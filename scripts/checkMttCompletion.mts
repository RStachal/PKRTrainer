import {
  buildMttCompletionReleaseGateReport,
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionReadinessFilters,
  renderMttCompletionReadinessReport,
  renderMttCompletionReleaseGateReport,
} from "../src/data/ranges/mttProductionReadiness.ts";
import type { AnteMode } from "../src/core/types.ts";
import type { BlindSpeed, EvModel, TableFormat, TrainingStreet } from "../src/core/trainingProfile.ts";

interface CliArgs {
  details: boolean;
  json: boolean;
  filters: MttCompletionReadinessFilters;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:completion",
    "  npm run mtt:completion -- --details",
    "  npm run mtt:completion -- --details --format=SIX_MAX --speed=TURBO --ev=DOLAR_EV --street=RIVER --ante=OFF --status=candidate",
    "  npm run mtt:completion -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER --json",
    "",
    "Output:",
    "  --details",
    "  --json",
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

  for (const item of argv) {
    if (item === "--details") {
      details = true;
      continue;
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--help" || item === "-h") {
      throw new Error(usage());
    }
    if (item.startsWith("--format=")) {
      filters.tableFormat = parseTableFormat(item.slice("--format=".length));
      continue;
    }
    if (item.startsWith("--speed=")) {
      filters.blindSpeed = parseBlindSpeed(item.slice("--speed=".length));
      continue;
    }
    if (item.startsWith("--ev=")) {
      filters.evModel = parseEvModel(item.slice("--ev=".length));
      continue;
    }
    if (item.startsWith("--street=")) {
      filters.street = parseStreet(item.slice("--street=".length));
      continue;
    }
    if (item.startsWith("--ante=")) {
      filters.ante = parseAnte(item.slice("--ante=".length));
      continue;
    }
    if (item.startsWith("--status=")) {
      filters.status = parseStatus(item.slice("--status=".length));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { details, json, filters };
}

function parseTableFormat(value: string): TableFormat {
  if (value === "FULL_RING_9" || value === "SIX_MAX") return value;
  throw new Error(`Unsupported --format value: ${value}\n\n${usage()}`);
}

function parseBlindSpeed(value: string): BlindSpeed {
  if (value === "REGULAR" || value === "TURBO") return value;
  throw new Error(`Unsupported --speed value: ${value}\n\n${usage()}`);
}

function parseEvModel(value: string): Extract<EvModel, "CHIP_EV" | "DOLAR_EV"> {
  if (value === "CHIP_EV" || value === "DOLAR_EV") return value;
  throw new Error(`Unsupported --ev value: ${value}\n\n${usage()}`);
}

function parseStreet(value: string): TrainingStreet {
  if (value === "PREFLOP" || value === "FLOP" || value === "TURN" || value === "RIVER") {
    return value;
  }
  throw new Error(`Unsupported --street value: ${value}\n\n${usage()}`);
}

function parseAnte(value: string): AnteMode {
  if (value === "ON" || value === "OFF") return value;
  throw new Error(`Unsupported --ante value: ${value}\n\n${usage()}`);
}

function parseStatus(value: string): MttCompletionReadinessFilters["status"] {
  const normalized = value.toUpperCase().replace("-", "_");
  if (normalized === "PRODUCTION" || normalized === "CANDIDATE" || normalized === "MISSING") {
    return normalized;
  }
  if (normalized === "NON_PRODUCTION") return "NON_PRODUCTION";
  if (normalized === "PREVIEW") return "CANDIDATE";
  if (normalized === "BLOCKED") return "MISSING";
  throw new Error(`Unsupported --status value: ${value}\n\n${usage()}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const fullReadiness = buildMttCompletionReadinessReport();
  const readiness = filterMttCompletionReadinessReport(fullReadiness, args.filters);
  const gateReadiness = hasFilters(args.filters) ? fullReadiness : readiness;
  const report = buildMttCompletionReleaseGateReport(gateReadiness);
  if (args.json) {
    console.log(JSON.stringify({
      filters: args.filters,
      gate: report,
      readiness,
    }, null, 2));
  } else {
    console.log(args.details
      ? `${renderMttCompletionReleaseGateReport(report)}\n\n${renderMttCompletionReadinessReport(readiness)}`
      : renderMttCompletionReleaseGateReport(report));
  }
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function hasFilters(filters: MttCompletionReadinessFilters): boolean {
  return Object.keys(filters).length > 0;
}
