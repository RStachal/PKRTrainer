import { ALL_HAND_CLASSES } from "../../core/poker";
import { validateActionEvSet, type ActionEvSet } from "../../core/actionEv";
import type {
  PostflopAction,
  PostflopOpponentPolicyBranch,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../core/postflopGenerator";
import {
  MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
  POSTFLOP_ACTIONS,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { HandLabel } from "../../core/types";
import type {
  BlindSpeed,
  EvModel,
  GameVariant,
  TableFormat,
} from "../../core/trainingProfile";
import type { AnteMode } from "../../core/types";
import type {
  PostflopStrategySourceEvidence,
  ProductionCardRemovalSample,
  ProductionHandClassOverlapPolicy,
} from "./postflopStrategyPack";
import { validatePostflopOpponentPolicyBranch } from "./postflopStrategyPack";
import { findPlaceholderStringPaths } from "./placeholderText";

export type TurnProductionLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION"
  | "PUBLIC_METADATA_ONLY"
  | "UNKNOWN";

export type TurnProductionRangeLane = "VALUE" | "BLUFF" | "CHECK";
export type TurnProductionFrequencyVisibility = "QUALITATIVE" | "EXACT";
export type TurnProductionTurnCardClass =
  | "BLANK"
  | "LOW_BRICK"
  | "OVER_CARD"
  | "BROADWAY"
  | "BOARD_PAIRING"
  | "FLUSH_COMPLETING"
  | "STRAIGHT_COMPLETING"
  | "DYNAMIC";

export interface TurnProductionActionFrequency {
  action: PostflopAction;
  frequencyPct: number;
  visibility: TurnProductionFrequencyVisibility;
}

export interface TurnProductionStrategyPackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeeds: readonly BlindSpeed[];
  street: "TURN";
  evModel: EvModel;
  antes: readonly AnteMode[];
}

export interface TurnProductionRangeBucket {
  lane: TurnProductionRangeLane;
  label: string;
  action: PostflopAction;
  handClasses: readonly HandLabel[];
  features: readonly string[];
  weightPct?: number;
  actionMix?: readonly TurnProductionActionFrequency[];
  actionEvs?: ActionEvSet<PostflopAction>;
}

export interface TurnProductionStrategyRule {
  id: string;
  actionNode: Extract<PostflopActionNode, "TURN_BARREL" | "TURN_FACING_BET">;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  positionPattern: PostflopPositionPattern;
  priorFlopAction: PostflopAction;
  turnCardClasses: readonly TurnProductionTurnCardClass[];
  sprMin: number;
  sprMax: number;
  actions: readonly PostflopAction[];
  recommendedAction: PostflopAction;
  opponentPolicy?: PostflopOpponentPolicyBranch;
  rangeBuckets: readonly TurnProductionRangeBucket[];
  handClassOverlapPolicies?: readonly ProductionHandClassOverlapPolicy[];
  cardRemovalSamples?: readonly ProductionCardRemovalSample[];
  explanation: string;
}

export interface TurnProductionStrategyPack {
  contentLanguage?: string;
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  confidence: "MEDIUM" | "HIGH" | "LOW";
  licenseKind: TurnProductionLicenseKind;
  licenseNote: string;
  dimensions: TurnProductionStrategyPackDimensions;
  sourceEvidence: readonly PostflopStrategySourceEvidence[];
  assumptions: readonly string[];
  rules: readonly TurnProductionStrategyRule[];
}

export interface TurnProductionCoverageReport {
  productionReady: boolean;
  errors: readonly string[];
  potTypes: readonly PostflopPotType[];
  positionPatterns: readonly PostflopPositionPattern[];
  priorFlopActions: readonly PostflopAction[];
  turnCardClasses: readonly TurnProductionTurnCardClass[];
  actionNodes: readonly PostflopActionNode[];
  rangeLanes: readonly TurnProductionRangeLane[];
  rangeMixBucketCount: number;
  missingPotTypes: readonly PostflopPotType[];
  missingPositionPatterns: readonly PostflopPositionPattern[];
  missingPriorFlopActions: readonly PostflopAction[];
  missingTurnCardClasses: readonly TurnProductionTurnCardClass[];
  missingActionNodes: readonly PostflopActionNode[];
  missingRangeLanes: readonly TurnProductionRangeLane[];
}

export const TURN_PRODUCTION_REQUIRED_POT_TYPES = [
  "SINGLE_RAISED",
  "THREE_BET_POT",
] as const satisfies readonly PostflopPotType[];

export const TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS = [
  ...MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
] as const satisfies readonly PostflopPositionPattern[];

export const TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
  "CALL",
  "RAISE",
] as const satisfies readonly PostflopAction[];

