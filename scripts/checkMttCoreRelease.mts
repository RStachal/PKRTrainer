import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  PKR_ENTITLEMENTS,
  TIER_ENTITLEMENTS,
  type PkrEntitlement,
} from "../src/core/paymentEntitlements.ts";
import {
  MTT_POSTFLOP_PILOT_CATALOG,
  readyMttPostflopPilots,
  validateMttPostflopPilotCatalog,
} from "../src/data/ranges/mttPostflopPilotCatalog.ts";
import { mttPostflopPilotRuntimeEntries } from "../src/data/ranges/mttPostflopPilotRuntime.ts";
import { buildMttPreflopSpeedDiffReport } from "../src/data/ranges/mttPreflopRangeAudit.ts";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks.ts";
import { buildMttActionEvReadinessReport } from "../src/data/ranges/mttActionEvReadiness.ts";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated.ts";
import {
  buildMttCompletionReadinessReport,
  buildMttCompletionReleaseGateReport,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { generatedMttProductionManifest } from "../src/data/ranges/mttProductionRegistry.generated.ts";
import {
  buildProductionPermissionManifestReport,
  type ProductionPermissionManifest,
} from "../src/data/ranges/productionPermissionManifest.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";

const CORE_SCOPE = "MTT_CORE_V1";
const CORE_PROFILE_KEYS = [
  "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|OFF",
  "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|ON",
  "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF",
  "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON",
] as const;
const CORE_PREFLOP_ENTITLEMENTS = [
  "mtt.preflop.9max.regular.chip_ev",
  "mtt.preflop.9max.turbo.chip_ev",
] as const satisfies readonly PkrEntitlement[];
const FORBIDDEN_PLAYER_FACING_TEXT = [
  /https?:\/\//i,
  /TexasSolver/i,
  /GTO Wizard/i,
  /permission\.json/i,
  /normalized\.json/i,
];

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  summary: boolean;
}

interface CorePermissionRow {
  packId: string;
  path: string;
  valid: boolean;
  licenseKind: string;
  reviewer: string;
  rightsOwner: string;
  evidenceCount: number;
  reuseDimensions: readonly string[];
  errors: readonly string[];
}

export interface MttCoreReleaseReport {
  valid: boolean;
  scope: typeof CORE_SCOPE;
  releaseLabel: "MTT ChipEV Core";
  counts: {
    preflopTargets: number;
    preflopProductionReady: number;
    generatedPreflopModules: number;
    permissionReady: number;
    pilotTargets: number;
    readyPilots: number;
    pilotRuntimeEntries: number;
    pilotRules: number;
    pilotRangeBuckets: number;
    pilotEntitlements: number;
    errors: number;
  };
  fullLibrary: {
    releaseReady: boolean;
    productionReadyRows: number;
    totalRows: number;
  };
  actionEv: {
    comparisonReady: boolean;
    preflopCompleteDecisions: number;
    preflopTotalDecisions: number;
    preflopReadyPacks: number;
    postflopCompleteDecisions: number;
    postflopTotalDecisions: number;
    postflopReadyPacks: number;
  };
  permissions: readonly CorePermissionRow[];
  errors: readonly string[];
  warnings: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  await loadCompleteMttProductionRegistry();
  const report = buildReport();
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
    "  npm run mtt:core-release",
    "  npm run mtt:core-release -- --summary",
    "  npm run mtt:core-release -- --json",
    "  npm run mtt:core-release -- --output=artifacts/mtt-core-release/report.json",
  ].join("\n");
}

