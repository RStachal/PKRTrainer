import {
  MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
  type PostflopPositionPattern,
  type PostflopPotType,
} from "../src/core/postflopGenerator.ts";
import type { PostflopActionNode } from "../src/core/postflopTrainingSpot.ts";
import {
  type AnteMode,
} from "../src/core/types.ts";
import {
  type BlindSpeed,
  type EvModel,
  type TableFormat,
} from "../src/core/trainingProfile.ts";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import {
  buildFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  flopProductionStrategyPacks,
} from "../src/data/ranges/flopProductionStrategyResolver.ts";
import {
  buildTurnProductionCoverageReport,
  type TurnProductionStrategyPack,
} from "../src/data/ranges/turnProductionStrategyPack.ts";
import {
  turnProductionStrategyPacks,
} from "../src/data/ranges/turnProductionStrategyResolver.ts";
import {
  buildRiverProductionCoverageReport,
  type RiverProductionStrategyPack,
} from "../src/data/ranges/riverProductionStrategyPack.ts";
import {
  riverProductionStrategyPacks,
} from "../src/data/ranges/riverProductionStrategyResolver.ts";

type PostflopStreet = Extract<MttCompletionReadinessRow["street"], "FLOP" | "TURN" | "RIVER">;
type CoveredPotType = Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
type CoverageState = "COVERED" | "BLOCKED";
type BlockerKind = "NONE" | "MISSING_PACK" | "MISSING_RULE" | "PACK_NOT_PRODUCTION_READY";
type ProductionPack = FlopProductionStrategyPack | TurnProductionStrategyPack | RiverProductionStrategyPack;

interface CliArgs {
  json: boolean;
  limit: number;
}

interface PotActionTarget {
  potType: CoveredPotType;
  actionNode: Extract<PostflopActionNode, "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET" | "FLOP_FACING_BET" | "TURN_BARREL" | "TURN_FACING_BET" | "RIVER_PRESSURE" | "RIVER_FACING_BET">;
}

interface PostflopProductionCoverageTarget {
  targetId: string;
  state: CoverageState;
  blockerKind: BlockerKind;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  ante: AnteMode;
  street: PostflopStreet;
  potType: CoveredPotType;
  actionNode: PotActionTarget["actionNode"];
  positionPattern: PostflopPositionPattern;
  packId: string | null;
  blockers: readonly string[];
}

interface PostflopProductionCoverageReport {
  counts: {
    profileRows: number;
    requiredPositionPatterns: number;
    totalTargets: number;
    coveredTargets: number;
    blockedTargets: number;
    byStreet: Record<PostflopStreet, { total: number; covered: number; blocked: number }>;
    byState: Record<CoverageState, number>;
    byBlockerKind: Record<BlockerKind, number>;
  };
  rows: readonly PostflopProductionCoverageTarget[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-coverage",
    "  npm run mtt:postflop-coverage -- --json",
    "  npm run mtt:postflop-coverage -- --limit=200",
    "",
    "Output:",
    "  --json",
    "  --limit=<positive integer>",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildPostflopProductionCoverageReport();
  console.log(args.json ? JSON.stringify(report, null, 2) : renderPostflopProductionCoverageReport(report, args.limit));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let limit = 80;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--limit=")) {
      limit = parseLimit(item.slice("--limit=".length));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, limit };
}

function parseLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Unsupported --limit value: ${value}\n\n${usage()}`);
  }
  return parsed;
}

function buildPostflopProductionCoverageReport(): PostflopProductionCoverageReport {
  const profileRows = buildMttCompletionReadinessReport().rows
    .filter((row): row is MttCompletionReadinessRow & { street: PostflopStreet } => row.street !== "PREFLOP");
  const rows = profileRows.flatMap(targetsForProfile);
  return {
    counts: {
      profileRows: profileRows.length,
      requiredPositionPatterns: MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS.length,
      totalTargets: rows.length,
      coveredTargets: rows.filter((row) => row.state === "COVERED").length,
      blockedTargets: rows.filter((row) => row.state === "BLOCKED").length,
      byStreet: countByStreet(rows),
      byState: {
        COVERED: rows.filter((row) => row.state === "COVERED").length,
        BLOCKED: rows.filter((row) => row.state === "BLOCKED").length,
      },
      byBlockerKind: countByBlockerKind(rows),
    },
    rows,
  };
}

function targetsForProfile(
  profile: MttCompletionReadinessRow & { street: PostflopStreet },
): PostflopProductionCoverageTarget[] {
  const bestPack = bestMatchingPack(profile);
  return potActionTargetsForStreet(profile.street).flatMap((target) => (
    MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS.map((positionPattern) => (
      targetForPattern(profile, target, positionPattern, bestPack)
    ))
  ));
}

function targetForPattern(
  profile: MttCompletionReadinessRow & { street: PostflopStreet },
  target: PotActionTarget,
  positionPattern: PostflopPositionPattern,
  pack: ProductionPack | null,
): PostflopProductionCoverageTarget {
  const coveredByRule = pack !== null && packHasRuleForTarget(pack, profile.street, target, positionPattern);
  const productionReady = pack !== null && packProductionReady(pack, profile.street);
  const state: CoverageState = coveredByRule && productionReady ? "COVERED" : "BLOCKED";
  const blockerKind = blockerKindFor(pack, coveredByRule, productionReady);
  return {
    targetId: [
      profile.tableFormat,
      profile.blindSpeed,
      profile.evModel,
      profile.street,
      profile.ante,
      target.potType,
      target.actionNode,
      positionPattern,
    ].join("|"),
    state,
    blockerKind,
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    evModel: profile.evModel,
    ante: profile.ante,
    street: profile.street,
    potType: target.potType,
    actionNode: target.actionNode,
    positionPattern,
    packId: pack?.id ?? null,
    blockers: blockersForTarget(profile, target, positionPattern, pack, coveredByRule, productionReady),
  };
}

function potActionTargetsForStreet(street: PostflopStreet): readonly PotActionTarget[] {
  switch (street) {
    case "FLOP":
      return [
        { potType: "SINGLE_RAISED", actionNode: "SINGLE_RAISED_POT_CBET" },
        { potType: "THREE_BET_POT", actionNode: "THREE_BET_POT_CBET" },
        { potType: "SINGLE_RAISED", actionNode: "FLOP_FACING_BET" },
        { potType: "THREE_BET_POT", actionNode: "FLOP_FACING_BET" },
      ];
    case "TURN":
      return [
        { potType: "SINGLE_RAISED", actionNode: "TURN_BARREL" },
        { potType: "THREE_BET_POT", actionNode: "TURN_BARREL" },
        { potType: "SINGLE_RAISED", actionNode: "TURN_FACING_BET" },
        { potType: "THREE_BET_POT", actionNode: "TURN_FACING_BET" },
      ];
    case "RIVER":
      return [
        { potType: "SINGLE_RAISED", actionNode: "RIVER_PRESSURE" },
        { potType: "THREE_BET_POT", actionNode: "RIVER_PRESSURE" },
        { potType: "SINGLE_RAISED", actionNode: "RIVER_FACING_BET" },
        { potType: "THREE_BET_POT", actionNode: "RIVER_FACING_BET" },
      ];
  }
}

function bestMatchingPack(profile: MttCompletionReadinessRow & { street: PostflopStreet }): ProductionPack | null {
  const packs = matchingPacks(profile);
  return packs.find((pack) => packProductionReady(pack, profile.street)) ?? packs[0] ?? null;
}

function matchingPacks(profile: MttCompletionReadinessRow & { street: PostflopStreet }): ProductionPack[] {
  switch (profile.street) {
    case "FLOP":
      return flopProductionStrategyPacks.filter((pack) => packMatchesProfile(pack, profile));
    case "TURN":
      return turnProductionStrategyPacks.filter((pack) => packMatchesProfile(pack, profile));
    case "RIVER":
      return riverProductionStrategyPacks.filter((pack) => packMatchesProfile(pack, profile));
  }
}

function packMatchesProfile(
  pack: ProductionPack,
  profile: MttCompletionReadinessRow & { street: PostflopStreet },
): boolean {
  return (
    pack.dimensions.gameVariant === "MTT" &&
    pack.dimensions.tableFormat === profile.tableFormat &&
    pack.dimensions.street === profile.street &&
    pack.dimensions.evModel === profile.evModel &&
    pack.dimensions.blindSpeeds.includes(profile.blindSpeed) &&
    pack.dimensions.antes.includes(profile.ante)
  );
}

function packHasRuleForTarget(
  pack: ProductionPack,
  street: PostflopStreet,
  target: PotActionTarget,
  positionPattern: PostflopPositionPattern,
): boolean {
  switch (street) {
    case "FLOP":
      return (pack as FlopProductionStrategyPack).rules.some((rule) => (
        rule.potType === target.potType &&
        rule.actionNode === target.actionNode &&
        rule.positionPattern === positionPattern
      ));
    case "TURN":
      return (pack as TurnProductionStrategyPack).rules.some((rule) => (
        rule.potType === target.potType &&
        rule.actionNode === target.actionNode &&
        rule.positionPattern === positionPattern
      ));
    case "RIVER":
      return (pack as RiverProductionStrategyPack).rules.some((rule) => (
        rule.potType === target.potType &&
        rule.actionNode === target.actionNode &&
        rule.positionPattern === positionPattern
      ));
  }
}

function packProductionReady(pack: ProductionPack, street: PostflopStreet): boolean {
  switch (street) {
    case "FLOP":
      return buildFlopProductionCoverageReport(pack as FlopProductionStrategyPack).productionReady;
    case "TURN":
      return buildTurnProductionCoverageReport(pack as TurnProductionStrategyPack).productionReady;
    case "RIVER":
      return buildRiverProductionCoverageReport(pack as RiverProductionStrategyPack).productionReady;
  }
}

function blockerKindFor(
  pack: ProductionPack | null,
  coveredByRule: boolean,
  productionReady: boolean,
): BlockerKind {
  if (pack === null) return "MISSING_PACK";
  if (!coveredByRule) return "MISSING_RULE";
  if (!productionReady) return "PACK_NOT_PRODUCTION_READY";
  return "NONE";
}

function blockersForTarget(
  profile: MttCompletionReadinessRow & { street: PostflopStreet },
  target: PotActionTarget,
  positionPattern: PostflopPositionPattern,
  pack: ProductionPack | null,
  coveredByRule: boolean,
  productionReady: boolean,
): readonly string[] {
  if (pack === null) return profile.missingReasons;
  if (!coveredByRule) {
    return [
      `Production pack ${pack.id} has no rule for ${target.potType}/${target.actionNode}/${positionPattern}.`,
    ];
  }
  if (!productionReady) return coverageMissingReasons(pack, profile.street);
  return [];
}

function coverageMissingReasons(pack: ProductionPack, street: PostflopStreet): readonly string[] {
  switch (street) {
    case "FLOP": {
      const report = buildFlopProductionCoverageReport(pack as FlopProductionStrategyPack);
      return [
        ...report.errors,
        ...missingListReason("missing pot types", report.missingPotTypes),
        ...missingListReason("missing position patterns", report.missingPositionPatterns),
        ...missingListReason("missing board textures", report.missingBoardTextures),
        ...missingListReason("missing SPR bands", report.missingSprBands),
        ...missingListReason("missing action nodes", report.missingActionNodes),
        ...missingListReason("missing range lanes", report.missingRangeLanes),
      ];
    }
    case "TURN": {
      const report = buildTurnProductionCoverageReport(pack as TurnProductionStrategyPack);
      return [
        ...report.errors,
        ...missingListReason("missing pot types", report.missingPotTypes),
        ...missingListReason("missing position patterns", report.missingPositionPatterns),
        ...missingListReason("missing prior flop actions", report.missingPriorFlopActions),
        ...missingListReason("missing turn card classes", report.missingTurnCardClasses),
        ...missingListReason("missing action nodes", report.missingActionNodes),
        ...missingListReason("missing range lanes", report.missingRangeLanes),
      ];
    }
    case "RIVER": {
      const report = buildRiverProductionCoverageReport(pack as RiverProductionStrategyPack);
      return [
        ...report.errors,
        ...missingListReason("missing pot types", report.missingPotTypes),
        ...missingListReason("missing position patterns", report.missingPositionPatterns),
        ...missingListReason("missing prior turn actions", report.missingPriorTurnActions),
        ...missingListReason("missing river runout classes", report.missingRiverRunoutClasses),
        ...missingListReason("missing blocker relevance bands", report.missingBlockerRelevance),
        ...missingListReason("missing action nodes", report.missingActionNodes),
        ...missingListReason("missing range lanes", report.missingRangeLanes),
      ];
    }
  }
}

function missingListReason(label: string, values: readonly string[]): readonly string[] {
  return values.length === 0 ? [] : [`${label}: ${values.join(", ")}.`];
}

function countByStreet(
  rows: readonly PostflopProductionCoverageTarget[],
): Record<PostflopStreet, { total: number; covered: number; blocked: number }> {
  return {
    FLOP: countRows(rows, (row) => row.street === "FLOP"),
    TURN: countRows(rows, (row) => row.street === "TURN"),
    RIVER: countRows(rows, (row) => row.street === "RIVER"),
  };
}

function countRows(
  rows: readonly PostflopProductionCoverageTarget[],
  predicate: (row: PostflopProductionCoverageTarget) => boolean,
): { total: number; covered: number; blocked: number } {
  const filtered = rows.filter(predicate);
  return {
    total: filtered.length,
    covered: filtered.filter((row) => row.state === "COVERED").length,
    blocked: filtered.filter((row) => row.state === "BLOCKED").length,
  };
}

function countByBlockerKind(rows: readonly PostflopProductionCoverageTarget[]): Record<BlockerKind, number> {
  return {
    NONE: rows.filter((row) => row.blockerKind === "NONE").length,
    MISSING_PACK: rows.filter((row) => row.blockerKind === "MISSING_PACK").length,
    MISSING_RULE: rows.filter((row) => row.blockerKind === "MISSING_RULE").length,
    PACK_NOT_PRODUCTION_READY: rows.filter((row) => row.blockerKind === "PACK_NOT_PRODUCTION_READY").length,
  };
}

function renderPostflopProductionCoverageReport(
  report: PostflopProductionCoverageReport,
  limit: number,
): string {
  const rows = report.rows.slice(0, limit);
  const lines = [
    "MTT postflop production coverage targets",
    `profile rows: ${report.counts.profileRows}`,
    `required position patterns: ${report.counts.requiredPositionPatterns}`,
    `total targets: ${report.counts.totalTargets}`,
    `covered targets: ${report.counts.coveredTargets}`,
    `blocked targets: ${report.counts.blockedTargets}`,
    `street counts: FLOP=${formatCount(report.counts.byStreet.FLOP)}, TURN=${formatCount(report.counts.byStreet.TURN)}, RIVER=${formatCount(report.counts.byStreet.RIVER)}`,
    `state counts: COVERED=${report.counts.byState.COVERED}, BLOCKED=${report.counts.byState.BLOCKED}`,
    `blocker counts: MISSING_PACK=${report.counts.byBlockerKind.MISSING_PACK}, MISSING_RULE=${report.counts.byBlockerKind.MISSING_RULE}, PACK_NOT_PRODUCTION_READY=${report.counts.byBlockerKind.PACK_NOT_PRODUCTION_READY}`,
    `shown rows: ${rows.length}/${report.rows.length}`,
  ];

  for (const row of rows) {
    lines.push(`${row.state} | ${row.targetId} | ${row.blockerKind}`);
    if (row.packId !== null) lines.push(`  pack: ${row.packId}`);
    for (const blocker of row.blockers.slice(0, 2)) lines.push(`  blocker: ${blocker}`);
  }

  return lines.join("\n");
}

function formatCount(count: { total: number; covered: number; blocked: number }): string {
  return `${count.covered}/${count.total} covered, ${count.blocked} blocked`;
}
