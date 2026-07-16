import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEFAULT_REVIEWS_DIR = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_OUTPUT = "artifacts/texas-solver-review-integration/viewer/index.html";
const DEFAULT_WAVES = "artifacts/texas-solver-review-protocol/packet/OWNER_REVIEW_WAVES.md";
const RANK_ORDER = "AKQJT98765432".split("");

interface CliArgs {
  inputs: string[];
  outputPath: string;
  reviewsDir: string;
  wavesPath: string | null;
  title: string;
}

interface ReviewReport {
  valid?: unknown;
  status?: unknown;
  productionReady?: unknown;
  familyId?: unknown;
  nodeHistory?: unknown;
  counts?: unknown;
  files?: unknown;
  anomalies?: unknown;
  blockers?: unknown;
  reviewOnlyTreeProfile?: unknown;
}

interface ReviewCounts {
  rawFiles: number;
  parsedFiles: number;
  blockedFiles: number;
  combos: number;
  handClasses: number;
}

interface ReviewFile {
  boardId: string;
  comboCount: number;
  handClassCount: number;
  nodeType: string;
  player: number | null;
  handClasses: Record<string, HandClassStrategy>;
}

interface HandClassStrategy {
  comboCount: number;
  averageByAction: Record<string, number>;
  dominantAction: string;
  dominantFrequency: number;
}

interface NormalizedReport {
  familyId: string;
  nodeLabel: string;
  sourcePath: string;
  valid: boolean;
  status: string;
  productionReady: boolean;
  counts: ReviewCounts;
  files: ReviewFile[];
  anomalies: string[];
  blockers: string[];
  reviewOnlyTreeProfile: string | null;
}

interface OwnerDecisionFamily {
  familyId: string;
  status: string;
  anchor: string;
  wave: number | null;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const inputPaths = args.inputs.length > 0 ? args.inputs : findReviewReports(args.reviewsDir);
  if (inputPaths.length === 0) {
    throw new Error(`No review reports found. Pass --input <file> or generate reports under ${args.reviewsDir}.`);
  }

