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
import { solvedTurnManifest } from "../src/data/ranges/turnSolvedManifest.generated.ts";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks.ts";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry.ts";
import { solvedRiverManifest } from "../src/data/ranges/riverSolvedManifest.generated.ts";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks.ts";
import { runtimeSolvedRiverPacks } from "../src/data/ranges/riverSolvedRuntimeRegistry.ts";
import { actionNodeForSolvedHero } from "../src/data/ranges/solvedHeroActionNode.ts";
import { solvedFlopManifest } from "../src/data/ranges/flopSolvedManifest.generated.ts";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks.ts";
import { runtimeSolvedFlopPacks } from "../src/data/ranges/flopSolvedRuntimeRegistry.ts";
import { shippedContentRisks } from "./lib/mttContentRisks.mts";

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
    /** Vyřešené turn rodiny, které se opravdu dodávají hráči. */
    turnFamiliesShipped: number;
    /** Rodiny, které prošly review bránou a daly by se dodat. */
    turnFamiliesReviewReady: number;
    turnSolvedTurns: number;
    /**
     * Různých flopů napříč rodinami.
     *
     * Ne součet přes rodiny: několik rodin řeší tentýž flop v jiné hloubce nebo
     * jiném typu potu, takže sečtený počet by tvrdil širší pokrytí board space,
     * než jaké ve skutečnosti je - 234 místo 133.
     */
    turnDistinctFlops: number;
    /** Vyřešené river rodiny, které se opravdu dodávají hráči. */
    riverFamiliesShipped: number;
    riverFamiliesReviewReady: number;
    riverSolvedRivers: number;
    /**
     * Různých pětikaretních desek napříč rodinami.
     *
     * Jednotka je celá deska, ne flop: na riveru je odpověď funkcí všech pěti
     * karet a počítat flopy by tvrdilo pokrytí, které pack nemá.
     */
    riverDistinctBoards: number;
    /** Vyřešené flopové rodiny, které se opravdu dodávají hráči. */
    solvedFlopFamiliesShipped: number;
    solvedFlopFamiliesReviewReady: number;
    solvedFlopRules: number;
    /** Různých flopů, na které vyřešený obsah odpovídá přesně. */
    solvedFlopBoards: number;
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
  turnFamilies: readonly {
    familyId: string;
    packId: string;
    /** Vyřešené turny v packu; jeden na board a kartu. */
    solvedTurns: number;
    /** Kolik různých flopů rodina pokrývá. */
    boards: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }[];
  solvedFlopFamilies: readonly {
    familyId: string;
    packId: string;
    rules: number;
    boards: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }[];
  riverFamilies: readonly {
    familyId: string;
    packId: string;
    /** Vyřešené rivery v packu; jeden na desku a pátou kartu. */
    solvedRivers: number;
    /** Kolik turnových podher rodina pokrývá. */
    turnSubgames: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
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
  // Vyřešený turn obsah se načte stejnou cestou jako v aplikaci, aby brána
  // počítala to, co hráč skutečně dostane - ne to, co leží v artefaktech.
  await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  const turnFamilies = runtimeSolvedTurnPacks.map((pack) => ({
    familyId: pack.familyIds[0] ?? pack.id,
    packId: pack.id,
    solvedTurns: pack.rules.length,
    boards: new Set(pack.rules.map((rule) => rule.sourceDirectory)).size,
    confidence: pack.confidence,
  }));
  const turnSolvedTurns = turnFamilies.reduce((sum, family) => sum + family.solvedTurns, 0);
  const turnDistinctFlops = new Set(
    runtimeSolvedTurnPacks.flatMap((pack) => pack.rules.flatMap((rule) => (
      rule.spot === undefined ? [] : [rule.spot.flop.join("")]
    ))),
  ).size;

  // Flop stejnou cestou. Vyřešený flop odpovídá na konkrétní desky, kdežto
  // pilotní packy na třídy textur - brána, která hlásí jen piloty, tvrdí o
  // flopu méně, než se dodává.
  await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
  const solvedFlopFamilies = runtimeSolvedFlopPacks.map((pack) => ({
    familyId: pack.familyIds[0] ?? pack.id,
    packId: pack.id,
    rules: pack.rules.length,
    boards: new Set(pack.rules.map((rule) => rule.flopSpot.flop.join(""))).size,
    confidence: pack.confidence,
  }));
  const solvedFlopRules = solvedFlopFamilies.reduce((sum, item) => sum + item.rules, 0);
  const solvedFlopBoards = new Set(
    runtimeSolvedFlopPacks.flatMap((pack) => pack.rules.map((rule) => rule.flopSpot.flop.join(""))),
  ).size;

  // River stejnou cestou. Bez tohohle brána mlčí o ulici, která obsah dodává, a
  // zdroj pravdy o mezerách tvrdí, že mezera je tam, kde už není.
  await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
  const riverFamilies = runtimeSolvedRiverPacks.map((pack) => ({
    familyId: pack.familyIds[0] ?? pack.id,
    packId: pack.id,
    solvedRivers: pack.rules.length,
    turnSubgames: new Set(pack.rules.map((rule) => rule.sourceDirectory)).size,
    confidence: pack.confidence,
  }));
  const riverSolvedRivers = riverFamilies.reduce((sum, family) => sum + family.solvedRivers, 0);
  const riverDistinctBoards = new Set(
    runtimeSolvedRiverPacks.flatMap((pack) => pack.rules.map((rule) => (
      `${rule.riverSpot.turnBoard.join("")}${rule.riverSpot.riverCard}`
    ))),
  ).size;

  // Která rozhodnutí vyřešený obsah opravdu odpovídá.
  //
  // Počet rodin a turnů zní široce, ale rozhodnutí, které hráč zrovna má, je
  // součástí shody - resolver porovnává i uzel. Rodina může mít desku vyřešenou
  // a přesto na ni neodpovědět, protože vyřešila jinou situaci. Bez tohohle
  // řádku brána hlásí pokrytí, které v praxi není.
  //
  // Měří se toutéž funkcí, kterou používá resolver, aby se brána a runtime
  // nemohly rozejít.
  const decisionsCovered = (street: "TURN" | "RIVER") => {
    const rules = street === "TURN"
      ? runtimeSolvedTurnPacks.flatMap((pack) => pack.rules)
      : runtimeSolvedRiverPacks.flatMap((pack) => pack.rules);
    const counts = new Map<string, number>();
    for (const rule of rules) {
      const node = actionNodeForSolvedHero(rule.spot?.hero, street) ?? "NEZNÁMÝ";
      counts.set(node, (counts.get(node) ?? 0) + 1);
    }
    return [...counts].sort((left, right) => right[1] - left[1]);
  };
  const turnDecisions = decisionsCovered("TURN");
  const riverDecisions = decisionsCovered("RIVER");
  const decisionLimit = (street: string, decisions: readonly (readonly [string, number])[]) => {
    const total = decisions.reduce((sum, [, count]) => sum + count, 0);
    if (total === 0) return [];
    const covered = decisions.map(([node, count]) => (
      `${node} ${((count / total) * 100).toFixed(0)}%`
    )).join(", ");
    const facing = `${street}_FACING_BET`;
    const missing = decisions.some(([node]) => node === facing)
      ? ""
      : ` Nothing answers ${facing}: a player facing a bet on this street is served the heuristic model even on a board that was solved.`;
    return [`Solved ${street} content answers ${covered}.${missing}`];
  };

  const contentRisks = shippedContentRisks(
    generatedMttPostflopPilotPacks.flatMap((entry) => entry.pack.rules.map((rule) => rule.id)),
  );
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
    // A library can ship without a rebuild ever running, so the two family-level
    // content risks are named here as well as in the pipeline. They are limits
    // rather than errors: the content is the best available, and blocking would
    // withhold the beta entirely rather than disclose what is in it.
    ...contentRisks.limits,
    "The seven FLOP families are scoped pilots, not complete postflop coverage.",
    // Turn obsah se dodává a brána o něm dosud nevěděla. Je to nejrozsáhlejší
    // solverem podložený obsah v aplikaci a zároveň nejméně prověřený: review
    // brána ověřila tvar solvu, ne kvalitu strategie, takže důvěra zůstává LOW,
    // dokud ho nepřečte hráč.
    ...(turnFamilies.length === 0 ? [] : [
      `Solved TURN content ships as ${turnFamilies.length} families, ` +
      `${turnSolvedTurns} solved turns across ${turnDistinctFlops} distinct flops. ` +
      "It answers only the exact boards it was solved on and declines every other; " +
      "confidence stays LOW until a player reviews it. " +
      "Boards solved on the reduced review-only tree are excluded, so no turn pack blends two trees.",
    ]),
    ...(solvedFlopFamilies.length === 0 ? [] : [
      `Solved FLOP content ships as ${solvedFlopFamilies.length} families, `
      + `${solvedFlopRules} solved decisions across ${solvedFlopBoards} distinct flops. `
      + "It answers those exact boards and declines every other; the texture-aggregate pilots "
      + "still answer everywhere else, so this is precision added, not coverage traded.",
      "Solved FLOP content has no player-review path yet, so it stays LOW - while the "
      + "texture-aggregate pilots in front of which it sits claim MEDIUM without a reader. "
      + "The weaker content therefore outranks the stronger one on the confidence ladder.",
    ]),
    ...decisionLimit("TURN", turnDecisions),
    ...decisionLimit("RIVER", riverDecisions),
    ...(riverFamilies.length === 0 ? [] : [
      `Solved RIVER content ships as ${riverFamilies.length} families, ` +
      `${riverSolvedRivers} solved rivers across ${riverDistinctBoards} distinct five-card boards. ` +
      "It answers only those exact boards and declines every other; the river is the narrowest content the app has.",
      "Solved RIVER content has no player-review path yet, so it stays LOW and cannot reach production on its own.",
    ]),
    ...(turnFamilies.some((family) => family.confidence !== "LOW") ? [] : [
      "No solved TURN family has been player-reviewed yet, so turn content is shipped content, not verified content.",
    ]),
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
      turnFamiliesShipped: turnFamilies.length,
      turnFamiliesReviewReady: solvedTurnManifest.length,
      turnSolvedTurns,
      turnDistinctFlops,
      riverFamiliesShipped: riverFamilies.length,
      riverFamiliesReviewReady: solvedRiverManifest.length,
      riverSolvedRivers,
      riverDistinctBoards,
      solvedFlopFamiliesShipped: solvedFlopFamilies.length,
      solvedFlopFamiliesReviewReady: solvedFlopManifest.length,
      solvedFlopRules,
      solvedFlopBoards,
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
    turnFamilies,
    solvedFlopFamilies,
    riverFamilies,
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
    `solved TURN families: ${report.counts.turnFamiliesShipped}/${report.counts.turnFamiliesReviewReady} ` +
    `(${report.counts.turnSolvedTurns} turns, ${report.counts.turnDistinctFlops} flops)`,
    `solved FLOP families: ${report.counts.solvedFlopFamiliesShipped}/${report.counts.solvedFlopFamiliesReviewReady} `
    + `(${report.counts.solvedFlopRules} decisions, ${report.counts.solvedFlopBoards} flops)`,
    `solved RIVER families: ${report.counts.riverFamiliesShipped}/${report.counts.riverFamiliesReviewReady} ` +
    `(${report.counts.riverSolvedRivers} rivers, ${report.counts.riverDistinctBoards} boards)`,
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
    resolve("scripts/run-cli.mjs"),
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
