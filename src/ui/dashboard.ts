/**
 * Training statistics dashboard (Req 9.3, 9.4, 9.5, 9.7).
 *
 * This module is the DOM rendering layer. It reads aggregate data from
 * `StatsStore` and keeps the data attributes used by DOM tests stable.
 *
 * ## Responsibilities
 *
 * - Summary (Req 9.3): total answered spots and success rate.
 * - Breakdowns (Req 9.4): action category, position and stack depth.
 * - Current session (Req 9.5): active streak and current-session spot count.
 * - Empty groups (Req 9.7): render a 0 count and unavailable rate marker.
 *
 * ## `sessionCount` (Req 9.5)
 *
 * `StatsStore.summary().total` is the persisted lifetime total. The current
 * session count is a runtime concept, so the caller passes it explicitly.
 *
 * ## Selectors / data attributes
 *
 * - `.dashboard`: root wrapper rendered into `root`.
 * - `.dashboard-summary`: summary block.
 * - `.dashboard-streak`: current streak.
 * - `.dashboard-session-count`: current-session spot count.
 * - `.breakdown`: one grouped breakdown table.
 * - `.breakdown-row`: one grouped row with group, total and rate data.
 *
 * _Requirements: 9.3, 9.4, 9.5, 9.7_
 */

import type {
  ActionContext,
  AnteMode,
  Filters,
  Position,
  StackBucket,
} from "../core/types";
import { evModelLabel } from "../core/trainingProfile";
import type {
  Breakdown,
  BreakdownDim,
  GroupStat,
  StatsStore,
  Summary,
} from "../persistence/statsStore";
import { migrateResultRecordsToV2, type ResultRecordV2 } from "../persistence/statsRecordV2";
import {
  buildStatsExportJson,
  importStatsJson,
  listStatsProfiles,
  removeStatsProfileRecords,
  type StatsProfileOption,
} from "../persistence/statsTransfer";
import type { PostflopLineResultRecord } from "../persistence/postflopLineResultRecord";
import {
  availableStatsV2Dimensions,
  breakdownStatsV2,
  buildStatsV2KpiModel,
  type StatsV2BreakdownDim,
  type StatsV2Group,
  type StatsV2KpiModel,
  type StatsV2LeakCandidate,
} from "../persistence/statsV2Analytics";
import {
  availablePostflopStatsDimensions,
  breakdownPostflopStats,
  type PostflopStatsBreakdownDim,
  type PostflopStatsGroup,
  type PostflopStatsV2BridgeRecord,
} from "../persistence/postflopResultRecord";
import type { ProductionPermissionManifestReport } from "../data/ranges/productionPermissionManifest";
import { buildPreflopCurriculumPlan } from "../persistence/preflopCurriculum";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DashboardData {
  store: StatsStore;
  /**
   * Spots answered in the current runtime session. The caller owns this value;
   * negative or invalid values are normalized to 0.
  */
  sessionCount: number;
  postflopRecords?: readonly PostflopStatsV2BridgeRecord[];
  postflopLineRecords?: readonly PostflopLineResultRecord[];
  permissionReports?: readonly ProductionPermissionManifestReport[];
  onStartPreflopFocus?: (filters: Filters) => void;
  onPostflopRecordsImported?: (records: readonly PostflopStatsV2BridgeRecord[]) => boolean | void;
  onPostflopLineRecordsImported?: (records: readonly PostflopLineResultRecord[]) => boolean | void;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const RATE_UNAVAILABLE = "\u2014";

const ACCURACY_TREND_WINDOW_SIZE = 5;
const ACCURACY_TREND_MAX_WINDOWS = 6;
const DECISION_TREND_WINDOW_SIZE = 3;
const DECISION_TREND_MAX_WINDOWS = 6;
const DECISION_TREND_MIN_SAMPLES = 6;
const DECISION_TREND_DELTA_THRESHOLD_MS = 250;

type AccuracyTrendSource = "preflop" | "postflop" | "mixed";

interface AccuracyTrendRecord {
  correct: boolean;
  ts: number;
  source: Exclude<AccuracyTrendSource, "mixed">;
}

interface AccuracyTrendPoint {
  index: number;
  startTs: number;
  endTs: number;
  total: number;
  correct: number;
  rate: number | null;
  source: AccuracyTrendSource;
}

interface ConfidenceWeightedGroup {
  key: string;
  label: string;
  total: number;
  correct: number;
  weightedTotal: number;
  weightedCorrect: number;
  rate: number | null;
  averageWeight: number;
}

interface ConfidenceWeightedKpiModel {
  total: number;
  weightedTotal: number;
  weightedCorrect: number;
  rate: number | null;
  groups: readonly ConfidenceWeightedGroup[];
}

interface DecisionTrendRecord {
  responseMs: number;
  ts: number;
  source: Exclude<AccuracyTrendSource, "mixed">;
}

interface DecisionTrendPoint {
  index: number;
  startTs: number;
  endTs: number;
  total: number;
  averageMs: number;
  source: AccuracyTrendSource;
}

interface DecisionTimeTrendModel {
  available: boolean;
  sample: number;
  minSample: number;
  direction: "faster" | "slower" | "stable" | null;
  deltaMs: number | null;
  points: readonly DecisionTrendPoint[];
}

/**
 * Formats a success rate for display. Null means unavailable.
 */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return RATE_UNAVAILABLE;
  return `${rate.toFixed(1)} %`;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return RATE_UNAVAILABLE;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds).toFixed(0)} s`;
}

function normalizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// Display labels
// ---------------------------------------------------------------------------

const DIM_TITLE: Record<BreakdownDim, string> = {
  context: "By action category",
  position: "By position",
  bucket: "By stack depth",
};

const PROFILE_DIM_TITLE: Record<StatsV2BreakdownDim, string> = {
  gameVariant: "By game variant",
  tableFormat: "By table format",
  blindSpeed: "By blind speed",
  street: "By street",
  evModel: "By model",
  ante: "By ante",
  rakeMode: "By rake mode",
  rangePackId: "By preflop model",
  position: "By position",
  bucket: "By stack",
  context: "By action spot",
};

const CONTEXT_LABEL: Record<ActionContext, string> = {
  RFI: "RFI / Open",
  VS_LIMP: "Vs limp (iso-raise)",
  VS_OPEN: "Vs open",
  VS_3BET: "Vs 3-bet",
  VS_4BET: "Vs 4-bet",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Vs all-in",
};

const POSTFLOP_DIM_TITLE: Record<PostflopStatsBreakdownDim, string> = {
  street: "By street",
  actionNode: "By postflop spot",
  boardTextureKey: "By board texture",
  strategyPackId: "By postflop model",
  confidence: "By confidence",
};

function groupLabel(dim: BreakdownDim | PostflopStatsBreakdownDim, key: string): string {
  switch (dim) {
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "position":
      return key;
    case "strategyPackId":
      return "Postflop model";
    case "confidence":
      return confidenceLabel(key);
    case "actionNode":
      return postflopActionNodeLabel(key);
    case "boardTextureKey":
      return postflopBoardTextureKeyLabel(key);
    case "street":
      return streetLabel(key);
  }
}

function profileGroupLabel(dim: StatsV2BreakdownDim, key: string): string {
  switch (dim) {
    case "gameVariant":
      return gameVariantLabel(key);
    case "tableFormat":
      return tableFormatLabel(key);
    case "blindSpeed":
      return blindSpeedLabel(key);
    case "street":
      return profileStreetLabel(key);
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "ante":
      return key === "ON" ? "Ante on" : "Ante off";
    case "evModel":
      return evModelLabel(key);
    case "rakeMode":
      return rakeModeLabel(key);
    case "rangePackId":
      return "Preflop model";
    case "position":
      return key;
    default:
      return key;
  }
}

function gameVariantLabel(key: string): string {
  if (key === "CASH") return "Cash";
  return key;
}

function tableFormatLabel(key: string): string {
  switch (key) {
    case "FULL_RING_9":
      return "9-max full ring";
    case "SIX_MAX":
      return "6-max";
    default:
      return key;
  }
}

function blindSpeedLabel(key: string): string {
  switch (key) {
    case "REGULAR":
      return "Regular";
    case "TURBO":
      return "Turbo";
    default:
      return key;
  }
}

function profileStreetLabel(key: string): string {
  switch (key) {
    case "PREFLOP":
      return "Preflop";
    default:
      return streetLabel(key);
  }
}

function rakeModeLabel(key: string): string {
  switch (key) {
    case "NONE":
      return "N/A";
    case "RAKE":
      return "Rake";
    case "NO_RAKE":
      return "No rake";
    default:
      return key;
  }
}

function confidenceLabel(key: string): string {
  switch (key) {
    case "LOW":
      return "low";
    case "MEDIUM":
      return "medium";
    case "HIGH":
      return "high";
    default:
      return key;
  }
}

function postflopActionNodeLabel(key: string): string {
  switch (key) {
    case "SINGLE_RAISED_POT_CBET":
      return "Flop c-bet in SRP";
    case "THREE_BET_POT_CBET":
      return "Flop c-bet in 3bet pot";
    case "FLOP_FACING_BET":
      return "Flop facing bet";
    case "TURN_BARREL":
      return "Turn barrel";
    case "TURN_FACING_BET":
      return "Turn facing bet";
    case "RIVER_PRESSURE":
      return "River pressure";
    case "RIVER_FACING_BET":
      return "River facing bet";
    default:
      return key;
  }
}

function postflopBoardTextureKeyLabel(key: string): string {
  return key
    .split("|")
    .filter(Boolean)
    .map(boardTextureLabel)
    .join(", ");
}

function boardTextureLabel(key: string): string {
  switch (key) {
    case "paired":
      return "paired";
    case "monotone":
      return "monotone";
    case "two-tone":
      return "two-tone";
    case "rainbow":
      return "rainbow";
    case "connected":
      return "connected";
    case "dry":
      return "dry";
    case "ace-high":
      return "A-high";
    case "broadway-high":
      return "broadway-high";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "straight-possible":
      return "straight possible";
    case "flush-draw-heavy":
      return "flush draw";
    case "disconnected":
      return "disconnected";
    default:
      return key;
  }
}

function streetLabel(key: string): string {
  switch (key) {
    case "FLOP":
      return "Flop";
    case "TURN":
      return "Turn";
    case "RIVER":
      return "River";
    default:
      return key;
  }
}

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Creates a rate element and keeps its `data-rate` test hook stable. */
function rateElement(tag: string, baseClass: string, rate: number | null): HTMLElement {
  const node = el(tag, baseClass);
  if (rate === null || !Number.isFinite(rate)) {
    node.classList.add("rate--unavailable");
    node.dataset.rate = "";
    node.textContent = RATE_UNAVAILABLE;
  } else {
    node.dataset.rate = String(rate);
    node.textContent = formatRate(rate);
  }
  return node;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderSummary(summary: Summary): HTMLElement {
  const box = el("section", "dashboard-summary");

  const heading = el("h3", "dashboard-summary__title");
  heading.textContent = "Summary";
  box.appendChild(heading);

  const total = el("div", "summary-total");
  total.dataset.total = String(summary.total);
  total.textContent = `Answered total: ${summary.total}`;
  box.appendChild(total);

  const rateLine = el("div", "summary-rate-line");
  const rateLabel = el("span", "summary-rate-label");
  rateLabel.textContent = "Success rate: ";
  const rate = rateElement("span", "summary-rate", summary.rate);
  rateLine.appendChild(rateLabel);
  rateLine.appendChild(rate);
  box.appendChild(rateLine);

  return box;
}

function renderKpiPanel(
  store: StatsStore,
  postflopRecords: readonly PostflopStatsV2BridgeRecord[] = [],
  onStartPreflopFocus?: (filters: Filters) => void,
): HTMLElement {
  const preflopRecords = migrateResultRecordsToV2(store.events());
  const model = buildStatsV2KpiModel(preflopRecords);
  const avgDecisionMs = averageDecisionMs(preflopRecords, postflopRecords);
  const accuracyTrend = buildAccuracyTrend(preflopRecords, postflopRecords);
  const confidenceWeightedKpi = buildConfidenceWeightedKpi(preflopRecords, postflopRecords);
  const decisionTrend = buildDecisionTimeTrend(preflopRecords, postflopRecords);
  const box = el("section", "dashboard-kpi");
  box.dataset.total = String(model.total);
  box.dataset.recentWindowSize = String(model.recentWindowSize);
  box.dataset.minLeakSample = String(model.minLeakSample);
  box.dataset.trendWindows = String(accuracyTrend.length);
  box.dataset.confidenceWeightedRate = confidenceWeightedKpi.rate === null
    ? ""
    : String(confidenceWeightedKpi.rate);
  box.dataset.confidenceWeightedTotal = formatWeightedNumber(confidenceWeightedKpi.weightedTotal);
  box.dataset.decisionTrendAvailable = String(decisionTrend.available);
  box.dataset.decisionTrendSamples = String(decisionTrend.sample);
  if (decisionTrend.deltaMs !== null) box.dataset.decisionTrendDeltaMs = String(decisionTrend.deltaMs);
  if (avgDecisionMs !== null) box.dataset.avgResponseMs = String(avgDecisionMs);

  const heading = el("h3", "dashboard-kpi__title");
  heading.textContent = "KPI";
  box.appendChild(heading);

  const cards = el("div", "dashboard-kpi__cards");
  cards.appendChild(kpiCard("Lifetime accuracy", "lifetimeRate", formatRate(model.lifetimeRate)));
  cards.appendChild(kpiCard(
    `Recent ${model.recentWindowSize}`,
    "recentRate",
    `${formatRate(model.recentRate)} (${model.recentTotal})`,
  ));
  cards.appendChild(kpiCard("Best streak", "bestStreak", String(model.bestStreak)));
  cards.appendChild(kpiCard("Leak focus", "leakFocus", leakFocusText(model)));
  cards.appendChild(kpiCard(
    "Weighted accuracy",
    "confidenceWeightedRate",
    `${formatRate(confidenceWeightedKpi.rate)} (${formatWeightedNumber(confidenceWeightedKpi.weightedTotal)}w)`,
  ));
  if (avgDecisionMs !== null) {
    cards.appendChild(kpiCard("Avg decision", "avgResponseMs", formatDurationMs(avgDecisionMs)));
  }
  if (decisionTrend.available) {
    cards.appendChild(kpiCard(
      "Decision trend",
      "decisionTrend",
      formatDecisionTrendSummary(decisionTrend),
    ));
  }
  box.appendChild(cards);

  box.appendChild(renderKpiChart(model));
  box.appendChild(renderConfidenceWeightedKpi(confidenceWeightedKpi));
  box.appendChild(renderDecisionTimeTrend(decisionTrend));
  box.appendChild(renderAccuracyTrend(accuracyTrend));
  box.appendChild(renderLeakChart(model.leakCandidates, preflopRecords, onStartPreflopFocus));

  return box;
}

function renderPreflopCurriculumPanel(
  store: StatsStore,
  onStartPreflopFocus?: (filters: Filters) => void,
): HTMLElement {
  const records = migrateResultRecordsToV2(store.events());
  const plan = buildPreflopCurriculumPlan(records);
  const box = el("section", "preflop-curriculum");
  box.dataset.available = String(plan.available);
  box.dataset.recommendations = String(plan.recommendations.length);

  const heading = el("h3", "preflop-curriculum__title");
  heading.textContent = "Training focus";
  box.appendChild(heading);

  const summary = el("div", "preflop-curriculum__summary");
  summary.textContent = plan.focus
    ? `${plan.focus.label} - ${formatRate(plan.focus.rate)} over ${plan.focus.total} spots`
    : plan.reason;
  box.appendChild(summary);

  const goals = el("div", "preflop-curriculum__goals");
  goals.textContent =
    `${plan.sessionGoal.targetSpots} spots | ` +
    `${plan.sessionGoal.targetAccuracy}% target | ` +
    `${plan.sessionGoal.streakTarget} streak`;
  box.appendChild(goals);

  const due = el("div", "preflop-curriculum__due");
  due.textContent = `${plan.repetitionQueue.length} due review spots`;
  box.appendChild(due);

  if (plan.recommendations.length > 0) {
    const recommendations = el("div", "preflop-curriculum__recommendations");
    const recommendationTitle = el("div", "preflop-curriculum__recommendations-title");
    recommendationTitle.textContent = "Next study focus";
    recommendations.appendChild(recommendationTitle);

    for (const recommendation of plan.recommendations) {
      const row = el("div", "preflop-curriculum__recommendation");
      row.dataset.dim = recommendation.dim;
      row.dataset.group = recommendation.key;
      row.dataset.priority = String(recommendation.priority);
      row.dataset.recentMistakes = String(recommendation.recentMistakes);
      row.dataset.recentTotal = String(recommendation.recentTotal);
      const label = el("div", "preflop-curriculum__recommendation-label");
      label.textContent = recommendation.label;
      const meta = el("div", "preflop-curriculum__recommendation-meta");
      meta.textContent = recommendation.reason;
      row.appendChild(label);
      row.appendChild(meta);
      const train = document.createElement("button");
      train.type = "button";
      train.className = "preflop-curriculum__recommendation-train";
      train.textContent = "Train";
      train.disabled = onStartPreflopFocus === undefined;
      train.addEventListener("click", () => onStartPreflopFocus?.(recommendation.filters));
      row.appendChild(train);
      recommendations.appendChild(row);
    }

    box.appendChild(recommendations);
  }

  if (plan.focus) {
    const actions = el("div", "preflop-curriculum__actions");
    const start = document.createElement("button");
    start.type = "button";
    start.className = "preflop-curriculum__start";
    start.textContent = "Train focus";
    start.disabled = onStartPreflopFocus === undefined;
    start.addEventListener("click", () => onStartPreflopFocus?.(plan.focus!.filters));
    actions.appendChild(start);
    box.appendChild(actions);
  }

  return box;
}

function renderPermissionAuditPanel(
  reports: readonly ProductionPermissionManifestReport[],
): HTMLElement {
  const box = el("section", "permission-audit");
  box.dataset.count = String(reports.length);
  box.dataset.ready = String(reports.filter((report) => report.valid).length);

  const heading = el("h3", "permission-audit__title");
  heading.textContent = "Range audit";
  box.appendChild(heading);

  if (reports.length === 0) {
    const empty = el("div", "permission-audit__empty");
    empty.textContent = "No audit reports loaded.";
    box.appendChild(empty);
    return box;
  }

  const rows = el("div", "permission-audit__rows");
  reports.forEach((report, index) => {
    rows.appendChild(renderPermissionAuditRow(report, index));
  });
  box.appendChild(rows);
  return box;
}

function renderPermissionAuditRow(
  report: ProductionPermissionManifestReport,
  index: number,
): HTMLElement {
  const row = el("div", "permission-audit-row");
  row.dataset.ready = report.valid ? "true" : "false";

  const title = el("div", "permission-audit-row__title");
  title.textContent = `Audit ${index + 1}`;
  row.appendChild(title);

  const status = el("div", "permission-audit-row__status");
  status.textContent = report.valid ? "Ready" : `Blocked (${report.errors.length})`;
  row.appendChild(status);

  const license = el("div", "permission-audit-row__license");
  license.textContent = permissionLicenseLabel(report.licenseKind);
  row.appendChild(license);

  const scope = el("div", "permission-audit-row__scope");
  scope.textContent = permissionScopeLabel(report.allowedRedistributionScope);
  row.appendChild(scope);

  const evidence = el("div", "permission-audit-row__evidence");
  evidence.textContent = `${report.evidenceCount} evidence`;
  row.appendChild(evidence);

  return row;
}

function permissionLicenseLabel(kind: string): string {
  switch (kind) {
    case "OWNED_SOLVER_EXPORT":
      return "Owned solver export";
    case "PUBLIC_CHART_WITH_PERMISSION":
      return "Public chart with permission";
    case "EXPLICIT_WRITTEN_PERMISSION":
      return "Written permission";
    default:
      return "Permission missing";
  }
}

function permissionScopeLabel(scope: string): string {
  switch (scope) {
    case "PKRTRAINER_RUNTIME_BUNDLE":
      return "Runtime bundle allowed";
    case "PKRTRAINER_INTERNAL_REVIEW_ONLY":
      return "Review only";
    case "NO_REDISTRIBUTION":
      return "No redistribution";
    default:
      return "Scope missing";
  }
}

function averageDecisionMs(
  preflopRecords: readonly { responseMs?: number }[],
  postflopRecords: readonly { responseMs?: number }[],
): number | null {
  let count = 0;
  let total = 0;
  for (const record of [...preflopRecords, ...postflopRecords]) {
    if (typeof record.responseMs !== "number" || !Number.isFinite(record.responseMs)) continue;
    if (record.responseMs < 0) continue;
    count += 1;
    total += record.responseMs;
  }
  if (count === 0) return null;
  return Math.round(total / count);
}

function buildAccuracyTrend(
  preflopRecords: readonly ResultRecordV2[],
  postflopRecords: readonly PostflopStatsV2BridgeRecord[],
  windowSize = ACCURACY_TREND_WINDOW_SIZE,
  maxWindows = ACCURACY_TREND_MAX_WINDOWS,
): AccuracyTrendPoint[] {
  const records: AccuracyTrendRecord[] = [
    ...preflopRecords.map((record) => ({
      correct: record.correct,
      ts: record.ts,
      source: "preflop" as const,
    })),
    ...postflopRecords.map((record) => ({
      correct: record.correct,
      ts: record.ts,
      source: "postflop" as const,
    })),
  ]
    .filter((record) => Number.isFinite(record.ts))
    .sort((a, b) => a.ts - b.ts);

  const normalizedWindowSize = Math.max(1, Math.floor(windowSize));
  const normalizedMaxWindows = Math.max(1, Math.floor(maxWindows));
  const windows: AccuracyTrendPoint[] = [];

  for (let offset = 0; offset < records.length; offset += normalizedWindowSize) {
    const chunk = records.slice(offset, offset + normalizedWindowSize);
    if (chunk.length === 0) continue;
    const correct = chunk.filter((record) => record.correct).length;
    const hasPreflop = chunk.some((record) => record.source === "preflop");
    const hasPostflop = chunk.some((record) => record.source === "postflop");

    windows.push({
      index: windows.length + 1,
      startTs: chunk[0].ts,
      endTs: chunk[chunk.length - 1].ts,
      total: chunk.length,
      correct,
      rate: successRate(chunk.length, correct),
      source: hasPreflop && hasPostflop ? "mixed" : hasPreflop ? "preflop" : "postflop",
    });
  }

  return windows.slice(-normalizedMaxWindows).map((point, index) => ({
    ...point,
    index: index + 1,
  }));
}

function successRate(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}

function buildConfidenceWeightedKpi(
  preflopRecords: readonly ResultRecordV2[],
  postflopRecords: readonly PostflopStatsV2BridgeRecord[],
): ConfidenceWeightedKpiModel {
  const groups = new Map<string, Omit<ConfidenceWeightedGroup, "rate" | "averageWeight">>();

  const add = (
    key: string,
    label: string,
    correct: boolean,
    weight: number,
  ): void => {
    const safeWeight = normalizeConfidenceWeight(weight);
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        label,
        total: 0,
        correct: 0,
        weightedTotal: 0,
        weightedCorrect: 0,
      };
      groups.set(key, group);
    }

    group.total += 1;
    group.weightedTotal += safeWeight;
    if (correct) {
      group.correct += 1;
      group.weightedCorrect += safeWeight;
    }
  };

  for (const record of preflopRecords) {
    const verified = record.rangePackId.length > 0 && record.sourceVerifiedAt.length > 0;
    add(
      verified ? "preflop-verified" : "preflop-fallback",
      verified ? "Preflop verified" : "Preflop fallback",
      record.correct,
      verified ? 1 : 0.6,
    );
  }

  for (const record of postflopRecords) {
    const group = postflopConfidenceWeightGroup(record);
    add(group.key, group.label, record.correct, group.weight);
  }

  const rawGroups = Array.from(groups.values());
  const weightedTotal = rawGroups.reduce((total, group) => total + group.weightedTotal, 0);
  const weightedCorrect = rawGroups.reduce((total, group) => total + group.weightedCorrect, 0);

  const normalizedGroups: ConfidenceWeightedGroup[] = rawGroups.map((group) => ({
    ...group,
    weightedTotal: roundOne(group.weightedTotal),
    weightedCorrect: roundOne(group.weightedCorrect),
    rate: weightedRate(group.weightedTotal, group.weightedCorrect),
    averageWeight: roundOne(group.weightedTotal / Math.max(1, group.total)),
  }));

  return {
    total: preflopRecords.length + postflopRecords.length,
    weightedTotal: roundOne(weightedTotal),
    weightedCorrect: roundOne(weightedCorrect),
    rate: weightedRate(weightedTotal, weightedCorrect),
    groups: normalizedGroups.sort((a, b) => (
      confidenceWeightedGroupOrder(a.key) - confidenceWeightedGroupOrder(b.key) ||
      a.label.localeCompare(b.label)
    )),
  };
}

function postflopConfidenceWeightGroup(record: PostflopStatsV2BridgeRecord): {
  key: string;
  label: string;
  weight: number;
} {
  if (!record.strategyPackId || record.confidence === null) {
    return { key: "postflop-fallback", label: "Postflop fallback", weight: 0.25 };
  }

  switch (record.confidence) {
    case "HIGH":
      return { key: "postflop-high", label: "Postflop high confidence", weight: 1 };
    case "MEDIUM":
      return { key: "postflop-medium", label: "Postflop medium confidence", weight: 0.75 };
    case "LOW":
    default:
      return { key: "postflop-low", label: "Postflop low confidence", weight: 0.5 };
  }
}

function normalizeConfidenceWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  return Math.min(1, weight);
}

function weightedRate(weightedTotal: number, weightedCorrect: number): number | null {
  if (!Number.isFinite(weightedTotal) || weightedTotal <= 0) return null;
  return Math.round((weightedCorrect / weightedTotal) * 1000) / 10;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatWeightedNumber(value: number): string {
  const rounded = roundOne(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function confidenceWeightedGroupOrder(key: string): number {
  switch (key) {
    case "preflop-verified":
      return 0;
    case "preflop-fallback":
      return 1;
    case "postflop-high":
      return 2;
    case "postflop-medium":
      return 3;
    case "postflop-low":
      return 4;
    case "postflop-fallback":
      return 5;
    default:
      return 99;
  }
}

function buildDecisionTimeTrend(
  preflopRecords: readonly ResultRecordV2[],
  postflopRecords: readonly PostflopStatsV2BridgeRecord[],
  windowSize = DECISION_TREND_WINDOW_SIZE,
  maxWindows = DECISION_TREND_MAX_WINDOWS,
  minSample = DECISION_TREND_MIN_SAMPLES,
): DecisionTimeTrendModel {
  const records: DecisionTrendRecord[] = [
    ...preflopRecords.map((record) => ({
      responseMs: record.responseMs,
      ts: record.ts,
      source: "preflop" as const,
    })),
    ...postflopRecords.map((record) => ({
      responseMs: record.responseMs,
      ts: record.ts,
      source: "postflop" as const,
    })),
  ].filter((record): record is DecisionTrendRecord => (
    typeof record.responseMs === "number" &&
    Number.isFinite(record.responseMs) &&
    record.responseMs >= 0 &&
    Number.isFinite(record.ts)
  )).sort((a, b) => a.ts - b.ts);

  if (records.length < minSample) {
    return {
      available: false,
      sample: records.length,
      minSample,
      direction: null,
      deltaMs: null,
      points: [],
    };
  }

  const normalizedWindowSize = Math.max(1, Math.floor(windowSize));
  const normalizedMaxWindows = Math.max(1, Math.floor(maxWindows));
  const minWindowSample = Math.min(2, normalizedWindowSize);
  const points: DecisionTrendPoint[] = [];

  for (let offset = 0; offset < records.length; offset += normalizedWindowSize) {
    const chunk = records.slice(offset, offset + normalizedWindowSize);
    if (chunk.length < minWindowSample) continue;
    const totalMs = chunk.reduce((total, record) => total + record.responseMs, 0);
    const hasPreflop = chunk.some((record) => record.source === "preflop");
    const hasPostflop = chunk.some((record) => record.source === "postflop");
    points.push({
      index: points.length + 1,
      startTs: chunk[0].ts,
      endTs: chunk[chunk.length - 1].ts,
      total: chunk.length,
      averageMs: Math.round(totalMs / chunk.length),
      source: hasPreflop && hasPostflop ? "mixed" : hasPreflop ? "preflop" : "postflop",
    });
  }

  const recentPoints = points.slice(-normalizedMaxWindows).map((point, index) => ({
    ...point,
    index: index + 1,
  }));
  const first = recentPoints[0];
  const last = recentPoints.at(-1);
  const deltaMs = first && last && recentPoints.length >= 2 ? last.averageMs - first.averageMs : null;

  return {
    available: recentPoints.length >= 2,
    sample: records.length,
    minSample,
    direction: decisionTrendDirection(deltaMs),
    deltaMs,
    points: recentPoints.length >= 2 ? recentPoints : [],
  };
}

function decisionTrendDirection(deltaMs: number | null): DecisionTimeTrendModel["direction"] {
  if (deltaMs === null) return null;
  if (deltaMs <= -DECISION_TREND_DELTA_THRESHOLD_MS) return "faster";
  if (deltaMs >= DECISION_TREND_DELTA_THRESHOLD_MS) return "slower";
  return "stable";
}

function formatDecisionTrendSummary(model: DecisionTimeTrendModel): string {
  if (!model.available || model.deltaMs === null || model.direction === null) return "Pending sample";
  if (model.direction === "stable") return "Stable";
  return `${model.direction === "faster" ? "Faster" : "Slower"} by ${formatDurationMs(Math.abs(model.deltaMs))}`;
}

function kpiCard(labelText: string, key: string, valueText: string): HTMLElement {
  const card = el("div", "dashboard-kpi-card");
  card.dataset.kpi = key;
  const label = el("div", "dashboard-kpi-card__label");
  label.textContent = labelText;
  const value = el("div", "dashboard-kpi-card__value");
  value.textContent = valueText;
  card.appendChild(label);
  card.appendChild(value);
  return card;
}

function leakFocusText(model: StatsV2KpiModel): string {
  const first = model.leakCandidates[0];
  if (!first) return `No leak over ${model.minLeakSample}+ samples`;
  return `${profileGroupLabel(first.dim, first.key)} (${formatRate(first.rate)})`;
}

function renderKpiChart(model: StatsV2KpiModel): HTMLElement {
  const chart = el("div", "dashboard-kpi-chart");
  chart.appendChild(rateBar("Lifetime", "lifetime", model.lifetimeRate, model.total));
  chart.appendChild(rateBar("Recent", "recent", model.recentRate, model.recentTotal));
  return chart;
}

function renderConfidenceWeightedKpi(model: ConfidenceWeightedKpiModel): HTMLElement {
  const chart = el("div", "dashboard-confidence-kpi");
  chart.dataset.total = String(model.total);
  chart.dataset.weightedTotal = formatWeightedNumber(model.weightedTotal);
  chart.dataset.weightedCorrect = formatWeightedNumber(model.weightedCorrect);
  chart.dataset.rate = model.rate === null ? "" : String(model.rate);

  const title = el("div", "dashboard-confidence-kpi__title");
  title.textContent = "Confidence-weighted KPI";
  chart.appendChild(title);

  if (model.groups.length === 0) {
    const empty = el("div", "dashboard-confidence-kpi__empty");
    empty.textContent = "No weighted sample yet.";
    chart.appendChild(empty);
    return chart;
  }

  const rows = el("div", "dashboard-confidence-kpi__rows");
  for (const group of model.groups) {
    rows.appendChild(renderConfidenceWeightedKpiRow(group));
  }
  chart.appendChild(rows);
  return chart;
}

function renderConfidenceWeightedKpiRow(group: ConfidenceWeightedGroup): HTMLElement {
  const row = el("div", "dashboard-confidence-kpi-row");
  row.dataset.group = group.key;
  row.dataset.total = String(group.total);
  row.dataset.correct = String(group.correct);
  row.dataset.weightedTotal = formatWeightedNumber(group.weightedTotal);
  row.dataset.weightedCorrect = formatWeightedNumber(group.weightedCorrect);
  row.dataset.averageWeight = formatWeightedNumber(group.averageWeight);
  row.dataset.rate = group.rate === null ? "" : String(group.rate);

  const label = el("div", "dashboard-confidence-kpi-row__label");
  label.textContent = group.label;
  row.appendChild(label);

  const track = el("div", "dashboard-confidence-kpi-row__track");
  const bar = el("div", "dashboard-confidence-kpi-row__bar");
  bar.style.width = `${group.rate === null ? 0 : Math.max(0, Math.min(100, group.rate))}%`;
  track.appendChild(bar);
  row.appendChild(track);

  row.appendChild(rateElement("div", "dashboard-confidence-kpi-row__rate", group.rate));

  const sample = el("div", "dashboard-confidence-kpi-row__sample");
  sample.textContent =
    `${group.correct}/${group.total} | ${formatWeightedNumber(group.weightedTotal)}w`;
  row.appendChild(sample);

  return row;
}

function renderDecisionTimeTrend(model: DecisionTimeTrendModel): HTMLElement {
  const chart = el("div", "dashboard-decision-trend");
  chart.dataset.available = String(model.available);
  chart.dataset.samples = String(model.sample);
  chart.dataset.minSample = String(model.minSample);
  chart.dataset.direction = model.direction ?? "";
  chart.dataset.deltaMs = model.deltaMs === null ? "" : String(model.deltaMs);
  chart.dataset.windows = String(model.points.length);

  const title = el("div", "dashboard-decision-trend__title");
  title.textContent = "Decision-time trend";
  chart.appendChild(title);

  if (!model.available) {
    const empty = el("div", "dashboard-decision-trend__empty");
    empty.textContent = `Needs ${model.minSample} timed decisions. Current sample: ${model.sample}.`;
    chart.appendChild(empty);
    return chart;
  }

  const summary = el("div", "dashboard-decision-trend__summary");
  summary.textContent = formatDecisionTrendSummary(model);
  chart.appendChild(summary);

  const bars = el("div", "dashboard-decision-trend__bars");
  const maxAverageMs = Math.max(...model.points.map((point) => point.averageMs), 1);
  for (const point of model.points) {
    bars.appendChild(renderDecisionTrendBar(point, maxAverageMs));
  }
  chart.appendChild(bars);
  return chart;
}

function renderDecisionTrendBar(point: DecisionTrendPoint, maxAverageMs: number): HTMLElement {
  const bar = el("div", "dashboard-decision-trend__bar");
  bar.dataset.index = String(point.index);
  bar.dataset.total = String(point.total);
  bar.dataset.averageMs = String(point.averageMs);
  bar.dataset.source = point.source;
  bar.dataset.startTs = String(point.startTs);
  bar.dataset.endTs = String(point.endTs);

  const value = el("div", "dashboard-decision-trend__value");
  value.textContent = formatDurationMs(point.averageMs);
  bar.appendChild(value);

  const track = el("div", "dashboard-decision-trend__track");
  const fill = el("div", "dashboard-decision-trend__fill");
  fill.style.height = `${Math.max(3, Math.min(100, (point.averageMs / maxAverageMs) * 100))}%`;
  track.appendChild(fill);
  bar.appendChild(track);

  const label = el("div", "dashboard-decision-trend__label");
  label.textContent = `W${point.index}`;
  bar.appendChild(label);

  const sample = el("div", "dashboard-decision-trend__sample");
  sample.textContent = `${point.total} decisions`;
  bar.appendChild(sample);

  return bar;
}

function renderAccuracyTrend(points: readonly AccuracyTrendPoint[]): HTMLElement {
  const chart = el("div", "dashboard-accuracy-trend");
  chart.dataset.windows = String(points.length);

  const title = el("div", "dashboard-accuracy-trend__title");
  title.textContent = "Recent accuracy trend";
  chart.appendChild(title);

  if (points.length === 0) {
    const empty = el("div", "dashboard-accuracy-trend__empty");
    empty.textContent = "No recent trend yet.";
    chart.appendChild(empty);
    return chart;
  }

  const bars = el("div", "dashboard-accuracy-trend__bars");
  for (const point of points) {
    bars.appendChild(renderAccuracyTrendBar(point));
  }
  chart.appendChild(bars);
  return chart;
}

function renderAccuracyTrendBar(point: AccuracyTrendPoint): HTMLElement {
  const bar = el("div", "dashboard-accuracy-trend__bar");
  bar.dataset.index = String(point.index);
  bar.dataset.total = String(point.total);
  bar.dataset.correct = String(point.correct);
  bar.dataset.rate = point.rate === null ? "" : String(point.rate);
  bar.dataset.source = point.source;
  bar.dataset.startTs = String(point.startTs);
  bar.dataset.endTs = String(point.endTs);

  const value = el("div", "dashboard-accuracy-trend__value");
  value.textContent = formatRate(point.rate);
  bar.appendChild(value);

  const track = el("div", "dashboard-accuracy-trend__track");
  const fill = el("div", "dashboard-accuracy-trend__fill");
  fill.style.height = `${point.rate === null ? 0 : Math.max(0, Math.min(100, point.rate))}%`;
  track.appendChild(fill);
  bar.appendChild(track);

  const label = el("div", "dashboard-accuracy-trend__label");
  label.textContent = `W${point.index}`;
  bar.appendChild(label);

  const sample = el("div", "dashboard-accuracy-trend__sample");
  sample.textContent = `${point.correct}/${point.total}`;
  bar.appendChild(sample);

  return bar;
}

function renderLeakChart(
  candidates: readonly StatsV2LeakCandidate[],
  records: readonly ResultRecordV2[],
  onStartPreflopFocus?: (filters: Filters) => void,
): HTMLElement {
  const chart = el("div", "dashboard-leak-chart");
  chart.dataset.count = String(candidates.length);
  const title = el("div", "dashboard-leak-chart__title");
  title.textContent = "Lowest-sample-qualified spots";
  chart.appendChild(title);

  if (candidates.length === 0) {
    const empty = el("div", "dashboard-leak-chart__empty");
    empty.textContent = "No qualified leaks yet.";
    chart.appendChild(empty);
    return chart;
  }

  for (const candidate of candidates.slice(0, 4)) {
    const row = rateBar(
      `${profileGroupLabel(candidate.dim, candidate.key)} (${candidate.total})`,
      candidate.dim,
      candidate.rate,
      candidate.total,
    );
    row.classList.add("dashboard-leak-row");
    row.dataset.dim = candidate.dim;
    row.dataset.group = candidate.key;
    const filters = filtersForLeakCandidate(candidate, records);
    row.dataset.actionable = String(filters !== null);
    const train = document.createElement("button");
    train.type = "button";
    train.className = "dashboard-leak-row__train";
    train.textContent = "Train";
    train.disabled = filters === null || onStartPreflopFocus === undefined;
    train.addEventListener("click", () => {
      if (filters !== null) onStartPreflopFocus?.(filters);
    });
    row.appendChild(train);
    chart.appendChild(row);
  }

  return chart;
}

function filtersForLeakCandidate(
  candidate: StatsV2LeakCandidate,
  records: readonly ResultRecordV2[],
): Filters | null {
  if (!isPreflopFocusDim(candidate.dim)) return null;
  const matchingRecords = records.filter((record) => String(record[candidate.dim]) === candidate.key);
  const ante = dominantPreflopAnte(matchingRecords);
  return {
    positions: candidate.dim === "position" ? [candidate.key as Position] : [],
    buckets: candidate.dim === "bucket" ? [Number(candidate.key) as StackBucket] : [],
    contexts: candidate.dim === "context" ? [candidate.key as ActionContext] : [],
    ante,
    scoringMode: "LENIENT",
  };
}

function isPreflopFocusDim(dim: StatsV2BreakdownDim): dim is "context" | "position" | "bucket" {
  return dim === "context" || dim === "position" || dim === "bucket";
}

function dominantPreflopAnte(records: readonly ResultRecordV2[]): AnteMode {
  const on = records.filter((record) => record.ante === "ON").length;
  const off = records.length - on;
  return on >= off ? "ON" : "OFF";
}

function rateBar(labelText: string, key: string, rate: number | null, total: number): HTMLElement {
  const row = el("div", "dashboard-kpi-chart-row");
  row.dataset.key = key;
  row.dataset.total = String(total);
  row.dataset.rate = rate === null ? "" : String(rate);

  const label = el("div", "dashboard-kpi-chart-row__label");
  label.textContent = labelText;
  row.appendChild(label);

  const track = el("div", "dashboard-kpi-chart-row__track");
  const bar = el("div", "dashboard-kpi-chart-row__bar");
  bar.style.width = `${rate === null ? 0 : Math.max(0, Math.min(100, rate))}%`;
  track.appendChild(bar);
  row.appendChild(track);

  row.appendChild(rateElement("div", "dashboard-kpi-chart-row__rate", rate));
  return row;
}

function renderStreakSession(streak: number, sessionCount: number): HTMLElement {
  const box = el("section", "dashboard-session");

  const heading = el("h3", "dashboard-session__title");
  heading.textContent = "Current session";
  box.appendChild(heading);

  const streakNode = el("div", "dashboard-streak");
  streakNode.dataset.streak = String(streak);
  streakNode.textContent = `Correct streak: ${streak}`;
  box.appendChild(streakNode);

  const sessionNode = el("div", "dashboard-session-count");
  sessionNode.dataset.sessionCount = String(sessionCount);
  sessionNode.textContent = `Spots this session: ${sessionCount}`;
  box.appendChild(sessionNode);

  return box;
}

function renderBreakdownRow(dim: BreakdownDim, g: GroupStat): HTMLElement {
  const row = el("div", "breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "breakdown-row__name");
  name.textContent = groupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "breakdown-row__count");
  count.textContent = `${g.total}\u00d7`;
  row.appendChild(count);

  row.appendChild(rateElement("span", "breakdown-row__rate", g.rate));

  return row;
}

function renderBreakdown(dim: BreakdownDim, breakdown: Breakdown): HTMLElement {
  const box = el("section", `breakdown breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h3", "breakdown__title");
  heading.textContent = DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "breakdown__rows");
  for (const g of breakdown) {
    rows.appendChild(renderBreakdownRow(dim, g));
  }
  box.appendChild(rows);

  return box;
}

