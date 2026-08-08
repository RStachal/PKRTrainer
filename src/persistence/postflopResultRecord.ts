import type {
  BoardTexture,
  PostflopAction,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopRecommendationSource,
  PostflopStreet,
  PostflopStrategyProvenance,
} from "../core/postflopGenerator";
import { POSTFLOP_ACTIONS, isPostflopPositionPattern } from "../core/postflopGenerator";
import type {
  PostflopActionNode,
  PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import type { ActionEvOutcome } from "../core/actionEv";
import { gradePostflopAction } from "../core/postflopScoring";
import {
  DEFAULT_TRAINING_PROFILE,
  profileId,
  type BlindSpeed,
  type EvModel,
  type GameVariant,
  type RakeMode,
  type TableFormat,
  type TrainingProfile,
} from "../core/trainingProfile";
import type { AnteMode, Position } from "../core/types";

export const POSTFLOP_RESULT_RECORD_SCHEMA = "postflop_result_record_v1";
export const POSTFLOP_STATS_V2_BRIDGE_SCHEMA = "postflop_stats_v2_bridge_v1";
export const POSTFLOP_STATS_V2_BRIDGE_RECORD_VERSION = 5;
export const POSTFLOP_SCENARIO_ID_VERSION = "postflop_scenario_v1";

export interface PostflopResultRecord {
  schema: typeof POSTFLOP_RESULT_RECORD_SCHEMA;
  qid: string;
  chosen: PostflopAction;
  recommended: PostflopAction;
  correct: boolean;
  street: PostflopStreet;
  actionNode: PostflopActionNode;
  potType: PostflopPotType;
  spr: number;
  boardTextures: readonly BoardTexture[];
  heroPosition: Position;
  villainPosition: Position;
  positionPattern: PostflopPositionPattern;
  sourceKind: PostflopRecommendationSource["kind"];
  sourcePackId: string | null;
  sourcePackVersion: string | null;
  sourceVerifiedAt: string | null;
  sourceRuleId: string;
  sourceConfidence: "LOW" | "MEDIUM" | "HIGH" | null;
  /**
   * Whether the answer was graded against solver output or the public heuristic
   * model. Optional so records written before this field remain valid; absent
   * means unknown, never "solver".
   */
  sourceProvenance?: PostflopStrategyProvenance | null;
  ts: number;
  responseMs?: number;
  actionEvOutcome?: ActionEvOutcome;
  chosenEvBb?: number;
  bestEvBb?: number;
  evLossBb?: number;
  equivalentBestActions?: readonly PostflopAction[];
}

export interface PostflopStatsV2BridgeRecord {
  schema: typeof POSTFLOP_STATS_V2_BRIDGE_SCHEMA;
  schemaVersion: number;
  qid: string;
  scenarioId?: string;
  correct: boolean;
  ts: number;
  profileId: string;
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: PostflopStreet;
  evModel: EvModel;
  ante: AnteMode;
  rakeMode: RakeMode;
  actionNode: PostflopActionNode;
  potType: PostflopPotType;
  boardTextureKey: string;
  heroPosition: Position;
  villainPosition: Position;
  positionPattern: PostflopPositionPattern;
  chosen: PostflopAction;
  recommended: PostflopAction;
  strategyPackId: string | null;
  strategyPackVersion?: string | null;
  strategyVerifiedAt?: string | null;
  strategyRuleId: string;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  strategyProvenance?: PostflopStrategyProvenance | null;
  responseMs?: number;
  actionEvOutcome?: ActionEvOutcome;
  chosenEvBb?: number;
  bestEvBb?: number;
  evLossBb?: number;
  equivalentBestActions?: readonly PostflopAction[];
}

export type PostflopStatsV2BridgeRecordLike =
  Omit<PostflopStatsV2BridgeRecord, "schemaVersion" | "ante"> & {
    schemaVersion?: number;
    ante?: AnteMode;
  };

export interface PostflopStatsV2BridgeOptions {
  profile?: Partial<TrainingProfile>;
}

export type PostflopStatsBreakdownDim =
  | "gameVariant"
  | "tableFormat"
  | "blindSpeed"
  | "evModel"
  | "ante"
  | "rakeMode"
  | "street"
  | "actionNode"
  | "potType"
  | "positionPattern"
  | "positionPair"
  | "boardTextureKey"
  | "strategyPackId"
  | "confidence"
  | "sourceQuality";

export interface PostflopStatsGroup {
  key: string;
  total: number;
  correct: number;
  rate: number | null;
}

export function buildPostflopResultRecord(
  spot: PostflopTrainingSpot,
  chosen: PostflopAction,
  ts = Date.now(),
  responseMs?: number,
): PostflopResultRecord {
  const source = spot.explanation.source;
  const grade = gradePostflopAction(spot, chosen);
  return {
    schema: POSTFLOP_RESULT_RECORD_SCHEMA,
    qid: spot.id,
    chosen,
    recommended: spot.recommendedAction,
    correct: grade.correct,
    street: spot.street,
    actionNode: spot.actionNode,
    potType: spot.potType,
    spr: spot.spr,
    boardTextures: [...spot.boardTextures],
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    positionPattern: spot.positionPattern,
    sourceKind: source.kind,
    sourcePackId: source.kind === "STRATEGY_PACK" ? source.packId : null,
    sourcePackVersion: source.kind === "STRATEGY_PACK" ? source.packVersion : null,
    sourceVerifiedAt: source.kind === "STRATEGY_PACK" ? source.packVerifiedAt : null,
    sourceRuleId: source.ruleId,
    sourceConfidence: source.kind === "STRATEGY_PACK" ? source.confidence : null,
    sourceProvenance: source.kind === "STRATEGY_PACK" ? source.provenance : null,
    ts,
    ...(isValidResponseMs(responseMs) ? { responseMs } : {}),
    ...(grade.actionEv
      ? {
          actionEvOutcome: grade.actionEv.outcome,
          chosenEvBb: grade.actionEv.chosenEvBb,
          bestEvBb: grade.actionEv.bestEvBb,
          evLossBb: grade.actionEv.evLossBb,
          equivalentBestActions: [...grade.actionEv.bestActions],
        }
      : {}),
  };
}

export function bridgePostflopResultRecordToStatsV2(
  record: PostflopResultRecord,
  options: PostflopStatsV2BridgeOptions = {},
): PostflopStatsV2BridgeRecord {
  const profile: TrainingProfile = {
    ...DEFAULT_TRAINING_PROFILE,
    ...options.profile,
    street: record.street,
  };
  const actionEv = completePostflopActionEvFields(record);

  return {
    schema: POSTFLOP_STATS_V2_BRIDGE_SCHEMA,
    schemaVersion: POSTFLOP_STATS_V2_BRIDGE_RECORD_VERSION,
    qid: record.qid,
    scenarioId: postflopScenarioId(profile, record),
    correct: record.correct,
    ts: record.ts,
    profileId: profileId(profile),
    gameVariant: profile.gameVariant,
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: record.street,
    evModel: profile.evModel,
    ante: profile.ante,
    rakeMode: profile.rakeMode,
    actionNode: record.actionNode,
    potType: record.potType,
    boardTextureKey: record.boardTextures.join("|"),
    heroPosition: record.heroPosition,
    villainPosition: record.villainPosition,
    positionPattern: record.positionPattern,
    chosen: record.chosen,
    recommended: record.recommended,
    strategyPackId: record.sourcePackId,
    strategyPackVersion: record.sourcePackVersion,
    strategyVerifiedAt: record.sourceVerifiedAt,
    strategyRuleId: record.sourceRuleId,
    confidence: record.sourceConfidence,
    strategyProvenance: record.sourceProvenance ?? null,
    ...(isValidResponseMs(record.responseMs) ? { responseMs: record.responseMs } : {}),
    ...(actionEv ?? {}),
  };
}

export function isPostflopResultRecord(value: unknown): value is PostflopResultRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PostflopResultRecord>;
  return (
    record.schema === POSTFLOP_RESULT_RECORD_SCHEMA &&
    typeof record.qid === "string" &&
    isPostflopAction(record.chosen) &&
    isPostflopAction(record.recommended) &&
    areActionsCompatibleWithNode(record.actionNode, record.chosen, record.recommended) &&
    typeof record.correct === "boolean" &&
    isPostflopStreet(record.street) &&
    isPostflopActionNode(record.actionNode) &&
    isPostflopPotType(record.potType) &&
    typeof record.spr === "number" &&
    Number.isFinite(record.spr) &&
    Array.isArray(record.boardTextures) &&
    record.boardTextures.every(isBoardTexture) &&
    typeof record.heroPosition === "string" &&
    typeof record.villainPosition === "string" &&
    isPostflopPositionPattern(record.positionPattern) &&
    (record.sourceKind === "STRATEGY_PACK" || record.sourceKind === "FALLBACK") &&
    (typeof record.sourcePackId === "string" || record.sourcePackId === null) &&
    (typeof record.sourcePackVersion === "string" || record.sourcePackVersion === null) &&
    (typeof record.sourceVerifiedAt === "string" || record.sourceVerifiedAt === null) &&
    typeof record.sourceRuleId === "string" &&
    (record.sourceConfidence === "LOW" ||
      record.sourceConfidence === "MEDIUM" ||
      record.sourceConfidence === "HIGH" ||
      record.sourceConfidence === null) &&
    typeof record.ts === "number" &&
    Number.isFinite(record.ts) &&
    isOptionalResponseMs(record.responseMs) &&
    isOptionalActionEvResult(record)
  );
}