  const reports = inputPaths.map(readReviewReport).sort(compareReports);
  const reviewWaves = readReviewWaves(args.wavesPath);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, buildHtml(args.title, reports, reviewWaves), "utf8");

  console.log(`TexasSolver review viewer written: ${args.outputPath}`);
  console.log(`Reports: ${reports.length}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const inputs: string[] = [];
  let outputPath = resolve(DEFAULT_OUTPUT);
  let reviewsDir = resolve(DEFAULT_REVIEWS_DIR);
  let wavesPath: string | null = existsSync(resolve(DEFAULT_WAVES)) ? resolve(DEFAULT_WAVES) : null;
  let title = "TexasSolver MTT review viewer";

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--input") {
      inputs.push(resolve(nextArg(argv, index, "--input")));
      index += 1;
      continue;
    }
    if (item.startsWith("--input=")) {
      inputs.push(resolve(requiredInlineValue(item, "--input")));
      continue;
    }
    if (item === "--reviews-dir") {
      reviewsDir = resolve(nextArg(argv, index, "--reviews-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--reviews-dir=")) {
      reviewsDir = resolve(requiredInlineValue(item, "--reviews-dir"));
      continue;
    }
    if (item === "--waves") {
      wavesPath = resolve(nextArg(argv, index, "--waves"));
      index += 1;
      continue;
    }
    if (item.startsWith("--waves=")) {
      wavesPath = resolve(requiredInlineValue(item, "--waves"));
      continue;
    }
    if (item === "--no-waves") {
      wavesPath = null;
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArg(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(requiredInlineValue(item, "--output"));
      continue;
    }
    if (item === "--title") {
      title = nextArg(argv, index, "--title");
      index += 1;
      continue;
    }
    if (item.startsWith("--title=")) {
      title = requiredInlineValue(item, "--title");
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { inputs, outputPath, reviewsDir, wavesPath, title };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-viewer",
    "  npm run mtt:texas-solver-viewer -- --input artifacts/.../CHECK.review-report.json",
    "  npm run mtt:texas-solver-viewer -- --reviews-dir artifacts/texas-solver-review-integration/reviews --output artifacts/texas-solver-review-integration/viewer/index.html",
    "  npm run mtt:texas-solver-viewer -- --waves artifacts/texas-solver-review-protocol/packet/OWNER_REVIEW_WAVES.md",
    "",
    "Builds a local source-safe HTML viewer from TexasSolver review JSON files.",
    "It does not create production normalized.json or permission.json files.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function requiredInlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function findReviewReports(reviewsDir: string): string[] {
  if (!existsSync(reviewsDir)) return [];
  return walkFiles(reviewsDir).filter((filePath) => (
    filePath.endsWith(".review-report.json") ||
    filePath.endsWith(".review.json")
  ));
}

function walkFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function readReviewWaves(wavesPath: string | null): ReadonlyMap<string, number> {
  const waves = new Map<string, number>();
  if (wavesPath === null) return waves;
  if (!existsSync(wavesPath)) throw new Error(`Owner review waves file is missing: ${wavesPath}`);

  let currentWave: number | null = null;
  for (const line of readFileSync(wavesPath, "utf8").split(/\r?\n/)) {
    const heading = line.match(/^## Wave (\d+)\s*$/i);
    if (heading !== null) {
      currentWave = Number.parseInt(heading[1], 10);
      continue;
    }
    const family = line.match(/^-\s+([A-Za-z0-9_]+):/);
    if (family === null || currentWave === null) continue;
    if (waves.has(family[1])) throw new Error(`Owner review waves contain duplicate family: ${family[1]}`);
    waves.set(family[1], currentWave);
  }
  return waves;
}

function readReviewReport(sourcePath: string): NormalizedReport {
  const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as ReviewReport;
  return {
    familyId: asString(parsed.familyId, "UNKNOWN_FAMILY"),
    nodeLabel: nodeLabel(parsed.nodeHistory),
    sourcePath,
    valid: parsed.valid === true,
    status: asString(parsed.status, "UNKNOWN"),
    productionReady: parsed.productionReady === true,
    counts: normalizeCounts(parsed.counts),
    files: normalizeFiles(parsed.files),
    anomalies: asStringArray(parsed.anomalies),
    blockers: asStringArray(parsed.blockers),
    reviewOnlyTreeProfile: typeof parsed.reviewOnlyTreeProfile === "string"
      ? parsed.reviewOnlyTreeProfile
      : null,
  };
}

function normalizeCounts(value: unknown): ReviewCounts {
  if (!isRecord(value)) return { rawFiles: 0, parsedFiles: 0, blockedFiles: 0, combos: 0, handClasses: 0 };
  return {
    rawFiles: asNumber(value.rawFiles),
    parsedFiles: asNumber(value.parsedFiles),
    blockedFiles: asNumber(value.blockedFiles),
    combos: asNumber(value.combos),
    handClasses: asNumber(value.handClasses),
  };
}

function normalizeFiles(value: unknown): ReviewFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    boardId: asString(item.boardId, "unknown"),
    comboCount: asNumber(item.comboCount),
    handClassCount: asNumber(item.handClassCount),
    nodeType: asString(item.nodeType, "unknown"),
    player: typeof item.player === "number" ? item.player : null,
    handClasses: normalizeHandClasses(item.handClasses),
  }));
}

function normalizeHandClasses(value: unknown): Record<string, HandClassStrategy> {
  if (!isRecord(value)) return {};
  const result: Record<string, HandClassStrategy> = {};
  for (const [handClass, rawStrategy] of Object.entries(value)) {
    if (!isRecord(rawStrategy)) continue;
    result[handClass] = {
      comboCount: asNumber(rawStrategy.comboCount),
      averageByAction: normalizeActionMix(rawStrategy.averageByAction),
      dominantAction: asString(rawStrategy.dominantAction, "UNKNOWN"),
      dominantFrequency: asNumber(rawStrategy.dominantFrequency),
    };
  }
  return result;
}

function normalizeActionMix(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [action, rawFrequency] of Object.entries(value)) result[action] = asNumber(rawFrequency);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nodeLabel(value: unknown): string {
  const nodeHistory = asStringArray(value);
  return nodeHistory.length === 0 ? "ROOT" : nodeHistory.join(" > ");
}

function compareReports(left: NormalizedReport, right: NormalizedReport): number {
  return `${left.familyId} ${left.nodeLabel}`.localeCompare(`${right.familyId} ${right.nodeLabel}`);
}

function buildHtml(title: string, reports: readonly NormalizedReport[], reviewWaves: ReadonlyMap<string, number>): string {
  const generatedAt = new Date().toISOString();
  const summary = summarizeReports(reports);
  const summaryCards = reports.map((report) => renderSummaryCard(report, reviewWaves)).join("\n");
  const reportSections = reports.map((report) => renderReportSection(report, reviewWaves)).join("\n");
  const waveOptions = renderWaveOptions(reports, reviewWaves);
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${css()}</style>
</head>
<body>
  <header class="page-header">
    <p class="eyebrow">PKRTrainer / source-safe review</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="generated">Generated ${escapeHtml(generatedAt)}. Review evidence only.</p>
    <dl class="metrics">
      <div><dt>Families</dt><dd>${summary.total}</dd></div>
      <div><dt>Ready</dt><dd>${summary.protocolReady}</dd></div>
      <div><dt>Pending</dt><dd>${summary.pending}</dd></div>
      <div><dt>Evidence</dt><dd>${summary.evidenceOnly}</dd></div>
      <div><dt>Blockers</dt><dd>${summary.blockers}</dd></div>
    </dl>
  </header>
  <main>
    <section class="toolbar" aria-label="Review filters">
      <label>Family<input id="family-filter" type="search" placeholder="Search family"></label>
      <label>Status<select id="status-filter"><option value="ALL">All statuses</option><option value="REVIEW_ONLY_EVIDENCE">Review-only evidence</option><option value="NEEDS_REVIEW">Needs review</option><option value="REVIEWED_SCOPED">Reviewed scoped</option><option value="REVIEWED_PRODUCTION">Reviewed production</option><option value="REVIEWED_NOT_USABLE">Reviewed not usable</option><option value="MISSING_REVIEW">Missing review</option></select></label>
      <label>Wave<select id="wave-filter">${waveOptions}</select></label>
      <output id="filter-count" aria-live="polite">${summary.total} families</output>
    </section>
    ${renderOwnerDecisionWorkbench(reports, reviewWaves)}
    <section class="summary-grid">${summaryCards}</section>
    ${reportSections}
  </main>
  <script>${filterScript()}</script>
</body>
</html>
`;
}