export const TURN_PRODUCTION_REQUIRED_CARD_CLASSES = [
  "BLANK",
  "LOW_BRICK",
  "OVER_CARD",
  "BROADWAY",
  "BOARD_PAIRING",
  "FLUSH_COMPLETING",
  "STRAIGHT_COMPLETING",
  "DYNAMIC",
] as const satisfies readonly TurnProductionTurnCardClass[];

export const TURN_PRODUCTION_REQUIRED_ACTION_NODES = [
  "TURN_BARREL",
  "TURN_FACING_BET",
] as const satisfies readonly PostflopActionNode[];

export const TURN_PRODUCTION_REQUIRED_RANGE_LANES = [
  "VALUE",
  "BLUFF",
  "CHECK",
] as const satisfies readonly TurnProductionRangeLane[];

const LEGAL_LICENSE_KINDS: readonly TurnProductionLicenseKind[] = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
];
const LEGAL_BLIND_SPEEDS: readonly BlindSpeed[] = ["REGULAR", "TURBO"];
const LEGAL_ANTE_MODES: readonly AnteMode[] = ["ON", "OFF"];
const HAND_CLASS_SET: ReadonlySet<HandLabel> = new Set(ALL_HAND_CLASSES);
const POSTFLOP_ACTION_SET: ReadonlySet<PostflopAction> = new Set(POSTFLOP_ACTIONS);
const TURN_PRODUCTION_BARREL_ACTIONS: readonly PostflopAction[] = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
];
const TURN_PRODUCTION_FACING_BET_ACTIONS: readonly PostflopAction[] = [
  "FOLD",
  "CALL",
  "RAISE",
];
const TURN_CARD_CLASS_SET: ReadonlySet<TurnProductionTurnCardClass> = new Set(
  TURN_PRODUCTION_REQUIRED_CARD_CLASSES,
);

export function validateTurnProductionStrategyPack(
  pack: TurnProductionStrategyPack,
): string[] {
  const errors: string[] = [];

  if (pack.id.trim().length === 0) errors.push("Turn production pack id is required.");
  if (pack.version.trim().length === 0) errors.push("Turn production pack version is required.");
  if (pack.createdAt.trim().length === 0) errors.push("Turn production pack createdAt is required.");
  if (pack.verifiedAt.trim().length === 0) errors.push("Turn production pack verifiedAt is required.");
  if (pack.confidence === "LOW") errors.push("Turn production pack cannot have LOW confidence.");
  if (!LEGAL_LICENSE_KINDS.includes(pack.licenseKind)) {
    errors.push("Turn production pack needs owned export, public permission, or explicit written permission.");
  }
  if (pack.licenseNote.trim().length === 0) errors.push("Turn production licenseNote is required.");
  errors.push(...validateProfileCoverage(
    "Turn production",
    pack.dimensions.blindSpeeds,
    pack.dimensions.antes,
  ));
  if (pack.dimensions.gameVariant !== "MTT") {
    errors.push("Turn production pack must use gameVariant MTT.");
  }
  if (pack.dimensions.street !== "TURN") errors.push("Turn production pack must use street TURN.");
  if (pack.sourceEvidence.length < 2) {
    errors.push("Turn production pack needs at least two source evidence entries.");
  }
  if (pack.assumptions.length === 0) errors.push("Turn production assumptions are required.");
  if (pack.rules.length === 0) errors.push("Turn production pack must contain at least one rule.");
  const placeholderPaths = findPlaceholderStringPaths(pack);
  if (placeholderPaths.length > 0) {
    errors.push(`Turn production pack must replace placeholder text before promotion: ${placeholderPaths.join(",")}.`);
  }

  for (const rule of pack.rules) {
    errors.push(...validateTurnProductionRule(rule, {
      exactFrequencyAllowed: licenseAllowsExactFrequency(pack.licenseKind),
    }));
  }

  return errors;
}