export function isPostflopStatsV2BridgeRecord(
  value: unknown,
): value is PostflopStatsV2BridgeRecordLike {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PostflopStatsV2BridgeRecordLike>;
  return (
    record.schema === POSTFLOP_STATS_V2_BRIDGE_SCHEMA &&
    isOptionalSchemaVersion(record.schemaVersion) &&
    typeof record.qid === "string" &&
    isOptionalNonEmptyString(record.scenarioId) &&
    typeof record.correct === "boolean" &&
    typeof record.ts === "number" &&
    Number.isFinite(record.ts) &&
    typeof record.profileId === "string" &&
    typeof record.gameVariant === "string" &&
    typeof record.tableFormat === "string" &&
    typeof record.blindSpeed === "string" &&
    isPostflopStreet(record.street) &&
    typeof record.evModel === "string" &&
    (record.ante === undefined || isAnteMode(record.ante)) &&
    typeof record.rakeMode === "string" &&
    isPostflopActionNode(record.actionNode) &&
    isPostflopPotType(record.potType) &&
    typeof record.boardTextureKey === "string" &&
    typeof record.heroPosition === "string" &&
    typeof record.villainPosition === "string" &&
    isPostflopPositionPattern(record.positionPattern) &&
    isPostflopAction(record.chosen) &&
    isPostflopAction(record.recommended) &&
    areActionsCompatibleWithNode(record.actionNode, record.chosen, record.recommended) &&
    (typeof record.strategyPackId === "string" || record.strategyPackId === null) &&
    isOptionalNullableString(record.strategyPackVersion) &&
    isOptionalNullableString(record.strategyVerifiedAt) &&
    typeof record.strategyRuleId === "string" &&
    (record.confidence === "LOW" ||
      record.confidence === "MEDIUM" ||
      record.confidence === "HIGH" ||
      record.confidence === null) &&
    isOptionalResponseMs(record.responseMs) &&
    isOptionalBridgeActionEvResult(record)
  );
}

