import { ALL_HAND_CLASSES } from "../../core/poker";
import { validateActionEvSet, type ActionEvSet } from "../../core/actionEv";
import type {
  PostflopAction,
  PostflopOpponentPolicyBranch,
  PostflopPositionPattern,
  PostflopPotType,
  PostflopRiverRunoutClass,
} from "../../core/postflopGenerator";
import {
  MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
  POSTFLOP_ACTIONS,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { AnteMode, HandLabel } from "../../core/types";
import type {
  BlindSpeed,
  EvModel,
  GameVariant,
  TableFormat,
} from "../../core/trainingProfile";
import type {
  PostflopStrategySourceEvidence,
  ProductionCardRemovalSample,
  ProductionHandClassOverlapPolicy,
} from "./postflopStrategyPack";
import { validatePostflopOpponentPolicyBranch } from "./postflopStrategyPack";
import { findPlaceholderStringPaths } from "./placeholderText";

export type RiverProductionLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION"
  | "PUBLIC_METADATA_ONLY"
  | "UNKNOWN";

export type RiverProductionRangeLane = "VALUE" | "BLUFF" | "CHECK";
export type RiverProductionFrequencyVisibility = "QUALITATIVE" | "EXACT";
export type RiverProductionBlockerRelevance = "LOW" | "MEDIUM" | "HIGH";
export type RiverProductionRunoutClass = PostflopRiverRunoutClass;

export interface RiverProductionActionFrequency {
  action: PostflopAction;
  frequencyPct: number;
  visibility: RiverProductionFrequencyVisibility;
}

export interface RiverProductionStrategyPackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeeds: readonly BlindSpeed[];
  street: "RIVER";
  evModel: EvModel;
  antes: readonly AnteMode[];
}

export interface RiverProductionRangeBucket {
  lane: RiverProductionRangeLane;
  label: string;
  action: PostflopAction;
  handClasses: readonly HandLabel[];
  features: readonly string[];
  blockerRelevance: RiverProductionBlockerRelevance;
  weightPct?: number;
  actionMix?: readonly RiverProductionActionFrequency[];
  actionEvs?: ActionEvSet<PostflopAction>;
}

export interface RiverProductionStrategyRule {
  id: string;
  actionNode: Extract<PostflopActionNode, "RIVER_PRESSURE" | "RIVER_FACING_BET">;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  positionPattern: PostflopPositionPattern;
  priorTurnAction: PostflopAction;
  riverRunoutClasses: readonly RiverProductionRunoutClass[];
  blockerRelevance: RiverProductionBlockerRelevance;
  sprMin: number;
  sprMax: number;
  actions: readonly PostflopAction[];
  recommendedAction: PostflopAction;
  opponentPolicy?: PostflopOpponentPolicyBranch;
  rangeBuckets: readonly RiverProductionRangeBucket[];
  handClassOverlapPolicies?: readonly ProductionHandClassOverlapPolicy[];
  cardRemovalSamples?: readonly ProductionCardRemovalSample[];
  explanation: string;
}

export interface RiverProductionStrategyPack {
  contentLanguage?: string;
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  confidence: "MEDIUM" | "HIGH" | "LOW";
  licenseKind: RiverProductionLicenseKind;
  licenseNote: string;
  dimensions: RiverProductionStrategyPackDimensions;
  sourceEvidence: readonly PostflopStrategySourceEvidence[];
  assumptions: readonly string[];
  rules: readonly RiverProductionStrategyRule[];
}

