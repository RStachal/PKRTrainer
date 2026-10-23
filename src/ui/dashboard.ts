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
import { positionPatternLabel } from "../core/postflopGenerator";
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
import { CS, getAppLanguage, localizedText } from "./cs";

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
  /**
   * The preflop profile the player is training. Leak detection and the study
   * plan are measured inside it; omitted, they follow the newest answer. What
   * they must not do is pool every profile, which turns a leak into an average
   * of tables the player is not sitting at.
   */
  activeProfileId?: string;
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
  context: "By action context",
  position: "By position",
  bucket: "By stack depth",
};

const PROFILE_DIM_TITLE: Record<StatsV2BreakdownDim, string> = {
  gameVariant: "By game variant",
  tableFormat: "By table format",
  blindSpeed: "By blind speed",
  street: "By street",
  evModel: "By EV model",
  ante: "By ante",
  rakeMode: "By rake",
  rangePackId: "By preflop model",
  position: "By position",
  bucket: "By stack depth",
  context: "By situation",
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
  gameVariant: "By game variant",
  tableFormat: "By table format",
  blindSpeed: "By blind speed",
  evModel: "By EV model",
  ante: "By ante",
  rakeMode: "By rake",
  street: "By street",
  actionNode: "By postflop node",
  potType: "By pot type",
  positionPattern: "By position pattern",
  positionPair: "By position pair",
  boardTextureKey: "By board texture",
  strategyPackId: "By postflop model",
  confidence: "By confidence",
  sourceQuality: "By production status",
};

type PostflopDashboardBreakdownDim = PostflopStatsBreakdownDim | "flowMode";

function groupLabel(dim: BreakdownDim | PostflopDashboardBreakdownDim, key: string): string {
  switch (dim) {
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "position":
      return key;
    case "gameVariant":
      return gameVariantLabel(key);
    case "tableFormat":
      return tableFormatLabel(key);
    case "blindSpeed":
      return blindSpeedLabel(key);
    case "evModel":
      return evModelLabel(key);
    case "ante":
      return key === "ON" ? "Ante on" : "Ante off";
    case "rakeMode":
      return rakeModeLabel(key);
    case "strategyPackId":
      return "Postflop model";
    case "confidence":
      return confidenceLabel(key);
    case "actionNode":
      return postflopActionNodeLabel(key);
    case "potType":
      return postflopPotTypeLabel(key);
    case "positionPattern":
      return positionPatternLabel(key as Parameters<typeof positionPatternLabel>[0]);
    case "positionPair":
      return positionPairLabel(key);
    case "boardTextureKey":
      return postflopBoardTextureKeyLabel(key);
    case "street":
      return streetLabel(key);
    case "sourceQuality":
      return postflopSourceQualityLabel(key);
    case "flowMode":
      return postflopFlowModeLabel(key);
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
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    default:
      return key;
  }
}