export function normalizePostflopStatsV2BridgeRecord(
  record: PostflopStatsV2BridgeRecordLike,
): PostflopStatsV2BridgeRecord {
  const completeActionEv = completePostflopActionEvFields(record);
  return {
    ...record,
    schemaVersion: isValidSchemaVersion(record.schemaVersion)
      ? Math.floor(record.schemaVersion)
      : hasAnyPostflopActionEvField(record) && !completeActionEv
        ? 4
        : POSTFLOP_STATS_V2_BRIDGE_RECORD_VERSION,
    ante: record.ante ?? parseAnteFromProfileId(record.profileId),
    ...(record.equivalentBestActions
      ? { equivalentBestActions: [...record.equivalentBestActions] }
      : {}),
  };
}

export function postflopScenarioId(
  profile: TrainingProfile,
  record: Pick<
    PostflopResultRecord,
    | "qid"
    | "street"
    | "actionNode"
    | "potType"
    | "spr"
    | "heroPosition"
    | "villainPosition"
    | "positionPattern"
  >,
): string {
  return [
    POSTFLOP_SCENARIO_ID_VERSION,
    profileId(profile),
    record.qid,
    record.street,
    record.actionNode,
    record.potType,
    `spr=${record.spr}`,
    `hero=${record.heroPosition}`,
    `villain=${record.villainPosition}`,
    `pattern=${record.positionPattern}`,
  ].join("|");
}

