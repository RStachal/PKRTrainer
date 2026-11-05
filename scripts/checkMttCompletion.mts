import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildMttCompletionReleaseGateReport,
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionReadinessFilters,
  renderMttCompletionReadinessReport,
  renderMttCompletionReleaseGateReport,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";

interface CliArgs {
  details: boolean;
  json: boolean;
  mode: "PRODUCTION" | "PREVIEW";
  outputPath: string | null;
  summary: boolean;
  filters: MttCompletionReadinessFilters;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:completion",
    "  npm run mtt:completion -- --summary",
    "  npm run mtt:completion -- --preview",
    "  npm run mtt:completion -- --details",
    "  npm run mtt:completion -- --details --format=SIX_MAX --speed=TURBO --ev=DOLAR_EV --street=RIVER --ante=OFF --status=candidate",
    "  npm run mtt:completion -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "  npm run mtt:completion -- --output=artifacts/mtt-completion-report.json",
    "",
    "Output:",
    "  --details",
    "  --json",
    "  --output=artifacts/mtt-completion-report.json",
    "  --preview",
    "  --summary",
    "",
    "Filters:",
    "  --format=FULL_RING_9|SIX_MAX",
    "  --speed=REGULAR|TURBO",
    "  --ev=CHIP_EV|DOLAR_EV",
    "  --street=PREFLOP|FLOP|TURN|RIVER",
    "  --ante=ON|OFF",
    "  --status=production|candidate|missing|non-production|preview|blocked",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let details = false;
  let json = false;
  let mode: CliArgs["mode"] = "PRODUCTION";
  let outputPath: string | null = null;
  let summary = false;

  for (const item of argv) {
    if (item === "--details") {
      details = true;
      continue;
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--preview") {
      mode = "PREVIEW";
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { details, json, mode, outputPath, summary, filters };
}

try {
  const args = parseArgs(process.argv.slice(2));
  await loadCompleteMttProductionRegistry();
  const fullReadiness = buildMttCompletionReadinessReport();
  const readiness = filterMttCompletionReadinessReport(fullReadiness, args.filters);
  const gateReadiness = hasFilters(args.filters) ? fullReadiness : readiness;
  const report = buildMttCompletionReleaseGateReport(gateReadiness, { mode: args.mode });
  const payload = {
    filters: args.filters,
    gate: report,
    readiness,
  };
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(args.details
      ? `${renderMttCompletionReleaseGateReport(report)}\n\n${renderMttCompletionReadinessReport(readiness)}`
      : renderMttCompletionReleaseGateReport(report, args.summary));
  }
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function hasFilters(filters: MttCompletionReadinessFilters): boolean {
  return Object.keys(filters).length > 0;
}
