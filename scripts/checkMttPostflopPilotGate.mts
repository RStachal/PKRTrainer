import { existsSync, readFileSync } from "node:fs";
import type { FlopProductionStrategyPack } from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  buildMttPostflopPilotGateReport,
  type MttPostflopPilotScope,
  type MttPostflopPilotGateReport,
} from "../src/data/ranges/mttPostflopPilotGate.ts";
import type { ProductionPermissionManifest } from "../src/data/ranges/productionPermissionManifest.ts";

const DEFAULT_NORMALIZED =
  "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK/normalized.candidate.json";
const DEFAULT_PERMISSION =
  "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK/permission.candidate.json";

interface CliArgs {
  json: boolean;
  normalizedPath: string;
  permissionPath: string;
  scope: MttPostflopPilotScope;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildPilotGateReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let normalizedPath = DEFAULT_NORMALIZED;
  let permissionPath = DEFAULT_PERMISSION;
  let scope: MttPostflopPilotScope = "BTN_vs_BB_SRP_FLOP_CBET";
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--normalized") {
      normalizedPath = requiredValue(argv, index, "--normalized");
      index += 1;
      continue;
    }
    if (item.startsWith("--normalized=")) {
      normalizedPath = inlineValue(item, "--normalized");
      continue;
    }
    if (item === "--permission-manifest") {
      permissionPath = requiredValue(argv, index, "--permission-manifest");
      index += 1;
      continue;
    }
    if (item.startsWith("--permission-manifest=")) {
      permissionPath = inlineValue(item, "--permission-manifest");
      continue;
    }
    if (item === "--scope") {
      scope = parseScope(requiredValue(argv, index, "--scope"));
      index += 1;
      continue;
    }
    if (item.startsWith("--scope=")) {
      scope = parseScope(inlineValue(item, "--scope"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, normalizedPath, permissionPath, scope, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-pilot-gate",
    "  npm run mtt:postflop-pilot-gate -- --summary",
    "  npm run mtt:postflop-pilot-gate -- --json",
    "  npm run mtt:postflop-pilot-gate -- --normalized <normalized.candidate.json> --permission-manifest <permission.candidate.json>",
    "  npm run mtt:postflop-pilot-gate -- --scope=BTN_vs_CO_3BP_FLOP_CBET --normalized <normalized.candidate.json> --permission-manifest <permission.candidate.json>",
    "  npm run mtt:postflop-pilot-gate -- --scope=BTN_vs_BB_SRP_FLOP_FACING_BET --normalized <normalized.candidate.json> --permission-manifest <permission.candidate.json>",
    "  npm run mtt:postflop-pilot-gate -- --scope=BTN_vs_CO_3BP_FLOP_FACING_BET --normalized <normalized.candidate.json> --permission-manifest <permission.candidate.json>",
    "",
    "Validates a narrow MTT postflop pilot pack without pretending it is full production coverage.",
    "Scopes: BTN_vs_BB_SRP_FLOP_CBET, UTG_vs_BB_SRP_FLOP_CBET, BTN_vs_CO_3BP_FLOP_CBET, BTN_vs_BB_SRP_FLOP_FACING_BET, BTN_vs_CO_3BP_FLOP_FACING_BET.",
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

function parseScope(value: string): MttPostflopPilotScope {
  if (
    value === "BTN_vs_BB_SRP_FLOP_CBET" ||
    value === "UTG_vs_BB_SRP_FLOP_CBET" ||
    value === "BTN_vs_CO_3BP_FLOP_CBET" ||
    value === "BTN_vs_BB_SRP_FLOP_FACING_BET" ||
    value === "BTN_vs_CO_3BP_FLOP_FACING_BET"
  ) {
    return value;
  }
  throw new Error(`Unsupported --scope value: ${value}\n\n${usage()}`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Návratový typ je napsaný, ne odvozený.
 *
 * Funkce má dvě větve a bez anotace se z nich odvodí **sjednocení dvou tvarů**,
 * které se pak nedá předat `renderReport`. Napsat typ je zároveň kontrola: obě
 * větve teď musí vydat totéž, což u brány dává smysl - report, který podle
 * okolností postrádá pole, se špatně čte i špatně testuje.
 */
function buildPilotGateReport(
  args: CliArgs,
): MttPostflopPilotGateReport & { normalizedPath: string; permissionPath: string } {
  const fileErrors = [
    ...(existsSync(args.normalizedPath) ? [] : [`Missing normalized candidate: ${args.normalizedPath}`]),
    ...(existsSync(args.permissionPath) ? [] : [`Missing permission candidate: ${args.permissionPath}`]),
  ];
  if (fileErrors.length > 0) {
    return {
      valid: false,
      normalizedPath: args.normalizedPath,
      permissionPath: args.permissionPath,
      pilotScope: args.scope,
      fullProductionReady: false,
      permissionReady: false,
      legalImportSlot: false,
      runtimeSmokeValid: false,
      // Prázdné, ne chybějící: když soubory nejsou, není z čeho číst rodiny -
      // ale konzument tohle pole čeká vždycky. Dosud v téhle větvi chybělo a
      // vracelo se `undefined`.
      provenanceFamilyIds: [],
      errors: fileErrors,
      warnings: [],
      counts: { rules: 0, rangeBuckets: 0, runtimeSmokeSamples: 0 },
    };
  }

  const pack = readJson<FlopProductionStrategyPack>(args.normalizedPath);
  const permission = readJson<ProductionPermissionManifest>(args.permissionPath);
  return {
    ...buildMttPostflopPilotGateReport(pack, permission, args.scope),
    normalizedPath: args.normalizedPath,
    permissionPath: args.permissionPath,
  };
}

function renderReport(
  report: MttPostflopPilotGateReport & { normalizedPath: string; permissionPath: string },
  summaryOnly: boolean,
): string {
  const lines = [
    "MTT postflop pilot gate",
    `valid: ${report.valid}`,
    `scope: ${report.pilotScope}`,
    `fullProductionReady: ${report.fullProductionReady}`,
    `permissionReady: ${report.permissionReady}`,
    `legalImportSlot: ${report.legalImportSlot}`,
    `runtimeSmokeValid: ${report.runtimeSmokeValid}`,
    `rules: ${report.counts.rules}`,
    `range buckets: ${report.counts.rangeBuckets}`,
  ];
  if (!summaryOnly) {
    if (report.errors.length > 0) {
      lines.push("errors:");
      for (const error of report.errors) lines.push(`- ${error}`);
    }
    if (report.warnings.length > 0) {
      lines.push("warnings:");
      for (const warning of report.warnings) lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}