function postflopActionNodeLabel(key: string): string {
  switch (key) {
    case "SINGLE_RAISED_POT_CBET":
      return "Flop c-bet in SRP";
    case "THREE_BET_POT_CBET":
      return "Flop c-bet in 3-bet pot";
    case "FLOP_FACING_BET":
      return "Flop facing bet";
    case "TURN_BARREL":
      return "Turn barrel";
    case "TURN_OOP_LEAD":
      return "Turn lead out of position";
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

function postflopPotTypeLabel(key: string): string {
  switch (key) {
    case "SINGLE_RAISED":
      return "Single-raised pot";
    case "THREE_BET_POT":
      return "3bet pot";
    case "LIMPED_POT":
      return "Limped pot";
    default:
      return key;
  }
}

function positionPairLabel(key: string): string {
  const [hero, villain] = key.split("_VS_");
  if (!hero || !villain) return key;
  return `${hero} vs ${villain}`;
}

function postflopSourceQualityLabel(key: string): string {
  switch (key) {
    case "PRODUCTION":
      return "Production";
    case "PREVIEW":
      return "Preview / low confidence";
    case "HEURISTIC":
      return "Heuristic model (not solver-backed)";
    case "FALLBACK":
      return "Fallback model";
    default:
      return key;
  }
}

function postflopFlowModeLabel(key: string): string {
  switch (key) {
    case "SINGLE_SPOT":
      return "Single spot";
    case "HAND_LINE":
      return "Hand line";
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
      return "broadway high";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "straight-possible":
      return "straight possible";
    case "flush-draw-heavy":
      return "flush-draw heavy";
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
  total.textContent = `Total answers: ${summary.total}`;
  box.appendChild(total);

  const rateLine = el("div", "summary-rate-line");
  const rateLabel = el("span", "summary-rate-label");
  rateLabel.textContent = CS.dashboard.successRate;
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
  activeProfileId?: string,
): HTMLElement {
  const preflopRecords = migrateResultRecordsToV2(store.events());
  const model = buildStatsV2KpiModel(preflopRecords, { leakProfileId: activeProfileId });
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
  cards.appendChild(kpiCard(CS.dashboard.lifetimeAccuracy, "lifetimeRate", formatRate(model.lifetimeRate)));
  cards.appendChild(kpiCard(
    `Last ${model.recentWindowSize}`,
    "recentRate",
    `${formatRate(model.recentRate)} (${model.recentTotal})`,
  ));
  cards.appendChild(kpiCard(CS.dashboard.bestStreak, "bestStreak", String(model.bestStreak)));
  cards.appendChild(kpiCard(CS.dashboard.leakFocus, "leakFocus", leakFocusText(model)));
  cards.appendChild(kpiCard(
    CS.dashboard.weightedAccuracy,
    "confidenceWeightedRate",
    `${formatRate(confidenceWeightedKpi.rate)} (${formatWeightedNumber(confidenceWeightedKpi.weightedTotal)}w)`,
  ));
  if (avgDecisionMs !== null) {
    cards.appendChild(kpiCard(CS.dashboard.averageDecision, "avgResponseMs", formatDurationMs(avgDecisionMs)));
  }
  if (decisionTrend.available) {
    cards.appendChild(kpiCard(
      CS.dashboard.decisionTrend,
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
  activeProfileId?: string,
): HTMLElement {
  const records = migrateResultRecordsToV2(store.events());
  const plan = buildPreflopCurriculumPlan(records, {
    language: getAppLanguage(),
    profileId: activeProfileId,
  });
  const box = el("section", "preflop-curriculum");
  box.dataset.available = String(plan.available);
  box.dataset.recommendations = String(plan.recommendations.length);
  box.dataset.scopeProfileId = plan.scope.profileId ?? "";
  box.dataset.scopeRecords = String(plan.scope.records);
  box.dataset.scopeSetAside = String(plan.scope.setAside);

  const heading = el("h3", "preflop-curriculum__title");
  heading.textContent = CS.dashboard.trainingFocus;
  box.appendChild(heading);

  const summary = el("div", "preflop-curriculum__summary");
  summary.textContent = plan.focus
    ? `${plan.focus.label} - ${formatRate(plan.focus.rate)}, ${plan.focus.total} spots`
    : plan.reason;
  box.appendChild(summary);

  const goals = el("div", "preflop-curriculum__goals");
  goals.textContent =
    `${plan.sessionGoal.targetSpots} spots | ` +
    `target ${plan.sessionGoal.targetAccuracy} % | ` +
    `streak ${plan.sessionGoal.streakTarget}`;
  box.appendChild(goals);

  const due = el("div", "preflop-curriculum__due");
  due.textContent = `Due for review: ${plan.repetitionQueue.length}`;
  box.appendChild(due);

  // Where the number came from. Without this a player who trains more than one
  // table sees a percentage with no way to tell which table it describes.
  if (plan.scope.profileId !== null) {
    const scope = el("div", "preflop-curriculum__scope");
    const measured = statsProfileLabel(plan.scope.profileId);
    scope.textContent = plan.scope.setAside > 0
      ? localizedText(
        `Measured in ${measured}: ${plan.scope.records} answers (${plan.scope.setAside} in other profiles are not counted).`,
        `Měřeno v profilu ${measured}: ${plan.scope.records} odpovědí (${plan.scope.setAside} z jiných profilů se nepočítá).`,
      )
      : localizedText(
        `Measured in ${measured}: ${plan.scope.records} answers.`,
        `Měřeno v profilu ${measured}: ${plan.scope.records} odpovědí.`,
      );
    box.appendChild(scope);
  }

  if (plan.recommendations.length > 0) {
    const recommendations = el("div", "preflop-curriculum__recommendations");
    const recommendationTitle = el("div", "preflop-curriculum__recommendations-title");
    recommendationTitle.textContent = CS.dashboard.nextStudyFocus;
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
      train.textContent = CS.dashboard.train;
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
    start.textContent = CS.dashboard.trainFocus;
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
  heading.textContent = CS.dashboard.rangeAudit;
  box.appendChild(heading);

  if (reports.length === 0) {
    const empty = el("div", "permission-audit__empty");
    empty.textContent = localizedText(
      "No permission audit reports are loaded.",
      "Nejsou načtené žádné kontrolní reporty.",
    );
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
  status.textContent = report.valid ? CS.dashboard.ready : `Blocked (${report.errors.length})`;
  row.appendChild(status);

  const license = el("div", "permission-audit-row__license");
  license.textContent = permissionLicenseLabel(report.licenseKind);
  row.appendChild(license);

  const scope = el("div", "permission-audit-row__scope");
  scope.textContent = permissionScopeLabel(report.allowedRedistributionScope);
  row.appendChild(scope);

  const evidence = el("div", "permission-audit-row__evidence");
  evidence.textContent = `Evidence: ${report.evidenceCount}`;
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
      return "Explicit written permission";
    default:
      return "Permission missing";
  }
}

function permissionScopeLabel(scope: string): string {
  switch (scope) {
    case "PKRTRAINER_RUNTIME_BUNDLE":
      return "Allowed in runtime bundle";
    case "PKRTRAINER_INTERNAL_REVIEW_ONLY":
      return "Internal review only";
    case "NO_REDISTRIBUTION":
      return "No redistribution";
    default:
      return "Permission scope missing";
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
      verified ? "Reviewed preflop" : "Fallback preflop model",
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
    return { key: "postflop-fallback", label: "Fallback postflop model", weight: 0.25 };
  }

  switch (record.confidence) {
    case "HIGH":
      return { key: "postflop-high", label: "High-confidence postflop", weight: 1 };
    case "MEDIUM":
      return { key: "postflop-medium", label: "Medium-confidence postflop", weight: 0.75 };
    case "LOW":
    default:
      return { key: "postflop-low", label: "Low-confidence postflop", weight: 0.5 };
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
  if (!model.available || model.deltaMs === null || model.direction === null) {
    return CS.dashboard.pendingSample;
  }
  if (model.direction === "stable") return CS.dashboard.stable;
  const duration = formatDurationMs(Math.abs(model.deltaMs));
  return model.direction === "faster"
    ? `Faster by ${duration}`
    : `Slower by ${duration}`;
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
  if (!first) return `No leak above ${model.minLeakSample}+ samples`;
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
  title.textContent = CS.dashboard.confidenceWeightedKpi;
  chart.appendChild(title);

  if (model.groups.length === 0) {
    const empty = el("div", "dashboard-confidence-kpi__empty");
    empty.textContent = localizedText(
      "No confidence-weighted sample is available yet.",
      "Zatím není dostupný vážený vzorek.",
    );
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
  title.textContent = CS.dashboard.decisionTimeTrend;
  chart.appendChild(title);

  if (!model.available) {
    const empty = el("div", "dashboard-decision-trend__empty");
    empty.textContent = localizedText(
      `${model.minSample} timed decisions are required. Current sample: ${model.sample}.`,
      `Je potřeba ${model.minSample} měřených rozhodnutí. Aktuální vzorek: ${model.sample}.`,
    );
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
  sample.textContent = `Decisions: ${point.total}`;
  bar.appendChild(sample);

  return bar;
}

function renderAccuracyTrend(points: readonly AccuracyTrendPoint[]): HTMLElement {
  const chart = el("div", "dashboard-accuracy-trend");
  chart.dataset.windows = String(points.length);

  const title = el("div", "dashboard-accuracy-trend__title");
  title.textContent = CS.dashboard.recentAccuracyTrend;
  chart.appendChild(title);

  if (points.length === 0) {
    const empty = el("div", "dashboard-accuracy-trend__empty");
    empty.textContent = localizedText(
      "No recent trend is available yet.",
      "Zatím není dostupný nedávný vývoj.",
    );
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
  title.textContent = CS.dashboard.qualifiedLeaks;
  chart.appendChild(title);

  if (candidates.length === 0) {
    const empty = el("div", "dashboard-leak-chart__empty");
    empty.textContent = localizedText(
      "No leak has a sufficient sample yet.",
      "Zatím není dostupná slabina s dostatečným vzorkem.",
    );
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
    train.textContent = CS.dashboard.train;
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
  heading.textContent = CS.dashboard.preflopLeakCharts;
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
  label.textContent = CS.dashboard.profile;
  const select = document.createElement("select");
  select.className = "stats-profile-select";
  select.appendChild(statsProfileOption("", CS.dashboard.allProfiles));
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
  exportBtn.textContent = CS.dashboard.exportJson;

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "stats-import";
  importBtn.textContent = CS.dashboard.importJson;

  const resetProfileBtn = document.createElement("button");
  resetProfileBtn.type = "button";
  resetProfileBtn.className = "stats-reset-profile";
  resetProfileBtn.textContent = CS.dashboard.resetProfile;
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
  textarea.placeholder = CS.dashboard.transferPlaceholder;
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
      ? localizedText(
        "The selected profile export is ready in the JSON field.",
        "Export vybraného profilu je připravený v poli JSON.",
      )
      : localizedText(
        "The stats export is ready in the JSON field.",
        "Export statistik je připravený v poli JSON.",
      );
  });

  importBtn.addEventListener("click", () => {
    const result = importStatsJson(textarea.value, data.store);
    status.hidden = false;
    if (result.ok) {
      const postflopSaved = data.onPostflopRecordsImported?.(result.postflopRecords) ?? true;
      if (!postflopSaved) {
        status.className = "stats-transfer__status stats-transfer__status--error";
        status.textContent = localizedText(
          "Preflop stats were imported, but the postflop record could not be saved.",
          "Preflop statistiky byly importovány, ale postflop záznam se nepodařilo uložit.",
        );
        return;
      }
      const postflopLinesSaved = data.onPostflopLineRecordsImported?.(result.postflopLineRecords) ?? true;
      if (!postflopLinesSaved) {
        status.className = "stats-transfer__status stats-transfer__status--error";
        status.textContent = localizedText(
          "Preflop and postflop stats were imported, but the postflop hand-line record could not be saved.",
          "Preflop a postflop statistiky byly importovány, ale záznam postflop hand line se nepodařilo uložit.",
        );
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
        refreshedStatus.textContent = localizedText(
          `Imported stats records: ${result.imported}.`,
          `Importováno záznamů statistik: ${result.imported}.`,
        );
      }
      return;
    }
    status.className = "stats-transfer__status stats-transfer__status--error";
    status.textContent = localizedText("Stats import failed.", "Import statistik selhal.");
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
      status.textContent = localizedText(
        "The selected profile reset failed.",
        "Reset vybraného profilu selhal.",
      );
      return;
    }
    const postflopSaved = data.onPostflopRecordsImported?.(selected.postflopRecords) ?? true;
    if (!postflopSaved) {
      status.className = "stats-transfer__status stats-transfer__status--error";
      status.textContent = localizedText(
        "Preflop stats were reset, but the postflop record could not be saved.",
        "Preflop statistiky byly resetovány, ale postflop záznam se nepodařilo uložit.",
      );
      return;
    }
    const postflopLinesSaved = data.onPostflopLineRecordsImported?.(selected.postflopLineRecords) ?? true;
    if (!postflopLinesSaved) {
      status.className = "stats-transfer__status stats-transfer__status--error";
      status.textContent = localizedText(
        "Preflop and postflop stats were reset, but the postflop hand-line record could not be saved.",
        "Preflop a postflop statistiky byly resetovány, ale záznam postflop hand line se nepodařilo uložit.",
      );
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
      refreshedStatus.textContent = localizedText(
        "The selected profile stats were reset.",
        "Statistiky vybraného profilu byly resetovány.",
      );
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
    empty.textContent = localizedText("No records yet.", "Zatím nejsou žádné záznamy.");
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
  heading.textContent = "Stats by profile";
  box.appendChild(heading);

  const eventsV2 = migrateResultRecordsToV2(store.events());
  for (const dim of availableStatsV2Dimensions()) {
    box.appendChild(renderProfileBreakdown(dim, breakdownStatsV2(eventsV2, dim)));
  }

  return box;
}

function renderPostflopBreakdownRow(
  dim: PostflopDashboardBreakdownDim,
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
  dim: PostflopDashboardBreakdownDim,
  groups: PostflopStatsGroup[],
): HTMLElement {
  const box = el("section", `postflop-breakdown postflop-breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h4", "postflop-breakdown__title");
  heading.textContent = dim === "flowMode" ? "By training type" : POSTFLOP_DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "postflop-breakdown__rows");
  if (groups.length === 0) {
    const empty = el("div", "postflop-breakdown__empty");
    empty.textContent = localizedText(
      "No postflop answers yet.",
      "Zatím nejsou žádné postflop odpovědi.",
    );
    rows.appendChild(empty);
  } else {
    for (const group of groups) {
      rows.appendChild(renderPostflopBreakdownRow(dim, group));
    }
  }
  box.appendChild(rows);

  return box;
}

function postflopFlowModeGroups(
  records: readonly PostflopStatsV2BridgeRecord[],
  lineRecords: readonly PostflopLineResultRecord[],
): PostflopStatsGroup[] {
  const singles = postflopStatsGroup(
    "SINGLE_SPOT",
    records.length,
    records.filter((record) => record.correct).length,
  );
  const lineStreetRecords = postflopLineStreetRecords(lineRecords);
  const lines = postflopStatsGroup(
    "HAND_LINE",
    lineStreetRecords.length,
    lineStreetRecords.filter((record) => record.correct).length,
  );
  return [singles, lines].filter((group) => group.total > 0);
}

function postflopLineStreetRecords(
  records: readonly PostflopLineResultRecord[],
): PostflopStatsV2BridgeRecord[] {
  return records.flatMap((line) => line.streetResults.map((street) => street.record));
}

function postflopLineStreetCount(records: readonly PostflopLineResultRecord[]): number {
  return records.reduce((total, record) => total + record.streetResults.length, 0);
}

function postflopStatsGroup(key: string, total: number, correct: number): PostflopStatsGroup {
  return {
    key,
    total,
    correct,
    rate: total <= 0 ? null : Math.round((correct / total) * 1000) / 10,
  };
}

function renderPostflopBreakdowns(
  records: readonly PostflopStatsV2BridgeRecord[],
  lineRecords: readonly PostflopLineResultRecord[] = [],
): HTMLElement {
  const box = el("section", "postflop-breakdowns");
  box.dataset.total = String(records.length + postflopLineStreetCount(lineRecords));

  const heading = el("h3", "postflop-breakdowns__title");
  heading.textContent = "Postflop stats";
  box.appendChild(heading);

  const allRecords = [...records, ...postflopLineStreetRecords(lineRecords)];
  box.appendChild(renderPostflopBreakdown("flowMode", postflopFlowModeGroups(records, lineRecords)));
  for (const dim of availablePostflopStatsDimensions()) {
    box.appendChild(renderPostflopBreakdown(dim, breakdownPostflopStats(allRecords, dim)));
  }

  return box;
}

function renderPostflopKpiCharts(
  records: readonly PostflopStatsV2BridgeRecord[],
  lineRecords: readonly PostflopLineResultRecord[] = [],
): HTMLElement {
  const allRecords = [...records, ...postflopLineStreetRecords(lineRecords)];
  const box = el("section", "postflop-kpi-charts");
  box.dataset.total = String(allRecords.length);
  const heading = el("h3", "postflop-kpi-charts__title");
  heading.textContent = "Postflop KPI";
  box.appendChild(heading);

  for (const dim of [
    "street",
    "actionNode",
    "potType",
    "positionPattern",
    "boardTextureKey",
    "sourceQuality",
    "confidence",
  ] as const) {
    box.appendChild(renderPostflopKpiChart(dim, breakdownPostflopStats(allRecords, dim)));
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
    empty.textContent = localizedText(
      "No postflop answers yet.",
      "Zatím nejsou žádné postflop odpovědi.",
    );
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

  // Summary (Req 9.3).
  wrapper.appendChild(renderSummary(store.summary()));
  wrapper.appendChild(renderKpiPanel(
    store,
    data.postflopRecords ?? [],
    data.onStartPreflopFocus,
    data.activeProfileId,
  ));
  wrapper.appendChild(renderPreflopCurriculumPanel(
    store,
    data.onStartPreflopFocus,
    data.activeProfileId,
  ));

  // Streak and current-session count (Req 9.5).
  wrapper.appendChild(renderStreakSession(store.currentStreak(), sessionCount));

  if (data.permissionReports !== undefined) {
    wrapper.appendChild(renderPermissionAuditPanel(data.permissionReports));
  }

  // Stats JSON export/import.
  wrapper.appendChild(renderStatsTransfer(data, root));

  // Profile breakdowns over migrated v2 records.
  wrapper.appendChild(renderProfileBreakdowns(store));
  wrapper.appendChild(renderPostflopBreakdowns(
    data.postflopRecords ?? [],
    data.postflopLineRecords ?? [],
  ));
  wrapper.appendChild(renderPreflopLeakCharts(store));
  wrapper.appendChild(renderPostflopKpiCharts(
    data.postflopRecords ?? [],
    data.postflopLineRecords ?? [],
  ));

  // Legacy breakdown dimensions.
  const dims: BreakdownDim[] = ["context", "position", "bucket"];
  for (const dim of dims) {
    wrapper.appendChild(renderBreakdown(dim, store.breakdownBy(dim)));
  }

  root.appendChild(wrapper);
}