function renderWaveOptions(reports: readonly NormalizedReport[], reviewWaves: ReadonlyMap<string, number>): string {
  const waveNumbers = [...new Set(reports.map((report) => reviewWaves.get(report.familyId)).filter((wave): wave is number => wave !== undefined))]
    .sort((left, right) => left - right);
  const firstPending = waveNumbers.find((wave) => reports.some((report) => (
    reviewWaves.get(report.familyId) === wave && (report.status === "NEEDS_REVIEW" || report.status === "MISSING_REVIEW")
  ))) ?? null;
  const options = [`<option value="ALL"${firstPending === null ? " selected" : ""}>All waves</option>`];
  for (const wave of waveNumbers) {
    const familyCount = new Set(reports.filter((report) => reviewWaves.get(report.familyId) === wave).map((report) => report.familyId)).size;
    options.push(`<option value="${wave}"${wave === firstPending ? " selected" : ""}>Wave ${wave} (${familyCount})</option>`);
  }
  if (reports.some((report) => !reviewWaves.has(report.familyId))) options.push('<option value="UNASSIGNED">Unassigned</option>');
  return options.join("");
}

function summarizeReports(reports: readonly NormalizedReport[]) {
  const familyStatuses = new Map<string, Set<string>>();
  const ownerEligibleFamilies = new Set<string>();
  let blockers = 0;
  for (const report of reports) {
    const statuses = familyStatuses.get(report.familyId) ?? new Set<string>();
    statuses.add(report.status);
    familyStatuses.set(report.familyId, statuses);
    if (report.reviewOnlyTreeProfile === null) ownerEligibleFamilies.add(report.familyId);
    blockers += report.blockers.length;
  }
  const protocolReady = [...familyStatuses.values()].filter((statuses) => (
    statuses.size > 0 && [...statuses].every((status) => status.startsWith("REVIEWED"))
  )).length;
  const evidenceOnly = [...familyStatuses.keys()].filter((familyId) => !ownerEligibleFamilies.has(familyId)).length;
  return {
    total: familyStatuses.size,
    protocolReady,
    pending: familyStatuses.size - protocolReady - evidenceOnly,
    evidenceOnly,
    blockers,
  };
}