export interface RiverProductionCoverageReport {
  productionReady: boolean;
  errors: readonly string[];
  potTypes: readonly PostflopPotType[];
  positionPatterns: readonly PostflopPositionPattern[];
  priorTurnActions: readonly PostflopAction[];
  riverRunoutClasses: readonly RiverProductionRunoutClass[];
  blockerRelevance: readonly RiverProductionBlockerRelevance[];
  actionNodes: readonly PostflopActionNode[];
  rangeLanes: readonly RiverProductionRangeLane[];
  rangeMixBucketCount: number;
  missingPotTypes: readonly PostflopPotType[];
  missingPositionPatterns: readonly PostflopPositionPattern[];
  missingPriorTurnActions: readonly PostflopAction[];
  missingRiverRunoutClasses: readonly RiverProductionRunoutClass[];
  missingBlockerRelevance: readonly RiverProductionBlockerRelevance[];
  missingActionNodes: readonly PostflopActionNode[];
  missingRangeLanes: readonly RiverProductionRangeLane[];
}

export const RIVER_PRODUCTION_REQUIRED_POT_TYPES = [
  "SINGLE_RAISED",
  "THREE_BET_POT",
] as const satisfies readonly PostflopPotType[];

export const RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS = [
  ...MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
] as const satisfies readonly PostflopPositionPattern[];

export const RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
  "CALL",
  "RAISE",
] as const satisfies readonly PostflopAction[];

export const RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES = [
  "BLANK",
  "OVER_CARD",
  "BOARD_PAIRING",
  "FLUSH_COMPLETING",
  "STRAIGHT_COMPLETING",
  "FOUR_FLUSH",
  "FOUR_STRAIGHT",
  "DYNAMIC",
] as const satisfies readonly RiverProductionRunoutClass[];

export const RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const satisfies readonly RiverProductionBlockerRelevance[];

export const RIVER_PRODUCTION_REQUIRED_ACTION_NODES = [
  "RIVER_PRESSURE",
  "RIVER_FACING_BET",
] as const satisfies readonly PostflopActionNode[];

export const RIVER_PRODUCTION_REQUIRED_RANGE_LANES = [
  "VALUE",
  "BLUFF",
  "CHECK",
] as const satisfies readonly RiverProductionRangeLane[];

const LEGAL_LICENSE_KINDS: readonly RiverProductionLicenseKind[] = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
];
const LEGAL_BLIND_SPEEDS: readonly BlindSpeed[] = ["REGULAR", "TURBO"];
const LEGAL_ANTE_MODES: readonly AnteMode[] = ["ON", "OFF"];
const HAND_CLASS_SET: ReadonlySet<HandLabel> = new Set(ALL_HAND_CLASSES);
const POSTFLOP_ACTION_SET: ReadonlySet<PostflopAction> = new Set(POSTFLOP_ACTIONS);
const RIVER_PRODUCTION_PRESSURE_ACTIONS: readonly PostflopAction[] = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
];
const RIVER_PRODUCTION_FACING_BET_ACTIONS: readonly PostflopAction[] = [
  "FOLD",
  "CALL",
  "RAISE",
];
const RUNOUT_CLASS_SET: ReadonlySet<RiverProductionRunoutClass> = new Set(
  RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES,
);
const BLOCKER_RELEVANCE_SET: ReadonlySet<RiverProductionBlockerRelevance> = new Set(
  RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE,
);

export function validateRiverProductionStrategyPack(pack: RiverProductionStrategyPack): string[] {
  const errors: string[] = [];

  if (pack.id.trim().length === 0) errors.push("River production pack id is required.");
  if (pack.version.trim().length === 0) errors.push("River production pack version is required.");
  if (pack.createdAt.trim().length === 0) errors.push("River production pack createdAt is required.");
  if (pack.verifiedAt.trim().length === 0) errors.push("River production pack verifiedAt is required.");
  if (pack.confidence === "LOW") errors.push("River production pack cannot have LOW confidence.");
  if (!LEGAL_LICENSE_KINDS.includes(pack.licenseKind)) {
    errors.push("River production pack needs owned export, public permission, or explicit written permission.");
  }
  if (pack.licenseNote.trim().length === 0) errors.push("River production licenseNote is required.");
  errors.push(...validateProfileCoverage(
    "River production",
    pack.dimensions.blindSpeeds,
    pack.dimensions.antes,
  ));
  if (pack.dimensions.gameVariant !== "MTT") {
    errors.push("River production pack must use gameVariant MTT.");
  }
  if (pack.dimensions.street !== "RIVER") errors.push("River production pack must use street RIVER.");
  if (pack.sourceEvidence.length < 2) errors.push("River production pack needs at least two source evidence entries.");
  if (pack.assumptions.length === 0) errors.push("River production assumptions are required.");
  if (pack.rules.length === 0) errors.push("River production pack must contain at least one rule.");
  const placeholderPaths = findPlaceholderStringPaths(pack);
  if (placeholderPaths.length > 0) {
    errors.push(`River production pack must replace placeholder text before promotion: ${placeholderPaths.join(",")}.`);
  }

  for (const rule of pack.rules) {
    errors.push(...validateRiverProductionRule(rule, {
      exactFrequencyAllowed: licenseAllowsExactFrequency(pack.licenseKind),
    }));
  }

  return errors;
}

