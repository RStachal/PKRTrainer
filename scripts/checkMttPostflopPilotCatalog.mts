import {
  MTT_POSTFLOP_PILOT_CATALOG,
  readyMttPostflopPilots,
  requiredEntitlementsForMttPostflopPilotScopes,
  validateMttPostflopPilotCatalog,
} from "../src/data/ranges/mttPostflopPilotCatalog.ts";

interface CliArgs {
  json: boolean;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const errors = validateMttPostflopPilotCatalog();
  const ready = readyMttPostflopPilots();
  const report = {
    valid: errors.length === 0,
    total: MTT_POSTFLOP_PILOT_CATALOG.length,
    ready: ready.length,
    waiting: MTT_POSTFLOP_PILOT_CATALOG.filter((entry) => entry.status === "WAITING").length,
    invalid: MTT_POSTFLOP_PILOT_CATALOG.filter((entry) => entry.status === "INVALID").length,
    rules: ready.reduce((sum, entry) => sum + entry.rules, 0),
    rangeBuckets: ready.reduce((sum, entry) => sum + entry.rangeBuckets, 0),
    requiredEntitlements: requiredEntitlementsForMttPostflopPilotScopes(ready.map((entry) => entry.scope)),
    pilots: MTT_POSTFLOP_PILOT_CATALOG,
    errors,
  };

  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
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
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-pilot-catalog",
    "  npm run mtt:postflop-pilot-catalog -- --summary",
    "  npm run mtt:postflop-pilot-catalog -- --json",
    "",
    "Audits source-free scoped MTT postflop pilot catalog metadata and required entitlements.",
  ].join("\n");
}

function renderReport(
  report: {
    valid: boolean;
    total: number;
    ready: number;
    waiting: number;
    invalid: number;
    rules: number;
    rangeBuckets: number;
    requiredEntitlements: readonly string[];
    pilots: typeof MTT_POSTFLOP_PILOT_CATALOG;
    errors: readonly string[];
  },
  args: CliArgs,
): string {
  const lines = [
    "MTT postflop pilot catalog",
    `valid: ${report.valid}`,
    `total: ${report.total}`,
    `ready: ${report.ready}`,
    `waiting: ${report.waiting}`,
    `invalid: ${report.invalid}`,
    `rules: ${report.rules}`,
    `range buckets: ${report.rangeBuckets}`,
    `required entitlements: ${report.requiredEntitlements.join(", ")}`,
  ];
  if (!args.summary) {
    for (const pilot of report.pilots) {
      lines.push(
        `${pilot.status} ${pilot.id}: ${pilot.scope} entitlement=${pilot.requiredEntitlement} ` +
        `rules=${pilot.rules} buckets=${pilot.rangeBuckets} fullProductionReady=${pilot.fullProductionReady}`,
      );
    }
  }
  for (const error of report.errors) lines.push(`ERROR: ${error}`);
  return lines.join("\n");
}
