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

import type { ActionContext } from "../core/types";
import type { Filters } from "../core/types";
import type {
  Breakdown,
  BreakdownDim,
  GroupStat,
  StatsStore,
  Summary,
} from "../persistence/statsStore";
import { migrateResultRecordsToV2, type ResultRecordV2 } from "../persistence/statsRecordV2";
import { buildStatsExportJson, importStatsJson } from "../persistence/statsTransfer";
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
  permissionReports?: readonly ProductionPermissionManifestReport[];
  onStartPreflopFocus?: (filters: Filters) => void;
  onPostflopRecordsImported?: (records: readonly PostflopStatsV2BridgeRecord[]) => boolean | void;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const RATE_UNAVAILABLE = "\u2014";

const ACCURACY_TREND_WINDOW_SIZE = 5;
const ACCURACY_TREND_MAX_WINDOWS = 6;

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
      return key === "CHIP_EV" ? "chipEV" : key;
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
    case "TURN_BARREL":
      return "Turn barrel";
    case "RIVER_PRESSURE":
      return "River pressure";
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
): HTMLElement {
  const preflopRecords = migrateResultRecordsToV2(store.events());
  const model = buildStatsV2KpiModel(preflopRecords);
  const avgDecisionMs = averageDecisionMs(preflopRecords, postflopRecords);
  const accuracyTrend = buildAccuracyTrend(preflopRecords, postflopRecords);
  const box = el("section", "dashboard-kpi");
  box.dataset.total = String(model.total);
  box.dataset.recentWindowSize = String(model.recentWindowSize);
  box.dataset.minLeakSample = String(model.minLeakSample);
  box.dataset.trendWindows = String(accuracyTrend.length);
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
  if (avgDecisionMs !== null) {
    cards.appendChild(kpiCard("Avg decision", "avgResponseMs", formatDurationMs(avgDecisionMs)));
  }
  box.appendChild(cards);

  box.appendChild(renderKpiChart(model));
  box.appendChild(renderAccuracyTrend(accuracyTrend));
  box.appendChild(renderLeakChart(model.leakCandidates));

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

function renderLeakChart(candidates: readonly StatsV2LeakCandidate[]): HTMLElement {
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
    chart.appendChild(row);
  }

  return chart;
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

function renderStatsTransfer(data: DashboardData, root: HTMLElement): HTMLElement {
  const box = el("section", "stats-transfer");

  const heading = el("h3", "stats-transfer__title");
  heading.textContent = "Stats export / import";
  box.appendChild(heading);

  const actions = el("div", "stats-transfer__actions");
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "stats-export";
  exportBtn.textContent = "Export JSON";

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "stats-import";
  importBtn.textContent = "Import JSON";

  actions.appendChild(exportBtn);
  actions.appendChild(importBtn);
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
    textarea.value = buildStatsExportJson(data.store, new Date(), {
      postflopRecords: data.postflopRecords ?? [],
    });
    status.hidden = false;
    status.className = "stats-transfer__status stats-transfer__status--ok";
    status.textContent = "Stats export is ready in the JSON field.";
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
      renderDashboard({
        ...data,
        postflopRecords: result.postflopRecords,
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
.dashboard-kpi-chart,.dashboard-accuracy-trend,.dashboard-leak-chart{display:grid;gap:7px;}
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
.dashboard-kpi-chart-row{display:grid;grid-template-columns:minmax(92px,1fr) minmax(120px,2fr) auto;
  align-items:center;gap:9px;font-size:12px;}
.dashboard-kpi-chart-row__label{font-weight:850;color:#dce7fb;min-width:0;overflow-wrap:anywhere;}
.dashboard-kpi-chart-row__track{height:9px;border-radius:999px;background:rgba(148,163,184,.14);overflow:hidden;}
.dashboard-kpi-chart-row__bar{height:100%;border-radius:inherit;background:linear-gradient(90deg,#2bd576,#7bd3ff);}
.dashboard-kpi-chart-row__rate{font-weight:950;color:#9ff0bd;font-variant-numeric:tabular-nums;}
.preflop-curriculum{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;
  background:
  radial-gradient(circle at 85% 0%,rgba(123,211,255,.12),rgba(123,211,255,0) 34%),
  linear-gradient(180deg,rgba(18,25,38,.98),rgba(10,15,24,.98));}
.preflop-curriculum__title{grid-column:1/-1;}
.preflop-curriculum__summary{font-size:14px;font-weight:950;color:#f8fbff;overflow-wrap:anywhere;}
.preflop-curriculum__goals,.preflop-curriculum__due{font-size:12px;font-weight:800;color:#9fb0cf;}
.preflop-curriculum__due{grid-column:1/2;}
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
.stats-transfer__actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;}
.stats-export,.stats-import{appearance:none;border:1px solid rgba(148,163,184,.24);border-radius:10px;
  background:linear-gradient(180deg,#202a3f,#141d2f);color:#e8ecf7;font-weight:900;font-size:13px;padding:9px 13px;
  cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.06);}
.stats-export:hover,.stats-import:hover{border-color:#2bd576;}
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
  .dashboard-accuracy-trend__bars{grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:7px;min-height:112px;}
  .dashboard-accuracy-trend__bar{grid-template-rows:auto 72px auto auto;font-size:10px;}
  .dashboard-accuracy-trend__track{height:72px;max-width:36px;}
  .dashboard-summary,.dashboard-kpi,.preflop-curriculum,.dashboard-session,.permission-audit,.breakdown,.stats-transfer,.profile-breakdowns,.postflop-breakdowns,.preflop-leak-charts,.postflop-kpi-charts{
    border-radius:12px;padding:12px;}
  .preflop-curriculum{grid-template-columns:1fr;}
  .preflop-curriculum__actions,.preflop-curriculum__due{grid-column:auto;grid-row:auto;}
  .preflop-curriculum__start{width:100%;min-height:42px;}
  .permission-audit-row{grid-template-columns:1fr;gap:5px;}
  .stats-transfer__actions{display:grid;grid-template-columns:1fr;}
  .stats-export,.stats-import{width:100%;min-height:42px;}
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
  wrapper.appendChild(renderKpiPanel(store, data.postflopRecords ?? []));
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