export function validateRiverProductionRule(
  rule: RiverProductionStrategyRule,
  options: { exactFrequencyAllowed?: boolean } = {},
): string[] {
  const errors: string[] = [];

  if (rule.id.trim().length === 0) errors.push("River production rule id is required.");
  if (!RIVER_PRODUCTION_REQUIRED_ACTION_NODES.includes(rule.actionNode)) {
    errors.push(`${rule.id}: river production rule must use RIVER_PRESSURE or RIVER_FACING_BET.`);
  }
  if (!POSTFLOP_ACTION_SET.has(rule.priorTurnAction)) errors.push(`${rule.id}: priorTurnAction is invalid.`);
  if (!isRiverPriorTurnAction(rule.priorTurnAction, rule.actionNode)) {
    errors.push(`${rule.id}: priorTurnAction ${rule.priorTurnAction} is not valid for ${rule.actionNode}.`);
  }
  if (rule.riverRunoutClasses.length === 0) errors.push(`${rule.id}: riverRunoutClasses are required.`);
  if (!BLOCKER_RELEVANCE_SET.has(rule.blockerRelevance)) errors.push(`${rule.id}: blockerRelevance is invalid.`);
  if (rule.actions.length === 0) errors.push(`${rule.id}: actions are required.`);
  for (const action of rule.actions) {
    if (!POSTFLOP_ACTION_SET.has(action)) errors.push(`${rule.id}: action ${action} is invalid.`);
    if (!isRiverProductionActionForNode(action, rule.actionNode)) {
      errors.push(`${rule.id}: action ${action} is not valid for ${rule.actionNode}.`);
    }
  }
  if (!rule.actions.includes(rule.recommendedAction)) errors.push(`${rule.id}: recommendedAction must be present in actions.`);
  if (!isRiverProductionActionForNode(rule.recommendedAction, rule.actionNode)) {
    errors.push(`${rule.id}: recommendedAction ${rule.recommendedAction} is not valid for ${rule.actionNode}.`);
  }
  if (!Number.isFinite(rule.sprMin) || !Number.isFinite(rule.sprMax)) errors.push(`${rule.id}: SPR bounds must be finite.`);
  if (rule.sprMin < 0 || rule.sprMax < rule.sprMin) errors.push(`${rule.id}: SPR bounds are invalid.`);
  if (rule.explanation.trim().length === 0) errors.push(`${rule.id}: explanation is required.`);
  if (rule.opponentPolicy) {
    errors.push(...validatePostflopOpponentPolicyBranch(rule.opponentPolicy, rule.id));
  }
  if (rule.rangeBuckets.length === 0) errors.push(`${rule.id}: rangeBuckets are required.`);
  for (const runoutClass of rule.riverRunoutClasses) {
    if (!RUNOUT_CLASS_SET.has(runoutClass)) errors.push(`${rule.id}: invalid riverRunoutClass ${runoutClass}.`);
  }

  const lanes = new Set<RiverProductionRangeLane>();
  const seenHands = new Set<HandLabel>();
  for (const bucket of rule.rangeBuckets) {
    lanes.add(bucket.lane);
    if (!BLOCKER_RELEVANCE_SET.has(bucket.blockerRelevance)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} blockerRelevance is invalid.`);
    }
    if (!rule.actions.includes(bucket.action)) errors.push(`${rule.id}: range bucket ${bucket.label} uses an unavailable action.`);
    if (!isRiverProductionActionForNode(bucket.action, rule.actionNode)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} action ${bucket.action} is not valid for ${rule.actionNode}.`);
    }
    if (bucket.label.trim().length === 0) errors.push(`${rule.id}: range bucket label is required.`);
    if (bucket.handClasses.length === 0 && bucket.features.length === 0) {
      errors.push(`${rule.id}: range bucket ${bucket.label} needs handClasses or features.`);
    }
    if (
      bucket.weightPct !== undefined &&
      (!Number.isFinite(bucket.weightPct) || bucket.weightPct < 0 || bucket.weightPct > 100)
    ) {
      errors.push(`${rule.id}: range bucket ${bucket.label} weightPct must be 0-100.`);
    }
    if (bucket.actionMix !== undefined) {
      errors.push(...validateBucketActionMix(rule, bucket, options.exactFrequencyAllowed === true));
    }
    if (bucket.actionEvs !== undefined) {
      for (const error of validateActionEvSet(bucket.actionEvs, rule.actions)) {
        errors.push(`${rule.id}: range bucket ${bucket.label} actionEvs ${error}.`);
      }
      if (options.exactFrequencyAllowed !== true) {
        errors.push(`${rule.id}: range bucket ${bucket.label} action EV requires owned export or explicit written permission.`);
      }
    }
    for (const hand of bucket.handClasses) {
      if (!HAND_CLASS_SET.has(hand)) errors.push(`${rule.id}: range bucket ${bucket.label} contains invalid hand ${hand}.`);
      const handKey = `${bucket.lane}|${hand}`;
      if (seenHands.has(handKey)) errors.push(`${rule.id}: duplicate hand ${hand} in ${bucket.lane} lane.`);
      seenHands.add(handKey);
    }
  }

  for (const lane of RIVER_PRODUCTION_REQUIRED_RANGE_LANES) {
    if (!lanes.has(lane)) errors.push(`${rule.id}: missing ${lane} range lane.`);
  }

  return errors;
}

