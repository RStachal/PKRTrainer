import { ALL_HAND_CLASSES } from "../../core/poker";
import { validateActionEvSet, type ActionEvSet } from "../../core/actionEv";
import type {
  BoardTexture,
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
  EvModel,
  GameVariant,
  BlindSpeed,
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

export type FlopProductionLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION"
  | "PUBLIC_METADATA_ONLY"
  | "UNKNOWN";

export type FlopProductionRangeLane = "VALUE" | "BLUFF" | "CHECK";
export type FlopProductionFrequencyVisibility = "QUALITATIVE" | "EXACT";
export type FlopProductionSprBand = "LOW" | "MID" | "HIGH";

export interface FlopProductionActionFrequency {
  action: PostflopAction;
  frequencyPct: number;
  visibility: FlopProductionFrequencyVisibility;
}

export interface FlopProductionStrategyPackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeeds: readonly BlindSpeed[];
  street: "FLOP";
  evModel: EvModel;
  antes: readonly AnteMode[];
}

export interface FlopProductionRangeBucket {
  lane: FlopProductionRangeLane;
  label: string;
  action: PostflopAction;
  handClasses: readonly HandLabel[];
  features: readonly string[];
  weightPct?: number;
  actionMix?: readonly FlopProductionActionFrequency[];
  actionEvs?: ActionEvSet<PostflopAction>;
}

export interface FlopProductionStrategyRule {
  id: string;
  actionNode: Extract<PostflopActionNode, "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET" | "FLOP_FACING_BET">;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  positionPattern: PostflopPositionPattern;
  boardTextures: readonly BoardTexture[];
  sprMin: number;
  sprMax: number;
  actions: readonly PostflopAction[];
  recommendedAction: PostflopAction;
  opponentPolicy?: PostflopOpponentPolicyBranch;
  rangeBuckets: readonly FlopProductionRangeBucket[];
  handClassOverlapPolicies?: readonly ProductionHandClassOverlapPolicy[];
  cardRemovalSamples?: readonly ProductionCardRemovalSample[];
  explanation: string;
}

export interface FlopProductionStrategyPack {
  contentLanguage?: string;
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  confidence: "MEDIUM" | "HIGH" | "LOW";
  licenseKind: FlopProductionLicenseKind;
  licenseNote: string;
  dimensions: FlopProductionStrategyPackDimensions;
  sourceEvidence: readonly PostflopStrategySourceEvidence[];
  assumptions: readonly string[];
  rules: readonly FlopProductionStrategyRule[];
}

export interface FlopProductionCoverageReport {
  productionReady: boolean;
  errors: readonly string[];
  potTypes: readonly PostflopPotType[];
  positionPatterns: readonly PostflopPositionPattern[];
  boardTextures: readonly BoardTexture[];
  sprBands: readonly FlopProductionSprBand[];
  actionNodes: readonly PostflopActionNode[];
  rangeLanes: readonly FlopProductionRangeLane[];
  rangeMixBucketCount: number;
  missingPotTypes: readonly PostflopPotType[];
  missingPositionPatterns: readonly PostflopPositionPattern[];
  missingBoardTextures: readonly BoardTexture[];
  missingSprBands: readonly FlopProductionSprBand[];
  missingActionNodes: readonly PostflopActionNode[];
  missingRangeLanes: readonly FlopProductionRangeLane[];
}

export const FLOP_PRODUCTION_REQUIRED_POT_TYPES = [
  "SINGLE_RAISED",
  "THREE_BET_POT",
] as const satisfies readonly PostflopPotType[];

export const FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS = [
  ...MTT_POSTFLOP_PRODUCTION_POSITION_PATTERNS,
] as const satisfies readonly PostflopPositionPattern[];

export const FLOP_PRODUCTION_REQUIRED_TEXTURES = [
  "paired",
  "monotone",
  "two-tone",
  "rainbow",
  "connected",
  "dry",
  "ace-high",
  "broadway-high",
  "low",
  "medium",
  "straight-possible",
  "flush-draw-heavy",
  "disconnected",
] as const satisfies readonly BoardTexture[];

export const FLOP_PRODUCTION_REQUIRED_ACTION_NODES = [
  "SINGLE_RAISED_POT_CBET",
  "THREE_BET_POT_CBET",
  "FLOP_FACING_BET",
] as const satisfies readonly PostflopActionNode[];

