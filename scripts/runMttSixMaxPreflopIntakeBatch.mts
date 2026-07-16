import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

interface CliArgs { sourceDir: string; outDir: string; reviewer: string; rightsOwner: string; sourceLocation: string; reviewedAt: string; confidence: Confidence | null; write: boolean; confirm: string | null; json: boolean; }
interface PreflightRow { packId: string; csvPath: string; exists: boolean; csvReady: boolean | null; legalSlot: boolean | null; errors: string[]; }

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
  let write = false;
  let confirm: string | null = null;
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
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
  if (write && (!reviewer || !rightsOwner || !sourceLocation || confidence === null)) throw new Error("--write requires --reviewer, --rights-owner, --source-location and --confidence=MEDIUM|HIGH.");
  return { sourceDir, outDir, reviewer, rightsOwner, sourceLocation, reviewedAt, confidence, write, confirm, json };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:sixmax-preflop-intake-batch -- --source-dir=<csv-folder> [--summary]",
    "  npm run mtt:sixmax-preflop-intake-batch -- --write --reviewer=<owner> --rights-owner=<owner> --source-location=<owned solver export> --confidence=HIGH --confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES",
    "",
    "Preflights all four exact six-max CHIP_EV CSV files before writing any candidate.",
    "It writes review candidates only; raw intake and production promotion stay explicit separate steps.",
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
  const rows = PACK_IDS.map((packId) => preflight(packId, args.sourceDir));
  const preflightValid = rows.every((row) => row.csvReady === true && row.legalSlot === true);
  const writes = preflightValid && args.write ? writeCandidates(args, rows) : [];
  const candidateValid = !args.write || writes.every((write) => write.candidateValid);
  const result = { valid: preflightValid && candidateValid, preflightValid, candidateValid, writePerformed: writes.length > 0, sourceDir: args.sourceDir, outDir: args.outDir, rows, writes };
  if (args.write) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(join(args.outDir, "batch-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    writeFileSync(join(args.outDir, "BATCH_REPORT.md"), `${renderBatchReport(result)}\n`, "utf8");
  }
  return result;
}

function preflight(packId: string, sourceDir: string): PreflightRow {
  const csvPath = join(sourceDir, `${packId}.csv`);
  if (!existsSync(csvPath)) return { packId, csvPath, exists: false, csvReady: null, legalSlot: null, errors: ["CSV is missing."] };
  const child = spawnSync(process.execPath, ["node_modules/vite-node/vite-node.mjs", "scripts/buildMttPreflopCsvDraft.mts", `--csv=${csvPath}`, `--pack-id=${packId}`, "--json"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = parseJson(child.stdout);
  if (parsed === null) return { packId, csvPath, exists: true, csvReady: false, legalSlot: false, errors: [compact(child.stderr || "CSV preflight produced no readable report.")] };
  const csvErrors = Array.isArray(parsed.csvErrors) ? parsed.csvErrors.filter((entry): entry is string => typeof entry === "string") : [];
  const slotReport = parsed.slotReport;
  return { packId, csvPath, exists: true, csvReady: parsed.csvReady === true, legalSlot: typeof slotReport === "object" && slotReport !== null && (slotReport as { valid?: unknown }).valid === true, errors: csvErrors.slice(0, 20) };
}

function writeCandidates(args: CliArgs, rows: readonly PreflightRow[]) {
  return rows.map((row) => {
    const packDir = join(args.outDir, row.packId);
    mkdirSync(packDir, { recursive: true });
    const child = spawnSync(process.execPath, [
      "node_modules/vite-node/vite-node.mjs", "scripts/buildMttPreflopCsvDraft.mts", `--csv=${row.csvPath}`, `--pack-id=${row.packId}`,
      `--out=${join(packDir, "normalized.candidate.json")}`, `--permission-out=${join(packDir, "permission.candidate.json")}`,
      `--reviewer=${args.reviewer}`, `--rights-owner=${args.rightsOwner}`, "--license-kind=OWNED_SOLVER_EXPORT",
      `--source-location=${args.sourceLocation}`, `--verified-at=${args.reviewedAt}`, `--confidence=${args.confidence}`, "--json",
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
  return ["MTT six-max preflop intake batch", `valid: ${result.valid}`, `preflight valid: ${result.preflightValid}`, `candidate valid: ${result.candidateValid}`, `write performed: ${result.writePerformed}`, `source: ${result.sourceDir}`, ...result.rows.map((row) => `- ${row.packId}: csvReady=${row.csvReady} legalSlot=${row.legalSlot} errors=${row.errors.length}`)].join("\n");
}

function renderBatchReport(result: ReturnType<typeof run>): string {
  return [
    "# Six-Max P1 Candidate Batch",
    "",
    `- Preflight valid: ${result.preflightValid}`,
    `- Candidate validation valid: ${result.candidateValid}`,
    `- Candidates written: ${result.writePerformed}`,
    "",
    "## Results",
    "",
    "| Pack | CSV ready | Legal slot | Candidate valid |",
    "| --- | --- | --- | --- |",
    ...result.rows.map((row) => {
      const write = result.writes.find((candidate) => candidate.packId === row.packId);
      return `| ${row.packId} | ${row.csvReady} | ${row.legalSlot} | ${write?.candidateValid ?? "not written"} |`;
    }),
    "",
    "## Next Gate",
    "",
    "Candidates are not raw intake. Stage each matching reviewed candidate explicitly with `mtt:p1-stage-reviewed-preflop`, then run ready-intake validation and promotion dry-run.",
  ].join("\n");
}