export function validateTurnProductionRule(
  rule: TurnProductionStrategyRule,
  options: { exactFrequencyAllowed?: boolean } = {},
): string[] {
  const errors: string[] = [];

  if (rule.id.trim().length === 0) errors.push("Turn production rule id is required.");
  if (!TURN_PRODUCTION_REQUIRED_ACTION_NODES.includes(rule.actionNode)) {
    errors.push(`${rule.id}: turn production rule must use TURN_BARREL or TURN_FACING_BET.`);
  }
  if (rule.turnCardClasses.length === 0) errors.push(`${rule.id}: turnCardClasses are required.`);
  if (!POSTFLOP_ACTION_SET.has(rule.priorFlopAction)) {
    errors.push(`${rule.id}: priorFlopAction is invalid.`);
  }
  if (!isTurnPriorFlopAction(rule.priorFlopAction, rule.actionNode)) {
    errors.push(`${rule.id}: priorFlopAction ${rule.priorFlopAction} is not valid for ${rule.actionNode}.`);
  }
  if (rule.actions.length === 0) errors.push(`${rule.id}: actions are required.`);
  for (const action of rule.actions) {
    if (!POSTFLOP_ACTION_SET.has(action)) errors.push(`${rule.id}: action ${action} is invalid.`);
    if (!isTurnProductionActionForNode(action, rule.actionNode)) {
      errors.push(`${rule.id}: action ${action} is not valid for ${rule.actionNode}.`);
    }
  }
  if (!rule.actions.includes(rule.recommendedAction)) {
    errors.push(`${rule.id}: recommendedAction must be present in actions.`);
  }
  if (!isTurnProductionActionForNode(rule.recommendedAction, rule.actionNode)) {
    errors.push(`${rule.id}: recommendedAction ${rule.recommendedAction} is not valid for ${rule.actionNode}.`);
  }
  if (!Number.isFinite(rule.sprMin) || !Number.isFinite(rule.sprMax)) {
    errors.push(`${rule.id}: SPR bounds must be finite.`);
  }
  if (rule.sprMin < 0 || rule.sprMax < rule.sprMin) {
    errors.push(`${rule.id}: SPR bounds are invalid.`);
  }
  if (rule.explanation.trim().length === 0) errors.push(`${rule.id}: explanation is required.`);
  if (rule.opponentPolicy) {
    errors.push(...validatePostflopOpponentPolicyBranch(rule.opponentPolicy, rule.id));
  }
  if (rule.rangeBuckets.length === 0) errors.push(`${rule.id}: rangeBuckets are required.`);
  for (const turnCardClass of rule.turnCardClasses) {
    if (!TURN_CARD_CLASS_SET.has(turnCardClass)) {
      errors.push(`${rule.id}: invalid turnCardClass ${turnCardClass}.`);
    }
  }

  const lanes = new Set<TurnProductionRangeLane>();
  const seenHands = new Set<HandLabel>();
  for (const bucket of rule.rangeBuckets) {
    lanes.add(bucket.lane);
    if (!rule.actions.includes(bucket.action)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} uses an unavailable action.`);
    }
    if (!isTurnProductionActionForNode(bucket.action, rule.actionNode)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} action ${bucket.action} is not valid for ${rule.actionNode}.`);
    }
    if (bucket.label.trim().length === 0) {
      errors.push(`${rule.id}: range bucket label is required.`);
    }
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
      if (!HAND_CLASS_SET.has(hand)) {
        errors.push(`${rule.id}: range bucket ${bucket.label} contains invalid hand ${hand}.`);
      }
      const handKey = `${bucket.lane}|${hand}`;
      if (seenHands.has(handKey)) {
        errors.push(`${rule.id}: duplicate hand ${hand} in ${bucket.lane} lane.`);
      }
      seenHands.add(handKey);
    }
  }

  for (const lane of TURN_PRODUCTION_REQUIRED_RANGE_LANES) {
    if (!lanes.has(lane)) errors.push(`${rule.id}: missing ${lane} range lane.`);
  }

  return errors;
}

