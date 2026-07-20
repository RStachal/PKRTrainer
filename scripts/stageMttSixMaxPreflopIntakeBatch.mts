import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const PACK_IDS = [
  "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1",
] as const;
const CONFIRM_TOKEN = "STAGE_REVIEWED_MTT_SIXMAX_P1_BATCH";

interface CliArgs { draftDir: string; rawRoot: string; incremental: boolean; write: boolean; confirm: string | null; json: boolean; }
interface StageRow { packId: string; candidatePath: string; permissionPath: string; permissionSource: "CANONICAL" | "CANDIDATE" | "MISSING"; status: "READY" | "WAITING" | "INVALID"; valid: boolean; errors: string[]; }

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
  let draftDir = resolve("artifacts/mtt-sixmax-preflop-intake");
  let rawRoot = resolve("Agents/range-intake/raw");
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
    if (item.startsWith("--draft-dir=")) { draftDir = resolve(value(item, "--draft-dir")); continue; }
    if (item.startsWith("--raw-root=")) { rawRoot = resolve(value(item, "--raw-root")); continue; }
    if (item.startsWith("--confirm=")) { confirm = value(item, "--confirm"); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  if (write && confirm !== CONFIRM_TOKEN) throw new Error(`--write requires --confirm=${CONFIRM_TOKEN}.`);
  return { draftDir, rawRoot, incremental, write, confirm, json };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:sixmax-preflop-stage-batch -- --draft-dir=artifacts/mtt-sixmax-preflop-intake [--summary]",
    "  npm run mtt:sixmax-preflop-stage-batch -- --draft-dir=artifacts/mtt-sixmax-preflop-intake --incremental [--summary]",
    "  npm run mtt:sixmax-preflop-stage-batch -- --write --confirm=STAGE_REVIEWED_MTT_SIXMAX_P1_BATCH",
    "",
    "Preflights all four six-max candidates and matching permission manifests before staging any raw intake file.",
    "--incremental stages every currently ready reviewed pair without waiting for absent pairs.",
    "Promotion remains a separate explicit action.",
  ].join("\n");
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
  const writes = preflightValid && args.write ? selectedRows.map((row) => writeOne(row, args)) : [];
  const writeValid = !args.write || writes.every((write) => write.valid && write.writePerformed);
  const result = {
    valid: preflightValid && writeValid,
    mode: args.incremental ? "INCREMENTAL" : "ATOMIC_ALL_FOUR",
    preflightValid,
    writeValid,
    writePerformed: writes.length > 0 && writeValid,
    counts: { ready: readyRows.length, waiting: waitingRows.length, invalid: invalidRows.length },
    draftDir: args.draftDir,
    rawRoot: args.rawRoot,
    rows,
    writes,
  };
  if (args.write) {
    mkdirSync(args.draftDir, { recursive: true });
    writeFileSync(join(args.draftDir, "STAGING_BATCH_REPORT.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function preflight(packId: string, args: CliArgs): StageRow {
  const candidatePath = join(args.draftDir, packId, "normalized.candidate.json");
  const candidatePermissionPath = join(args.draftDir, packId, "permission.candidate.json");
  const canonicalPermissionPath = join(args.rawRoot, packId, "permission.json");
  const candidateExists = existsSync(candidatePath);
  const permissionSource = existsSync(canonicalPermissionPath)
    ? "CANONICAL"
    : existsSync(candidatePermissionPath) ? "CANDIDATE" : "MISSING";
  const permissionPath = permissionSource === "CANONICAL" ? canonicalPermissionPath : candidatePermissionPath;
  const permissionExists = permissionSource !== "MISSING";
  if (!candidateExists && !permissionExists) {
    return { packId, candidatePath, permissionPath, permissionSource, status: "WAITING", valid: false, errors: ["Candidate is missing.", "Permission manifest is missing."] };
  }
  if (!candidateExists) {
    return { packId, candidatePath, permissionPath, permissionSource, status: "WAITING", valid: false, errors: ["Candidate is missing."] };
  }
  if (!permissionExists) {
    return { packId, candidatePath, permissionPath, permissionSource, status: "INVALID", valid: false, errors: ["Permission manifest is missing."] };
  }
  const row = { packId, candidatePath, permissionPath, permissionSource };
  const result = invokeStage(row, args, false);
  return { ...row, status: result.valid ? "READY" : "INVALID", valid: result.valid, errors: result.errors };
}

function writeOne(row: StageRow, args: CliArgs) { return invokeStage(row, args, true); }

function invokeStage(row: Pick<StageRow, "packId" | "permissionPath">, args: CliArgs, write: boolean) {
  const commandArgs = [
    "node_modules/vite-node/vite-node.mjs", "scripts/stageMttP1ReviewedPreflopIntake.mts",
    `--pack-id=${row.packId}`, `--draft-dir=${args.draftDir}`, `--raw-root=${args.rawRoot}`, `--permission=${row.permissionPath}`, "--json",
  ];
  if (write) commandArgs.push("--write", "--confirm=STAGE_REVIEWED_MTT_P1_PREFLOP");
  const child = spawnSync(process.execPath, commandArgs, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const report = parseJson(child.stdout);
  const errors = Array.isArray(report?.errors) ? report.errors.filter((entry): entry is string => typeof entry === "string") : [compact(child.stderr || "No readable staging report.")];
  return { packId: row.packId, valid: report?.valid === true, writePerformed: report?.writePerformed === true, exitCode: child.status, errors, report };
}

function parseJson(value: string): Record<string, unknown> | null {
  try { const parsed: unknown = JSON.parse(value); return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null; } catch { return null; }
}
function compact(value: string): string { return value.trim().slice(0, 500); }
function render(result: ReturnType<typeof run>): string {
  return ["MTT six-max preflop staging batch", `mode: ${result.mode}`, `valid: ${result.valid}`, `preflight valid: ${result.preflightValid}`, `write valid: ${result.writeValid}`, `write performed: ${result.writePerformed}`, `ready: ${result.counts.ready}`, `waiting: ${result.counts.waiting}`, `invalid: ${result.counts.invalid}`, ...result.rows.map((row) => `- ${row.packId}: ${row.status} permission=${row.permissionSource}${row.errors.length > 0 ? ` ${row.errors.join(" ")}` : ""}`)].join("\n");
}
