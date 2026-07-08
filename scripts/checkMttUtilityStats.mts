import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildMttUtilityStatsReport,
  type MttUtilityStatsRecord,
} from "../src/persistence/mttUtilityStats.ts";
import { isResultRecordV2 } from "../src/persistence/statsRecordV2.ts";

const DEFAULT_OUTPUT = "artifacts/mtt-utility-stats/report.json";

interface CliArgs {
  inputPath: string | null;
  outputPath: string | null;
  json: boolean;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const records = args.inputPath === null ? [] : readRecords(args.inputPath);
  const report = buildMttUtilityStatsReport(records);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let inputPath: string | null = null;
  let outputPath: string | null = null;
  let json = false;
  let summary = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(DEFAULT_OUTPUT);
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    if (item.startsWith("--input=")) {
      const value = item.slice("--input=".length).trim();
      if (value.length === 0) throw new Error(`--input requires a path.\n\n${usage()}`);
      inputPath = resolve(value);
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { inputPath, outputPath, json, summary };
}

function readRecords(inputPath: string): MttUtilityStatsRecord[] {
  if (!existsSync(inputPath)) throw new Error(`Input file does not exist: ${inputPath}`);
  const parsed: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`Input file must contain a JSON array: ${inputPath}`);
  const invalid = parsed.findIndex((record) => !isResultRecordV2(record));
  if (invalid !== -1) {
    throw new Error(`Input record at index ${invalid} is not a valid ResultRecordV2.`);
  }
  return parsed as MttUtilityStatsRecord[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:utility-stats -- --summary",
    "  npm run mtt:utility-stats -- --input=artifacts/stats/result-records-v2.json --output",
    "  npm run mtt:utility-stats -- --input=records.json --json",
    "",
    "Builds a source-free MTT utility stats report with profile/scenario/pack-version separation,",
    "source quality buckets and EV-loss-aware spaced repetition queue.",
  ].join("\n");
}

function renderReport(
  report: ReturnType<typeof buildMttUtilityStatsReport>,
  summaryOnly: boolean,
): string {
  const lines = [
    "MTT utility stats",
    `valid: ${report.valid}`,
    `total MTT records: ${report.total}`,
    `source PRODUCTION: ${report.sourceQualityCounts.PRODUCTION}`,
    `source PREVIEW: ${report.sourceQualityCounts.PREVIEW}`,
    `source FALLBACK: ${report.sourceQualityCounts.FALLBACK}`,
    `source LEGACY_UNKNOWN: ${report.sourceQualityCounts.LEGACY_UNKNOWN}`,
    `groups: ${report.groups.length}`,
    `repetition queue: ${report.repetitionQueue.length}`,
    `pack drift warnings: ${report.packDriftWarnings.length}`,
  ];
  if (!summaryOnly) {
    for (const item of report.repetitionQueue.slice(0, 10)) {
      lines.push(`QUEUE ${item.priority} ${item.profileId} ${item.qid}: ${item.reason}`);
    }
    for (const warning of report.packDriftWarnings) {
      lines.push(`WARNING ${warning.scenarioId}: ${warning.message}`);
    }
  }
  for (const error of report.errors) lines.push(`ERROR: ${error}`);
  return lines.join("\n");
}
