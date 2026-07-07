import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_PACK =
  "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_FACING_BET_PILOT/normalized.candidate.json";
const DEFAULT_OUTPUT = "artifacts/range-cross-check/sample.json";
const DEFAULT_CSV = "artifacts/range-cross-check/sample.csv";

type Action = "CHECK" | "BET_SMALL" | "BET_BIG" | "CALL" | "RAISE" | "FOLD";

interface CliArgs {
  packPath: string;
  outputPath: string;
  csvPath: string;
  sampleSize: number;
  seed: number;
}

interface Pack {
  id: string;
  version: string;
  dimensions: {
    gameVariant: string;
    tableFormat: string;
    blindSpeeds: readonly string[];
    street: string;
    evModel: string;
    antes: readonly string[];
  };
  rules: readonly Rule[];
}

interface Rule {
  id: string;
  actionNode: string;
  potType: string;
  positionPattern: string;
  boardTextures: readonly string[];
  sprMin: number;
  sprMax: number;
  recommendedAction: Action;
  rangeBuckets: readonly Bucket[];
}

interface Bucket {
  lane: string;
  label: string;
  action: Action;
  handClasses: readonly string[];
  actionMix?: readonly { action: Action; frequencyPct: number; visibility: string }[];
}

interface SampleRow {
  sampleId: string;
  packId: string;
  packVersion: string;
  ruleId: string;
  actionNode: string;
  potType: string;
  positionPattern: string;
  sprMin: number;
  sprMax: number;
  boardTextures: readonly string[];
  handClass: string;
  lane: string;
  bucketLabel: string;
  ourAction: Action;
  ourFrequencies: Partial<Record<Action, number>>;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const pack = JSON.parse(readFileSync(args.packPath, "utf8")) as Pack;
  const rows = sampleRows(flattenPack(pack), args.sampleSize, args.seed);
  const report = {
    valid: true,
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    sampleSize: args.sampleSize,
    sourcePack: args.packPath,
    outputPath: args.outputPath,
    csvPath: args.csvPath,
    pack: {
      id: pack.id,
      version: pack.version,
      dimensions: pack.dimensions,
      rules: pack.rules.length,
    },
    rows,
    externalCsvContract: {
      required: ["sampleId"],
      recommended: ["externalAction"],
      optionalFrequencies: ["CHECK", "BET_SMALL", "BET_BIG", "CALL", "RAISE", "FOLD"],
      note: "Fill externalAction and/or action-frequency columns from the other solver, then run range:cross-check-compare.",
    },
  };
  mkdirSync(dirname(args.outputPath), { recursive: true });
  mkdirSync(dirname(args.csvPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(args.csvPath, renderCsv(rows), "utf8");
  console.log(renderSummary(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let packPath = resolve(DEFAULT_PACK);
  let outputPath = resolve(DEFAULT_OUTPUT);
  let csvPath = resolve(DEFAULT_CSV);
  let sampleSize = 25;
  let seed = 20260707;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--pack") {
      packPath = resolve(requiredValue(argv, index, "--pack"));
      index += 1;
      continue;
    }
    if (item.startsWith("--pack=")) {
      packPath = resolve(inlineValue(item, "--pack"));
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(requiredValue(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    if (item === "--csv") {
      csvPath = resolve(requiredValue(argv, index, "--csv"));
      index += 1;
      continue;
    }
    if (item.startsWith("--csv=")) {
      csvPath = resolve(inlineValue(item, "--csv"));
      continue;
    }
    if (item === "--sample-size") {
      sampleSize = parsePositiveInt(requiredValue(argv, index, "--sample-size"), "--sample-size");
      index += 1;
      continue;
    }
    if (item.startsWith("--sample-size=")) {
      sampleSize = parsePositiveInt(inlineValue(item, "--sample-size"), "--sample-size");
      continue;
    }
    if (item === "--seed") {
      seed = parsePositiveInt(requiredValue(argv, index, "--seed"), "--seed");
      index += 1;
      continue;
    }
    if (item.startsWith("--seed=")) {
      seed = parsePositiveInt(inlineValue(item, "--seed"), "--seed");
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { packPath, outputPath, csvPath, sampleSize, seed };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run range:cross-check-sample",
    "  npm run range:cross-check-sample -- --pack artifacts/.../normalized.candidate.json --sample-size=40 --seed=123",
    "",
    "Builds a deterministic random hand-class sample for external solver comparison.",
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function flattenPack(pack: Pack): SampleRow[] {
  return pack.rules.flatMap((rule, ruleIndex) =>
    rule.rangeBuckets.flatMap((bucket, bucketIndex) =>
      bucket.handClasses.map((handClass, handIndex) => ({
        sampleId: [
          "PKR",
          String(ruleIndex + 1).padStart(2, "0"),
          String(bucketIndex + 1).padStart(3, "0"),
          String(handIndex + 1).padStart(2, "0"),
          handClass,
        ].join("-"),
        packId: pack.id,
        packVersion: pack.version,
        ruleId: rule.id,
        actionNode: rule.actionNode,
        potType: rule.potType,
        positionPattern: rule.positionPattern,
        sprMin: rule.sprMin,
        sprMax: rule.sprMax,
        boardTextures: [...rule.boardTextures],
        handClass,
        lane: bucket.lane,
        bucketLabel: bucket.label,
        ourAction: bucket.action,
        ourFrequencies: frequencies(bucket),
      })),
    ),
  );
}

function frequencies(bucket: Bucket): Partial<Record<Action, number>> {
  const result: Partial<Record<Action, number>> = {};
  for (const item of bucket.actionMix ?? []) result[item.action] = item.frequencyPct;
  return result;
}

function sampleRows(rows: readonly SampleRow[], sampleSize: number, seed: number): SampleRow[] {
  const decorated = rows.map((row) => ({ row, score: randomScore(`${seed}:${row.sampleId}:${row.ruleId}`) }));
  return decorated
    .sort((a, b) => a.score - b.score || a.row.sampleId.localeCompare(b.row.sampleId))
    .slice(0, Math.min(sampleSize, rows.length))
    .map((item, index) => ({
      ...item.row,
      sampleId: `S${String(index + 1).padStart(3, "0")}-${item.row.sampleId}`,
    }));
}

function randomScore(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function renderCsv(rows: readonly SampleRow[]): string {
  const actions: readonly Action[] = ["CHECK", "BET_SMALL", "BET_BIG", "CALL", "RAISE", "FOLD"];
  const header = [
    "sampleId",
    "ruleId",
    "actionNode",
    "potType",
    "positionPattern",
    "sprMin",
    "sprMax",
    "boardTextures",
    "handClass",
    "lane",
    "ourAction",
    ...actions.map((action) => `our_${action}`),
    "externalAction",
    ...actions,
    "externalNotes",
  ];
  const body = rows.map((row) => [
    row.sampleId,
    row.ruleId,
    row.actionNode,
    row.potType,
    row.positionPattern,
    String(row.sprMin),
    String(row.sprMax),
    row.boardTextures.join("|"),
    row.handClass,
    row.lane,
    row.ourAction,
    ...actions.map((action) => formatNumber(row.ourFrequencies[action])),
    "",
    ...actions.map(() => ""),
    "",
  ]);
  return `${[header, ...body].map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "" : String(Math.round(value * 10) / 10);
}

function renderSummary(report: {
  valid: boolean;
  sourcePack: string;
  outputPath: string;
  csvPath: string;
  rows: readonly SampleRow[];
}): string {
  return [
    "Range cross-check sample",
    `valid: ${report.valid}`,
    `rows: ${report.rows.length}`,
    `source: ${report.sourcePack}`,
    `json: ${report.outputPath}`,
    `csv: ${report.csvPath}`,
  ].join("\n");
}
