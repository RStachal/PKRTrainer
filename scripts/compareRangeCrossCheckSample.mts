import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const DEFAULT_SAMPLE = "artifacts/range-cross-check/sample.json";
const DEFAULT_EXTERNAL = "artifacts/range-cross-check/external.csv";
const DEFAULT_OUTPUT = "artifacts/range-cross-check/compare-report.json";
const DEFAULT_MARKDOWN = "artifacts/range-cross-check/compare-report.md";

const ACTIONS = ["CHECK", "BET_SMALL", "BET_BIG", "CALL", "RAISE", "FOLD"] as const;
type Action = (typeof ACTIONS)[number];

interface CliArgs {
  samplePath: string;
  externalPath: string;
  outputPath: string;
  markdownPath: string;
  actionTolerancePct: number;
  frequencyTolerancePct: number;
}

interface SampleReport {
  rows: SampleRow[];
}

interface SampleRow {
  sampleId: string;
  ruleId: string;
  actionNode: string;
  potType: string;
  positionPattern: string;
  handClass: string;
  lane: string;
  ourAction: Action;
  ourFrequencies: Partial<Record<Action, number>>;
}

interface ExternalRow {
  sampleId: string;
  externalAction: string | null;
  externalFrequencies: Partial<Record<Action, number>>;
  notes: string | null;
}

