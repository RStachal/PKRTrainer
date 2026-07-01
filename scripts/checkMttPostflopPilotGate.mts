import { existsSync, readFileSync } from "node:fs";
import {
  buildFlopProductionCoverageReport,
  validateFlopProductionStrategyPack,
  type FlopProductionStrategyPack,
} from "../src/data/ranges/flopProductionStrategyPack.ts";
import { buildMttPostflopImportSlotValidationReport } from "../src/data/ranges/mttImportSlotValidation.ts";
import {
  buildProductionPermissionManifestReport,
  type ProductionPermissionManifest,
} from "../src/data/ranges/productionPermissionManifest.ts";
import { validateProductionStrategySemantics } from "../src/data/ranges/productionStrategySemanticValidation.ts";
import { buildProductionStrategyRuntimeSmokeReport } from "../src/data/ranges/productionStrategyRuntimeSmoke.ts";

const DEFAULT_NORMALIZED =
  "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK/normalized.candidate.json";
const DEFAULT_PERMISSION =
  "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK/permission.candidate.json";

interface CliArgs {
  json: boolean;
  normalizedPath: string;
  permissionPath: string;
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
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, normalizedPath, permissionPath, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-pilot-gate",
    "  npm run mtt:postflop-pilot-gate -- --summary",
    "  npm run mtt:postflop-pilot-gate -- --json",
    "  npm run mtt:postflop-pilot-gate -- --normalized <normalized.candidate.json> --permission-manifest <permission.candidate.json>",
    "",
    "Validates the narrow BTN vs BB SRP flop pilot pack without pretending it is full production coverage.",
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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function buildPilotGateReport(args: CliArgs) {
  const fileErrors = [
    ...(existsSync(args.normalizedPath) ? [] : [`Missing normalized candidate: ${args.normalizedPath}`]),
    ...(existsSync(args.permissionPath) ? [] : [`Missing permission candidate: ${args.permissionPath}`]),
  ];
  if (fileErrors.length > 0) {
    return {
      valid: false,
      normalizedPath: args.normalizedPath,
      permissionPath: args.permissionPath,
      pilotScope: "BTN_vs_BB_SRP_FLOP_CBET",
      fullProductionReady: false,
      errors: fileErrors,
      warnings: [],
      counts: { rules: 0, rangeBuckets: 0, runtimeSmokeSamples: 0 },
    };
  }

  const pack = readJson<FlopProductionStrategyPack>(args.normalizedPath);
  const permission = readJson<ProductionPermissionManifest>(args.permissionPath);
  const schemaErrors = validateFlopProductionStrategyPack(pack);
  const slotReport = buildMttPostflopImportSlotValidationReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permission, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const semanticErrors = validateProductionStrategySemantics(pack);
  const runtimeSmoke = buildProductionStrategyRuntimeSmokeReport(pack);
  const coverage = buildFlopProductionCoverageReport(pack);
  const scopeErrors = pilotScopeErrors(pack);
  const errors = [
    ...schemaErrors,
    ...slotReport.errors,
    ...permissionReport.errors,
    ...semanticErrors,
    ...runtimeSmoke.errors,
    ...scopeErrors,
  ];
  const warnings = [
    ...(coverage.productionReady ? [] : ["Pilot pack is intentionally narrower than full flop-production coverage."]),
    ...coverage.missingPotTypes.map((item) => `Full-production missing pot type: ${item}`),
    ...coverage.missingActionNodes.map((item) => `Full-production missing action node: ${item}`),
    ...coverage.missingSprBands.map((item) => `Full-production missing SPR band: ${item}`),
  ];

  return {
    valid: errors.length === 0,
    normalizedPath: args.normalizedPath,
    permissionPath: args.permissionPath,
    pilotScope: "BTN_vs_BB_SRP_FLOP_CBET",
    fullProductionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    legalImportSlot: slotReport.valid,
    runtimeSmokeValid: runtimeSmoke.valid,
    errors,
    warnings,
    counts: {
      rules: pack.rules.length,
      rangeBuckets: pack.rules.reduce((count, rule) => count + rule.rangeBuckets.length, 0),
      runtimeSmokeSamples: runtimeSmoke.sampleCount,
    },
  };
}

function pilotScopeErrors(pack: FlopProductionStrategyPack): string[] {
  const errors: string[] = [];
  if (pack.dimensions.gameVariant !== "MTT") errors.push("Pilot pack must be MTT.");
  if (pack.dimensions.tableFormat !== "FULL_RING_9") errors.push("Pilot pack must be FULL_RING_9.");
  if (pack.dimensions.street !== "FLOP") errors.push("Pilot pack must be FLOP.");
  if (!pack.dimensions.blindSpeeds.includes("REGULAR")) errors.push("Pilot pack must cover REGULAR speed.");
  if (!pack.dimensions.antes.includes("OFF")) errors.push("Pilot pack must cover ante OFF.");
  if (pack.rules.length < 1) errors.push("Pilot pack must contain at least one rule.");
  for (const rule of pack.rules) {
    if (rule.potType !== "SINGLE_RAISED") errors.push(`${rule.id}: pilot only allows SINGLE_RAISED pot.`);
    if (rule.actionNode !== "SINGLE_RAISED_POT_CBET") {
      errors.push(`${rule.id}: pilot only allows SINGLE_RAISED_POT_CBET.`);
    }
    if (rule.positionPattern !== "SRP_BTN_VS_BB") {
      errors.push(`${rule.id}: pilot only allows SRP_BTN_VS_BB.`);
    }
    const lanes = new Set(rule.rangeBuckets.map((bucket) => bucket.lane));
    for (const lane of ["VALUE", "BLUFF", "CHECK"]) {
      if (!lanes.has(lane as "VALUE" | "BLUFF" | "CHECK")) errors.push(`${rule.id}: missing ${lane} lane.`);
    }
    if (rule.rangeBuckets.length < 30) errors.push(`${rule.id}: pilot needs at least 30 hand-class buckets.`);
  }
  return errors;
}

function renderReport(report: ReturnType<typeof buildPilotGateReport>, summaryOnly: boolean): string {
  const lines = [
    "MTT postflop pilot gate",
    `valid: ${report.valid}`,
    `scope: ${report.pilotScope}`,
    `fullProductionReady: ${report.fullProductionReady}`,
    `permissionReady: ${"permissionReady" in report ? report.permissionReady : false}`,
    `legalImportSlot: ${"legalImportSlot" in report ? report.legalImportSlot : false}`,
    `runtimeSmokeValid: ${"runtimeSmokeValid" in report ? report.runtimeSmokeValid : false}`,
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