export function buildTurnProductionCoverageReport(
  pack: TurnProductionStrategyPack,
): TurnProductionCoverageReport {
  const errors = validateTurnProductionStrategyPack(pack);
  const potTypes = uniqueInOrder(
    pack.rules.map((rule) => rule.potType),
    TURN_PRODUCTION_REQUIRED_POT_TYPES,
  );
  const positionPatterns = uniqueInOrder(
    pack.rules.map((rule) => rule.positionPattern),
    TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  );
  const priorFlopActions = uniqueInOrder(
    pack.rules.map((rule) => rule.priorFlopAction),
    TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS,
  );
  const turnCardClasses = uniqueInOrder(
    pack.rules.flatMap((rule) => [...rule.turnCardClasses]),
    TURN_PRODUCTION_REQUIRED_CARD_CLASSES,
  );
  const actionNodes = uniqueInOrder(
    pack.rules.map((rule) => rule.actionNode),
    TURN_PRODUCTION_REQUIRED_ACTION_NODES,
  );
  const rangeLanes = uniqueInOrder(
    pack.rules.flatMap((rule) => rule.rangeBuckets.map((bucket) => bucket.lane)),
    TURN_PRODUCTION_REQUIRED_RANGE_LANES,
  );
  const rangeMixBucketCount = pack.rules.reduce((count, rule) => (
    count + rule.rangeBuckets.filter((bucket) => bucket.actionMix !== undefined).length
  ), 0);
  const missingPotTypes = TURN_PRODUCTION_REQUIRED_POT_TYPES.filter((item) => (
    !potTypes.includes(item)
  ));
  const missingPositionPatterns = TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS.filter((item) => (
    !positionPatterns.includes(item)
  ));
  const missingPriorFlopActions = TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS.filter((item) => (
    !priorFlopActions.includes(item)
  ));
  const missingTurnCardClasses = TURN_PRODUCTION_REQUIRED_CARD_CLASSES.filter((item) => (
    !turnCardClasses.includes(item)
  ));
  const missingActionNodes = TURN_PRODUCTION_REQUIRED_ACTION_NODES.filter((item) => (
    !actionNodes.includes(item)
  ));
  const missingRangeLanes = TURN_PRODUCTION_REQUIRED_RANGE_LANES.filter((item) => (
    !rangeLanes.includes(item)
  ));

  return {
    productionReady:
      errors.length === 0 &&
      missingPotTypes.length === 0 &&
      missingPositionPatterns.length === 0 &&
      missingPriorFlopActions.length === 0 &&
      missingTurnCardClasses.length === 0 &&
      missingActionNodes.length === 0 &&
      missingRangeLanes.length === 0,
    errors,
    potTypes,
    positionPatterns,
    priorFlopActions,
    turnCardClasses,
    actionNodes,
    rangeLanes,
    rangeMixBucketCount,
    missingPotTypes,
    missingPositionPatterns,
    missingPriorFlopActions,
    missingTurnCardClasses,
    missingActionNodes,
    missingRangeLanes,
  };
}

