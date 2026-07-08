import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildMttLearningPathCatalogReport } from "../src/data/ranges/mttScenarioCatalog.ts";

const DEFAULT_OUTPUT = "artifacts/mtt-scenario-catalog/report.json";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildMttLearningPathCatalogReport();
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
    "  npm run mtt:scenario-catalog",
    "  npm run mtt:scenario-catalog -- --summary",
    "  npm run mtt:scenario-catalog -- --json",
    "  npm run mtt:scenario-catalog -- --output=artifacts/mtt-scenario-catalog/report.json",
    "",
    "Audits source-free MTT learning path presets against capability and pilot catalog state.",
  ].join("\n");
}

function renderReport(
  report: ReturnType<typeof buildMttLearningPathCatalogReport>,
  summaryOnly: boolean,
): string {
  const lines = [
    "MTT scenario catalog",
    `valid: ${report.valid}`,
    `total: ${report.counts.total}`,
    `ready: ${report.counts.ready}`,
    `preview: ${report.counts.preview}`,
    `waiting: ${report.counts.waiting}`,
    `unsupported: ${report.counts.unsupported}`,
    `estimated playable spots: ${report.counts.estimatedPlayableSpots}`,
  ];
  if (!summaryOnly) {
    for (const row of report.rows) {
      lines.push(`${row.status} ${row.id}: ${row.label} spots=${row.estimatedSpotPool}`);
      for (const scope of row.readyPilotScopes) lines.push(`  ready pilot: ${scope}`);
      for (const scope of row.waitingPilotScopes) lines.push(`  waiting pilot: ${scope}`);
      for (const blocker of row.blockers) lines.push(`  blocker: ${blocker}`);
    }
  }
  for (const error of report.errors) lines.push(`ERROR: ${error}`);
  return lines.join("\n");
}
