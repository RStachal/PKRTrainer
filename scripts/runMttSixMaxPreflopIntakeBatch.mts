import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import {
  buildMttPreflopCsvScaffoldDocument,
  inspectMttPreflopCsvScaffold,
  type MttPreflopCsvScaffoldInspection,
  type MttPreflopCsvScaffoldSchema,
} from "../src/data/ranges/mttPreflopCsvScaffold.ts";

const PACK_IDS = [
  "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1",
] as const;
const CONFIRM_TOKEN = "BUILD_MTT_SIXMAX_P1_CANDIDATES";

type Confidence = "MEDIUM" | "HIGH";

interface CliArgs { sourceDir: string; outDir: string; outputPath: string | null; reviewer: string; rightsOwner: string; sourceLocation: string; reviewedAt: string; confidence: Confidence | null; incremental: boolean; refreshBlankScaffolds: boolean; write: boolean; confirm: string | null; json: boolean; }
interface PreflightRow { packId: string; csvPath: string; exists: boolean; records: number | null; csvReady: boolean | null; productionReady: boolean | null; legalSlot: boolean | null; preflightConfidence: Confidence; status: "READY" | "WAITING" | "INVALID"; errors: string[]; scaffoldSchema: MttPreflopCsvScaffoldSchema | null; actionEvColumnsPresent: boolean | null; sourceSafeBlank: boolean | null; refreshedBlank: boolean; protectedStale: boolean; scaffoldErrors: string[]; }
interface WorkbenchRefresh { packId: string; csvPath: string; existed: boolean; beforeSha256: string | null; afterSha256: string | null; initialSchema: MttPreflopCsvScaffoldSchema | null; initialSourceSafeBlank: boolean | null; refreshableBlank: boolean; refreshedBlank: boolean; protectedStale: boolean; errors: string[]; }

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
  let outputPath: string | null = null;
  let reviewer = "";
  let rightsOwner = "";
  let sourceLocation = "";
  let reviewedAt = today();
  let confidence: Confidence | null = null;
  let incremental = false;
  let refreshBlankScaffolds = false;
  let write = false;
  let confirm: string | null = null;
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--incremental") { incremental = true; continue; }
    if (item === "--refresh-blank-scaffolds") { refreshBlankScaffolds = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") continue;
    if (item.startsWith("--source-dir=")) { sourceDir = resolve(value(item, "--source-dir")); continue; }
    if (item.startsWith("--out-dir=")) { outDir = resolve(value(item, "--out-dir")); continue; }
    if (item.startsWith("--output=")) { outputPath = resolve(value(item, "--output")); continue; }
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
  if (!write && confirm !== null) throw new Error("--confirm requires --write.");
  if (outputPath !== null && PACK_IDS.some((packId) => samePath(outputPath, join(sourceDir, `${packId}.csv`)))) {
    throw new Error("--output must not overwrite a reviewed six-max workbench CSV.");
  }
  return { sourceDir, outDir, outputPath, reviewer, rightsOwner, sourceLocation, reviewedAt, confidence, incremental, refreshBlankScaffolds, write, confirm, json };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:sixmax-preflop-intake-batch -- --source-dir=<csv-folder> [--summary]",
    "  npm run mtt:sixmax-preflop-intake-batch -- --source-dir=<csv-folder> --incremental [--summary]",
    "  npm run mtt:sixmax-preflop-intake-batch -- --incremental --refresh-blank-scaffolds --output=<report.json>",
    "  npm run mtt:sixmax-preflop-intake-batch -- --write --confidence=HIGH --confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES",
    "",
    "Preflights all four exact six-max CHIP_EV CSV files before writing any candidate.",
    "--incremental allows each currently ready CSV to advance without waiting for the other slots.",
    "--refresh-blank-scaffolds upgrades only a complete, provably untouched legacy scaffold; any human edit is protected.",
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
  const refreshes = PACK_IDS.map((packId) => refreshWorkbench(packId, args));
  const refreshByPack = new Map(refreshes.map((refresh) => [refresh.packId, refresh]));
  const rows = PACK_IDS.map((packId) => preflight(packId, args, refreshByPack.get(packId)));
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
    workbenchCurrent: rows.every((row) => row.scaffoldSchema === "CURRENT_ACTION_EV"),
    strategyValuesGenerated: "none",
    workbenchCounts: {
      currentScaffolds: rows.filter((row) => row.scaffoldSchema === "CURRENT_ACTION_EV").length,
      legacyScaffolds: rows.filter((row) => row.scaffoldSchema === "LEGACY_NO_ACTION_EV").length,
      unknownScaffolds: rows.filter((row) => row.exists && row.scaffoldSchema === "UNKNOWN").length,
      blankScaffolds: rows.filter((row) => row.sourceSafeBlank === true).length,
      nonBlankScaffolds: rows.filter((row) => row.exists && row.sourceSafeBlank === false).length,
      actionEvReadyScaffolds: rows.filter((row) => row.actionEvColumnsPresent === true).length,
      refreshedBlankScaffolds: refreshes.filter((refresh) => refresh.refreshedBlank).length,
      protectedStaleScaffolds: rows.filter((row) => row.protectedStale).length,
    },
    rows,
    refreshes,
    writes,
  };
  if (args.write) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(join(args.outDir, "batch-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    writeFileSync(join(args.outDir, "BATCH_REPORT.md"), `${renderBatchReport(result)}\n`, "utf8");
  }
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function preflight(packId: string, args: CliArgs, refresh: WorkbenchRefresh | undefined): PreflightRow {
  const csvPath = join(args.sourceDir, `${packId}.csv`);
  const preflightConfidence = args.confidence ?? "MEDIUM";
  if (!existsSync(csvPath)) return { packId, csvPath, exists: false, records: null, csvReady: null, productionReady: null, legalSlot: null, preflightConfidence, status: "WAITING", errors: ["CSV is missing."], scaffoldSchema: null, actionEvColumnsPresent: null, sourceSafeBlank: null, refreshedBlank: false, protectedStale: false, scaffoldErrors: [] };
  const input = readFileSync(csvPath, "utf8");
  const scaffold = inspectMttPreflopCsvScaffold(input, packId);
  const scaffoldState = scaffoldFields(scaffold, refresh?.refreshedBlank ?? false);
  if (scaffold.sourceSafeBlank) {
    return { packId, csvPath, exists: true, records: 0, csvReady: null, productionReady: null, legalSlot: null, preflightConfidence, status: "WAITING", errors: ["CSV contains no reviewed strategy records yet."], ...scaffoldState };
  }
  if (!csvNeedsFullPreflight(input, ["strictActions", "lenientActions", "actionEvsBb", "equivalentThresholdBb", "acceptableThresholdBb", "sourceReferenceId", "reviewer", "reviewedAt"])) {
    return { packId, csvPath, exists: true, records: 0, csvReady: null, productionReady: null, legalSlot: null, preflightConfidence, status: "WAITING", errors: ["CSV contains no reviewed strategy records yet."], ...scaffoldState };
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
  if (parsed === null) return { packId, csvPath, exists: true, records: null, csvReady: false, productionReady: false, legalSlot: false, preflightConfidence, status: "INVALID", errors: [compact(child.stderr || "CSV preflight produced no readable report.")], ...scaffoldState };
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
  return { packId, csvPath, exists: true, records, csvReady, productionReady, legalSlot, preflightConfidence, status, errors, ...scaffoldState };
}

function refreshWorkbench(packId: string, args: CliArgs): WorkbenchRefresh {
  const csvPath = join(args.sourceDir, `${packId}.csv`);
  if (!existsSync(csvPath)) {
    return { packId, csvPath, existed: false, beforeSha256: null, afterSha256: null, initialSchema: null, initialSourceSafeBlank: null, refreshableBlank: false, refreshedBlank: false, protectedStale: false, errors: [] };
  }

  const before = readFileSync(csvPath);
  const beforeSha256 = sha256(before);
  let inspection: MttPreflopCsvScaffoldInspection;
  try {
    inspection = inspectMttPreflopCsvScaffold(before.toString("utf8"), packId);
  } catch (error) {
    return { packId, csvPath, existed: true, beforeSha256, afterSha256: beforeSha256, initialSchema: "UNKNOWN", initialSourceSafeBlank: false, refreshableBlank: false, refreshedBlank: false, protectedStale: true, errors: [compact(error instanceof Error ? error.message : String(error))] };
  }

  const base = {
    packId,
    csvPath,
    existed: true,
    beforeSha256,
    initialSchema: inspection.schema,
    initialSourceSafeBlank: inspection.sourceSafeBlank,
    refreshableBlank: inspection.refreshableBlank,
    protectedStale: inspection.stale && !inspection.refreshableBlank,
  };
  if (!args.refreshBlankScaffolds || !inspection.refreshableBlank) {
    return { ...base, afterSha256: beforeSha256, refreshedBlank: false, errors: [] };
  }

  const current = readFileSync(csvPath);
  if (sha256(current) !== beforeSha256) {
    return { ...base, afterSha256: sha256(current), refreshedBlank: false, protectedStale: true, errors: ["CSV changed during blank-scaffold refresh; no overwrite was attempted."] };
  }

  const generated = buildMttPreflopCsvScaffoldDocument(packId);
  const generatedInspection = inspectMttPreflopCsvScaffold(generated.document, packId);
  if (!generatedInspection.current || !generatedInspection.sourceSafeBlank) {
    return { ...base, afterSha256: beforeSha256, refreshedBlank: false, protectedStale: true, errors: ["Generated replacement did not pass the current blank-scaffold invariant."] };
  }

  try {
    replaceFileWithBackup(csvPath, generated.document);
    return { ...base, afterSha256: sha256(readFileSync(csvPath)), refreshedBlank: true, protectedStale: false, errors: [] };
  } catch (error) {
    const afterSha256 = existsSync(csvPath) ? sha256(readFileSync(csvPath)) : null;
    return { ...base, afterSha256, refreshedBlank: false, protectedStale: true, errors: [compact(error instanceof Error ? error.message : String(error))] };
  }
}

function scaffoldFields(inspection: MttPreflopCsvScaffoldInspection, refreshedBlank: boolean) {
  return {
    scaffoldSchema: inspection.schema,
    actionEvColumnsPresent: inspection.actionEvColumnsPresent,
    sourceSafeBlank: inspection.sourceSafeBlank,
    refreshedBlank,
    protectedStale: inspection.stale && !inspection.refreshableBlank,
    scaffoldErrors: inspection.errors,
  };
}

function replaceFileWithBackup(path: string, document: string): void {
  const nonce = `${process.pid}-${Date.now()}`;
  const temporaryPath = `${path}.${nonce}.refresh.tmp`;
  const backupPath = `${path}.${nonce}.refresh.bak`;
  writeFileSync(temporaryPath, document, "utf8");
  renameSync(path, backupPath);
  try {
    renameSync(temporaryPath, path);
  } catch (error) {
    if (!existsSync(path) && existsSync(backupPath)) renameSync(backupPath, path);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  rmSync(backupPath, { force: true });
}

function sha256(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase("en-US") === resolve(right).toLocaleLowerCase("en-US");
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
  return ["MTT six-max preflop intake batch", `mode: ${result.mode}`, `valid: ${result.valid}`, `preflight valid: ${result.preflightValid}`, `candidate valid: ${result.candidateValid}`, `write performed: ${result.writePerformed}`, `permission mode: ${result.permissionMode}`, `workbench current: ${result.workbenchCurrent}`, `current scaffolds: ${result.workbenchCounts.currentScaffolds}/${PACK_IDS.length}`, `action-EV ready scaffolds: ${result.workbenchCounts.actionEvReadyScaffolds}/${PACK_IDS.length}`, `blank scaffolds: ${result.workbenchCounts.blankScaffolds}`, `nonblank scaffolds: ${result.workbenchCounts.nonBlankScaffolds}`, `refreshed blank scaffolds: ${result.workbenchCounts.refreshedBlankScaffolds}`, `protected stale scaffolds: ${result.workbenchCounts.protectedStaleScaffolds}`, `strategy values generated: ${result.strategyValuesGenerated}`, `ready: ${result.counts.ready}`, `waiting: ${result.counts.waiting}`, `invalid: ${result.counts.invalid}`, `source: ${result.sourceDir}`, ...result.rows.map((row) => `- ${row.packId}: status=${row.status} records=${row.records} schema=${row.scaffoldSchema} actionEvColumns=${row.actionEvColumnsPresent} blank=${row.sourceSafeBlank} refreshed=${row.refreshedBlank} protectedStale=${row.protectedStale} csvReady=${row.csvReady} productionReady=${row.productionReady} legalSlot=${row.legalSlot} confidence=${row.preflightConfidence} errors=${row.errors.length}`)].join("\n");
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
    `- Workbench current: ${result.workbenchCurrent}`,
    `- Action-EV-ready scaffolds: ${result.workbenchCounts.actionEvReadyScaffolds}/${PACK_IDS.length}`,
    `- Blank scaffolds refreshed: ${result.workbenchCounts.refreshedBlankScaffolds}`,
    `- Protected stale scaffolds: ${result.workbenchCounts.protectedStaleScaffolds}`,
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