export function buildRiverProductionCoverageReport(
  pack: RiverProductionStrategyPack,
): RiverProductionCoverageReport {
  const errors = validateRiverProductionStrategyPack(pack);
  const potTypes = uniqueInOrder(pack.rules.map((rule) => rule.potType), RIVER_PRODUCTION_REQUIRED_POT_TYPES);
  const positionPatterns = uniqueInOrder(
    pack.rules.map((rule) => rule.positionPattern),
    RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  );
  const priorTurnActions = uniqueInOrder(
    pack.rules.map((rule) => rule.priorTurnAction),
    RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS,
  );
  const riverRunoutClasses = uniqueInOrder(
    pack.rules.flatMap((rule) => [...rule.riverRunoutClasses]),
    RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES,
  );
  const blockerRelevance = uniqueInOrder(
    pack.rules.flatMap((rule) => [
      rule.blockerRelevance,
      ...rule.rangeBuckets.map((bucket) => bucket.blockerRelevance),
    ]),
    RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE,
  );
  const actionNodes = uniqueInOrder(
    pack.rules.map((rule) => rule.actionNode),
    RIVER_PRODUCTION_REQUIRED_ACTION_NODES,
  );
  const rangeLanes = uniqueInOrder(
    pack.rules.flatMap((rule) => rule.rangeBuckets.map((bucket) => bucket.lane)),
    RIVER_PRODUCTION_REQUIRED_RANGE_LANES,
  );
  const rangeMixBucketCount = pack.rules.reduce((count, rule) => (
    count + rule.rangeBuckets.filter((bucket) => bucket.actionMix !== undefined).length
  ), 0);
  const missingPotTypes = RIVER_PRODUCTION_REQUIRED_POT_TYPES.filter((item) => !potTypes.includes(item));
  const missingPositionPatterns = RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS.filter((item) => !positionPatterns.includes(item));
  const missingPriorTurnActions = RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS.filter((item) => !priorTurnActions.includes(item));
  const missingRiverRunoutClasses = RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES.filter((item) => !riverRunoutClasses.includes(item));
  const missingBlockerRelevance = RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE.filter((item) => !blockerRelevance.includes(item));
  const missingActionNodes = RIVER_PRODUCTION_REQUIRED_ACTION_NODES.filter((item) => !actionNodes.includes(item));
  const missingRangeLanes = RIVER_PRODUCTION_REQUIRED_RANGE_LANES.filter((item) => !rangeLanes.includes(item));

  return {
    productionReady:
      errors.length === 0 &&
      missingPotTypes.length === 0 &&
      missingPositionPatterns.length === 0 &&
      missingPriorTurnActions.length === 0 &&
      missingRiverRunoutClasses.length === 0 &&
      missingBlockerRelevance.length === 0 &&
      missingActionNodes.length === 0 &&
      missingRangeLanes.length === 0,
    errors,
    potTypes,
    positionPatterns,
    priorTurnActions,
    riverRunoutClasses,
    blockerRelevance,
    actionNodes,
    rangeLanes,
    rangeMixBucketCount,
    missingPotTypes,
    missingPositionPatterns,
    missingPriorTurnActions,
    missingRiverRunoutClasses,
    missingBlockerRelevance,
    missingActionNodes,
    missingRangeLanes,
  };
}

