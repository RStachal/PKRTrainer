import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const PACK_IDS = [
  "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1",
] as const;
const CONFIRM_TOKEN = "BUILD_MTT_SIXMAX_P1_CANDIDATES";

type Confidence = "MEDIUM" | "HIGH";

interface CliArgs { sourceDir: string; outDir: string; reviewer: string; rightsOwner: string; sourceLocation: string; reviewedAt: string; confidence: Confidence | null; incremental: boolean; write: boolean; confirm: string | null; json: boolean; }
interface PreflightRow { packId: string; csvPath: string; exists: boolean; records: number | null; csvReady: boolean | null; productionReady: boolean | null; legalSlot: boolean | null; preflightConfidence: Confidence; status: "READY" | "WAITING" | "INVALID"; errors: string[]; }

try {
  const args = parseArgs(process.argv.slice(2));
  const result = run(args);
  console.log(args.json ? JSON.stringify(result, null, 2) : render(result));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let sourceDir = resolve("artifacts/mtt-p1-sixmax-workbench");
  let outDir = resolve("artifacts/mtt-sixmax-preflop-intake");
  let reviewer = "";
  let rightsOwner = "";
  let sourceLocation = "";
  let reviewedAt = today();
  let confidence: Confidence | null = null;
  let incremental = false;
  let write = false;
  let confirm: string | null = null;
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--incremental") { incremental = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") continue;
    if (item.startsWith("--source-dir=")) { sourceDir = resolve(value(item, "--source-dir")); continue; }
    if (item.startsWith("--out-dir=")) { outDir = resolve(value(item, "--out-dir")); continue; }
    if (item.startsWith("--reviewer=")) { reviewer = value(item, "--reviewer"); continue; }
    if (item.startsWith("--rights-owner=")) { rightsOwner = value(item, "--rights-owner"); continue; }
    if (item.startsWith("--source-location=")) { sourceLocation = value(item, "--source-location"); continue; }
    if (item.startsWith("--reviewed-at=")) { reviewedAt = value(item, "--reviewed-at"); continue; }
    if (item.startsWith("--confidence=")) { confidence = parseConfidence(value(item, "--confidence")); continue; }
    if (item.startsWith("--confirm=")) { confirm = value(item, "--confirm"); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)) throw new Error("--reviewed-at must use YYYY-MM-DD.");
  if (write && confirm !== CONFIRM_TOKEN) throw new Error(`--write requires --confirm=${CONFIRM_TOKEN}.`);
  if (write && confidence === null) throw new Error("--write requires --confidence=MEDIUM|HIGH.");
  return { sourceDir, outDir, reviewer, rightsOwner, sourceLocation, reviewedAt, confidence, incremental, write, confirm, json };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:sixmax-preflop-intake-batch -- --source-dir=<csv-folder> [--summary]",
    "  npm run mtt:sixmax-preflop-intake-batch -- --source-dir=<csv-folder> --incremental [--summary]",
    "  npm run mtt:sixmax-preflop-intake-batch -- --write --confidence=HIGH --confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES",
    "",
    "Preflights all four exact six-max CHIP_EV CSV files before writing any candidate.",
    "--incremental allows each currently ready CSV to advance without waiting for the other slots.",
    "It writes normalized review candidates only and reuses the separately staged canonical permission manifest.",
    "Raw intake and production promotion stay explicit separate steps.",
  ].join("\n");
}

function parseConfidence(value: string): Confidence {
  if (value === "MEDIUM" || value === "HIGH") return value;
  throw new Error("--confidence must be MEDIUM or HIGH; LOW cannot create a production-intake candidate.");
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (!result) throw new Error(`${flag} requires a value.`);
  return result;
}

