import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ALL_HAND_CLASSES } from "../src/core/poker.ts";
import { STACK_BUCKETS } from "../src/core/types.ts";
import { positionsForFormat } from "../src/core/trainingProfile.ts";
import { mttProductionImportIdentityFromPackId } from "../src/data/ranges/mttImportSlotNaming.ts";

interface CliArgs {
  packId: string;
  outputPath: string;
  maxRows: number | null;
  reviewer: string;
  reviewedAt: string;
  sourceReferenceId: string;
}

const ACTION_CONTEXTS = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
] as const;

const HEADER = [
  "rowKind",
  "packId",
  "tableFormat",
  "blindSpeed",
  "ante",
  "evModel",
  "position",
  "sourceStackBB",
  "bucket",
  "context",
  "handClass",
  "strictActions",
  "lenientActions",
  "actionEvsBb",
  "equivalentThresholdBb",
  "acceptableThresholdBb",
  "sourceReferenceId",
  "reviewer",
  "reviewedAt",
  "notes",
];

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:preflop-csv-scaffold -- --pack-id <packId> --out artifacts/mtt-preflop-csv-scaffold/<packId>.csv",
    "  npm run mtt:preflop-csv-scaffold -- --pack-id <packId> --max-rows=200",
    "",
    "Creates an empty source-safe CSV scaffold. It contains no strategy values; strictActions and lenientActions must be filled from reviewed data.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let packId = "";
  let outputPath = "";
  let maxRows: number | null = null;
  let reviewer = "";
  let reviewedAt = "";
  let sourceReferenceId = "";

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--pack-id") {
      packId = requiredValue(argv, index, "--pack-id");
      index += 1;
      continue;
    }
    if (item.startsWith("--pack-id=")) {
      packId = inlineValue(item, "--pack-id");
      continue;
    }
    if (item === "--out") {
      outputPath = requiredValue(argv, index, "--out");
      index += 1;
      continue;
    }
    if (item.startsWith("--out=")) {
      outputPath = inlineValue(item, "--out");
      continue;
    }
    if (item === "--max-rows") {
      maxRows = parsePositiveInt(requiredValue(argv, index, "--max-rows"), "--max-rows");
      index += 1;
      continue;
    }
    if (item.startsWith("--max-rows=")) {
      maxRows = parsePositiveInt(inlineValue(item, "--max-rows"), "--max-rows");
      continue;
    }
    if (item === "--reviewer") {
      reviewer = requiredValue(argv, index, "--reviewer");
      index += 1;
      continue;
    }
    if (item.startsWith("--reviewer=")) {
      reviewer = inlineValue(item, "--reviewer");
      continue;
    }
    if (item === "--reviewed-at") {
      reviewedAt = requiredValue(argv, index, "--reviewed-at");
      index += 1;
      continue;
    }
    if (item.startsWith("--reviewed-at=")) {
      reviewedAt = inlineValue(item, "--reviewed-at");
      continue;
    }
    if (item === "--source-reference-id") {
      sourceReferenceId = requiredValue(argv, index, "--source-reference-id");
      index += 1;
      continue;
    }
    if (item.startsWith("--source-reference-id=")) {
      sourceReferenceId = inlineValue(item, "--source-reference-id");
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (packId.length === 0) throw new Error(`--pack-id is required.\n\n${usage()}`);
  if (outputPath.length === 0) outputPath = `artifacts/mtt-preflop-csv-scaffold/${packId}.csv`;
  return { packId, outputPath: resolve(outputPath), maxRows, reviewer, reviewedAt, sourceReferenceId };
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const identity = mttProductionImportIdentityFromPackId(args.packId);
  if (identity === null || identity.street !== "PREFLOP") {
    throw new Error(`Pack id is not a legal MTT preflop production slot: ${args.packId}`);
  }

  const rows: string[][] = [HEADER];
  let emitted = 0;
  for (const position of positionsForFormat(identity.tableFormat)) {
    for (const bucket of STACK_BUCKETS) {
      for (const context of ACTION_CONTEXTS) {
        for (const handClass of ALL_HAND_CLASSES) {
          if (args.maxRows !== null && emitted >= args.maxRows) break;
          rows.push([
            "HAND_CLASS_DECISION",
            args.packId,
            identity.tableFormat,
            identity.blindSpeed,
            identity.ante,
            identity.evModel,
            position,
            String(bucket),
            String(bucket),
            context,
            handClass,
            "",
            "",
            "",
            "",
            "",
            args.sourceReferenceId,
            args.reviewer,
            args.reviewedAt,
            "fill strictActions and lenientActions from reviewed source",
          ]);
          emitted += 1;
        }
        if (args.maxRows !== null && emitted >= args.maxRows) break;
      }
      if (args.maxRows !== null && emitted >= args.maxRows) break;
    }
    if (args.maxRows !== null && emitted >= args.maxRows) break;
  }

  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
  console.log([
    "MTT preflop CSV scaffold",
    `packId: ${args.packId}`,
    `output: ${args.outputPath}`,
    `rows: ${emitted}`,
    `completeSlotRows: ${positionsForFormat(identity.tableFormat).length * STACK_BUCKETS.length * ACTION_CONTEXTS.length * ALL_HAND_CLASSES.length}`,
    "strategyValues: none",
  ].join("\n"));
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1] ?? "";
  if (value.length === 0 || value.startsWith("-")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length);
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
