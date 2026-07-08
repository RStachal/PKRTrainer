import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildMttVariantQaReport } from "../src/data/ranges/mttVariantQa.ts";

const DEFAULT_OUTPUT = "artifacts/mtt-variant-qa/report.json";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildMttVariantQaReport();
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
  let json = false;
  let outputPath: string | null = null;
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
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, outputPath, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:variant-qa",
    "  npm run mtt:variant-qa -- --summary",
    "  npm run mtt:variant-qa -- --json",
    "  npm run mtt:variant-qa -- --output=artifacts/mtt-variant-qa/report.json",
    "",
    "Runs variant-specific QA for the current MTT flop pilot lab release train.",
  ].join("\n");
}

function renderReport(
  report: ReturnType<typeof buildMttVariantQaReport>,
  summaryOnly: boolean,
): string {
  const lines = [
    "MTT variant QA",
    `valid: ${report.valid}`,
    `release train: ${report.releaseTrain}`,
    `scenario status: ${report.scenarioStatus ?? "missing"}`,
    `runtime smokes: ${report.counts.runtimeSmokes}`,
    `passed: ${report.counts.passed}`,
    `failed: ${report.counts.failed}`,
    `errors: ${report.counts.errors}`,
  ];
  if (!summaryOnly) {
    for (const row of report.runtimeSmokes) {
      lines.push(`${row.status} ${row.catalogId}: ${row.scope} mapped=${row.mappedScope ?? "null"} proPlus=${row.proPlusAllowed}`);
    }
  }
  for (const error of report.errors) lines.push(`ERROR: ${error}`);
  return lines.join("\n");
}