interface CompareRow {
  sampleId: string;
  ruleId: string;
  actionNode: string;
  handClass: string;
  ourAction: Action;
  externalAction: string | null;
  actionMatch: boolean | null;
  maxFrequencyDeltaPct: number | null;
  frequencyPass: boolean | null;
  deltas: Partial<Record<Action, number>>;
  notes: string | null;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const sample = JSON.parse(readFileSync(args.samplePath, "utf8")) as SampleReport;
  const externalRows = readExternalRows(args.externalPath);
  const report = compare(sample.rows, externalRows, args);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  mkdirSync(dirname(args.markdownPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(args.markdownPath, renderMarkdown(report), "utf8");
  console.log(renderSummary(report, args));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let samplePath = resolve(DEFAULT_SAMPLE);
  let externalPath = resolve(DEFAULT_EXTERNAL);
  let outputPath = resolve(DEFAULT_OUTPUT);
  let markdownPath = resolve(DEFAULT_MARKDOWN);
  let actionTolerancePct = 0;
  let frequencyTolerancePct = 15;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--sample") {
      samplePath = resolve(requiredValue(argv, index, "--sample"));
      index += 1;
      continue;
    }
    if (item.startsWith("--sample=")) {
      samplePath = resolve(inlineValue(item, "--sample"));
      continue;
    }
    if (item === "--external") {
      externalPath = resolve(requiredValue(argv, index, "--external"));
      index += 1;
      continue;
    }
    if (item.startsWith("--external=")) {
      externalPath = resolve(inlineValue(item, "--external"));
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
    if (item === "--markdown") {
      markdownPath = resolve(requiredValue(argv, index, "--markdown"));
      index += 1;
      continue;
    }
    if (item.startsWith("--markdown=")) {
      markdownPath = resolve(inlineValue(item, "--markdown"));
      continue;
    }
    if (item === "--frequency-tolerance-pct") {
      frequencyTolerancePct = parseNonNegativeNumber(requiredValue(argv, index, "--frequency-tolerance-pct"), item);
      index += 1;
      continue;
    }
    if (item.startsWith("--frequency-tolerance-pct=")) {
      frequencyTolerancePct = parseNonNegativeNumber(inlineValue(item, "--frequency-tolerance-pct"), "--frequency-tolerance-pct");
      continue;
    }
    if (item === "--action-tolerance-pct") {
      actionTolerancePct = parseNonNegativeNumber(requiredValue(argv, index, "--action-tolerance-pct"), item);
      index += 1;
      continue;
    }
    if (item.startsWith("--action-tolerance-pct=")) {
      actionTolerancePct = parseNonNegativeNumber(inlineValue(item, "--action-tolerance-pct"), "--action-tolerance-pct");
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { samplePath, externalPath, outputPath, markdownPath, actionTolerancePct, frequencyTolerancePct };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run range:cross-check-compare -- --external artifacts/range-cross-check/external.csv",
    "  npm run range:cross-check-compare -- --sample artifacts/.../sample.json --external other-solver.csv --frequency-tolerance-pct=10",
    "",
    "Compares a PKRTrainer cross-check sample against an external solver CSV/JSON.",
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

function parseNonNegativeNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number.`);
  return parsed;
}

function readExternalRows(path: string): ExternalRow[] {
  if (extname(path).toLowerCase() === ".json") {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { rows?: unknown[] } | unknown[];
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(rows)) throw new Error("External JSON must be an array or { rows: [...] }.");
    return rows.map((row) => externalRowFromObject(row as Record<string, unknown>));
  }
  return parseCsv(readFileSync(path, "utf8")).map(externalRowFromObject);
}

function externalRowFromObject(row: Record<string, unknown>): ExternalRow {
  const sampleId = stringValue(row.sampleId);
  if (sampleId === null) throw new Error("Every external row must include sampleId.");
  const externalAction = stringValue(row.externalAction) ?? stringValue(row.action);
  const externalFrequencies: Partial<Record<Action, number>> = {};
  for (const action of ACTIONS) {
    const value = numberValue(row[action] ?? row[`external_${action}`]);
    if (value !== null) externalFrequencies[action] = value;
  }
  return {
    sampleId,
    externalAction,
    externalFrequencies,
    notes: stringValue(row.externalNotes) ?? stringValue(row.notes),
  };
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function compare(sampleRows: readonly SampleRow[], externalRows: readonly ExternalRow[], args: CliArgs) {
  const externalBySampleId = new Map(externalRows.map((row) => [row.sampleId, row]));
  const rows: CompareRow[] = sampleRows.map((sample) => {
    const external = externalBySampleId.get(sample.sampleId);
    if (external === undefined) {
      return {
        sampleId: sample.sampleId,
        ruleId: sample.ruleId,
        actionNode: sample.actionNode,
        handClass: sample.handClass,
        ourAction: sample.ourAction,
        externalAction: null,
        actionMatch: null,
        maxFrequencyDeltaPct: null,
        frequencyPass: null,
        deltas: {},
        notes: "Missing external row.",
      };
    }
    const deltas: Partial<Record<Action, number>> = {};
    for (const action of ACTIONS) {
      const ours = sample.ourFrequencies[action];
      const theirs = external.externalFrequencies[action];
      if (ours !== undefined && theirs !== undefined) deltas[action] = round(theirs - ours);
    }
    const maxFrequencyDeltaPct = Object.values(deltas).length === 0
      ? null
      : Math.max(...Object.values(deltas).map((value) => Math.abs(value)));
    return {
      sampleId: sample.sampleId,
      ruleId: sample.ruleId,
      actionNode: sample.actionNode,
      handClass: sample.handClass,
      ourAction: sample.ourAction,
      externalAction: external.externalAction,
      actionMatch: external.externalAction === null ? null : normalizeAction(external.externalAction) === sample.ourAction,
      maxFrequencyDeltaPct,
      frequencyPass: maxFrequencyDeltaPct === null ? null : maxFrequencyDeltaPct <= args.frequencyTolerancePct,
      deltas,
      notes: external.notes,
    };
  });
  const missingExternal = rows.filter((row) => row.externalAction === null && row.maxFrequencyDeltaPct === null).length;
  const actionCompared = rows.filter((row) => row.actionMatch !== null);
  const actionMismatch = actionCompared.filter((row) => row.actionMatch === false).length;
  const frequencyCompared = rows.filter((row) => row.frequencyPass !== null);
  const frequencyFail = frequencyCompared.filter((row) => row.frequencyPass === false).length;
  const actionMismatchPct = actionCompared.length === 0 ? 0 : (actionMismatch / actionCompared.length) * 100;
  return {
    valid:
      missingExternal === 0 &&
      actionMismatchPct <= args.actionTolerancePct &&
      frequencyFail === 0,
    generatedAt: new Date().toISOString(),
    samplePath: args.samplePath,
    externalPath: args.externalPath,
    tolerances: {
      actionMismatchPct: args.actionTolerancePct,
      frequencyDeltaPct: args.frequencyTolerancePct,
    },
    counts: {
      samples: sampleRows.length,
      externalRows: externalRows.length,
      missingExternal,
      actionCompared: actionCompared.length,
      actionMismatch,
      actionMismatchPct: round(actionMismatchPct),
      frequencyCompared: frequencyCompared.length,
      frequencyFail,
    },
    rows,
  };
}

function normalizeAction(value: string): Action | string {
  const normalized = value.trim().toUpperCase().replaceAll(" ", "_");
  if (normalized === "BET" || normalized === "BET_50" || normalized === "CBET") return "BET_SMALL";
  if (normalized === "BIG_BET" || normalized === "BET_75" || normalized === "ALLIN" || normalized === "ALL_IN") return "BET_BIG";
  return normalized;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseCsv(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => item.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim().length > 0)) rows.push(row);
  const [header, ...body] = rows;
  if (header === undefined) return [];
  return body.map((line) => Object.fromEntries(header.map((key, index) => [key, line[index] ?? ""])));
}

function renderMarkdown(report: ReturnType<typeof compare>): string {
  const failedRows = report.rows.filter((row) => row.actionMatch === false || row.frequencyPass === false || row.externalAction === null);
  return [
    "# Range cross-check report",
    "",
    `- valid: ${report.valid}`,
    `- samples: ${report.counts.samples}`,
    `- missing external rows: ${report.counts.missingExternal}`,
    `- action mismatches: ${report.counts.actionMismatch}/${report.counts.actionCompared} (${report.counts.actionMismatchPct} %)`,
    `- frequency fails: ${report.counts.frequencyFail}/${report.counts.frequencyCompared}`,
    "",
    "## Rows needing review",
    "",
    failedRows.length === 0
      ? "No rows failed configured tolerances."
      : failedRows.map((row) => [
          `- ${row.sampleId} ${row.handClass}: ours=${row.ourAction}, external=${row.externalAction ?? "missing"}, maxDelta=${row.maxFrequencyDeltaPct ?? "n/a"}`,
        ].join("")).join("\n"),
    "",
  ].join("\n");
}

function renderSummary(report: ReturnType<typeof compare>, args: CliArgs): string {
  return [
    "Range cross-check compare",
    `valid: ${report.valid}`,
    `samples: ${report.counts.samples}`,
    `missing external: ${report.counts.missingExternal}`,
    `action mismatch: ${report.counts.actionMismatch}/${report.counts.actionCompared} (${report.counts.actionMismatchPct}%)`,
    `frequency fail: ${report.counts.frequencyFail}/${report.counts.frequencyCompared}`,
    `json: ${args.outputPath}`,
    `markdown: ${args.markdownPath}`,
  ].join("\n");
}
