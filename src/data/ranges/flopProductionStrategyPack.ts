import { ALL_HAND_CLASSES } from "../../core/poker";
import type {
  BoardTexture,
  PostflopAction,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { HandLabel } from "../../core/types";
import type {
  EvModel,
  GameVariant,
  TableFormat,
} from "../../core/trainingProfile";
import type { PostflopStrategySourceEvidence } from "./postflopStrategyPack";

export type FlopProductionLicenseKind =
  | "OWNED_SOLVER_EXPORT"
  | "PUBLIC_CHART_WITH_PERMISSION"
  | "EXPLICIT_WRITTEN_PERMISSION"
  | "PUBLIC_METADATA_ONLY"
  | "UNKNOWN";

export type FlopProductionRangeLane = "VALUE" | "BLUFF" | "CHECK";

export interface FlopProductionStrategyPackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  street: "FLOP";
  evModel: EvModel;
}

export interface FlopProductionRangeBucket {
  lane: FlopProductionRangeLane;
  label: string;
  action: PostflopAction;
  handClasses: readonly HandLabel[];
  features: readonly string[];
  weightPct?: number;
}

export interface FlopProductionStrategyRule {
  id: string;
  actionNode: Extract<PostflopActionNode, "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET">;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  positionPattern: PostflopPositionPattern;
  boardTextures: readonly BoardTexture[];
  sprMin: number;
  sprMax: number;
  actions: readonly PostflopAction[];
  recommendedAction: PostflopAction;
  rangeBuckets: readonly FlopProductionRangeBucket[];
  explanation: string;
}

export interface FlopProductionStrategyPack {
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
  actionNodes: readonly PostflopActionNode[];
  rangeLanes: readonly FlopProductionRangeLane[];
  missingPotTypes: readonly PostflopPotType[];
  missingPositionPatterns: readonly PostflopPositionPattern[];
  missingBoardTextures: readonly BoardTexture[];
  missingActionNodes: readonly PostflopActionNode[];
  missingRangeLanes: readonly FlopProductionRangeLane[];
}

export const FLOP_PRODUCTION_REQUIRED_POT_TYPES = [
  "SINGLE_RAISED",
  "THREE_BET_POT",
] as const satisfies readonly PostflopPotType[];

export const FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS = [
  "EP_VS_BB",
  "BTN_VS_BB",
  "SB_VS_BB",
  "OOP_RAISER_VS_IP_CALLER",
  "OOP_CALLER_VS_IP_3BETTOR",
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
] as const satisfies readonly PostflopActionNode[];

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
  if (pack.dimensions.street !== "FLOP") errors.push("Flop production pack must use street FLOP.");
  if (pack.sourceEvidence.length < 2) {
    errors.push("Flop production pack needs at least two source evidence entries.");
  }
  if (pack.assumptions.length === 0) errors.push("Flop production assumptions are required.");
  if (pack.rules.length === 0) errors.push("Flop production pack must contain at least one rule.");

  for (const rule of pack.rules) {
    errors.push(...validateFlopProductionRule(rule));
  }

  return errors;
}

export function validateFlopProductionRule(rule: FlopProductionStrategyRule): string[] {
  const errors: string[] = [];

  if (rule.id.trim().length === 0) errors.push("Flop production rule id is required.");
  if (rule.boardTextures.length === 0) errors.push(`${rule.id}: boardTextures are required.`);
  if (rule.actions.length === 0) errors.push(`${rule.id}: actions are required.`);
  if (!rule.actions.includes(rule.recommendedAction)) {
    errors.push(`${rule.id}: recommendedAction must be present in actions.`);
  }
  if (!Number.isFinite(rule.sprMin) || !Number.isFinite(rule.sprMax)) {
    errors.push(`${rule.id}: SPR bounds must be finite.`);
  }
  if (rule.sprMin < 0 || rule.sprMax < rule.sprMin) {
    errors.push(`${rule.id}: SPR bounds are invalid.`);
  }
  if (rule.explanation.trim().length === 0) errors.push(`${rule.id}: explanation is required.`);
  if (rule.rangeBuckets.length === 0) errors.push(`${rule.id}: rangeBuckets are required.`);
  if (rule.potType === "SINGLE_RAISED" && rule.actionNode !== "SINGLE_RAISED_POT_CBET") {
    errors.push(`${rule.id}: SINGLE_RAISED pot must use SINGLE_RAISED_POT_CBET.`);
  }
  if (rule.potType === "THREE_BET_POT" && rule.actionNode !== "THREE_BET_POT_CBET") {
    errors.push(`${rule.id}: THREE_BET_POT must use THREE_BET_POT_CBET.`);
  }

  const lanes = new Set<FlopProductionRangeLane>();
  const seenHands = new Set<HandLabel>();
  for (const bucket of rule.rangeBuckets) {
    lanes.add(bucket.lane);
    if (!rule.actions.includes(bucket.action)) {
      errors.push(`${rule.id}: range bucket ${bucket.label} uses an unavailable action.`);
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

  for (const lane of FLOP_PRODUCTION_REQUIRED_RANGE_LANES) {
    if (!lanes.has(lane)) errors.push(`${rule.id}: missing ${lane} range lane.`);
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
  const rangeLanes = uniqueInOrder(
    pack.rules.flatMap((rule) => rule.rangeBuckets.map((bucket) => bucket.lane)),
    FLOP_PRODUCTION_REQUIRED_RANGE_LANES,
  );
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
      missingRangeLanes.length === 0,
    errors,
    potTypes,
    positionPatterns,
    boardTextures,
    actionNodes,
    rangeLanes,
    missingPotTypes,
    missingPositionPatterns,
    missingBoardTextures,
    missingActionNodes,
    missingRangeLanes,
  };
}

function uniqueInOrder<T extends string>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  const seen = new Set(values);
  return order.filter((value) => seen.has(value));
}
