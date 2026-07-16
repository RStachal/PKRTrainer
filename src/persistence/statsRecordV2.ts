import type {
  ActionContext,
  ActionKey,
  AnteMode,
  Position,
  ScoringMode,
  Spot,
  StackBucket,
} from "../core/types";
import { preflopScenarioId } from "../core/preflopScenarioIdentity";
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
import {
  currentMttPreflopRangePack,
  mttPreflopRangePackForProfile,
} from "../data/ranges/mttPreflopRangePacks";
import type { ResultRecord } from "./statsStore";
import { PREFLOP_RESULT_IDENTITY_SCHEMA } from "./statsStore";
import type { RangePack } from "../data/ranges/rangePack";
import { evaluateActionEv, type ActionEvOutcome } from "../core/actionEv";

export const RESULT_RECORD_V2_SCHEMA = "result_record_v2";
export const LEGACY_UNKNOWN_PROFILE_ID = "LEGACY_UNKNOWN_PROFILE";
export type ResultProfileStatus = "KNOWN" | "LEGACY_UNKNOWN";

export interface ResultRecordV2 {
  schema: typeof RESULT_RECORD_V2_SCHEMA;
  qid: string;
  chosen: ActionKey;
  correct: boolean;
  context: ActionContext;
  position: Position;
  bucket: StackBucket;
  ts: number;
  scenarioId: string;
  profileStatus: ResultProfileStatus;
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
  scoringMode: ScoringMode | "UNKNOWN";
  responseMs?: number;
  actionEvOutcome?: ActionEvOutcome;
  chosenEvBb?: number;
  bestEvBb?: number;
  evLossBb?: number;
  equivalentBestActions?: readonly ActionKey[];
}

export interface UpgradeResultRecordOptions {
  profile?: TrainingProfile;
}

export function upgradeResultRecordToV2(
  record: ResultRecord,
  options: UpgradeResultRecordOptions = {},
): ResultRecordV2 {
  if (record.identity) {
    return {
      schema: RESULT_RECORD_V2_SCHEMA,
      qid: record.qid,
      chosen: record.chosen,
      correct: record.correct,
      context: record.context,
      position: record.position,
      bucket: record.bucket,
      ts: record.ts,
      scenarioId: record.identity.scenarioId,
      profileStatus: "KNOWN",
      profileId: record.identity.profileId,
      gameVariant: record.identity.gameVariant,
      tableFormat: record.identity.tableFormat,
      blindSpeed: record.identity.blindSpeed,
      street: record.identity.street,
      evModel: record.identity.evModel,
      ante: record.identity.ante,
      rakeMode: record.identity.rakeMode,
      rangePackId: record.identity.rangePackId,
      rangePackVersion: record.identity.rangePackVersion,
      sourceVerifiedAt: record.identity.sourceVerifiedAt,
      scoringMode: record.identity.scoringMode,
      ...(isValidResponseMs(record.responseMs) ? { responseMs: record.responseMs } : {}),
      ...actionEvFields(record),
    };
  }

  const ante = parseAnteFromQuestionId(record.qid) ?? DEFAULT_TRAINING_PROFILE.ante;
  const profile: TrainingProfile = {
    ...DEFAULT_TRAINING_PROFILE,
    ...options.profile,
    ante,
  };
  const hasExplicitProfile = options.profile !== undefined;
  const pack = hasExplicitProfile ? rangePackForStatsProfile(profile) : null;

  return {
    schema: RESULT_RECORD_V2_SCHEMA,
    qid: record.qid,
    chosen: record.chosen,
    correct: record.correct,
    context: record.context,
    position: record.position,
    bucket: record.bucket,
    ts: record.ts,
    scenarioId: `${hasExplicitProfile ? "preflop_scenario_v1" : "legacy_preflop_scenario"}|${
      hasExplicitProfile ? profileId(profile) : LEGACY_UNKNOWN_PROFILE_ID
    }|${record.qid}`,
    profileStatus: hasExplicitProfile ? "KNOWN" : "LEGACY_UNKNOWN",
    profileId: hasExplicitProfile ? profileId(profile) : LEGACY_UNKNOWN_PROFILE_ID,
    gameVariant: profile.gameVariant,
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    street: profile.street,
    evModel: profile.evModel,
    ante: profile.ante,
    rakeMode: profile.rakeMode,
    rangePackId: pack?.id ?? "LEGACY_UNKNOWN_STRATEGY",
    rangePackVersion: pack?.version ?? "unknown",
    sourceVerifiedAt: pack?.verifiedAt ?? "unknown",
    scoringMode: "UNKNOWN",
    ...(isValidResponseMs(record.responseMs) ? { responseMs: record.responseMs } : {}),
    ...actionEvFields(record),
  };
}

export interface BuildPreflopResultRecordOptions {
  spot: Spot;
  chosen: ActionKey;
  correct: boolean;
  profile: TrainingProfile;
  rangePack: Pick<RangePack, "id" | "version" | "verifiedAt">;
  scoringMode: ScoringMode;
  ts: number;
  responseMs?: number;
}