function renderPreflopLeakCharts(store: StatsStore): HTMLElement {
  const box = el("section", "preflop-leak-charts");
  const heading = el("h3", "preflop-leak-charts__title");
  heading.textContent = "Preflop leak charts";
  box.appendChild(heading);

  const dims: BreakdownDim[] = ["context", "position", "bucket"];
  for (const dim of dims) {
    box.appendChild(renderPreflopLeakChart(dim, store.breakdownBy(dim)));
  }

  return box;
}

function renderPreflopLeakChart(dim: BreakdownDim, breakdown: Breakdown): HTMLElement {
  const chart = el("div", `preflop-leak-chart preflop-leak-chart--${dim}`);
  chart.dataset.dim = dim;
  const heading = el("h4", "preflop-leak-chart__title");
  heading.textContent = DIM_TITLE[dim];
  chart.appendChild(heading);

  const rows = el("div", "preflop-leak-chart__rows");
  for (const group of breakdown) {
    const row = rateBar(groupLabel(dim, group.key), group.key, group.rate, group.total);
    row.classList.add("preflop-leak-chart-row");
    row.dataset.dim = dim;
    row.dataset.group = group.key;
    rows.appendChild(row);
  }
  chart.appendChild(rows);
  return chart;
}

function renderStatsProfileSelector(
  profiles: readonly StatsProfileOption[],
): { wrap: HTMLElement; select: HTMLSelectElement } {
  const wrap = el("div", "stats-profile-filter");
  const label = document.createElement("label");
  label.className = "stats-profile-filter__label";
  label.textContent = "Profile";
  const select = document.createElement("select");
  select.className = "stats-profile-select";
  select.appendChild(statsProfileOption("", "All profiles"));
  for (const profile of profiles) {
    select.appendChild(statsProfileOption(
      profile.profileId,
      `${statsProfileLabel(profile.profileId)} (${profile.total})`,
    ));
  }
  label.appendChild(select);
  wrap.appendChild(label);
  return { wrap, select };
}

function statsProfileOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function statsProfileLabel(profileId: string): string {
  const [variant, table, speed, street, model, ante] = profileId.split("|");
  if (!variant || !table || !speed || !street) return profileId;
  return [variant, tableFormatLabel(table), blindSpeedLabel(speed), profileStreetLabel(street), evModelLabel(model ?? ""), ante]
    .filter(Boolean)
    .join(" ");
}

function renderStatsTransfer(data: DashboardData, root: HTMLElement): HTMLElement {
  const box = el("section", "stats-transfer");

  const heading = el("h3", "stats-transfer__title");
  heading.textContent = "Stats export / import";
  box.appendChild(heading);

  const profileOptions = listStatsProfiles(
    data.store.events(),
    data.postflopRecords ?? [],
    data.postflopLineRecords ?? [],
  );
  const profileSelector = renderStatsProfileSelector(profileOptions);
  box.appendChild(profileSelector.wrap);

  const actions = el("div", "stats-transfer__actions");
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "stats-export";
  exportBtn.textContent = "Export JSON";

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "stats-import";
  importBtn.textContent = "Import JSON";

  const resetProfileBtn = document.createElement("button");
  resetProfileBtn.type = "button";
  resetProfileBtn.className = "stats-reset-profile";
  resetProfileBtn.textContent = "Reset selected profile";
  resetProfileBtn.disabled = profileSelector.select.value === "";
  profileSelector.select.addEventListener("change", () => {
    resetProfileBtn.disabled = profileSelector.select.value === "";
  });

  actions.appendChild(exportBtn);
  actions.appendChild(importBtn);
  actions.appendChild(resetProfileBtn);
  box.appendChild(actions);

  const textarea = document.createElement("textarea");
  textarea.className = "stats-json-box";
  textarea.placeholder = "Export / import stats JSON";
  textarea.rows = 8;
  box.appendChild(textarea);

  const status = el("div", "stats-transfer__status");
  status.setAttribute("role", "status");
  status.hidden = true;
  box.appendChild(status);

  exportBtn.addEventListener("click", () => {
    const selectedProfileId = profileSelector.select.value || undefined;
    textarea.value = buildStatsExportJson(data.store, new Date(), {
      postflopRecords: data.postflopRecords ?? [],
      postflopLineRecords: data.postflopLineRecords ?? [],
      profileId: selectedProfileId,
    });
    status.hidden = false;
    status.className = "stats-transfer__status stats-transfer__status--ok";
    status.textContent = selectedProfileId
      ? "Selected profile export is ready in the JSON field."
      : "Stats export is ready in the JSON field.";
  });

  importBtn.addEventListener("click", () => {
    const result = importStatsJson(textarea.value, data.store);
    status.hidden = false;
    if (result.ok) {
      const postflopSaved = data.onPostflopRecordsImported?.(result.postflopRecords) ?? true;
      if (!postflopSaved) {
        status.className = "stats-transfer__status stats-transfer__status--error";
        status.textContent = "Preflop stats were imported, but the postflop log could not be saved.";
        return;
      }
      const postflopLinesSaved = data.onPostflopLineRecordsImported?.(result.postflopLineRecords) ?? true;
      if (!postflopLinesSaved) {
        status.className = "stats-transfer__status stats-transfer__status--error";
        status.textContent = "Preflop and postflop stats were imported, but the postflop line log could not be saved.";
        return;
      }
      renderDashboard({
        ...data,
        postflopRecords: result.postflopRecords,
        postflopLineRecords: result.postflopLineRecords,
      }, root);
      const refreshedStatus = root.querySelector<HTMLElement>(".stats-transfer__status");
      if (refreshedStatus) {
        refreshedStatus.hidden = false;
        refreshedStatus.className = "stats-transfer__status stats-transfer__status--ok";
        refreshedStatus.textContent = `Imported ${result.imported} stats records.`;
      }
      return;
    }
    status.className = "stats-transfer__status stats-transfer__status--error";
    status.textContent = result.error ?? "Stats import failed.";
  });

  resetProfileBtn.addEventListener("click", () => {
    const selectedProfileId = profileSelector.select.value;
    if (selectedProfileId === "") return;
    const selected = removeStatsProfileRecords(
      data.store.events(),
      data.postflopRecords ?? [],
      data.postflopLineRecords ?? [],
      selectedProfileId,
    );
    const save = data.store.replaceAll(selected.events);
    status.hidden = false;
    if (!save.ok) {
      status.className = "stats-transfer__status stats-transfer__status--error";
      status.textContent = save.error ?? "Selected profile reset failed.";
      return;
    }
    const postflopSaved = data.onPostflopRecordsImported?.(selected.postflopRecords) ?? true;
    if (!postflopSaved) {
      status.className = "stats-transfer__status stats-transfer__status--error";
      status.textContent = "Preflop stats were reset, but the postflop log could not be saved.";
      return;
    }
    const postflopLinesSaved = data.onPostflopLineRecordsImported?.(selected.postflopLineRecords) ?? true;
    if (!postflopLinesSaved) {
      status.className = "stats-transfer__status stats-transfer__status--error";
      status.textContent = "Preflop and postflop stats were reset, but the postflop line log could not be saved.";
      return;
    }
    renderDashboard({
      ...data,
      postflopRecords: selected.postflopRecords,
      postflopLineRecords: selected.postflopLineRecords,
    }, root);
    const refreshedStatus = root.querySelector<HTMLElement>(".stats-transfer__status");
    if (refreshedStatus) {
      refreshedStatus.hidden = false;
      refreshedStatus.className = "stats-transfer__status stats-transfer__status--ok";
      refreshedStatus.textContent = "Selected profile stats were reset.";
    }
  });

  return box;
}

