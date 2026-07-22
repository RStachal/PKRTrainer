import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  mergeMttPreflopCsvScaffoldChunk,
  type MttPreflopCsvScaffoldProgress,
} from "../src/data/ranges/mttPreflopCsvScaffold.ts";

const PACK_IDS = [
  "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-on-production-v1",
  "mtt-six-max-turbo-preflop-chip-ev-ante-off-production-v1",
] as const;
const CONFIRM_TOKEN = "MERGE_REVIEWED_MTT_SIXMAX_PREFLOP_CHUNK";

interface CliArgs {
  chunkPath: string;
  confirm: string | null;
  json: boolean;
  outputPath: string | null;
  packId: string;
  workbenchPath: string;
  write: boolean;
}

interface MergeReport {
  afterProgress: MttPreflopCsvScaffoldProgress | null;
  beforeProgress: MttPreflopCsvScaffoldProgress;
  chunkPath: string;
  chunkSha256: string;
  counts: {
    chunkRows: number;
    conflictRows: number;
    matchedRows: number;
    plannedChangedRows: number;
    unchangedRows: number;
  };
  errors: string[];
  finalSha256: string;
  packId: string;
  proposedSha256: string | null;
  status: "ALREADY_APPLIED" | "DRY_RUN_READY" | "INVALID" | "MERGED";
  strategyValuesGenerated: "none";
  valid: boolean;
  workbenchPath: string;
  workbenchSha256Before: string;
  writePerformed: boolean;
  writeRequested: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let chunkPath = "";
  let confirm: string | null = null;
  let json = false;
  let outputPath: string | null = null;
  let packId = "";
  let workbenchPath = "";
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") continue;
    if (item === "--pack-id") { packId = requiredValue(argv, index, "--pack-id"); index += 1; continue; }
    if (item === "--chunk") { chunkPath = requiredValue(argv, index, "--chunk"); index += 1; continue; }
    if (item === "--workbench") { workbenchPath = requiredValue(argv, index, "--workbench"); index += 1; continue; }
    if (item === "--output") { outputPath = resolve(requiredValue(argv, index, "--output")); index += 1; continue; }
    if (item.startsWith("--pack-id=")) { packId = inlineValue(item, "--pack-id"); continue; }
    if (item.startsWith("--chunk=")) { chunkPath = inlineValue(item, "--chunk"); continue; }
    if (item.startsWith("--workbench=")) { workbenchPath = inlineValue(item, "--workbench"); continue; }
    if (item.startsWith("--output=")) { outputPath = resolve(inlineValue(item, "--output")); continue; }
    if (item.startsWith("--confirm=")) { confirm = inlineValue(item, "--confirm"); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (!PACK_IDS.some((candidate) => candidate === packId)) {
    throw new Error(`--pack-id must name one of the four exact six-max CHIP_EV production slots.\n\n${usage()}`);
  }
  if (chunkPath.length === 0) throw new Error(`--chunk is required.\n\n${usage()}`);
  const resolvedChunkPath = resolve(chunkPath);
  const resolvedWorkbenchPath = resolve(
    workbenchPath || join("artifacts/mtt-p1-sixmax-workbench", `${packId}.csv`),
  );
  if (samePath(resolvedChunkPath, resolvedWorkbenchPath)) {
    throw new Error("--chunk and --workbench must be different files.");
  }
  if (outputPath !== null && (
    samePath(outputPath, resolvedChunkPath) || samePath(outputPath, resolvedWorkbenchPath)
  )) {
    throw new Error("--output must not overwrite the chunk or workbench CSV.");
  }
  if (write && confirm !== CONFIRM_TOKEN) {
    throw new Error(`--write requires --confirm=${CONFIRM_TOKEN}.`);
  }
  if (!write && confirm !== null) throw new Error("--confirm requires --write.");
  if (!existsSync(resolvedWorkbenchPath)) throw new Error(`Workbench CSV does not exist: ${resolvedWorkbenchPath}`);
  if (!existsSync(resolvedChunkPath)) throw new Error(`Chunk CSV does not exist: ${resolvedChunkPath}`);

  return {
    chunkPath: resolvedChunkPath,
    confirm,
    json,
    outputPath,
    packId,
    workbenchPath: resolvedWorkbenchPath,
    write,
  };
}

function run(args: CliArgs): MergeReport {
  const workbenchBefore = readFileSync(args.workbenchPath);
  const chunk = readFileSync(args.chunkPath);
  const workbenchSha256Before = sha256(workbenchBefore);
  const merged = mergeMttPreflopCsvScaffoldChunk(
    workbenchBefore.toString("utf8"),
    chunk.toString("utf8"),
    args.packId,
  );
  const report: MergeReport = {
    afterProgress: merged.afterProgress,
    beforeProgress: merged.beforeProgress,
    chunkPath: args.chunkPath,
    chunkSha256: sha256(chunk),
    counts: {
      chunkRows: merged.chunkRows,
      conflictRows: merged.conflictRows,
      matchedRows: merged.matchedRows,
      plannedChangedRows: merged.plannedChangedRows,
      unchangedRows: merged.unchangedRows,
    },
    errors: [...merged.errors],
    finalSha256: workbenchSha256Before,
    packId: args.packId,
    proposedSha256: merged.document === null ? null : sha256(Buffer.from(merged.document, "utf8")),
    status: merged.valid ? "DRY_RUN_READY" : "INVALID",
    strategyValuesGenerated: "none",
    valid: merged.valid,
    workbenchPath: args.workbenchPath,
    workbenchSha256Before,
    writePerformed: false,
    writeRequested: args.write,
  };
  if (!merged.valid || merged.document === null || !args.write) return report;
  if (merged.plannedChangedRows === 0) {
    report.status = "ALREADY_APPLIED";
    return report;
  }

  const current = readFileSync(args.workbenchPath);
  const currentSha256 = sha256(current);
  if (currentSha256 !== workbenchSha256Before) {
    report.valid = false;
    report.status = "INVALID";
    report.finalSha256 = currentSha256;
    report.errors.push("Workbench changed after preflight; no write was attempted.");
    return report;
  }

  try {
    report.finalSha256 = replaceFileWithBackup(
      args.workbenchPath,
      merged.document,
      report.proposedSha256,
    );
  } catch (error) {
    report.valid = false;
    report.status = "INVALID";
    report.finalSha256 = existsSync(args.workbenchPath)
      ? sha256(readFileSync(args.workbenchPath))
      : "missing";
    report.errors.push(
      `Atomic workbench replacement failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return report;
  }
  report.status = "MERGED";
  report.writePerformed = true;
  return report;
}

function replaceFileWithBackup(path: string, document: string, expectedSha256: string): string {
  const nonce = `${process.pid}-${Date.now()}`;
  const temporaryPath = `${path}.${nonce}.merge.tmp`;
  const backupPath = `${path}.${nonce}.merge.bak`;
  writeFileSync(temporaryPath, document, "utf8");
  const temporarySha256 = sha256(readFileSync(temporaryPath));
  if (temporarySha256 !== expectedSha256) {
    rmSync(temporaryPath, { force: true });
    throw new Error("temporary file hash does not match the validated merge document");
  }
  renameSync(path, backupPath);
  try {
    renameSync(temporaryPath, path);
    const finalSha256 = sha256(readFileSync(path));
    if (finalSha256 !== expectedSha256) {
      throw new Error("written file hash does not match the validated merge document");
    }
    rmSync(backupPath, { force: true });
    return finalSha256;
  } catch (error) {
    if (existsSync(path)) rmSync(path, { force: true });
    if (existsSync(backupPath)) renameSync(backupPath, path);
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function render(report: MergeReport): string {
  return [
    "MTT six-max preflop chunk merge",
    `status: ${report.status}`,
    `valid: ${report.valid}`,
    `write requested: ${report.writeRequested}`,
    `write performed: ${report.writePerformed}`,
    `pack: ${report.packId}`,
    `chunk rows: ${report.counts.chunkRows}`,
    `matched rows: ${report.counts.matchedRows}`,
    `planned changed rows: ${report.counts.plannedChangedRows}`,
    `unchanged rows: ${report.counts.unchangedRows}`,
    `conflict rows: ${report.counts.conflictRows}`,
    `strategy values generated: ${report.strategyValuesGenerated}`,
    `strategy progress: ${report.beforeProgress.strategyCompleteRows} -> ${report.afterProgress?.strategyCompleteRows ?? "n/a"}`,
    `action-EV progress: ${report.beforeProgress.actionEvCompleteRows} -> ${report.afterProgress?.actionEvCompleteRows ?? "n/a"}`,
    `review progress: ${report.beforeProgress.reviewCompleteRows} -> ${report.afterProgress?.reviewCompleteRows ?? "n/a"}`,
    `workbench: ${report.workbenchPath}`,
    `chunk: ${report.chunkPath}`,
    ...report.errors.map((error) => `- ${error}`),
  ].join("\n");
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:sixmax-preflop-merge-chunk -- --pack-id=<packId> --chunk=<reviewed.csv> [--summary]",
    `  npm run mtt:sixmax-preflop-merge-chunk -- --pack-id=<packId> --chunk=<reviewed.csv> --write --confirm=${CONFIRM_TOKEN}`,
    "",
    "Dry-run is the default. The chunk must use the exact current 20-column scaffold header and immutable decision identity.",
    "Complete strategy pairs and action-EV triples are merged independently; conflicts block the entire write.",
    "This command never creates candidates, permissions, production data, or strategy values.",
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const result = argv[index + 1] ?? "";
  if (result.length === 0 || result.startsWith("-")) throw new Error(`${flag} requires a value.`);
  return result;
}

function inlineValue(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase("en-US") === resolve(right).toLocaleLowerCase("en-US");
}

function sha256(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
