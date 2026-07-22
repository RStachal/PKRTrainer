import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildMttActionEvReadinessReport } from "../src/data/ranges/mttActionEvReadiness.ts";
import { MTT_POSTFLOP_PILOT_CATALOG } from "../src/data/ranges/mttPostflopPilotCatalog.ts";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated.ts";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks.ts";
import { buildMttCompletionReadinessReport } from "../src/data/ranges/mttProductionReadiness.ts";
import type { MttCoreReleaseReport } from "./checkMttCoreRelease.mts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";

export const MTT_PLAYABLE_BETA_SCOPE = "MTT_PLAYABLE_BETA_V1" as const;

const TARGET_PREFLOP_PROFILE_KEYS = [
  "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|OFF",
  "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|ON",
  "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|OFF",
  "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON",
  "SIX_MAX|REGULAR|CHIP_EV|PREFLOP|OFF",
  "SIX_MAX|REGULAR|CHIP_EV|PREFLOP|ON",
  "SIX_MAX|TURBO|CHIP_EV|PREFLOP|OFF",
  "SIX_MAX|TURBO|CHIP_EV|PREFLOP|ON",
] as const;

const MINIMUM_PREFLOP_PROFILE_KEYS = TARGET_PREFLOP_PROFILE_KEYS.slice(0, 4);

export interface MttPlayableBetaReport {
  schemaVersion: "PKRTRAINER_MTT_PLAYABLE_BETA_REPORT_V1";
  scope: typeof MTT_PLAYABLE_BETA_SCOPE;
  status: "BLOCKED" | "LAUNCHABLE_INCREMENT" | "TARGET_SCOPE_COMPLETE";
  valid: boolean;
  targetScopeComplete: boolean;
  counts: {
    minimumPreflopReady: number;
    minimumPreflopTargets: number;
    preflopReady: number;
    preflopTargets: number;
    sixMaxReady: number;
    sixMaxTargets: number;
    flopPilotsReady: number;
    flopPilotTargets: number;
    actionEvPreflopComplete: number;
    actionEvPreflopTotal: number;
    actionEvFlopComplete: number;
    actionEvFlopTotal: number;
    errors: number;
  };
  preflop: readonly {
    profileKey: string;
    status: "PRODUCTION" | "CANDIDATE" | "MISSING";
    packId: string | null;
    blockers: readonly string[];
  }[];
  flopPilots: readonly {
    id: string;
    status: "READY" | "WAITING" | "INVALID";
    rules: number;
    rangeBuckets: number;
    limitations: readonly string[];
  }[];
  fullLibrary: MttCoreReleaseReport["fullLibrary"];
  actionEv: MttCoreReleaseReport["actionEv"] & {
    selectedPreflopPacks: number;
    selectedFlopPacks: number;
  };
  errors: readonly string[];
  knownLimits: readonly string[];
}

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  summary: boolean;
}