function renderOwnerDecisionWorkbench(reports: readonly NormalizedReport[], reviewWaves: ReadonlyMap<string, number>): string {
  const families = ownerDecisionFamilies(reports, reviewWaves);
  if (families.length === 0) {
    return `<section class="evidence-boundary" aria-labelledby="evidence-boundary-title"><p class="eyebrow">Read-only boundary</p><h2 id="evidence-boundary-title">Owner Decisions Disabled</h2><p>These reports use a reduced review-only tree. Inspect frequencies here, but record no production usability decision from this viewer.</p></section>`;
  }
  const storageKey = `pkrtrainer-texas-solver-owner-review-v1:${families.map((family) => family.familyId).join("|")}`;
  const rows = families.map((family) => `<tr data-owner-row data-family="${escapeHtml(family.familyId)}" data-family-id="${escapeHtml(family.familyId)}" data-status="${escapeHtml(family.status)}" data-wave="${waveValue(family.wave)}">
    <td><strong><a href="#${escapeHtml(family.anchor)}">${escapeHtml(family.familyId)}</a></strong><small>${escapeHtml(family.status)}</small></td>
    <td>${escapeHtml(family.wave === null ? "Unassigned" : `Wave ${family.wave}`)}</td>
    <td><select data-owner-decision aria-label="Decision for ${escapeHtml(family.familyId)}"><option value="">Pending</option><option value="yes">Yes</option><option value="scoped">Scoped</option><option value="no">No</option></select></td>
    <td><input data-owner-scope aria-label="Scope for ${escapeHtml(family.familyId)}" type="text"></td>
    <td><input data-owner-caveats aria-label="Caveats for ${escapeHtml(family.familyId)}" type="text"></td>
  </tr>`).join("");
  return `<section class="owner-workbench" data-owner-root data-storage-key="${escapeHtml(storageKey)}" aria-labelledby="owner-workbench-title">
    <div class="owner-workbench-head"><div><p class="eyebrow">Human gate</p><h2 id="owner-workbench-title">Owner Decisions</h2></div><div class="owner-outputs"><output id="owner-progress" aria-live="polite"></output><output id="owner-decision-status" aria-live="polite"></output></div></div>
    <div class="owner-meta"><label>Reviewer<input id="owner-reviewer" type="text" autocomplete="name"></label><label>Reviewed at<input id="owner-reviewed-at" type="date" value="${today()}"></label><button id="import-owner-decisions" type="button" title="Import a decision JSON draft">Import JSON</button><input id="owner-decisions-file" type="file" accept="application/json,.json" hidden><button id="copy-owner-decisions" type="button" title="Copy decision JSON">Copy JSON</button><button id="download-owner-decisions" type="button" title="Download decision JSON">Download JSON</button><button id="copy-owner-commands" type="button" title="Copy PowerShell dry-run and confirmed write commands">Copy PS commands</button><button id="clear-owner-decisions" type="button" title="Clear the locally stored draft">Clear draft</button></div>
    <div class="owner-table-wrap"><table><thead><tr><th>Family</th><th>Wave</th><th>Decision</th><th>Scope</th><th>Caveats</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function ownerDecisionFamilies(reports: readonly NormalizedReport[], reviewWaves: ReadonlyMap<string, number>): OwnerDecisionFamily[] {
  const families = new Map<string, OwnerDecisionFamily>();
  for (const report of reports) {
    if (report.reviewOnlyTreeProfile !== null) continue;
    const current = families.get(report.familyId);
    if (current === undefined || current.status === "NEEDS_REVIEW") {
      families.set(report.familyId, {
        familyId: report.familyId,
        status: report.status,
        anchor: reportAnchor(report),
        wave: reviewWaves.get(report.familyId) ?? null,
      });
    }
  }
  return [...families.values()].sort((left, right) => (left.wave ?? Number.MAX_SAFE_INTEGER) - (right.wave ?? Number.MAX_SAFE_INTEGER) || left.familyId.localeCompare(right.familyId));
}

function waveValue(wave: number | null | undefined): string {
  return wave === null || wave === undefined ? "UNASSIGNED" : String(wave);
}

function renderSummaryCard(report: NormalizedReport, reviewWaves: ReadonlyMap<string, number>): string {
  const statusClass = statusClassFor(report.status);
  const wave = reviewWaves.get(report.familyId);
  return `<a class="card ${statusClass}" data-review-card data-family="${escapeHtml(report.familyId)}" data-status="${escapeHtml(report.status)}" data-wave="${waveValue(wave)}" href="#${reportAnchor(report)}">
    <span>${escapeHtml(report.familyId)}</span>
    <strong>${escapeHtml(report.nodeLabel)}</strong>
    <small class="review-summary">${escapeHtml(report.reviewOnlyTreeProfile ?? (wave === undefined ? "Unassigned" : `Wave ${wave}`))} / ${escapeHtml(report.status)} / ${report.counts.rawFiles} boards / ${report.blockers.length} blockers</small>
  </a>`;
}

function renderReportSection(report: NormalizedReport, reviewWaves: ReadonlyMap<string, number>): string {
  const files = report.files.map((file) => renderBoard(report, file)).join("\n");
  const warnings = [...report.blockers, ...report.anomalies].map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const wave = reviewWaves.get(report.familyId);
  return `<section class="report" data-review-report data-family="${escapeHtml(report.familyId)}" data-status="${escapeHtml(report.status)}" data-wave="${waveValue(wave)}" id="${reportAnchor(report)}">
    <div class="report-head">
      <div>
        <p class="eyebrow">${escapeHtml(report.familyId)}</p>
        <h2>${escapeHtml(report.nodeLabel)}</h2>
        <p class="path">${escapeHtml(relative(process.cwd(), report.sourcePath))}</p>
      </div>
      <dl>
        <div><dt>Valid</dt><dd>${report.valid ? "yes" : "no"}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(report.status)}</dd></div>
        <div><dt>Production</dt><dd>${report.productionReady ? "ready" : "no"}</dd></div>
        <div><dt>Tree</dt><dd>${escapeHtml(report.reviewOnlyTreeProfile ?? "full")}</dd></div>
        <div><dt>Raw</dt><dd>${report.counts.rawFiles}</dd></div>
        <div><dt>Combos</dt><dd>${report.counts.combos}</dd></div>
      </dl>
    </div>
    ${warnings.length > 0 ? `<ul class="warnings">${warnings}</ul>` : ""}
    <div class="boards">${files}</div>
  </section>`;
}

function renderBoard(report: NormalizedReport, file: ReviewFile): string {
  const boardSummary = summarizeBoardActions(file);
  return `<article class="board">
    <div class="board-head">
      <div>
        <h3>${escapeHtml(file.boardId)}</h3>
        <p class="board-meta">${file.comboCount} combos / ${file.handClassCount} hand classes / player ${file.player ?? "?"} / ${escapeHtml(file.nodeType)}</p>
      </div>
      <p class="action-summary">${escapeHtml(boardSummary)}</p>
    </div>
    <div class="matrix" aria-label="${escapeHtml(`${report.familyId} ${report.nodeLabel} ${file.boardId}`)}">
      ${renderMatrix(file)}
    </div>
  </article>`;
}

function summarizeBoardActions(file: ReviewFile): string {
  const counts = new Map<string, number>();
  for (const strategy of Object.values(file.handClasses)) {
    counts.set(strategy.dominantAction, (counts.get(strategy.dominantAction) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([action, count]) => `${action}: ${count}`)
    .join(" / ");
}

function renderMatrix(file: ReviewFile): string {
  const header = [`<span class="corner"></span>`, ...RANK_ORDER.map((rank) => `<span class="rank">${rank}</span>`)].join("");
  const rows = RANK_ORDER.map((rowRank, rowIndex) => {
    const cells = RANK_ORDER.map((columnRank, columnIndex) => {
      const handClass = handClassForCell(rowRank, columnRank, rowIndex, columnIndex);
      const strategy = file.handClasses[handClass];
      if (strategy === undefined) return `<span class="cell empty"><b>${handClass}</b></span>`;
      const actionClass = cssActionClass(strategy.dominantAction);
      const mix = Object.entries(strategy.averageByAction)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([action, frequency]) => `${action} ${(frequency * 100).toFixed(0)}%`)
        .join(" / ");
      return `<span class="cell ${actionClass}" title="${escapeHtml(`${handClass}: ${mix}`)}">
        <b>${handClass}</b>
        <em>${escapeHtml(strategy.dominantAction)}</em>
        <small>${Math.round(strategy.dominantFrequency * 100)}%</small>
      </span>`;
    }).join("");
    return `<span class="rank row-rank">${rowRank}</span>${cells}`;
  }).join("");
  return `${header}${rows}`;
}

function handClassForCell(rowRank: string, columnRank: string, rowIndex: number, columnIndex: number): string {
  if (rowRank === columnRank) return `${rowRank}${columnRank}`;
  return rowIndex < columnIndex ? `${rowRank}${columnRank}s` : `${columnRank}${rowRank}o`;
}

function cssActionClass(action: string): string {
  if (action.startsWith("BET")) return "bet";
  if (action.startsWith("RAISE")) return "raise";
  if (action === "CHECK") return "check";
  if (action === "CALL") return "call";
  if (action === "FOLD") return "fold";
  return "unknown";
}

function reportAnchor(report: NormalizedReport): string {
  return `${report.familyId}-${report.nodeLabel}`.replace(/[^a-z0-9_-]+/gi, "-");
}

function statusClassFor(status: string): string {
  if (status === "REVIEWED_PRODUCTION") return "status-production";
  if (status === "REVIEWED_SCOPED") return "status-scoped";
  if (status === "REVIEWED_NOT_USABLE" || status === "MISSING_REVIEW") return "status-blocked";
  if (status === "REVIEW_ONLY_EVIDENCE") return "status-evidence";
  return "status-pending";
}

function filterScript(): string {
  return `