export function renderRiverProductionCoverageReport(
  pack: RiverProductionStrategyPack,
  report: RiverProductionCoverageReport = buildRiverProductionCoverageReport(pack),
): string {
  const lines = [
    `River production StrategyPack: ${pack.id}`,
    `productionReady: ${report.productionReady}`,
    `model: ${pack.dimensions.gameVariant}/${pack.dimensions.tableFormat}/${pack.dimensions.evModel}`,
    `profile coverage: ${pack.dimensions.blindSpeeds.join(",") || "none"}/${pack.dimensions.antes.join(",") || "none"}`,
    `license: ${pack.licenseKind}`,
    `confidence: ${pack.confidence}`,
    `sources: ${pack.sourceEvidence.length}`,
    `rules: ${pack.rules.length}`,
    `pot types: ${report.potTypes.join(",") || "none"}`,
    `position patterns: ${report.positionPatterns.join(",") || "none"}`,
    `prior turn actions: ${report.priorTurnActions.join(",") || "none"}`,
    `river runout classes: ${report.riverRunoutClasses.join(",") || "none"}`,
    `blocker relevance: ${report.blockerRelevance.join(",") || "none"}`,
    `action nodes: ${report.actionNodes.join(",") || "none"}`,
    `range lanes: ${report.rangeLanes.join(",") || "none"}`,
    `range mix buckets: ${report.rangeMixBucketCount}`,
    `missing pot types: ${report.missingPotTypes.join(",") || "none"}`,
    `missing position patterns: ${report.missingPositionPatterns.join(",") || "none"}`,
    `missing prior turn actions: ${report.missingPriorTurnActions.join(",") || "none"}`,
    `missing river runout classes: ${report.missingRiverRunoutClasses.join(",") || "none"}`,
    `missing blocker relevance: ${report.missingBlockerRelevance.join(",") || "none"}`,
    `missing action nodes: ${report.missingActionNodes.join(",") || "none"}`,
    `missing range lanes: ${report.missingRangeLanes.join(",") || "none"}`,
  ];

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return lines.join("\n");
}