function run(args: CliArgs) {
  const rows = PACK_IDS.map((packId) => preflight(packId, args));
  const readyRows = rows.filter((row) => row.status === "READY");
  const waitingRows = rows.filter((row) => row.status === "WAITING");
  const invalidRows = rows.filter((row) => row.status === "INVALID");
  const preflightValid = args.incremental
    ? invalidRows.length === 0
    : readyRows.length === PACK_IDS.length;
  const selectedRows = args.incremental ? readyRows : rows;
  const writes = preflightValid && args.write ? writeCandidates(args, selectedRows) : [];
  const candidateValid = !args.write || writes.every((write) => write.candidateValid);
  const result = {
    valid: preflightValid && candidateValid,
    mode: args.incremental ? "INCREMENTAL" : "ATOMIC_ALL_FOUR",
    preflightValid,
    candidateValid,
    writePerformed: writes.length > 0,
    counts: { ready: readyRows.length, waiting: waitingRows.length, invalid: invalidRows.length },
    sourceDir: args.sourceDir,
    outDir: args.outDir,
    permissionMode: "CANONICAL_STAGED_MANIFEST",
    rows,
    writes,
  };
  if (args.write) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(join(args.outDir, "batch-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    writeFileSync(join(args.outDir, "BATCH_REPORT.md"), `${renderBatchReport(result)}\n`, "utf8");
  }
  return result;
}

function preflight(packId: string, args: CliArgs): PreflightRow {
  const csvPath = join(args.sourceDir, `${packId}.csv`);
  const preflightConfidence = args.confidence ?? "MEDIUM";
  if (!existsSync(csvPath)) return { packId, csvPath, exists: false, records: null, csvReady: null, productionReady: null, legalSlot: null, preflightConfidence, status: "WAITING", errors: ["CSV is missing."] };
  if (!csvNeedsFullPreflight(readFileSync(csvPath, "utf8"), ["strictActions", "lenientActions"])) {
    return { packId, csvPath, exists: true, records: 0, csvReady: null, productionReady: null, legalSlot: null, preflightConfidence, status: "WAITING", errors: ["CSV contains no reviewed strategy records yet."] };
  }
  const child = spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs", "scripts/buildMttPreflopCsvDraft.mts",
    `--csv=${csvPath}`, `--pack-id=${packId}`, `--confidence=${preflightConfidence}`,
    "--license-kind=OWNED_SOLVER_EXPORT",
    "--license-note=Owner-confirmed canonical permission manifest is staged separately.",
    "--json",
  ], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = parseJson(child.stdout);
  if (parsed === null) return { packId, csvPath, exists: true, records: null, csvReady: false, productionReady: false, legalSlot: false, preflightConfidence, status: "INVALID", errors: [compact(child.stderr || "CSV preflight produced no readable report.")] };
  const csvErrors = Array.isArray(parsed.csvErrors) ? parsed.csvErrors.filter((entry): entry is string => typeof entry === "string") : [];
  const slotReport = parsed.slotReport;
  const readinessReport = parsed.report;
  const readinessErrors = typeof readinessReport === "object" && readinessReport !== null && Array.isArray((readinessReport as { errors?: unknown }).errors)
    ? ((readinessReport as { errors: unknown[] }).errors).filter((entry): entry is string => typeof entry === "string")
    : [];
  const csvReady = parsed.csvReady === true;
  const productionReady = parsed.productionReady === true;
  const records = typeof parsed.records === "number" ? parsed.records : null;
  const legalSlot = typeof slotReport === "object" && slotReport !== null && (slotReport as { valid?: unknown }).valid === true;
  const status = csvReady && productionReady && legalSlot ? "READY" : "INVALID";
  const errors = [...csvErrors, ...readinessErrors].slice(0, 20);
  return { packId, csvPath, exists: true, records, csvReady, productionReady, legalSlot, preflightConfidence, status, errors };
}