export function buildProfileAwarePreflopResultRecord(
  options: BuildPreflopResultRecordOptions,
): ResultRecord {
  const actionEv = options.spot.actionEvs
    ? evaluateActionEv(options.spot.actionEvs, options.chosen)
    : null;
  return {
    qid: options.spot.id,
    chosen: options.chosen,
    correct: options.correct,
    context: options.spot.context,
    position: options.spot.heroPos,
    bucket: options.spot.effStack,
    ts: options.ts,
    ...(isValidResponseMs(options.responseMs) ? { responseMs: options.responseMs } : {}),
    ...(actionEv
      ? {
          actionEvOutcome: actionEv.outcome,
          chosenEvBb: actionEv.chosenEvBb,
          bestEvBb: actionEv.bestEvBb,
          evLossBb: actionEv.evLossBb,
          equivalentBestActions: [...actionEv.bestActions],
        }
      : {}),
    identity: {
      schema: PREFLOP_RESULT_IDENTITY_SCHEMA,
      scenarioId: preflopScenarioId(options.profile, options.spot),
      profileId: profileId(options.profile),
      gameVariant: options.profile.gameVariant,
      tableFormat: options.profile.tableFormat,
      blindSpeed: options.profile.blindSpeed,
      street: options.profile.street,
      evModel: options.profile.evModel,
      ante: options.profile.ante,
      rakeMode: options.profile.rakeMode,
      rangePackId: options.rangePack.id,
      rangePackVersion: options.rangePack.version,
      sourceVerifiedAt: options.rangePack.verifiedAt,
      scoringMode: options.scoringMode,
    },
  };
}

function rangePackForStatsProfile(profile: TrainingProfile) {
  const pack = mttPreflopRangePackForProfile(profile);
  if (pack) return pack;

  if (isLegacyMttPreflopProfile(profile)) {
    return currentMttPreflopRangePack(profile.ante);
  }

  const candidate = candidatePackMetadata(profile);
  if (candidate) return candidate;

  throw new Error(`No RangePack for training profile ${profileId(profile)}.`);
}

function candidatePackMetadata(profile: TrainingProfile): {
  id: string;
  version: string;
  verifiedAt: string;
} | null {
  const table = profile.tableFormat === "FULL_RING_9" ? "full-ring-9" : "six-max";
  const speed = profile.blindSpeed === "REGULAR" ? "regular" : "turbo";
  const ante = profile.ante === "ON" ? "ante-on" : "ante-off";
  if (
    profile.gameVariant === "SNG" &&
    profile.street === "PREFLOP" &&
    profile.rakeMode === "NONE" &&
    (profile.evModel === "CHIP_EV" || profile.evModel === "ICM")
  ) {
    const model = profile.evModel === "CHIP_EV" ? "chip-ev" : "icm";
    return {
      id: `sng-${table}-${speed}-preflop-${model}-${ante}-candidate-v0`,
      version: "candidate-v0",
      verifiedAt: "2026-06-03",
    };
  }
  if (
    profile.gameVariant === "CASH" &&
    profile.tableFormat === "SIX_MAX" &&
    profile.blindSpeed === "REGULAR" &&
    profile.street === "PREFLOP" &&
    profile.evModel === "CHIP_EV" &&
    profile.ante === "OFF" &&
    (profile.rakeMode === "RAKE" || profile.rakeMode === "NO_RAKE")
  ) {
    return {
      id: `cash-six-max-regular-preflop-chip-ev-${
        profile.rakeMode === "RAKE" ? "rake" : "no-rake"
      }-candidate-v0`,
      version: "candidate-v0",
      verifiedAt: "2026-06-03",
    };
  }
  return null;
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
    typeof record.scenarioId === "string" &&
    (record.profileStatus === "KNOWN" || record.profileStatus === "LEGACY_UNKNOWN") &&
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
    (
      record.scoringMode === "LENIENT" ||
      record.scoringMode === "STRICT" ||
      record.scoringMode === "UNKNOWN"
    ) &&
    isOptionalResponseMs(record.responseMs) &&
    isOptionalActionEvOutcome(record.actionEvOutcome) &&
    isOptionalFiniteNumber(record.chosenEvBb) &&
    isOptionalFiniteNumber(record.bestEvBb) &&
    isOptionalNonNegativeFiniteNumber(record.evLossBb) &&
    isOptionalActionKeys(record.equivalentBestActions)
  );
}

function actionEvFields(record: ResultRecord): Partial<ResultRecordV2> {
  return {
    ...(isOptionalActionEvOutcome(record.actionEvOutcome) && record.actionEvOutcome
      ? { actionEvOutcome: record.actionEvOutcome }
      : {}),
    ...(isOptionalFiniteNumber(record.chosenEvBb) && record.chosenEvBb !== undefined
      ? { chosenEvBb: record.chosenEvBb }
      : {}),
    ...(isOptionalFiniteNumber(record.bestEvBb) && record.bestEvBb !== undefined
      ? { bestEvBb: record.bestEvBb }
      : {}),
    ...(isOptionalNonNegativeFiniteNumber(record.evLossBb) && record.evLossBb !== undefined
      ? { evLossBb: record.evLossBb }
      : {}),
    ...(isOptionalActionKeys(record.equivalentBestActions) && record.equivalentBestActions
      ? { equivalentBestActions: [...record.equivalentBestActions] }
      : {}),
  };
}

function isOptionalActionEvOutcome(value: unknown): value is ActionEvOutcome | undefined {
  return value === undefined ||
    value === "BEST" ||
    value === "EQUIVALENT" ||
    value === "ACCEPTABLE" ||
    value === "MISTAKE";
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalNonNegativeFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (
    typeof value === "number" && Number.isFinite(value) && value >= 0
  );
}

function isOptionalActionKeys(value: unknown): value is readonly ActionKey[] | undefined {
  return value === undefined || (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string")
  );
}

function isValidResponseMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalResponseMs(value: unknown): boolean {
  return value === undefined || isValidResponseMs(value);
}