function renderProfileBreakdownRow(dim: StatsV2BreakdownDim, g: StatsV2Group): HTMLElement {
  const row = el("div", "profile-breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "profile-breakdown-row__name");
  name.textContent = profileGroupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "profile-breakdown-row__count");
  count.textContent = `${g.total}\u00d7`;
  row.appendChild(count);

  row.appendChild(rateElement("span", "profile-breakdown-row__rate", g.rate));

  return row;
}

function renderProfileBreakdown(dim: StatsV2BreakdownDim, groups: StatsV2Group[]): HTMLElement {
  const box = el("section", `profile-breakdown profile-breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h4", "profile-breakdown__title");
  heading.textContent = PROFILE_DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "profile-breakdown__rows");
  if (groups.length === 0) {
    const empty = el("div", "profile-breakdown__empty");
    empty.textContent = "No records yet.";
    rows.appendChild(empty);
  } else {
    for (const g of groups) {
      rows.appendChild(renderProfileBreakdownRow(dim, g));
    }
  }
  box.appendChild(rows);

  return box;
}

function renderProfileBreakdowns(store: StatsStore): HTMLElement {
  const box = el("section", "profile-breakdowns");

  const heading = el("h3", "profile-breakdowns__title");
  heading.textContent = "Profile breakdowns";
  box.appendChild(heading);

  const eventsV2 = migrateResultRecordsToV2(store.events());
  for (const dim of availableStatsV2Dimensions()) {
    box.appendChild(renderProfileBreakdown(dim, breakdownStatsV2(eventsV2, dim)));
  }

  return box;
}

function renderPostflopBreakdownRow(
  dim: PostflopStatsBreakdownDim,
  g: PostflopStatsGroup,
): HTMLElement {
  const row = el("div", "postflop-breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "postflop-breakdown-row__name");
  name.textContent = groupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "postflop-breakdown-row__count");
  count.textContent = `${g.total}\u00d7`;
  row.appendChild(count);

  row.appendChild(rateElement("span", "postflop-breakdown-row__rate", g.rate));

  return row;
}

function renderPostflopBreakdown(
  dim: PostflopStatsBreakdownDim,
  groups: PostflopStatsGroup[],
): HTMLElement {
  const box = el("section", `postflop-breakdown postflop-breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h4", "postflop-breakdown__title");
  heading.textContent = POSTFLOP_DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "postflop-breakdown__rows");
  if (groups.length === 0) {
    const empty = el("div", "postflop-breakdown__empty");
    empty.textContent = "No postflop answers yet.";
    rows.appendChild(empty);
  } else {
    for (const group of groups) {
      rows.appendChild(renderPostflopBreakdownRow(dim, group));
    }
  }
  box.appendChild(rows);

  return box;
}