export function availablePostflopStatsDimensions(): PostflopStatsBreakdownDim[] {
  return [
    "gameVariant",
    "tableFormat",
    "blindSpeed",
    "evModel",
    "ante",
    "rakeMode",
    "street",
    "actionNode",
    "potType",
    "positionPattern",
    "positionPair",
    "boardTextureKey",
    "strategyPackId",
    "confidence",
    "sourceQuality",
  ];
}

export function breakdownPostflopStats(
  records: readonly PostflopStatsV2BridgeRecord[],
  dim: PostflopStatsBreakdownDim,
): PostflopStatsGroup[] {
  const groups = new Map<string, { total: number; correct: number }>();
  const order: string[] = [];

  for (const record of records) {
    const key = postflopDimKey(record, dim);
    let group = groups.get(key);
    if (group === undefined) {
      group = { total: 0, correct: 0 };
      groups.set(key, group);
      order.push(key);
    }
    group.total += 1;
    if (record.correct) group.correct += 1;
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    return {
      key,
      total: group.total,
      correct: group.correct,
      rate: successRate(group.total, group.correct),
    };
  });
}

function postflopDimKey(
  record: PostflopStatsV2BridgeRecord,
  dim: PostflopStatsBreakdownDim,
): string {
  if (dim === "positionPair") return `${record.heroPosition}_VS_${record.villainPosition}`;
  if (dim === "sourceQuality") return postflopSourceQualityKey(record);
  const value = record[dim];
  if (value === null || value === "") return "N/A";
  return String(value);
}

/**
 * How much a recorded answer is worth as evidence of progress.
 *
 * This used to read `confidence` alone, which is a quality label the pack author
 * sets - not a statement about where the content came from. The public heuristic
 * packs happen to carry LOW today, so heuristic answers land in PREVIEW; raise
 * one to MEDIUM, a plausible edit if that model is ever improved, and a player's
 * own statistics would start counting heuristic answers as PRODUCTION.
 *
 * Provenance is the structural fact, so it decides solver-versus-not and
 * confidence only grades solver-backed content. Records written before
 * provenance was stored keep the old classification rather than being
 * reinterpreted on a guess.
 */
function postflopSourceQualityKey(record: PostflopStatsV2BridgeRecord): string {
  if (!record.strategyPackId || record.confidence === null) return "FALLBACK";
  if (record.strategyProvenance === "PUBLIC_HEURISTIC") return "HEURISTIC";
  if (record.confidence === "LOW") return "PREVIEW";
  return "PRODUCTION";
}

function parseAnteFromProfileId(value: string): AnteMode {
  const ante = value.split("|")[5];
  return isAnteMode(ante) ? ante : DEFAULT_TRAINING_PROFILE.ante;
}

function successRate(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}

function isValidResponseMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalResponseMs(value: unknown): boolean {
  return value === undefined || isValidResponseMs(value);
}

function isOptionalActionEvResult(record: Partial<PostflopResultRecord>): boolean {
  if (!hasAnyPostflopActionEvField(record)) return true;
  return completePostflopActionEvFields(record) !== null;
}

type PostflopActionEvFields = Required<Pick<
  PostflopResultRecord,
  | "actionEvOutcome"
  | "chosenEvBb"
  | "bestEvBb"
  | "evLossBb"
  | "equivalentBestActions"
>>;

type PostflopActionEvCarrier = Partial<PostflopActionEvFields> & {
  actionNode?: PostflopActionNode;
};

function completePostflopActionEvFields(
  record: PostflopActionEvCarrier,
): PostflopActionEvFields | null {
  const equivalentBestActions = record.equivalentBestActions;
  return (
    isActionEvOutcome(record.actionEvOutcome) &&
    typeof record.chosenEvBb === "number" &&
    Number.isFinite(record.chosenEvBb) &&
    typeof record.bestEvBb === "number" &&
    Number.isFinite(record.bestEvBb) &&
    isFiniteNonNegative(record.evLossBb) &&
    Array.isArray(equivalentBestActions) &&
    equivalentBestActions.length > 0 &&
    areActionsCompatibleWithNode(record.actionNode, ...equivalentBestActions)
  )
    ? {
        actionEvOutcome: record.actionEvOutcome,
        chosenEvBb: record.chosenEvBb,
        bestEvBb: record.bestEvBb,
        evLossBb: record.evLossBb,
        equivalentBestActions: [...equivalentBestActions],
      }
    : null;
}