export function renderTurnProductionCoverageReport(
  pack: TurnProductionStrategyPack,
  report: TurnProductionCoverageReport = buildTurnProductionCoverageReport(pack),
): string {
  const lines = [
    `Turn production StrategyPack: ${pack.id}`,
    `productionReady: ${report.productionReady}`,
    `model: ${pack.dimensions.gameVariant}/${pack.dimensions.tableFormat}/${pack.dimensions.evModel}`,
    `profile coverage: ${pack.dimensions.blindSpeeds.join(",") || "none"}/${pack.dimensions.antes.join(",") || "none"}`,
    `license: ${pack.licenseKind}`,
    `confidence: ${pack.confidence}`,
    `sources: ${pack.sourceEvidence.length}`,
    `rules: ${pack.rules.length}`,
    `pot types: ${report.potTypes.join(",") || "none"}`,
    `position patterns: ${report.positionPatterns.join(",") || "none"}`,
    `prior flop actions: ${report.priorFlopActions.join(",") || "none"}`,
    `turn card classes: ${report.turnCardClasses.join(",") || "none"}`,
    `action nodes: ${report.actionNodes.join(",") || "none"}`,
    `range lanes: ${report.rangeLanes.join(",") || "none"}`,
    `range mix buckets: ${report.rangeMixBucketCount}`,
    `missing pot types: ${report.missingPotTypes.join(",") || "none"}`,
    `missing position patterns: ${report.missingPositionPatterns.join(",") || "none"}`,
    `missing prior flop actions: ${report.missingPriorFlopActions.join(",") || "none"}`,
    `missing turn card classes: ${report.missingTurnCardClasses.join(",") || "none"}`,
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
  rule: TurnProductionStrategyRule,
  bucket: TurnProductionRangeBucket,
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
    if (!rule.actions.includes(item.action)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} actionMix uses an unavailable action.`);
    }
    if (!isTurnProductionActionForNode(item.action, rule.actionNode)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} actionMix uses action ${item.action} outside ${rule.actionNode}.`);
    }
    if (seenActions.has(item.action)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} actionMix duplicates ${item.action}.`);
    }
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

  if (!includesBucketAction) {
    errors.push(`${rule.id}: range bucket ${bucket.label} actionMix must include the bucket action.`);
  }
  if (Math.abs(total - 100) > 0.1) {
    errors.push(`${rule.id}: range bucket ${bucket.label} actionMix frequencies must sum to 100.`);
  }

  return errors;
}

function licenseAllowsExactFrequency(kind: TurnProductionLicenseKind): boolean {
  return kind === "OWNED_SOLVER_EXPORT" || kind === "EXPLICIT_WRITTEN_PERMISSION";
}

function isTurnPriorFlopAction(
  action: PostflopAction,
  actionNode: TurnProductionStrategyRule["actionNode"],
): boolean {
  const allowed: readonly PostflopAction[] = actionNode === "TURN_FACING_BET"
    ? ["CALL"]
    : ["CHECK", "BET_SMALL", "BET_BIG", "RAISE"];
  return allowed.includes(action);
}

function isTurnProductionActionForNode(
  action: PostflopAction,
  actionNode: TurnProductionStrategyRule["actionNode"],
): boolean {
  return turnProductionActionsForNode(actionNode).includes(action);
}

function turnProductionActionsForNode(
  actionNode: TurnProductionStrategyRule["actionNode"],
): readonly PostflopAction[] {
  switch (actionNode) {
    case "TURN_BARREL":
      return TURN_PRODUCTION_BARREL_ACTIONS;
    case "TURN_FACING_BET":
      return TURN_PRODUCTION_FACING_BET_ACTIONS;
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

function uniqueInOrder<T extends string>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const seen = new Set(values);
  return order.filter((value) => seen.has(value));
}