function renderPostflopBreakdowns(
  records: readonly PostflopStatsV2BridgeRecord[],
): HTMLElement {
  const box = el("section", "postflop-breakdowns");
  box.dataset.total = String(records.length);

  const heading = el("h3", "postflop-breakdowns__title");
  heading.textContent = "Postflop breakdowns";
  box.appendChild(heading);

  for (const dim of availablePostflopStatsDimensions()) {
    box.appendChild(renderPostflopBreakdown(dim, breakdownPostflopStats(records, dim)));
  }

  return box;
}

function renderPostflopKpiCharts(
  records: readonly PostflopStatsV2BridgeRecord[],
): HTMLElement {
  const box = el("section", "postflop-kpi-charts");
  box.dataset.total = String(records.length);
  const heading = el("h3", "postflop-kpi-charts__title");
  heading.textContent = "Postflop KPI charts";
  box.appendChild(heading);

  for (const dim of ["street", "actionNode", "boardTextureKey", "confidence"] as const) {
    box.appendChild(renderPostflopKpiChart(dim, breakdownPostflopStats(records, dim)));
  }

  return box;
}

function renderPostflopKpiChart(
  dim: PostflopStatsBreakdownDim,
  groups: PostflopStatsGroup[],
): HTMLElement {
  const chart = el("div", `postflop-kpi-chart postflop-kpi-chart--${dim}`);
  chart.dataset.dim = dim;
  const heading = el("h4", "postflop-kpi-chart__title");
  heading.textContent = POSTFLOP_DIM_TITLE[dim];
  chart.appendChild(heading);

  const rows = el("div", "postflop-kpi-chart__rows");
  if (groups.length === 0) {
    const empty = el("div", "postflop-kpi-chart__empty");
    empty.textContent = "No postflop answers yet.";
    rows.appendChild(empty);
  } else {
    for (const group of groups) {
      const row = rateBar(groupLabel(dim, group.key), group.key, group.rate, group.total);
      row.classList.add("postflop-kpi-chart-row");
      row.dataset.dim = dim;
      row.dataset.group = group.key;
      rows.appendChild(row);
    }
  }
  chart.appendChild(rows);
  return chart;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function dashboardStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
.dashboard{font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;color:#e8ecf7;display:flex;
  flex-direction:column;gap:16px;max-width:960px;margin:0 auto;}
.dashboard h3{margin:0 0 10px;font-size:14px;font-weight:950;color:#f8fbff;}
.dashboard h4{margin:0 0 8px;font-size:12px;font-weight:950;color:#dce7fb;}
.dashboard-summary,.dashboard-kpi,.preflop-curriculum,.dashboard-session,.permission-audit,.breakdown,.stats-transfer,.profile-breakdowns,.postflop-breakdowns,.preflop-leak-charts,.postflop-kpi-charts{
  background:linear-gradient(180deg,rgba(18,25,38,.98),rgba(10,15,24,.98));
  border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:14px 16px;
  box-shadow:0 18px 48px rgba(0,0,0,.23),inset 0 1px 0 rgba(255,255,255,.05);}
.dashboard-summary{display:grid;gap:6px;background:
  radial-gradient(circle at 16% 0%,rgba(43,213,118,.13),rgba(43,213,118,0) 35%),
  linear-gradient(180deg,rgba(18,25,38,.98),rgba(10,15,24,.98));}
.dashboard-summary .summary-total{font-size:13px;color:#a8b7d5;font-weight:750;}
.dashboard-summary .summary-rate-line{margin-top:2px;font-size:22px;font-weight:950;color:#9ff0bd;}
.dashboard-summary .summary-rate-label{font-size:13px;font-weight:750;color:#a8b7d5;}
.dashboard-kpi{display:grid;gap:12px;}
.dashboard-kpi__cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}
.dashboard-kpi-card{border:1px solid rgba(123,211,255,.14);border-radius:10px;padding:10px;
  background:rgba(255,255,255,.045);min-width:0;}
.dashboard-kpi-card__label{font-size:11px;font-weight:900;text-transform:uppercase;color:#9fb0cf;}
.dashboard-kpi-card__value{margin-top:4px;font-size:16px;font-weight:950;color:#f8fbff;overflow-wrap:anywhere;}
.dashboard-kpi-chart,.dashboard-confidence-kpi,.dashboard-decision-trend,.dashboard-accuracy-trend,.dashboard-leak-chart{display:grid;gap:7px;}
.dashboard-confidence-kpi{border-top:1px solid rgba(148,163,184,.12);padding-top:10px;}
.dashboard-confidence-kpi__title{font-size:12px;font-weight:950;color:#dce7fb;}
.dashboard-confidence-kpi__empty{font-size:12px;color:#9fb0cf;}
.dashboard-confidence-kpi__rows{display:grid;gap:6px;}
.dashboard-confidence-kpi-row{display:grid;grid-template-columns:minmax(130px,1.3fr) minmax(120px,2fr) auto auto;
  align-items:center;gap:9px;font-size:12px;border:1px solid rgba(148,163,184,.12);border-radius:9px;
  background:rgba(255,255,255,.035);padding:7px 8px;}
.dashboard-confidence-kpi-row__label{font-weight:850;color:#dce7fb;min-width:0;overflow-wrap:anywhere;}
.dashboard-confidence-kpi-row__track{height:8px;border-radius:999px;background:rgba(148,163,184,.14);overflow:hidden;}
.dashboard-confidence-kpi-row__bar{height:100%;border-radius:inherit;background:linear-gradient(90deg,#7bd3ff,#2bd576);}
.dashboard-confidence-kpi-row__rate{font-weight:950;color:#9ff0bd;font-variant-numeric:tabular-nums;}
.dashboard-confidence-kpi-row__sample{font-weight:800;color:#9fb0cf;font-variant-numeric:tabular-nums;white-space:nowrap;}
.dashboard-confidence-kpi-row[data-group="postflop-low"] .dashboard-confidence-kpi-row__bar,
.dashboard-confidence-kpi-row[data-group="postflop-fallback"] .dashboard-confidence-kpi-row__bar{
  background:linear-gradient(90deg,#facc15,#7bd3ff);}
.dashboard-decision-trend{border-top:1px solid rgba(148,163,184,.12);padding-top:10px;}
.dashboard-decision-trend__title{font-size:12px;font-weight:950;color:#dce7fb;}
.dashboard-decision-trend__summary{font-size:13px;font-weight:950;color:#f8fbff;}
.dashboard-decision-trend__empty{font-size:12px;color:#9fb0cf;}
.dashboard-decision-trend__bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(58px,1fr));
  gap:8px;align-items:end;min-height:122px;}
.dashboard-decision-trend__bar{display:grid;grid-template-rows:auto 82px auto auto;gap:5px;min-width:0;
  align-items:end;justify-items:center;font-size:11px;color:#9fb0cf;}
.dashboard-decision-trend__value{font-weight:950;color:#f8fbff;font-variant-numeric:tabular-nums;}
.dashboard-decision-trend__track{width:100%;max-width:42px;height:82px;border-radius:999px;
  display:flex;align-items:flex-end;overflow:hidden;background:linear-gradient(180deg,rgba(148,163,184,.16),rgba(148,163,184,.08));
  border:1px solid rgba(148,163,184,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
.dashboard-decision-trend__fill{width:100%;border-radius:999px 999px 0 0;
  background:linear-gradient(180deg,#facc15,#7bd3ff);min-height:2px;}
.dashboard-decision-trend__label{font-weight:950;color:#dce7fb;}
.dashboard-decision-trend__sample{font-weight:800;font-variant-numeric:tabular-nums;text-align:center;}
.dashboard-decision-trend[data-direction="faster"] .dashboard-decision-trend__summary{color:#9ff0bd;}
.dashboard-decision-trend[data-direction="slower"] .dashboard-decision-trend__summary{color:#ffb4b4;}
.dashboard-accuracy-trend{border-top:1px solid rgba(148,163,184,.12);padding-top:10px;}
.dashboard-accuracy-trend__title{font-size:12px;font-weight:950;color:#dce7fb;}
.dashboard-accuracy-trend__empty{font-size:12px;color:#9fb0cf;}
.dashboard-accuracy-trend__bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(58px,1fr));
  gap:8px;align-items:end;min-height:126px;}
.dashboard-accuracy-trend__bar{display:grid;grid-template-rows:auto 86px auto auto;gap:5px;min-width:0;
  align-items:end;justify-items:center;font-size:11px;color:#9fb0cf;}
.dashboard-accuracy-trend__value{font-weight:950;color:#9ff0bd;font-variant-numeric:tabular-nums;}
.dashboard-accuracy-trend__track{width:100%;max-width:42px;height:86px;border-radius:999px;
  display:flex;align-items:flex-end;overflow:hidden;background:linear-gradient(180deg,rgba(148,163,184,.16),rgba(148,163,184,.08));
  border:1px solid rgba(148,163,184,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
.dashboard-accuracy-trend__fill{width:100%;border-radius:999px 999px 0 0;
  background:linear-gradient(180deg,#7bd3ff,#2bd576);min-height:2px;}
.dashboard-accuracy-trend__label{font-weight:950;color:#dce7fb;}
.dashboard-accuracy-trend__sample{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;}
.dashboard-accuracy-trend__bar[data-source="postflop"] .dashboard-accuracy-trend__fill{
  background:linear-gradient(180deg,#facc15,#2bd576);}
.dashboard-accuracy-trend__bar[data-source="mixed"] .dashboard-accuracy-trend__fill{
  background:linear-gradient(180deg,#c084fc,#7bd3ff 52%,#2bd576);}
.dashboard-leak-chart{border-top:1px solid rgba(148,163,184,.12);padding-top:10px;}
.dashboard-leak-chart__title{font-size:12px;font-weight:950;color:#dce7fb;}
.dashboard-leak-chart__empty{font-size:12px;color:#9fb0cf;}
.dashboard-leak-row{grid-template-columns:minmax(92px,1fr) minmax(120px,2fr) auto auto;}
.dashboard-leak-row__train,.preflop-curriculum__recommendation-train{appearance:none;border:1px solid rgba(43,213,118,.45);
  border-radius:9px;background:linear-gradient(180deg,#2bd576,#20bf69);color:#06120b;font-weight:950;
  font-size:12px;padding:7px 10px;cursor:pointer;box-shadow:0 10px 20px rgba(43,213,118,.14),
  inset 0 1px 0 rgba(255,255,255,.22);}
.dashboard-leak-row__train:disabled,.preflop-curriculum__recommendation-train:disabled{
  opacity:.45;cursor:not-allowed;}
.dashboard-kpi-chart-row{display:grid;grid-template-columns:minmax(92px,1fr) minmax(120px,2fr) auto;
  align-items:center;gap:9px;font-size:12px;}
.dashboard-kpi-chart-row__label{font-weight:850;color:#dce7fb;min-width:0;overflow-wrap:anywhere;}
.dashboard-kpi-chart-row__track{height:9px;border-radius:999px;background:rgba(148,163,184,.14);overflow:hidden;}
.dashboard-kpi-chart-row__bar{height:100%;border-radius:inherit;background:linear-gradient(90deg,#2bd576,#7bd3ff);}
.dashboard-kpi-chart-row__rate{font-weight:950;color:#9ff0bd;font-variant-numeric:tabular-nums;}
.dashboard-kpi-chart-row.dashboard-leak-row{grid-template-columns:minmax(92px,1fr) minmax(120px,2fr) auto auto;}
.preflop-curriculum{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;
  background:
  radial-gradient(circle at 85% 0%,rgba(123,211,255,.12),rgba(123,211,255,0) 34%),
  linear-gradient(180deg,rgba(18,25,38,.98),rgba(10,15,24,.98));}
.preflop-curriculum__title{grid-column:1/-1;}
.preflop-curriculum__summary{font-size:14px;font-weight:950;color:#f8fbff;overflow-wrap:anywhere;}
.preflop-curriculum__goals,.preflop-curriculum__due{font-size:12px;font-weight:800;color:#9fb0cf;}
.preflop-curriculum__due{grid-column:1/2;}
.preflop-curriculum__recommendations{grid-column:1/-1;display:grid;gap:7px;margin-top:4px;}
.preflop-curriculum__recommendations-title{font-size:12px;font-weight:950;color:#dce7fb;}
.preflop-curriculum__recommendation{display:grid;grid-template-columns:minmax(110px,1fr) minmax(160px,2fr) auto;
  gap:8px;align-items:center;border:1px solid rgba(148,163,184,.13);border-radius:9px;
  padding:8px;background:rgba(255,255,255,.035);font-size:12px;}
.preflop-curriculum__recommendation-label{font-weight:950;color:#f8fbff;min-width:0;overflow-wrap:anywhere;}
.preflop-curriculum__recommendation-meta{font-weight:800;color:#9fb0cf;min-width:0;overflow-wrap:anywhere;}
.preflop-curriculum__actions{grid-column:2;grid-row:2/5;align-self:center;}
.preflop-curriculum__start{appearance:none;border:1px solid rgba(43,213,118,.55);border-radius:10px;
  background:linear-gradient(180deg,#32df83,#20c96f);color:#06120b;font-weight:950;font-size:13px;
  padding:10px 14px;cursor:pointer;box-shadow:0 12px 26px rgba(43,213,118,.2),inset 0 1px 0 rgba(255,255,255,.28);}
.preflop-curriculum__start:disabled{opacity:.45;cursor:not-allowed;}
.dashboard-session{display:flex;flex-direction:column;gap:5px;}
.dashboard-streak{font-size:15px;font-weight:950;color:#9ff0bd;}
.dashboard-session-count{font-size:13px;color:#a8b7d5;font-weight:750;}
.permission-audit{display:grid;gap:10px;}
.permission-audit__rows{display:grid;gap:8px;}
.permission-audit__empty{font-size:12px;color:#9fb0cf;}
.permission-audit-row{display:grid;grid-template-columns:minmax(72px,1fr) auto auto auto auto;
  gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);border-radius:10px;
  padding:9px;background:rgba(255,255,255,.035);font-size:12px;color:#dce7fb;}
.permission-audit-row__title{font-weight:950;color:#f8fbff;}
.permission-audit-row__status{font-weight:950;color:#9ff0bd;}
.permission-audit-row[data-ready="false"] .permission-audit-row__status{color:#ffb4b4;}
.permission-audit-row__license,.permission-audit-row__scope,.permission-audit-row__evidence{
  color:#9fb0cf;font-weight:800;overflow-wrap:anywhere;}
.profile-breakdowns,.postflop-breakdowns,.preflop-leak-charts,.postflop-kpi-charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.profile-breakdowns__title,.postflop-breakdowns__title,.preflop-leak-charts__title,.postflop-kpi-charts__title{grid-column:1/-1;}
.preflop-leak-chart--bucket{grid-column:1/-1;}
.postflop-kpi-chart--boardTextureKey{grid-column:1/-1;}
.profile-breakdown,.postflop-breakdown,.preflop-leak-chart,.postflop-kpi-chart{background:rgba(255,255,255,.04);
  border:1px solid rgba(148,163,184,.13);border-radius:10px;padding:9px;min-width:0;}
.preflop-leak-chart__rows,.postflop-kpi-chart__rows{display:grid;gap:6px;}
.postflop-kpi-chart__empty{font-size:12px;color:#9fb0cf;}
.breakdown__rows,.profile-breakdown__rows,.postflop-breakdown__rows{display:flex;flex-direction:column;gap:2px;}
.breakdown-row,.profile-breakdown-row,.postflop-breakdown-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;
  align-items:center;padding:5px 7px;border-radius:8px;font-size:13px;}
.breakdown-row:nth-child(odd),.profile-breakdown-row:nth-child(odd),.postflop-breakdown-row:nth-child(odd){background:rgba(255,255,255,.035);}
.breakdown-row__name,.profile-breakdown-row__name,.postflop-breakdown-row__name{font-weight:750;min-width:0;overflow-wrap:anywhere;color:#e8ecf7;}
.breakdown-row__count,.profile-breakdown-row__count,.postflop-breakdown-row__count{color:#9fb0cf;font-variant-numeric:tabular-nums;}
.breakdown-row__rate,.profile-breakdown-row__rate,.postflop-breakdown-row__rate{font-weight:950;text-align:right;font-variant-numeric:tabular-nums;color:#9ff0bd;}
.profile-breakdown__empty,.postflop-breakdown__empty{font-size:12px;color:#9fb0cf;}
.rate--unavailable{color:#9fb0cf;font-weight:700;}
.stats-profile-filter{display:grid;gap:5px;margin-bottom:8px;}
.stats-profile-filter__label{display:grid;gap:5px;font-size:12px;font-weight:900;color:#9fb0cf;}
.stats-profile-select{appearance:none;border:1px solid rgba(148,163,184,.24);border-radius:10px;
  background:#101827;color:#e8ecf7;font-weight:850;font-size:13px;padding:9px 11px;min-height:40px;}
.stats-transfer__actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;}
.stats-export,.stats-import,.stats-reset-profile{appearance:none;border:1px solid rgba(148,163,184,.24);border-radius:10px;
  background:linear-gradient(180deg,#202a3f,#141d2f);color:#e8ecf7;font-weight:900;font-size:13px;padding:9px 13px;
  cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.06);}
.stats-reset-profile{border-color:rgba(255,180,180,.28);}
.stats-export:hover,.stats-import:hover{border-color:#2bd576;}
.stats-reset-profile:hover{border-color:#ffb4b4;}
.stats-reset-profile:disabled{opacity:.45;cursor:not-allowed;}
.stats-json-box{box-sizing:border-box;width:100%;min-height:140px;resize:vertical;
  border:1px solid rgba(148,163,184,.24);border-radius:10px;padding:10px 11px;font-family:ui-monospace,
  SFMono-Regular,Consolas,monospace;font-size:12px;color:#e8ecf7;background:#101827;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
.stats-transfer__status{margin-top:8px;font-size:12px;font-weight:700;}
.stats-transfer__status--ok{color:#9ff0bd;}
.stats-transfer__status--error{color:#ffb4b4;}
@media (max-width:640px){
  .dashboard{max-width:100%;}
  .profile-breakdowns,.postflop-breakdowns,.preflop-leak-charts,.postflop-kpi-charts{grid-template-columns:1fr;}
  .preflop-leak-chart--bucket{grid-column:auto;}
  .postflop-kpi-chart--boardTextureKey{grid-column:auto;}
  .dashboard-kpi__cards{grid-template-columns:1fr 1fr;}
  .dashboard-kpi-chart-row{grid-template-columns:1fr;gap:5px;}
  .dashboard-leak-row{grid-template-columns:1fr;}
  .dashboard-leak-row__train,.preflop-curriculum__recommendation-train{width:100%;min-height:38px;}
  .dashboard-confidence-kpi-row{grid-template-columns:1fr;gap:5px;}
  .dashboard-confidence-kpi-row__sample{white-space:normal;}
  .dashboard-decision-trend__bars{grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:7px;min-height:108px;}
  .dashboard-decision-trend__bar{grid-template-rows:auto 70px auto auto;font-size:10px;}
  .dashboard-decision-trend__track{height:70px;max-width:36px;}
  .dashboard-accuracy-trend__bars{grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:7px;min-height:112px;}
  .dashboard-accuracy-trend__bar{grid-template-rows:auto 72px auto auto;font-size:10px;}
  .dashboard-accuracy-trend__track{height:72px;max-width:36px;}
  .dashboard-summary,.dashboard-kpi,.preflop-curriculum,.dashboard-session,.permission-audit,.breakdown,.stats-transfer,.profile-breakdowns,.postflop-breakdowns,.preflop-leak-charts,.postflop-kpi-charts{
    border-radius:12px;padding:12px;}
  .preflop-curriculum{grid-template-columns:1fr;}
  .preflop-curriculum__actions,.preflop-curriculum__due{grid-column:auto;grid-row:auto;}
  .preflop-curriculum__recommendations{grid-column:auto;}
  .preflop-curriculum__recommendation{grid-template-columns:1fr;}
  .preflop-curriculum__start{width:100%;min-height:42px;}
  .permission-audit-row{grid-template-columns:1fr;gap:5px;}
  .stats-transfer__actions{display:grid;grid-template-columns:1fr;}
  .stats-export,.stats-import,.stats-reset-profile,.stats-profile-select{width:100%;min-height:42px;}
}
`;
  return style;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Renders the statistics dashboard into `root`.
 */
export function renderDashboard(data: DashboardData, root: HTMLElement): void {
  root.innerHTML = "";

  const { store } = data;
  const sessionCount = normalizeCount(data.sessionCount);

  const wrapper = el("div", "dashboard");
  wrapper.appendChild(dashboardStyles());

  // Summary (Req 9.3).
  wrapper.appendChild(renderSummary(store.summary()));
  wrapper.appendChild(renderKpiPanel(
    store,
    data.postflopRecords ?? [],
    data.onStartPreflopFocus,
  ));
  wrapper.appendChild(renderPreflopCurriculumPanel(store, data.onStartPreflopFocus));

  // Streak and current-session count (Req 9.5).
  wrapper.appendChild(renderStreakSession(store.currentStreak(), sessionCount));

  if (data.permissionReports !== undefined) {
    wrapper.appendChild(renderPermissionAuditPanel(data.permissionReports));
  }

  // Stats JSON export/import.
  wrapper.appendChild(renderStatsTransfer(data, root));

  // Profile breakdowns over migrated v2 records.
  wrapper.appendChild(renderProfileBreakdowns(store));
  wrapper.appendChild(renderPostflopBreakdowns(data.postflopRecords ?? []));
  wrapper.appendChild(renderPreflopLeakCharts(store));
  wrapper.appendChild(renderPostflopKpiCharts(data.postflopRecords ?? []));

  // Legacy breakdown dimensions.
  const dims: BreakdownDim[] = ["context", "position", "bucket"];
  for (const dim of dims) {
    wrapper.appendChild(renderBreakdown(dim, store.breakdownBy(dim)));
  }

  root.appendChild(wrapper);
}