function hasAnyPostflopActionEvField(record: PostflopActionEvCarrier): boolean {
  return [
    record.actionEvOutcome,
    record.chosenEvBb,
    record.bestEvBb,
    record.evLossBb,
    record.equivalentBestActions,
  ].some((value) => value !== undefined);
}

function isOptionalBridgeActionEvResult(
  record: Partial<PostflopStatsV2BridgeRecordLike>,
): boolean {
  if (!hasAnyPostflopActionEvField(record)) return true;

  if (isValidSchemaVersion(record.schemaVersion) && record.schemaVersion >= 5) {
    return completePostflopActionEvFields(record) !== null;
  }

  return (
    isOptionalActionEvOutcome(record.actionEvOutcome) &&
    isOptionalFiniteNumber(record.chosenEvBb) &&
    isOptionalFiniteNumber(record.bestEvBb) &&
    (record.evLossBb === undefined || isFiniteNonNegative(record.evLossBb)) &&
    (
      record.equivalentBestActions === undefined ||
      (
        Array.isArray(record.equivalentBestActions) &&
        record.equivalentBestActions.length > 0 &&
        areActionsCompatibleWithNode(record.actionNode, ...record.equivalentBestActions)
      )
    )
  );
}

function isActionEvOutcome(value: unknown): value is ActionEvOutcome {
  return value === "BEST" ||
    value === "EQUIVALENT" ||
    value === "ACCEPTABLE" ||
    value === "MISTAKE";
}

function isOptionalActionEvOutcome(value: unknown): value is ActionEvOutcome | undefined {
  return value === undefined || isActionEvOutcome(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalNonEmptyString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isValidSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isOptionalSchemaVersion(value: unknown): boolean {
  return value === undefined || isValidSchemaVersion(value);
}

function isAnteMode(value: unknown): value is AnteMode {
  return value === "ON" || value === "OFF";
}

function isPostflopAction(value: unknown): value is PostflopAction {
  return typeof value === "string" && POSTFLOP_ACTIONS.includes(value as PostflopAction);
}

function areActionsCompatibleWithNode(
  node: PostflopActionNode | undefined,
  ...actions: readonly (PostflopAction | undefined)[]
): boolean {
  if (!isPostflopActionNode(node)) return false;
  return actions.every((action) => (
    action !== undefined && actionsForNode(node).includes(action)
  ));
}

function actionsForNode(node: PostflopActionNode): readonly PostflopAction[] {
  switch (node) {
    case "FLOP_FACING_BET":
    case "TURN_FACING_BET":
    case "RIVER_FACING_BET":
      return ["FOLD", "CALL", "RAISE"];
    case "SINGLE_RAISED_POT_CBET":
    case "THREE_BET_POT_CBET":
    case "TURN_BARREL":
    case "TURN_OOP_LEAD":
    case "RIVER_PRESSURE":
      return ["CHECK", "BET_SMALL", "BET_BIG"];
  }
}

function isPostflopStreet(value: unknown): value is PostflopStreet {
  return value === "FLOP" || value === "TURN" || value === "RIVER";
}

function isPostflopActionNode(value: unknown): value is PostflopActionNode {
  return (
    value === "SINGLE_RAISED_POT_CBET" ||
    value === "THREE_BET_POT_CBET" ||
    value === "FLOP_FACING_BET" ||
    value === "TURN_BARREL" ||
    value === "TURN_OOP_LEAD" ||
    value === "TURN_FACING_BET" ||
    value === "RIVER_PRESSURE" ||
    value === "RIVER_FACING_BET"
  );
}

function isPostflopPotType(value: unknown): value is PostflopPotType {
  return (
    value === "SINGLE_RAISED" ||
    value === "THREE_BET_POT" ||
    value === "LIMPED_POT"
  );
}

function isBoardTexture(value: unknown): value is BoardTexture {
  return (
    value === "paired" ||
    value === "monotone" ||
    value === "two-tone" ||
    value === "rainbow" ||
    value === "connected" ||
    value === "dry" ||
    value === "ace-high" ||
    value === "broadway-high" ||
    value === "low" ||
    value === "medium" ||
    value === "straight-possible" ||
    value === "flush-draw-heavy" ||
    value === "disconnected"
  );
}