function validateBucketActionMix(
  rule: RiverProductionStrategyRule,
  bucket: RiverProductionRangeBucket,
  exactFrequencyAllowed: boolean,
): string[] {
  const errors: string[] = [];
  const mix = bucket.actionMix ?? [];
  if (mix.length === 0) {
    errors.push(`${rule.id}: range bucket ${bucket.label} actionMix cannot be empty.`);
    return errors;
  }

  const seenActions = new Set<PostflopAction>();
  let total = 0;
  let includesBucketAction = false;
  for (const item of mix) {
    if (!rule.actions.includes(item.action)) errors.push(`${rule.id}: range bucket ${bucket.label} actionMix uses an unavailable action.`);
    if (!isRiverProductionActionForNode(item.action, rule.actionNode)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} actionMix uses action ${item.action} outside ${rule.actionNode}.`);
    }
    if (seenActions.has(item.action)) errors.push(`${rule.id}: range bucket ${bucket.label} actionMix duplicates ${item.action}.`);
    seenActions.add(item.action);
    if (item.action === bucket.action) includesBucketAction = true;
    if (!Number.isFinite(item.frequencyPct) || item.frequencyPct < 0 || item.frequencyPct > 100) {
      errors.push(`${rule.id}: range bucket ${bucket.label} actionMix frequencyPct must be 0-100.`);
    } else {
      total += item.frequencyPct;
    }
    if (item.visibility !== "QUALITATIVE" && item.visibility !== "EXACT") {
      errors.push(`${rule.id}: range bucket ${bucket.label} actionMix visibility is invalid.`);
    }
    if (item.visibility === "EXACT" && !exactFrequencyAllowed) {
      errors.push(`${rule.id}: range bucket ${bucket.label} exact actionMix frequencies require owned export or explicit written permission.`);
    }
  }

  if (!includesBucketAction) errors.push(`${rule.id}: range bucket ${bucket.label} actionMix must include the bucket action.`);
  if (Math.abs(total - 100) > 0.1) errors.push(`${rule.id}: range bucket ${bucket.label} actionMix frequencies must sum to 100.`);
  return errors;
}

function licenseAllowsExactFrequency(kind: RiverProductionLicenseKind): boolean {
  return kind === "OWNED_SOLVER_EXPORT" || kind === "EXPLICIT_WRITTEN_PERMISSION";
}

function isRiverPriorTurnAction(
  action: PostflopAction,
  actionNode: RiverProductionStrategyRule["actionNode"],
): boolean {
  const allowed: readonly PostflopAction[] = actionNode === "RIVER_FACING_BET"
    ? ["CALL"]
    : ["CHECK", "BET_SMALL", "BET_BIG", "RAISE"];
  return allowed.includes(action);
}

function isRiverProductionActionForNode(
  action: PostflopAction,
  actionNode: RiverProductionStrategyRule["actionNode"],
): boolean {
  return riverProductionActionsForNode(actionNode).includes(action);
}

function riverProductionActionsForNode(
  actionNode: RiverProductionStrategyRule["actionNode"],
): readonly PostflopAction[] {
  switch (actionNode) {
    case "RIVER_PRESSURE":
      return RIVER_PRODUCTION_PRESSURE_ACTIONS;
    case "RIVER_FACING_BET":
      return RIVER_PRODUCTION_FACING_BET_ACTIONS;
  }
  return [];
}

function validateProfileCoverage(
  prefix: string,
  blindSpeeds: readonly BlindSpeed[],
  antes: readonly AnteMode[],
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(blindSpeeds) || blindSpeeds.length === 0) {
    errors.push(`${prefix} blindSpeeds coverage is required.`);
  } else {
    for (const blindSpeed of blindSpeeds) {
      if (!LEGAL_BLIND_SPEEDS.includes(blindSpeed)) {
        errors.push(`${prefix} blindSpeed ${blindSpeed} is invalid.`);
      }
    }
  }

  if (!Array.isArray(antes) || antes.length === 0) {
    errors.push(`${prefix} ante coverage is required.`);
  } else {
    for (const ante of antes) {
      if (!LEGAL_ANTE_MODES.includes(ante)) {
        errors.push(`${prefix} ante ${ante} is invalid.`);
      }
    }
  }

  return errors;
}

function uniqueInOrder<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const seen = new Set(values);
  return order.filter((value) => seen.has(value));
}