function buildReport(): MttCoreReleaseReport {
  const readiness = buildMttCompletionReadinessReport();
  const fullLibrary = buildMttCompletionReleaseGateReport(readiness);
  const expectedKeys = new Set<string>(CORE_PROFILE_KEYS);
  const coreRows = readiness.rows.filter((row) => expectedKeys.has(profileKey(row)));
  const coreGeneratedEntries = generatedMttProductionManifest.filter((entry) => (
    expectedKeys.has(entry.profileKey) && entry.kind === "mtt-preflop"
  ));
  const permissions = coreRows.map((row) => permissionRow(
    row.packId ?? "",
    row.blindSpeed,
  ));
  const readyPilots = readyMttPostflopPilots();
  const pilotRuntimeEntries = mttPostflopPilotRuntimeEntries();
  const corePreflopPacks = allMttPreflopRangePacks.filter((pack) => (
    expectedKeys.has(profileKey(pack.dimensions))
  ));
  const actionEv = buildMttActionEvReadinessReport({
    preflopPacks: corePreflopPacks,
    postflopPacks: generatedMttPostflopPilotPacks.map((entry) => entry.pack),
  });
  const pilotEntitlements = new Set(readyPilots.map((pilot) => pilot.requiredEntitlement));
  const errors = [
    ...coreProfileErrors(coreRows),
    ...generatedEntryErrors(coreGeneratedEntries),
    ...permissions.flatMap((row) => row.errors.map((error) => `${row.packId}: ${error}`)),
    ...fullRingSpeedReuseErrors(),
    ...validateMttPostflopPilotCatalog(),
    ...pilotRuntimeErrors(readyPilots, pilotRuntimeEntries),
    ...entitlementErrors(pilotEntitlements),
    ...playerFacingMetadataErrors(),
    ...actionEv.errors,
  ];
  const warnings = [
    ...(fullLibrary.valid ? [] : [
      `Full MTT NLHE library remains incomplete (${fullLibrary.productionReadyRows}/${fullLibrary.totalRows}); ` +
      `${CORE_SCOPE} must be marketed as scoped core content.`,
    ]),
    ...(actionEv.comparisonReady ? [] : [
      `Solver action-EV comparison remains incomplete: preflop ` +
      `${actionEv.preflop.completeDecisions}/${actionEv.preflop.totalDecisions}, scoped flop ` +
      `${actionEv.postflop.completeDecisions}/${actionEv.postflop.totalDecisions}. ` +
      "Strategy frequencies are not EV and are not counted.",
    ]),
  ];

  return {
    valid: errors.length === 0,
    scope: CORE_SCOPE,
    releaseLabel: "MTT ChipEV Core",
    counts: {
      preflopTargets: CORE_PROFILE_KEYS.length,
      preflopProductionReady: coreRows.filter((row) => row.productionReady).length,
      generatedPreflopModules: coreGeneratedEntries.length,
      permissionReady: permissions.filter((row) => row.valid).length,
      pilotTargets: MTT_POSTFLOP_PILOT_CATALOG.length,
      readyPilots: readyPilots.length,
      pilotRuntimeEntries: pilotRuntimeEntries.length,
      pilotRules: readyPilots.reduce((sum, pilot) => sum + pilot.rules, 0),
      pilotRangeBuckets: readyPilots.reduce((sum, pilot) => sum + pilot.rangeBuckets, 0),
      pilotEntitlements: pilotEntitlements.size,
      errors: errors.length,
    },
    fullLibrary: {
      releaseReady: fullLibrary.valid,
      productionReadyRows: fullLibrary.productionReadyRows,
      totalRows: fullLibrary.totalRows,
    },
    actionEv: {
      comparisonReady: actionEv.comparisonReady,
      preflopCompleteDecisions: actionEv.preflop.completeDecisions,
      preflopTotalDecisions: actionEv.preflop.totalDecisions,
      preflopReadyPacks: actionEv.preflop.readyPacks,
      postflopCompleteDecisions: actionEv.postflop.completeDecisions,
      postflopTotalDecisions: actionEv.postflop.totalDecisions,
      postflopReadyPacks: actionEv.postflop.readyPacks,
    },
    permissions,
    errors,
    warnings,
  };
}

function coreProfileErrors(
  rows: ReturnType<typeof buildMttCompletionReadinessReport>["rows"],
): string[] {
  const errors: string[] = [];
  if (rows.length !== CORE_PROFILE_KEYS.length) {
    errors.push(`Core preflop scope expected ${CORE_PROFILE_KEYS.length} rows, found ${rows.length}.`);
  }
  const actualKeys = new Set(rows.map(profileKey));
  for (const key of CORE_PROFILE_KEYS) {
    if (!actualKeys.has(key)) errors.push(`Core preflop profile is missing: ${key}.`);
  }
  for (const row of rows) {
    if (!row.productionReady || row.status !== "PRODUCTION" || row.packId === null) {
      errors.push(`Core preflop profile is not production-ready: ${profileKey(row)}.`);
    }
  }
  return errors;
}

