import type {
  BoardTexture,
  PostflopAction,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopRecommendationSource,
  PostflopStreet,
} from "../core/postflopGenerator";
import type {
  PostflopActionNode,
  PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
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
import type { Position } from "../core/types";

export const POSTFLOP_RESULT_RECORD_SCHEMA = "postflop_result_record_v1";
export const POSTFLOP_STATS_V2_BRIDGE_SCHEMA = "postflop_stats_v2_bridge_v1";

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
  sourceRuleId: string;
  sourceConfidence: "LOW" | "MEDIUM" | "HIGH" | null;
  ts: number;
  responseMs?: number;
}

export interface PostflopStatsV2BridgeRecord {
  schema: typeof POSTFLOP_STATS_V2_BRIDGE_SCHEMA;
  qid: string;
  correct: boolean;
  ts: number;
  profileId: string;
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: PostflopStreet;
  evModel: EvModel;
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
  strategyRuleId: string;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  responseMs?: number;
}

export interface PostflopStatsV2BridgeOptions {
  profile?: Partial<TrainingProfile>;
}

export type PostflopStatsBreakdownDim =
  | "street"
  | "actionNode"
  | "boardTextureKey"
  | "strategyPackId"
  | "confidence";

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
  return {
    schema: POSTFLOP_RESULT_RECORD_SCHEMA,
    qid: spot.id,
    chosen,
    recommended: spot.recommendedAction,
    correct: chosen === spot.recommendedAction,
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
    sourceRuleId: source.ruleId,
    sourceConfidence: source.kind === "STRATEGY_PACK" ? source.confidence : null,
    ts,
    ...(isValidResponseMs(responseMs) ? { responseMs } : {}),
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

  return {
    schema: POSTFLOP_STATS_V2_BRIDGE_SCHEMA,
    qid: record.qid,
    correct: record.correct,
    ts: record.ts,
    profileId: profileId(profile),
    gameVariant: profile.gameVariant,
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: record.street,
    evModel: profile.evModel,
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
    strategyRuleId: record.sourceRuleId,
    confidence: record.sourceConfidence,
    ...(isValidResponseMs(record.responseMs) ? { responseMs: record.responseMs } : {}),
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
    typeof record.sourceRuleId === "string" &&
    (record.sourceConfidence === "LOW" ||
      record.sourceConfidence === "MEDIUM" ||
      record.sourceConfidence === "HIGH" ||
      record.sourceConfidence === null) &&
    typeof record.ts === "number" &&
    Number.isFinite(record.ts) &&
    isOptionalResponseMs(record.responseMs)
  );
}

export function isPostflopStatsV2BridgeRecord(
  value: unknown,
): value is PostflopStatsV2BridgeRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PostflopStatsV2BridgeRecord>;
  return (
    record.schema === POSTFLOP_STATS_V2_BRIDGE_SCHEMA &&
    typeof record.qid === "string" &&
    typeof record.correct === "boolean" &&
    typeof record.ts === "number" &&
    Number.isFinite(record.ts) &&
    typeof record.profileId === "string" &&
    typeof record.gameVariant === "string" &&
    typeof record.tableFormat === "string" &&
    typeof record.blindSpeed === "string" &&
    isPostflopStreet(record.street) &&
    typeof record.evModel === "string" &&
    typeof record.rakeMode === "string" &&
    isPostflopActionNode(record.actionNode) &&
    isPostflopPotType(record.potType) &&
    typeof record.boardTextureKey === "string" &&
    typeof record.heroPosition === "string" &&
    typeof record.villainPosition === "string" &&
    isPostflopPositionPattern(record.positionPattern) &&
    isPostflopAction(record.chosen) &&
    isPostflopAction(record.recommended) &&
    (typeof record.strategyPackId === "string" || record.strategyPackId === null) &&
    typeof record.strategyRuleId === "string" &&
    (record.confidence === "LOW" ||
      record.confidence === "MEDIUM" ||
      record.confidence === "HIGH" ||
      record.confidence === null) &&
    isOptionalResponseMs(record.responseMs)
  );
}

export function availablePostflopStatsDimensions(): PostflopStatsBreakdownDim[] {
  return [
    "street",
    "actionNode",
    "boardTextureKey",
    "strategyPackId",
    "confidence",
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
  const value = record[dim];
  if (value === null || value === "") return "N/A";
  return String(value);
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

function isPostflopAction(value: unknown): value is PostflopAction {
  return value === "CHECK" || value === "BET_SMALL" || value === "BET_BIG";
}

function isPostflopStreet(value: unknown): value is PostflopStreet {
  return value === "FLOP" || value === "TURN" || value === "RIVER";
}

function isPostflopActionNode(value: unknown): value is PostflopActionNode {
  return (
    value === "SINGLE_RAISED_POT_CBET" ||
    value === "THREE_BET_POT_CBET" ||
    value === "TURN_BARREL" ||
    value === "RIVER_PRESSURE"
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

function isPostflopPositionPattern(value: unknown): value is PostflopPositionPattern {
  return (
    value === "EP_VS_BB" ||
    value === "BTN_VS_BB" ||
    value === "SB_VS_BB" ||
    value === "OOP_RAISER_VS_IP_CALLER" ||
    value === "OOP_CALLER_VS_IP_3BETTOR"
  );
}