const familyFilter = document.getElementById("family-filter");
const statusFilter = document.getElementById("status-filter");
const waveFilter = document.getElementById("wave-filter");
const count = document.getElementById("filter-count");
const cards = [...document.querySelectorAll("[data-review-card]")];
const reports = [...document.querySelectorAll("[data-review-report]")];
const ownerRows = [...document.querySelectorAll("[data-owner-row]")];
function applyFilters() {
  const family = familyFilter.value.trim().toLowerCase();
  const status = statusFilter.value;
  const wave = waveFilter.value;
  for (const element of [...cards, ...reports, ...ownerRows]) {
    const matchesFamily = element.dataset.family.toLowerCase().includes(family);
    const matchesStatus = status === "ALL" || element.dataset.status === status;
    const matchesWave = wave === "ALL" || element.dataset.wave === wave;
    element.hidden = !(matchesFamily && matchesStatus && matchesWave);
  }
  const visible = new Set(reports.filter((report) => !report.hidden).map((report) => report.dataset.family)).size;
  count.value = visible + (visible === 1 ? " family" : " families");
  count.textContent = count.value;
  updateOwnerProgress();
}
familyFilter.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);
waveFilter.addEventListener("change", applyFilters);

const ownerRoot = document.querySelector("[data-owner-root]");
const ownerStatus = document.getElementById("owner-decision-status");
const ownerProgress = document.getElementById("owner-progress");
const ownerReviewer = document.getElementById("owner-reviewer");
const ownerReviewedAt = document.getElementById("owner-reviewed-at");
const ownerFileInput = document.getElementById("owner-decisions-file");
const ownerStorageKey = ownerRoot?.dataset.storageKey ?? "";
const ownerSchemaVersion = "pkrtrainer-texas-solver-owner-decisions-v1";
const ownerDecisionValues = new Set(["", "yes", "no", "scoped"]);