function generatedEntryErrors(
  entries: readonly (typeof generatedMttProductionManifest)[number][],
): string[] {
  const errors: string[] = [];
  if (entries.length !== CORE_PROFILE_KEYS.length) {
    errors.push(`Generated core preflop modules expected ${CORE_PROFILE_KEYS.length}, found ${entries.length}.`);
  }
  const profileKeys = new Set(entries.map((entry) => entry.profileKey));
  const packIds = new Set(entries.map((entry) => entry.packId));
  for (const key of CORE_PROFILE_KEYS) {
    if (!profileKeys.has(key)) errors.push(`Generated core preflop module is missing for ${key}.`);
  }
  if (packIds.size !== entries.length) errors.push("Generated core preflop modules contain duplicate pack ids.");
  return errors;
}

function permissionRow(packId: string, blindSpeed: string): CorePermissionRow {
  const path = `Agents/range-intake/raw/${packId}/permission.json`;
  if (packId.length === 0 || !existsSync(path)) {
    return {
      packId: packId || "missing-pack-id",
      path,
      valid: false,
      licenseKind: "",
      reviewer: "",
      rightsOwner: "",
      evidenceCount: 0,
      reuseDimensions: [],
      errors: [`Source-free production permission manifest is missing: ${path}.`],
    };
  }

  const manifest = JSON.parse(readFileSync(path, "utf8")) as ProductionPermissionManifest;
  const report = buildProductionPermissionManifestReport(manifest, {
    packId,
    licenseKind: "OWNED_SOLVER_EXPORT",
    blindSpeeds: [blindSpeed as "REGULAR" | "TURBO"],
    evModels: ["CHIP_EV"],
  });
  const errors = [...report.errors];
  if (manifest.licenseKind !== "OWNED_SOLVER_EXPORT") {
    errors.push("Core preflop manifest must use OWNED_SOLVER_EXPORT.");
  }
  if (blindSpeed === "TURBO" && !manifest.reusePolicy?.allowedDimensions.includes("BLIND_SPEED")) {
    errors.push("Turbo core preflop manifest must include reviewed BLIND_SPEED reuse.");
  }

  return {
    packId,
    path,
    valid: errors.length === 0,
    licenseKind: report.licenseKind,
    reviewer: report.reviewer,
    rightsOwner: report.rightsOwner,
    evidenceCount: report.evidenceCount,
    reuseDimensions: report.reusePolicyDimensions,
    errors,
  };
}

function fullRingSpeedReuseErrors(): string[] {
  return buildMttPreflopSpeedDiffReport().rows
    .filter((row) => row.tableFormat === "FULL_RING_9")
    .flatMap((row) => row.status === "COMPARABLE"
      ? []
      : row.blockers.map((blocker) => `FULL_RING_9 ante ${row.ante}: ${blocker}`));
}

function pilotRuntimeErrors(
  readyPilots: readonly (typeof MTT_POSTFLOP_PILOT_CATALOG)[number][],
  runtimeEntries: ReturnType<typeof mttPostflopPilotRuntimeEntries>,
): string[] {
  const errors: string[] = [];
  const runtimeIds = new Set(runtimeEntries.map((entry) => entry.catalog.id));
  if (readyPilots.length !== 7) errors.push(`Core postflop pilot catalog expected 7 READY pilots, found ${readyPilots.length}.`);
  if (runtimeEntries.length !== readyPilots.length) {
    errors.push(`Core postflop runtime expected ${readyPilots.length} entries, found ${runtimeEntries.length}.`);
  }
  for (const pilot of readyPilots) {
    if (!runtimeIds.has(pilot.id)) errors.push(`READY pilot has no runtime entry: ${pilot.id}.`);
    if (pilot.fullProductionReady !== false) errors.push(`Scoped pilot is marked full production: ${pilot.id}.`);
  }
  return errors;
}