function csvNeedsFullPreflight(input: string, columnNames: readonly string[]): boolean {
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;
  let targetIndexes: number[] | null = null;

  const finishRow = (): boolean => {
    row.push(cellValue);
    cellValue = "";
    if (row.every((cell) => cell.trim().length === 0)) {
      row = [];
      return false;
    }
    if (targetIndexes === null) {
      targetIndexes = columnNames
        .map((column) => row.findIndex((cell) => cell.trim() === column))
        .filter((index) => index >= 0);
      row = [];
      return targetIndexes.length !== columnNames.length;
    }
    const populated = targetIndexes.some((index) => (row[index] ?? "").trim().length > 0);
    row = [];
    return populated;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted && char === '"' && next === '"') {
      cellValue += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(cellValue);
      cellValue = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      if (finishRow()) return true;
      continue;
    }
    cellValue += char;
  }
  return finishRow() || targetIndexes === null;
}

function writeCandidates(args: CliArgs, rows: readonly PreflightRow[]) {
  return rows.map((row) => {
    const packDir = join(args.outDir, row.packId);
    mkdirSync(packDir, { recursive: true });
    const child = spawnSync(process.execPath, [
      "node_modules/vite-node/vite-node.mjs", "scripts/buildMttPreflopCsvDraft.mts", `--csv=${row.csvPath}`, `--pack-id=${row.packId}`,
      `--out=${join(packDir, "normalized.candidate.json")}`, "--license-kind=OWNED_SOLVER_EXPORT",
      "--license-note=Owner-confirmed canonical permission manifest is staged separately.",
      `--verified-at=${args.reviewedAt}`, `--confidence=${args.confidence}`, "--json",
    ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const report = parseJson(child.stdout);
    return { packId: row.packId, exitCode: child.status, candidateValid: child.status === 0 && report?.valid === true && report.productionReady === true, report, stderr: compact(child.stderr) };
  });
}

function parseJson(value: string): Record<string, unknown> | null {
  try { const parsed: unknown = JSON.parse(value); return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null; } catch { return null; }
}
function compact(value: string): string { return value.trim().slice(0, 500); }
function today(): string { return new Date().toISOString().slice(0, 10); }
function render(result: ReturnType<typeof run>): string {
  return ["MTT six-max preflop intake batch", `mode: ${result.mode}`, `valid: ${result.valid}`, `preflight valid: ${result.preflightValid}`, `candidate valid: ${result.candidateValid}`, `write performed: ${result.writePerformed}`, `permission mode: ${result.permissionMode}`, `ready: ${result.counts.ready}`, `waiting: ${result.counts.waiting}`, `invalid: ${result.counts.invalid}`, `source: ${result.sourceDir}`, ...result.rows.map((row) => `- ${row.packId}: status=${row.status} records=${row.records} csvReady=${row.csvReady} productionReady=${row.productionReady} legalSlot=${row.legalSlot} confidence=${row.preflightConfidence} errors=${row.errors.length}`)].join("\n");
}

function renderBatchReport(result: ReturnType<typeof run>): string {
  return [
    "# Six-Max P1 Candidate Batch",
    "",
    `- Mode: ${result.mode}`,
    `- Preflight valid: ${result.preflightValid}`,
    `- Candidate validation valid: ${result.candidateValid}`,
    `- Candidates written: ${result.writePerformed}`,
    `- Permission mode: ${result.permissionMode}`,
    "",
    "## Results",
    "",
    "| Pack | Status | Legal slot | Candidate valid |",
    "| --- | --- | --- | --- |",
    ...result.rows.map((row) => {
      const write = result.writes.find((candidate) => candidate.packId === row.packId);
      return `| ${row.packId} | ${row.status} | ${row.legalSlot} | ${write?.candidateValid ?? "not written"} |`;
    }),
    "",
    "## Next Gate",
    "",
    "Candidates are not raw intake. Stage each matching reviewed candidate explicitly with `mtt:p1-stage-reviewed-preflop`, then run ready-intake validation and promotion dry-run.",
  ].join("\n");
}