function ownerDecisionDocument(validate = true, rows = ownerRows) {
  const reviewer = document.getElementById("owner-reviewer").value.trim();
  const reviewedAt = document.getElementById("owner-reviewed-at").value;
  const decisions = rows.map((row) => ({
    familyId: row.dataset.familyId,
    reviewer,
    reviewedAt,
    decision: row.querySelector("[data-owner-decision]").value,
    scope: row.querySelector("[data-owner-scope]").value.trim(),
    caveats: row.querySelector("[data-owner-caveats]").value.trim(),
  }));
  if (validate) {
    const selected = decisions.filter((decision) => decision.decision !== "");
    if (selected.length === 0) throw new Error("Select at least one owner decision.");
    const invalid = selected.find((decision) => !decision.reviewer || !/^\\d{4}-\\d{2}-\\d{2}$/.test(decision.reviewedAt) || !decision.caveats || ((decision.decision === "yes" || decision.decision === "scoped") && !decision.scope));
    if (invalid) throw new Error("Complete reviewer, date, caveats and scope for Yes or Scoped decisions.");
  }
  return { schemaVersion: ownerSchemaVersion, decisions };
}

function ownerRowsForExport() {
  const wave = waveFilter.value;
  return wave === "ALL" ? ownerRows : ownerRows.filter((row) => row.dataset.wave === wave);
}