export async function buildMttPlayableBetaReport(): Promise<MttPlayableBetaReport> {
  const core = runCoreReleaseReport();
  await loadCompleteMttProductionRegistry();
  const readiness = buildMttCompletionReadinessReport();
  const rowsByKey = new Map(readiness.rows.map((row) => [profileKey(row), row]));
  const targetRows = TARGET_PREFLOP_PROFILE_KEYS.map((key) => ({ key, row: rowsByKey.get(key) }));
  const missingTargetRows = targetRows.filter(({ row }) => row === undefined).map(({ key }) => key);
  const productionRows = targetRows.filter(({ row }) => row?.productionReady === true);
  const minimumReady = MINIMUM_PREFLOP_PROFILE_KEYS.filter(
    (key) => rowsByKey.get(key)?.productionReady === true,
  ).length;
  const selectedPreflopPacks = targetRows.flatMap(({ row }) => {
    if (row?.packId === null || row?.packId === undefined) return [];
    const pack = allMttPreflopRangePacks.find((candidate) => candidate.id === row.packId);
    return pack === undefined ? [] : [pack];
  });
  const actionEv = buildMttActionEvReadinessReport({
    preflopPacks: selectedPreflopPacks,
    postflopPacks: generatedMttPostflopPilotPacks.map((entry) => entry.pack),
  });
  const errors = [
    ...core.errors,
    ...missingTargetRows.map((key) => `Playable-beta target profile is absent from readiness: ${key}.`),
    ...targetRows.flatMap(({ key, row }) => (
      row?.productionReady === true && row.packId !== null &&
      !selectedPreflopPacks.some((pack) => pack.id === row.packId)
        ? [`Production beta pack is absent from the runtime catalog: ${key}.`]
        : []
    )),
    ...actionEv.errors,
  ];
  const launchable = errors.length === 0 && core.valid &&
    minimumReady === MINIMUM_PREFLOP_PROFILE_KEYS.length &&
    core.counts.readyPilots === core.counts.pilotTargets;
  const targetScopeComplete = launchable && productionRows.length === TARGET_PREFLOP_PROFILE_KEYS.length;
  const sixMaxReady = productionRows.filter(({ key }) => key.startsWith("SIX_MAX|")).length;
  const knownLimits = [
    ...(targetScopeComplete ? [] : [
      `Six-max CHIP_EV preflop remains ${sixMaxReady}/4; unavailable profiles must stay disabled.`,
    ]),
    ...(!core.actionEv.comparisonReady ? [
      `Reviewed per-action EV is incomplete: preflop ${actionEv.preflop.completeDecisions}/` +
      `${actionEv.preflop.totalDecisions}, scoped FLOP ${actionEv.postflop.completeDecisions}/` +
      `${actionEv.postflop.totalDecisions}. EV bubbles must remain hidden where data is incomplete.`,
    ] : []),
    ...(core.fullLibrary.releaseReady ? [] : [
      `Full MTT NLHE library is not complete (${core.fullLibrary.productionReadyRows}/` +
      `${core.fullLibrary.totalRows}); this scope is a bounded playable beta.`,
    ]),
    "The seven FLOP families are scoped pilots, not complete postflop coverage.",
  ];

  return {
    schemaVersion: "PKRTRAINER_MTT_PLAYABLE_BETA_REPORT_V1",
    scope: MTT_PLAYABLE_BETA_SCOPE,
    status: !launchable
      ? "BLOCKED"
      : targetScopeComplete
        ? "TARGET_SCOPE_COMPLETE"
        : "LAUNCHABLE_INCREMENT",
    valid: launchable,
    targetScopeComplete,
    counts: {
      minimumPreflopReady: minimumReady,
      minimumPreflopTargets: MINIMUM_PREFLOP_PROFILE_KEYS.length,
      preflopReady: productionRows.length,
      preflopTargets: TARGET_PREFLOP_PROFILE_KEYS.length,
      sixMaxReady,
      sixMaxTargets: 4,
      flopPilotsReady: core.counts.readyPilots,
      flopPilotTargets: core.counts.pilotTargets,
      actionEvPreflopComplete: actionEv.preflop.completeDecisions,
      actionEvPreflopTotal: actionEv.preflop.totalDecisions,
      actionEvFlopComplete: actionEv.postflop.completeDecisions,
      actionEvFlopTotal: actionEv.postflop.totalDecisions,
      errors: errors.length,
    },
    preflop: targetRows.map(({ key, row }) => ({
      profileKey: key,
      status: row?.status ?? "MISSING",
      packId: row?.packId ?? null,
      blockers: row?.productionReady === true ? [] : (row?.missingReasons ?? ["Readiness row is missing."]),
    })),
    flopPilots: MTT_POSTFLOP_PILOT_CATALOG.map((pilot) => ({
      id: pilot.id,
      status: pilot.status,
      rules: pilot.rules,
      rangeBuckets: pilot.rangeBuckets,
      limitations: pilot.limitations,
    })),
    fullLibrary: core.fullLibrary,
    actionEv: {
      ...core.actionEv,
      preflopCompleteDecisions: actionEv.preflop.completeDecisions,
      preflopTotalDecisions: actionEv.preflop.totalDecisions,
      preflopReadyPacks: actionEv.preflop.readyPacks,
      postflopCompleteDecisions: actionEv.postflop.completeDecisions,
      postflopTotalDecisions: actionEv.postflop.totalDecisions,
      postflopReadyPacks: actionEv.postflop.readyPacks,
      comparisonReady: actionEv.comparisonReady,
      selectedPreflopPacks: selectedPreflopPacks.length,
      selectedFlopPacks: generatedMttPostflopPilotPacks.length,
    },
    errors,
    knownLimits,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildMttPlayableBetaReport();
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  let summary = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
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

function render(report: MttPlayableBetaReport, summary: boolean): string {
  const lines = [
    "MTT playable beta gate",
    `scope: ${report.scope}`,
    `status: ${report.status}`,
    `valid: ${report.valid}`,
    `target scope complete: ${report.targetScopeComplete}`,
    `preflop production: ${report.counts.preflopReady}/${report.counts.preflopTargets}`,
    `six-max production: ${report.counts.sixMaxReady}/${report.counts.sixMaxTargets}`,
    `scoped FLOP pilots: ${report.counts.flopPilotsReady}/${report.counts.flopPilotTargets}`,
    `preflop action EV: ${report.counts.actionEvPreflopComplete}/${report.counts.actionEvPreflopTotal}`,
    `scoped FLOP action EV: ${report.counts.actionEvFlopComplete}/${report.counts.actionEvFlopTotal}`,
    `errors: ${report.counts.errors}`,
  ];
  if (!summary) {
    lines.push(...report.errors.map((error) => `error: ${error}`));
    lines.push(...report.knownLimits.map((limit) => `limit: ${limit}`));
  }
  return lines.join("\n");
}

function profileKey(profile: {
  tableFormat: string;
  blindSpeed: string;
  evModel: string;
  street: string;
  ante: string;
}): string {
  return [
    profile.tableFormat,
    profile.blindSpeed,
    profile.evModel,
    profile.street,
    profile.ante,
  ].join("|");
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:playable-beta -- --summary",
    "  npm run mtt:playable-beta -- --json",
    "  npm run mtt:playable-beta -- --output=artifacts/mtt-playable-beta/report.json",
  ].join("\n");
}

function runCoreReleaseReport(): MttCoreReleaseReport {
  const result = spawnSync(process.execPath, [
    resolve("node_modules/vite-node/vite-node.mjs"),
    resolve("scripts/checkMttCoreRelease.mts"),
    "--json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `MTT Core release report failed (${result.status ?? "no exit"}): ` +
      `${result.stderr.trim() || result.stdout.trim() || "no output"}`,
    );
  }
  return JSON.parse(result.stdout) as MttCoreReleaseReport;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
