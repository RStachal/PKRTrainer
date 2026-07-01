import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEFAULT_REVIEWS_DIR = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_OUTPUT = "artifacts/texas-solver-review-integration/viewer/index.html";
const RANK_ORDER = "AKQJT98765432".split("");

interface CliArgs {
  inputs: string[];
  outputPath: string;
  reviewsDir: string;
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
}

try {
  const args = parseArgs(process.argv.slice(2));
  const inputPaths = args.inputs.length > 0 ? args.inputs : findReviewReports(args.reviewsDir);
  if (inputPaths.length === 0) {
    throw new Error(`No review reports found. Pass --input <file> or generate reports under ${args.reviewsDir}.`);
  }

  const reports = inputPaths.map(readReviewReport).sort(compareReports);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, buildHtml(args.title, reports), "utf8");

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

  return { inputs, outputPath, reviewsDir, title };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-viewer",
    "  npm run mtt:texas-solver-viewer -- --input artifacts/.../CHECK.review-report.json",
    "  npm run mtt:texas-solver-viewer -- --reviews-dir artifacts/texas-solver-review-integration/reviews --output artifacts/texas-solver-review-integration/viewer/index.html",
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

function buildHtml(title: string, reports: readonly NormalizedReport[]): string {
  const generatedAt = new Date().toISOString();
  const summaryCards = reports.map(renderSummaryCard).join("\n");
  const reportSections = reports.map(renderReportSection).join("\n");
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${css()}</style>
</head>
<body>
  <header>
    <p class="eyebrow">PKRTrainer · source-safe review</p>
    <h1>${escapeHtml(title)}</h1>
    <p>Generated ${escapeHtml(generatedAt)}. Tento viewer je jen pro poker review TexasSolver exportů; nevytváří produkční import.</p>
  </header>
  <main>
    <section class="summary-grid">${summaryCards}</section>
    ${reportSections}
  </main>
</body>
</html>
`;
}

function renderSummaryCard(report: NormalizedReport): string {
  const statusClass = report.valid && report.blockers.length === 0 ? "ok" : "warn";
  return `<a class="card ${statusClass}" href="#${reportAnchor(report)}">
    <span>${escapeHtml(report.familyId)}</span>
    <strong>${escapeHtml(report.nodeLabel)}</strong>
    <small>${report.counts.rawFiles} raw · ${report.counts.combos} combos · ${report.counts.handClasses} hands · ${report.anomalies.length} anomalies</small>
  </a>`;
}

function renderReportSection(report: NormalizedReport): string {
  const files = report.files.map((file) => renderBoard(report, file)).join("\n");
  const warnings = [...report.blockers, ...report.anomalies].map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<section class="report" id="${reportAnchor(report)}">
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
        <p>${file.comboCount} combos · ${file.handClassCount} hand classes · player ${file.player ?? "?"} · ${escapeHtml(file.nodeType)}</p>
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
    .join(" · ");
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
        .join(" · ");
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
h1 { margin-bottom: 10px; font-size: clamp(30px, 4vw, 56px); }
h2 { margin-bottom: 6px; font-size: 30px; }
h3 { margin-bottom: 4px; font-size: 22px; }
main { padding: 24px; }
.eyebrow { margin-bottom: 8px; color: #8fb3ff; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
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
`;
}