export const FLOP_PRODUCTION_REQUIRED_SPR_BANDS = [
  "LOW",
  "MID",
  "HIGH",
] as const satisfies readonly FlopProductionSprBand[];

export const FLOP_PRODUCTION_REQUIRED_RANGE_LANES = [
  "VALUE",
  "BLUFF",
  "CHECK",
] as const satisfies readonly FlopProductionRangeLane[];

const LEGAL_LICENSE_KINDS: readonly FlopProductionLicenseKind[] = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
];
const LEGAL_BLIND_SPEEDS: readonly BlindSpeed[] = ["REGULAR", "TURBO"];
const LEGAL_ANTE_MODES: readonly AnteMode[] = ["ON", "OFF"];
const POSTFLOP_ACTION_SET: ReadonlySet<PostflopAction> = new Set(POSTFLOP_ACTIONS);
const FLOP_PRODUCTION_CBET_ACTIONS: readonly PostflopAction[] = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
];
const FLOP_PRODUCTION_FACING_BET_ACTIONS: readonly PostflopAction[] = [
  "FOLD",
  "CALL",
  "RAISE",
];
const HAND_CLASS_SET: ReadonlySet<HandLabel> = new Set(ALL_HAND_CLASSES);

export function validateFlopProductionStrategyPack(
  pack: FlopProductionStrategyPack,
): string[] {
  const errors: string[] = [];

  if (pack.id.trim().length === 0) errors.push("Flop production pack id is required.");
  if (pack.version.trim().length === 0) errors.push("Flop production pack version is required.");
  if (pack.createdAt.trim().length === 0) errors.push("Flop production pack createdAt is required.");
  if (pack.verifiedAt.trim().length === 0) errors.push("Flop production pack verifiedAt is required.");
  if (pack.confidence === "LOW") errors.push("Flop production pack cannot have LOW confidence.");
  if (!LEGAL_LICENSE_KINDS.includes(pack.licenseKind)) {
    errors.push("Flop production pack needs owned export, public permission, or explicit written permission.");
  }
  if (pack.licenseNote.trim().length === 0) errors.push("Flop production licenseNote is required.");
  errors.push(...validateProfileCoverage(
    "Flop production",
    pack.dimensions.blindSpeeds,
    pack.dimensions.antes,
  ));
  if (pack.dimensions.gameVariant !== "MTT") {
    errors.push("Flop production pack must use gameVariant MTT.");
  }
  if (pack.dimensions.street !== "FLOP") errors.push("Flop production pack must use street FLOP.");
  if (pack.sourceEvidence.length < 2) {
    errors.push("Flop production pack needs at least two source evidence entries.");
  }
  if (pack.assumptions.length === 0) errors.push("Flop production assumptions are required.");
  if (pack.rules.length === 0) errors.push("Flop production pack must contain at least one rule.");
  const placeholderPaths = findPlaceholderStringPaths(pack);
  if (placeholderPaths.length > 0) {
    errors.push(`Flop production pack must replace placeholder text before promotion: ${placeholderPaths.join(",")}.`);
  }

  for (const rule of pack.rules) {
    errors.push(...validateFlopProductionRule(rule, {
      exactFrequencyAllowed: licenseAllowsExactFrequency(pack.licenseKind),
    }));
  }

  return errors;
}