function entitlementErrors(pilotEntitlements: ReadonlySet<PkrEntitlement>): string[] {
  const errors: string[] = [];
  const known = new Set<PkrEntitlement>(PKR_ENTITLEMENTS);
  const proPlus = new Set<PkrEntitlement>(TIER_ENTITLEMENTS.PRO_PLUS);
  const free = new Set<PkrEntitlement>(TIER_ENTITLEMENTS.FREE);
  for (const entitlement of [...CORE_PREFLOP_ENTITLEMENTS, ...pilotEntitlements]) {
    if (!known.has(entitlement)) errors.push(`Core entitlement is not registered: ${entitlement}.`);
  }
  for (const entitlement of CORE_PREFLOP_ENTITLEMENTS) {
    if (!proPlus.has(entitlement)) errors.push(`PRO_PLUS is missing core preflop entitlement: ${entitlement}.`);
  }
  for (const entitlement of pilotEntitlements) {
    if (!proPlus.has(entitlement)) errors.push(`PRO_PLUS is missing pilot entitlement: ${entitlement}.`);
    if (free.has(entitlement)) errors.push(`FREE tier must not include paid pilot entitlement: ${entitlement}.`);
  }
  return errors;
}

function playerFacingMetadataErrors(): string[] {
  return MTT_POSTFLOP_PILOT_CATALOG.flatMap((pilot) => {
    const text = [pilot.label, ...pilot.limitations].join("\n");
    return FORBIDDEN_PLAYER_FACING_TEXT
      .filter((pattern) => pattern.test(text))
      .map((pattern) => `${pilot.id}: player-facing pilot metadata matches forbidden source pattern ${pattern}.`);
  });
}

function profileKey(row: {
  tableFormat: string;
  blindSpeed: string;
  evModel: string;
  street: string;
  ante: string;
}): string {
  return [row.tableFormat, row.blindSpeed, row.evModel, row.street, row.ante].join("|");
}

function renderReport(report: MttCoreReleaseReport, summaryOnly: boolean): string {
  const lines = [
    "MTT core release gate",
    `scope: ${report.scope}`,
    `release label: ${report.releaseLabel}`,
    `valid: ${report.valid}`,
    `preflop production: ${report.counts.preflopProductionReady}/${report.counts.preflopTargets}`,
    `generated preflop modules: ${report.counts.generatedPreflopModules}`,
    `permission ready: ${report.counts.permissionReady}/${report.counts.preflopTargets}`,
    `scoped flop pilots: ${report.counts.readyPilots}/${report.counts.pilotTargets}`,
    `pilot runtime entries: ${report.counts.pilotRuntimeEntries}`,
    `pilot rules: ${report.counts.pilotRules}`,
    `pilot range buckets: ${report.counts.pilotRangeBuckets}`,
    `pilot entitlements: ${report.counts.pilotEntitlements}`,
    `action EV comparison ready: ${report.actionEv.comparisonReady}`,
    `preflop action EV: ${report.actionEv.preflopCompleteDecisions}/${report.actionEv.preflopTotalDecisions} decisions (${report.actionEv.preflopReadyPacks}/${report.counts.preflopTargets} packs)`,
    `scoped flop action EV: ${report.actionEv.postflopCompleteDecisions}/${report.actionEv.postflopTotalDecisions} decisions (${report.actionEv.postflopReadyPacks}/${report.counts.pilotTargets} packs)`,
    `full library ready: ${report.fullLibrary.releaseReady}`,
    `full library production: ${report.fullLibrary.productionReadyRows}/${report.fullLibrary.totalRows}`,
    `errors: ${report.counts.errors}`,
  ];
  if (!summaryOnly) {
    for (const permission of report.permissions) {
      lines.push(
        `permission ${permission.valid ? "READY" : "BLOCKED"}: ${permission.packId} ` +
        `license=${permission.licenseKind} evidence=${permission.evidenceCount} ` +
        `reuse=${permission.reuseDimensions.join(",") || "none"}`,
      );
    }
  }
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  for (const error of report.errors) lines.push(`error: ${error}`);
  return lines.join("\n");
}
