import type {
  ActionContext,
  ActionKey,
  AnteMode,
  Position,
  StackBucket,
} from "../core/types";
import {
  DEFAULT_TRAINING_PROFILE,
  profileId,
  type BlindSpeed,
  type EvModel,
  type GameVariant,
  type RakeMode,
  type TableFormat,
  type TrainingProfile,
  type TrainingStreet,
} from "../core/trainingProfile";
import { currentMttPreflopRangePack } from "../data/ranges/mttPreflopRangePacks";
import { rangePackForTrainingProfile } from "../data/ranges/trainingRangePacks";
import type { ResultRecord } from "./statsStore";

export const RESULT_RECORD_V2_SCHEMA = "result_record_v2";

export interface ResultRecordV2 {
  schema: typeof RESULT_RECORD_V2_SCHEMA;
  qid: string;
  chosen: ActionKey;
  correct: boolean;
  context: ActionContext;
  position: Position;
  bucket: StackBucket;
  ts: number;
  profileId: string;
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: TrainingStreet;
  evModel: EvModel;
  ante: AnteMode;
  rakeMode: RakeMode;
  rangePackId: string;
  rangePackVersion: string;
  sourceVerifiedAt: string;
  responseMs?: number;
}

export interface UpgradeResultRecordOptions {
  profile?: TrainingProfile;
}

export function upgradeResultRecordToV2(
  record: ResultRecord,
  options: UpgradeResultRecordOptions = {},
): ResultRecordV2 {
  const ante = parseAnteFromQuestionId(record.qid) ?? DEFAULT_TRAINING_PROFILE.ante;
  const profile: TrainingProfile = {
    ...DEFAULT_TRAINING_PROFILE,
    ...options.profile,
    ante,
  };
  const pack = rangePackForStatsProfile(profile);

  return {
    schema: RESULT_RECORD_V2_SCHEMA,
    qid: record.qid,
    chosen: record.chosen,
    correct: record.correct,
    context: record.context,
    position: record.position,
    bucket: record.bucket,
    ts: record.ts,
    profileId: profileId(profile),
    gameVariant: profile.gameVariant,
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: profile.street,
    evModel: profile.evModel,
    ante: profile.ante,
    rakeMode: profile.rakeMode,
    rangePackId: pack.id,
    rangePackVersion: pack.version,
    sourceVerifiedAt: pack.verifiedAt,
    ...(isValidResponseMs(record.responseMs) ? { responseMs: record.responseMs } : {}),
  };
}

function rangePackForStatsProfile(profile: TrainingProfile) {
  const pack = rangePackForTrainingProfile(profile);
  if (pack) return pack;

  if (isLegacyMttPreflopProfile(profile)) {
    return currentMttPreflopRangePack(profile.ante);
  }

  throw new Error(`No RangePack for training profile ${profileId(profile)}.`);
}

function isLegacyMttPreflopProfile(profile: TrainingProfile): boolean {
  return (
    profile.gameVariant === "MTT" &&
    profile.tableFormat === "FULL_RING_9" &&
    profile.blindSpeed === "REGULAR" &&
    profile.street === "PREFLOP" &&
    profile.evModel === "CHIP_EV" &&
    profile.rakeMode === "NONE"
  );
}

export function migrateResultRecordsToV2(
  records: readonly ResultRecord[],
  options: UpgradeResultRecordOptions = {},
): ResultRecordV2[] {
  return records.map((record) => upgradeResultRecordToV2(record, options));
}

export function parseAnteFromQuestionId(qid: string): AnteMode | null {
  const parts = qid.split("|");
  const last = parts.at(-1);
  return last === "ON" || last === "OFF" ? last : null;
}

export function isResultRecordV2(value: unknown): value is ResultRecordV2 {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ResultRecordV2>;
  return (
    record.schema === RESULT_RECORD_V2_SCHEMA &&
    typeof record.qid === "string" &&
    typeof record.chosen === "string" &&
    typeof record.correct === "boolean" &&
    typeof record.context === "string" &&
    typeof record.position === "string" &&
    typeof record.bucket === "number" &&
    typeof record.ts === "number" &&
    typeof record.profileId === "string" &&
    typeof record.gameVariant === "string" &&
    typeof record.tableFormat === "string" &&
    typeof record.blindSpeed === "string" &&
    typeof record.street === "string" &&
    typeof record.evModel === "string" &&
    (record.ante === "ON" || record.ante === "OFF") &&
    typeof record.rakeMode === "string" &&
    typeof record.rangePackId === "string" &&
    typeof record.rangePackVersion === "string" &&
    typeof record.sourceVerifiedAt === "string" &&
    isOptionalResponseMs(record.responseMs)
  );
}

function isValidResponseMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalResponseMs(value: unknown): boolean {
  return value === undefined || isValidResponseMs(value);
}