function serializeOwnerDecisions() {
  try {
    const json = JSON.stringify(ownerDecisionDocument(true, ownerRowsForExport()), null, 2) + "\\n";
    ownerStatus.textContent = "Decision JSON ready";
    return json;
  } catch (error) {
    ownerStatus.textContent = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function ownerDownloadFilename() {
  const wave = waveFilter.value;
  return wave === "ALL" ? "owner-review-decisions.json" : "owner-review-decisions-wave-" + wave.toLowerCase() + ".json";
}

function updateOwnerProgress() {
  if (!ownerProgress) return;
  const visibleRows = ownerRows.filter((row) => !row.hidden);
  const decidedRows = visibleRows.filter((row) => row.querySelector("[data-owner-decision]").value !== "");
  const label = waveFilter.selectedOptions[0]?.textContent ?? "Review";
  ownerProgress.textContent = label + ": " + decidedRows.length + "/" + visibleRows.length + " decided";
}

function saveOwnerDraft() {
  try {
    localStorage.setItem(ownerStorageKey, JSON.stringify(ownerDecisionDocument(false)));
    ownerStatus.textContent = "Draft saved locally";
  } catch {
    ownerStatus.textContent = "Local draft storage unavailable";
  }
  updateOwnerProgress();
}

function applyOwnerDocument(documentValue) {
  if (!documentValue || documentValue.schemaVersion !== ownerSchemaVersion || !Array.isArray(documentValue.decisions)) {
    throw new Error("Decision JSON uses an unsupported schema.");
  }
  const rowsByFamily = new Map(ownerRows.map((row) => [row.dataset.familyId, row]));
  const seen = new Set();
  const reviewers = new Set();
  const reviewDates = new Set();
  for (const decision of documentValue.decisions) {
    if (!decision || typeof decision.familyId !== "string" || !rowsByFamily.has(decision.familyId)) throw new Error("Decision JSON contains an unknown family.");
    if (seen.has(decision.familyId)) throw new Error("Decision JSON contains a duplicate family.");
    seen.add(decision.familyId);
    if (!["reviewer", "reviewedAt", "decision", "scope", "caveats"].every((field) => typeof decision[field] === "string")) throw new Error("Decision JSON contains a non-string decision field.");
    if (!ownerDecisionValues.has(decision.decision ?? "")) throw new Error("Decision JSON contains an invalid decision.");
    if (decision.reviewer) reviewers.add(decision.reviewer);
    if (decision.reviewedAt) reviewDates.add(decision.reviewedAt);
  }
  if (reviewers.size > 1 || reviewDates.size > 1) throw new Error("Imported decisions must share one reviewer and review date.");
  ownerReviewer.value = [...reviewers][0] ?? "";
  ownerReviewedAt.value = [...reviewDates][0] ?? "";
  for (const row of ownerRows) {
    const decision = documentValue.decisions.find((entry) => entry.familyId === row.dataset.familyId);
    if (!decision) continue;
    row.querySelector("[data-owner-decision]").value = decision.decision ?? "";
    row.querySelector("[data-owner-scope]").value = typeof decision.scope === "string" ? decision.scope : "";
    row.querySelector("[data-owner-caveats]").value = typeof decision.caveats === "string" ? decision.caveats : "";
  }
  updateOwnerProgress();
}

function restoreOwnerDraft() {
  try {
    const draft = localStorage.getItem(ownerStorageKey);
    if (!draft) return;
    applyOwnerDocument(JSON.parse(draft));
    ownerStatus.textContent = "Local draft restored";
  } catch {
    ownerStatus.textContent = "Stored draft could not be restored";
  }
}

if (ownerRoot && ownerStatus && ownerProgress && ownerReviewer && ownerReviewedAt && ownerFileInput) {
document.getElementById("copy-owner-decisions").addEventListener("click", async () => {
  const json = serializeOwnerDecisions();
  if (!json) return;
  try { await navigator.clipboard.writeText(json); ownerStatus.textContent = "Decision JSON copied"; }
  catch { ownerStatus.textContent = "Copy unavailable; use Download JSON"; }
});
document.getElementById("download-owner-decisions").addEventListener("click", () => {
  const json = serializeOwnerDecisions();
  if (!json) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  link.download = ownerDownloadFilename();
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("import-owner-decisions").addEventListener("click", () => ownerFileInput.click());
ownerFileInput.addEventListener("change", async () => {
  const file = ownerFileInput.files?.[0];
  if (!file) return;
  try {
    applyOwnerDocument(JSON.parse(await file.text()));
    saveOwnerDraft();
    ownerStatus.textContent = "Decision JSON imported";
  } catch (error) {
    ownerStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    ownerFileInput.value = "";
  }
});

document.getElementById("copy-owner-commands").addEventListener("click", async () => {
  if (!serializeOwnerDecisions()) return;
  const decisionsPath = "$HOME\\\\Downloads\\\\" + ownerDownloadFilename();
  const dryRun = 'npm run mtt:texas-solver-owner-review-batch -- --decisions="' + decisionsPath + '"';
  const write = dryRun + " --write --confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH";
  try {
    await navigator.clipboard.writeText(dryRun + "\\n" + write + "\\n");
    ownerStatus.textContent = "Dry-run and confirmed write commands copied";
  } catch {
    ownerStatus.textContent = "Command copy unavailable";
  }
});

document.getElementById("clear-owner-decisions").addEventListener("click", () => {
  if (!window.confirm("Clear all owner decision fields and the locally stored draft?")) return;
  ownerReviewer.value = "";
  ownerReviewedAt.value = ownerReviewedAt.defaultValue;
  for (const row of ownerRows) {
    row.querySelector("[data-owner-decision]").value = "";
    row.querySelector("[data-owner-scope]").value = "";
    row.querySelector("[data-owner-caveats]").value = "";
  }
  try { localStorage.removeItem(ownerStorageKey); } catch {}
  ownerStatus.textContent = "Draft cleared";
  updateOwnerProgress();
});

ownerRoot.addEventListener("input", saveOwnerDraft);
ownerRoot.addEventListener("change", (event) => {
  if (event.target !== ownerFileInput) saveOwnerDraft();
});
restoreOwnerDraft();
}
applyFilters();
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function css(): string {
  return `
:root { color-scheme: dark; font-family: Inter, Segoe UI, system-ui, sans-serif; background: #10141d; color: #edf2ff; }
body { margin: 0; }
header { padding: 32px; background: linear-gradient(135deg, #172033, #111827); border-bottom: 1px solid #2a3448; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 10px; font-size: 42px; }
h2 { margin-bottom: 6px; font-size: 30px; }
h3 { margin-bottom: 4px; font-size: 22px; }
main { padding: 24px; }
.eyebrow { margin-bottom: 8px; color: #8fb3ff; font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
.summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: 28px; }
.card { display: grid; gap: 6px; padding: 16px; color: inherit; text-decoration: none; background: #182235; border: 1px solid #2d3a52; border-radius: 16px; }
.card strong { font-size: 20px; }
.card small, .path, .board p { color: #aab7cf; }
.card.ok { border-color: #2d9f73; }
.card.warn { border-color: #b9842b; }
.report { margin: 28px 0; padding: 22px; background: #131b2a; border: 1px solid #2a3448; border-radius: 20px; }
.report-head { display: flex; gap: 20px; justify-content: space-between; align-items: start; flex-wrap: wrap; }
dl { display: grid; gap: 8px; grid-template-columns: repeat(5, minmax(86px, 1fr)); margin: 0; }
dl div { padding: 10px; background: #0f1623; border-radius: 12px; }
dt { color: #8ea0bd; font-size: 12px; text-transform: uppercase; }
dd { margin: 2px 0 0; font-weight: 800; }
.warnings { padding: 12px 18px; background: #332312; border: 1px solid #80521f; border-radius: 12px; }
.boards { display: grid; gap: 20px; }
.board { overflow: auto; padding: 16px; background: #0f1623; border: 1px solid #253149; border-radius: 16px; }
.board-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; min-width: 980px; }
.action-summary { max-width: 520px; text-align: right; }
.matrix { display: grid; grid-template-columns: 34px repeat(13, 68px); grid-auto-rows: 52px; gap: 4px; min-width: 980px; }
.rank, .corner { display: grid; place-items: center; color: #8ea0bd; font-weight: 800; }
.row-rank { justify-content: end; padding-right: 8px; }
.cell { display: grid; place-items: center; padding: 4px; border-radius: 8px; text-align: center; line-height: 1.05; border: 1px solid rgba(255,255,255,.08); }
.cell b { font-size: 13px; }
.cell em { font-size: 10px; font-style: normal; opacity: .9; }
.cell small { font-size: 11px; font-weight: 800; }
.cell.empty { color: #56637a; background: #151c2a; }
.cell.bet { background: #134e3a; }
.cell.raise { background: #4a2a73; }
.cell.check { background: #374151; }
.cell.call { background: #164e63; }
.cell.fold { background: #6b1f2d; }
.cell.unknown { background: #4b5563; }
.page-header { padding: 28px max(20px, calc((100vw - 1280px) / 2)); background: #18212c; }
.page-header > p:not(.eyebrow):not(.generated) { display: none; }
.generated, .board-meta { color: #aab7cf; }
.metrics { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(110px, 160px)); margin: 18px 0 0; }
.metrics div { padding: 10px; background: #0f1623; border: 1px solid #2a3448; border-radius: 6px; }
.toolbar { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; padding: 14px 0; border-bottom: 1px solid #2a3448; }
.toolbar label { display: grid; gap: 5px; color: #aab7cf; font-size: 12px; font-weight: 700; }
.toolbar input, .toolbar select { min-height: 34px; padding: 6px 8px; color: inherit; background: #0f1623; border: 1px solid #526171; border-radius: 4px; font: inherit; }
#family-filter { min-width: 260px; }
#filter-count { margin-left: auto; color: #aab7cf; font-size: 13px; }
.card, .report, .board { border-radius: 6px; }
.card > small:not(.review-summary), .path, .board-head > div > p:not(.board-meta) { display: none; }
.card.status-pending { border-left: 4px solid #d7a640; }
.card.status-scoped { border-left: 4px solid #56b4d3; }
.card.status-production { border-left: 4px solid #56b37f; }
.card.status-blocked { border-left: 4px solid #d96767; }
.card.status-evidence { border-left: 4px solid #4cb6a6; }
.owner-workbench { margin: 24px 0 28px; padding: 20px; border: 1px solid #2a3448; border-radius: 6px; background: #131b2a; }
.evidence-boundary { margin: 24px 0 28px; padding: 20px; border-left: 4px solid #4cb6a6; background: #152627; }
.owner-workbench-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
.owner-workbench-head h2 { margin-bottom: 0; font-size: 24px; }
.owner-outputs { display: grid; gap: 4px; justify-items: end; }
.owner-meta { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; margin: 16px 0; }
.owner-meta label { display: grid; gap: 5px; color: #aab7cf; font-size: 12px; font-weight: 700; }
.owner-meta input, .owner-table-wrap input, .owner-table-wrap select, .owner-meta button { min-height: 34px; box-sizing: border-box; padding: 6px 8px; color: inherit; background: #0f1623; border: 1px solid #526171; border-radius: 4px; font: inherit; }
.owner-meta button { cursor: pointer; background: #1a3a57; border-color: #4f89b5; }
.owner-table-wrap { overflow-x: auto; }
.owner-table-wrap table { width: 100%; min-width: 960px; border-collapse: collapse; }
.owner-table-wrap th { color: #8ea0bd; font-size: 12px; text-align: left; text-transform: uppercase; }
.owner-table-wrap th, .owner-table-wrap td { padding: 9px 8px; border-top: 1px solid #263246; vertical-align: middle; }
.owner-table-wrap td:first-child { min-width: 320px; }.owner-table-wrap td:first-child a { color: #c9dcff; }.owner-table-wrap td:first-child small { display: block; color: #aab7cf; margin-top: 3px; }.owner-table-wrap input { width: 100%; }.owner-table-wrap select { min-width: 110px; }
#owner-progress, #owner-decision-status { color: #aab7cf; font-size: 13px; }
@media (max-width: 640px) { h1 { font-size: 30px; } .page-header { padding: 20px; } .metrics { grid-template-columns: repeat(2, 1fr); } .report-head dl { grid-template-columns: repeat(2, minmax(100px, 1fr)); } #filter-count { width: 100%; margin-left: 0; } #family-filter { min-width: min(260px, 100%); } .owner-workbench-head { align-items: start; flex-direction: column; } .owner-outputs { justify-items: start; } }
`;
}