export function validateFlopProductionRule(
  rule: FlopProductionStrategyRule,
  options: { exactFrequencyAllowed?: boolean } = {},
): string[] {
  const errors: string[] = [];

  if (rule.id.trim().length === 0) errors.push("Flop production rule id is required.");
  if (rule.boardTextures.length === 0) errors.push(`${rule.id}: boardTextures are required.`);
  if (rule.actions.length === 0) errors.push(`${rule.id}: actions are required.`);
  for (const action of rule.actions) {
    if (!POSTFLOP_ACTION_SET.has(action)) errors.push(`${rule.id}: action ${action} is invalid.`);
    if (!isFlopProductionActionForNode(action, rule.actionNode)) {
      errors.push(`${rule.id}: action ${action} is not valid for ${rule.actionNode}.`);
    }
  }
  if (!rule.actions.includes(rule.recommendedAction)) {
    errors.push(`${rule.id}: recommendedAction must be present in actions.`);
  }
  if (!isFlopProductionActionForNode(rule.recommendedAction, rule.actionNode)) {
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
  if (!flopPotTypeMatchesActionNode(rule.potType, rule.actionNode)) {
    errors.push(`${rule.id}: ${rule.potType} pot cannot use ${rule.actionNode}.`);
  }

  const lanes = new Set<FlopProductionRangeLane>();
  const seenHands = new Set<HandLabel>();
  for (const bucket of rule.rangeBuckets) {
    lanes.add(bucket.lane);
    if (!rule.actions.includes(bucket.action)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} uses an unavailable action.`);
    }
    if (!isFlopProductionActionForNode(bucket.action, rule.actionNode)) {
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

  // Lane coverage is a pack-level requirement, not a per-rule one. A single rule
  // is one SPR band at one action node, and a converged solve can legitimately
  // have no bluffs there: at SPR below 3 the observed BTN c-bet range is pairs
  // and broadway only, with suited connectors checking. Demanding all three
  // lanes per rule would force a bluff lane to be invented where the solver has
  // none, which the content contract forbids. The pack as a whole must still
  // demonstrate VALUE, BLUFF and CHECK; see missingRangeLanes in
  // buildFlopProductionStrategyPackReport.
  if (lanes.size === 0) errors.push(`${rule.id}: at least one range lane is required.`);

  return errors;
}

function validateBucketActionMix(
  rule: FlopProductionStrategyRule,
  bucket: FlopProductionRangeBucket,
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
    if (!isFlopProductionActionForNode(item.action, rule.actionNode)) {
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

export function buildFlopProductionCoverageReport(
  pack: FlopProductionStrategyPack,
): FlopProductionCoverageReport {
  const errors = validateFlopProductionStrategyPack(pack);
  const potTypes = uniqueInOrder(
    pack.rules.map((rule) => rule.potType),
    FLOP_PRODUCTION_REQUIRED_POT_TYPES,
  );
  const positionPatterns = uniqueInOrder(
    pack.rules.map((rule) => rule.positionPattern),
    FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  );
  const boardTextures = uniqueInOrder(
    pack.rules.flatMap((rule) => [...rule.boardTextures]),
    FLOP_PRODUCTION_REQUIRED_TEXTURES,
  );
  const actionNodes = uniqueInOrder(
    pack.rules.map((rule) => rule.actionNode),
    FLOP_PRODUCTION_REQUIRED_ACTION_NODES,
  );
  const sprBands = uniqueInOrder(
    pack.rules.flatMap(ruleSprBands),
    FLOP_PRODUCTION_REQUIRED_SPR_BANDS,
  );
  const rangeLanes = uniqueInOrder(
    pack.rules.flatMap((rule) => rule.rangeBuckets.map((bucket) => bucket.lane)),
    FLOP_PRODUCTION_REQUIRED_RANGE_LANES,
  );
  const rangeMixBucketCount = pack.rules.reduce((count, rule) => (
    count + rule.rangeBuckets.filter((bucket) => bucket.actionMix !== undefined).length
  ), 0);
  const missingPotTypes = FLOP_PRODUCTION_REQUIRED_POT_TYPES.filter((item) => (
    !potTypes.includes(item)
  ));
  const missingPositionPatterns = FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS.filter((item) => (
    !positionPatterns.includes(item)
  ));
  const missingBoardTextures = FLOP_PRODUCTION_REQUIRED_TEXTURES.filter((item) => (
    !boardTextures.includes(item)
  ));
  const missingActionNodes = FLOP_PRODUCTION_REQUIRED_ACTION_NODES.filter((item) => (
    !actionNodes.includes(item)
  ));
  const missingSprBands = FLOP_PRODUCTION_REQUIRED_SPR_BANDS.filter((item) => (
    !sprBands.includes(item)
  ));
  const missingRangeLanes = FLOP_PRODUCTION_REQUIRED_RANGE_LANES.filter((item) => (
    !rangeLanes.includes(item)
  ));

  return {
    productionReady:
      errors.length === 0 &&
      missingPotTypes.length === 0 &&
      missingPositionPatterns.length === 0 &&
      missingBoardTextures.length === 0 &&
      missingActionNodes.length === 0 &&
      missingSprBands.length === 0 &&
      missingRangeLanes.length === 0,
    errors,
    potTypes,
    positionPatterns,
    boardTextures,
    sprBands,
    actionNodes,
    rangeLanes,
    rangeMixBucketCount,
    missingPotTypes,
    missingPositionPatterns,
    missingBoardTextures,
    missingSprBands,
    missingActionNodes,
    missingRangeLanes,
  };
}

export function renderFlopProductionCoverageReport(
  pack: FlopProductionStrategyPack,
  report: FlopProductionCoverageReport = buildFlopProductionCoverageReport(pack),
): string {
  const lines = [
    `Flop production StrategyPack: ${pack.id}`,
    `productionReady: ${report.productionReady}`,
    `model: ${pack.dimensions.gameVariant}/${pack.dimensions.tableFormat}/${pack.dimensions.evModel}`,
    `profile coverage: ${pack.dimensions.blindSpeeds.join(",") || "none"}/${pack.dimensions.antes.join(",") || "none"}`,
    `license: ${pack.licenseKind}`,
    `confidence: ${pack.confidence}`,
    `sources: ${pack.sourceEvidence.length}`,
    `rules: ${pack.rules.length}`,
    `pot types: ${report.potTypes.join(",") || "none"}`,
    `position patterns: ${report.positionPatterns.join(",") || "none"}`,
    `board textures: ${report.boardTextures.join(",") || "none"}`,
    `SPR bands: ${report.sprBands.join(",") || "none"}`,
    `action nodes: ${report.actionNodes.join(",") || "none"}`,
    `range lanes: ${report.rangeLanes.join(",") || "none"}`,
    `range mix buckets: ${report.rangeMixBucketCount}`,
    `missing pot types: ${report.missingPotTypes.join(",") || "none"}`,
    `missing position patterns: ${report.missingPositionPatterns.join(",") || "none"}`,
    `missing board textures: ${report.missingBoardTextures.join(",") || "none"}`,
    `missing SPR bands: ${report.missingSprBands.join(",") || "none"}`,
    `missing action nodes: ${report.missingActionNodes.join(",") || "none"}`,
    `missing range lanes: ${report.missingRangeLanes.join(",") || "none"}`,
  ];

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  return lines.join("\n");
}

function licenseAllowsExactFrequency(kind: FlopProductionLicenseKind): boolean {
  return kind === "OWNED_SOLVER_EXPORT" || kind === "EXPLICIT_WRITTEN_PERMISSION";
}

function isFlopProductionActionForNode(
  action: PostflopAction,
  actionNode: FlopProductionStrategyRule["actionNode"],
): boolean {
  return flopProductionActionsForNode(actionNode).includes(action);
}

function flopProductionActionsForNode(
  actionNode: FlopProductionStrategyRule["actionNode"],
): readonly PostflopAction[] {
  switch (actionNode) {
    case "SINGLE_RAISED_POT_CBET":
    case "THREE_BET_POT_CBET":
      return FLOP_PRODUCTION_CBET_ACTIONS;
    case "FLOP_FACING_BET":
      return FLOP_PRODUCTION_FACING_BET_ACTIONS;
  }
}

function flopPotTypeMatchesActionNode(
  potType: FlopProductionStrategyRule["potType"],
  actionNode: FlopProductionStrategyRule["actionNode"],
): boolean {
  switch (actionNode) {
    case "SINGLE_RAISED_POT_CBET":
      return potType === "SINGLE_RAISED";
    case "THREE_BET_POT_CBET":
      return potType === "THREE_BET_POT";
    case "FLOP_FACING_BET":
      return potType === "SINGLE_RAISED" || potType === "THREE_BET_POT";
  }
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

function ruleSprBands(
  rule: Pick<FlopProductionStrategyRule, "sprMin" | "sprMax">,
): FlopProductionSprBand[] {
  const bands: FlopProductionSprBand[] = [];
  if (rangesOverlap(rule.sprMin, rule.sprMax, 0, 3)) bands.push("LOW");
  if (rangesOverlap(rule.sprMin, rule.sprMax, 3, 8)) bands.push("MID");
  if (rangesOverlap(rule.sprMin, rule.sprMax, 8, Number.POSITIVE_INFINITY)) bands.push("HIGH");
  return bands;
}

function rangesOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): boolean {
  return aMin < bMax && bMin < aMax;
}

function uniqueInOrder<T extends string>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const seen = new Set(values);
  return order.filter((value) => seen.has(value));
}
