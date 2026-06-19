import type {
  PostflopAtomicAction,
  PostflopLine,
  PostflopLineAction,
  PostflopPolicyAction,
  PostflopStreetState,
} from "../core/postflopLineSimulator";
import type { PostflopAction, PostflopStreet } from "../core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../core/postflopTrainingSpot";
import type { TrainingProfile } from "../core/trainingProfile";
import {
  bridgePostflopResultRecordToStatsV2,
  buildPostflopResultRecord,
  isPostflopStatsV2BridgeRecord,
  normalizePostflopStatsV2BridgeRecord,
  type PostflopStatsV2BridgeRecord,
} from "./postflopResultRecord";

export const POSTFLOP_LINE_RESULT_RECORD_SCHEMA = "postflop_line_result_record_v1";
export const POSTFLOP_LINE_RESULT_RECORD_VERSION = 1;

export interface PostflopLineStreetResultRecord {
  index: number;
  street: PostflopStreet;
  record: PostflopStatsV2BridgeRecord;
  potBBBefore: number;
  effectiveStackBBBefore: number;
  potBBAfter: number;
  effectiveStackBBAfter: number;
}

export interface PostflopLineResultRecord {
  schema: typeof POSTFLOP_LINE_RESULT_RECORD_SCHEMA;
  schemaVersion: number;
  lineId: string;
  scenarioId?: string;
  seed: number;
  profileId: string;
  startedAt: number;
  completedAt: number;
  totalStreets: number;
  correctStreets: number;
  perfect: boolean;
  streetResults: readonly PostflopLineStreetResultRecord[];
  actionHistory: readonly PostflopLineAction[];
}

export interface PostflopLineResultOptions {
  profile?: Partial<TrainingProfile>;
  chosenByStreet?: Partial<Record<PostflopStreet, PostflopAction>>;
  startedAt?: number;
  completedAt?: number;
}

export function buildPostflopLineResultRecord(
  line: PostflopLine,
  options: PostflopLineResultOptions = {},
): PostflopLineResultRecord {
  const startedAt = validTimestamp(options.startedAt) ? options.startedAt : Date.now();
  const completedAt = validTimestamp(options.completedAt) ? options.completedAt : startedAt;
  const streetResults = line.streets.map((street, index) => {
    const trainingSpot = postflopSpotToTrainingSpot(street.spot);
    const chosen = options.chosenByStreet?.[street.street] ?? trainingSpot.recommendedAction;
    const result = buildPostflopResultRecord(trainingSpot, chosen, completedAt);
    const bridge = bridgePostflopResultRecordToStatsV2(result, {
      profile: {
        ...options.profile,
        street: street.street,
      },
    });
    const action = line.actionHistory[index];
    return {
      index,
      street: street.street,
      record: bridge,
      potBBBefore: action?.potBBBefore ?? trainingSpot.potBB,
      effectiveStackBBBefore: action?.effectiveStackBBBefore ?? trainingSpot.effectiveStackBB,
      potBBAfter: action?.potBBAfter ?? trainingSpot.potBB,
      effectiveStackBBAfter: action?.effectiveStackBBAfter ?? trainingSpot.effectiveStackBB,
    };
  });
  const correctStreets = streetResults.filter((street) => street.record.correct).length;
  const profileId = streetResults[0]?.record.profileId ?? "";
  const lineId = postflopLineId(line);

  return {
    schema: POSTFLOP_LINE_RESULT_RECORD_SCHEMA,
    schemaVersion: POSTFLOP_LINE_RESULT_RECORD_VERSION,
    lineId,
    scenarioId: postflopLineScenarioId(
      profileId,
      lineId,
      streetResults.map((street) => street.record.scenarioId ?? street.record.qid),
    ),
    seed: line.seed,
    profileId,
    startedAt,
    completedAt,
    totalStreets: streetResults.length,
    correctStreets,
    perfect: correctStreets === streetResults.length,
    streetResults,
    actionHistory: line.actionHistory.map(cloneLineAction),
  };
}

export function isPostflopLineResultRecord(value: unknown): value is PostflopLineResultRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PostflopLineResultRecord>;
  return (
    record.schema === POSTFLOP_LINE_RESULT_RECORD_SCHEMA &&
    isValidSchemaVersion(record.schemaVersion) &&
    typeof record.lineId === "string" &&
    (
      record.scenarioId === undefined ||
      (typeof record.scenarioId === "string" && record.scenarioId.length > 0)
    ) &&
    typeof record.seed === "number" &&
    Number.isFinite(record.seed) &&
    typeof record.profileId === "string" &&
    validTimestamp(record.startedAt) &&
    validTimestamp(record.completedAt) &&
    typeof record.totalStreets === "number" &&
    Number.isInteger(record.totalStreets) &&
    record.totalStreets >= 0 &&
    typeof record.correctStreets === "number" &&
    Number.isInteger(record.correctStreets) &&
    record.correctStreets >= 0 &&
    record.correctStreets <= record.totalStreets &&
    typeof record.perfect === "boolean" &&
    Array.isArray(record.streetResults) &&
    record.streetResults.length === record.totalStreets &&
    record.streetResults.every(isPostflopLineStreetResultRecord) &&
    Array.isArray(record.actionHistory) &&
    record.actionHistory.every(isPostflopLineAction)
  );
}

export function normalizePostflopLineResultRecord(
  record: PostflopLineResultRecord,
): PostflopLineResultRecord {
  return {
    ...record,
    schemaVersion: Math.floor(record.schemaVersion),
    streetResults: record.streetResults.map((street) => ({
      ...street,
      record: normalizePostflopStatsV2BridgeRecord(street.record),
    })),
    actionHistory: record.actionHistory.map(cloneLineAction),
  };
}

export function postflopLineId(line: Pick<PostflopLine, "seed" | "board">): string {
  return [
    "POSTFLOP_LINE",
    line.seed >>> 0,
    line.board.map((card) => `${card.rank}${card.suit}`).join("-"),
  ].join("|");
}

export function postflopLineScenarioId(
  profileId: string,
  lineId: string,
  streetScenarioIds: readonly string[],
): string {
  return [
    "postflop_line_scenario_v1",
    profileId,
    lineId,
    ...streetScenarioIds,
  ].join("|");
}

function isPostflopLineStreetResultRecord(
  value: unknown,
): value is PostflopLineStreetResultRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PostflopLineStreetResultRecord>;
  return (
    typeof record.index === "number" &&
    Number.isInteger(record.index) &&
    record.index >= 0 &&
    isPostflopStreet(record.street) &&
    isPostflopStatsV2BridgeRecord(record.record) &&
    isNonNegativeFinite(record.potBBBefore) &&
    isNonNegativeFinite(record.effectiveStackBBBefore) &&
    isNonNegativeFinite(record.potBBAfter) &&
    isNonNegativeFinite(record.effectiveStackBBAfter)
  );
}

function isPostflopLineAction(value: unknown): value is PostflopLineAction {
  if (typeof value !== "object" || value === null) return false;
  const action = value as Partial<PostflopLineAction>;
  return (
    isPostflopStreet(action.street) &&
    isPostflopAction(action.action) &&
    isNonNegativeFinite(action.potBBBefore) &&
    isNonNegativeFinite(action.effectiveStackBBBefore) &&
    isNonNegativeFinite(action.potBBAfter) &&
    isNonNegativeFinite(action.effectiveStackBBAfter) &&
    isOptionalNonNegativeFinite(action.amountToCallBB) &&
    isOptionalNonNegativeFinite(action.heroContributionBB) &&
    isOptionalNonNegativeFinite(action.villainContributionBB) &&
    (action.opponentResponse === undefined || isPostflopPolicyAction(action.opponentResponse)) &&
    (
      action.sequence === undefined ||
      (
        Array.isArray(action.sequence) &&
        action.sequence.every(isPostflopAtomicAction)
      )
    ) &&
    isOptionalPostflopStreetState(action.stateBefore) &&
    isOptionalPostflopStreetState(action.stateAfter)
  );
}

function isPostflopAtomicAction(value: unknown): value is PostflopAtomicAction {
  if (typeof value !== "object" || value === null) return false;
  const action = value as Partial<PostflopAtomicAction>;
  return (
    (action.actor === "HERO" || action.actor === "VILLAIN") &&
    isPostflopPolicyAction(action.action) &&
    isNonNegativeFinite(action.amountBB) &&
    isNonNegativeFinite(action.contributionAfterBB) &&
    isNonNegativeFinite(action.amountToCallBeforeBB) &&
    typeof action.allIn === "boolean" &&
    typeof action.fullRaise === "boolean" &&
    typeof action.bettingReopened === "boolean"
  );
}

function isPostflopPolicyAction(value: unknown): value is PostflopPolicyAction {
  return value === "CHECK" ||
    value === "CALL" ||
    value === "FOLD" ||
    value === "BET_SMALL" ||
    value === "BET_BIG" ||
    value === "RAISE" ||
    value === "ALL_IN";
}

function isOptionalPostflopStreetState(
  value: unknown,
): value is PostflopStreetState | undefined {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<PostflopStreetState>;
  return (
    isPostflopStreet(state.street) &&
    isNonNegativeFinite(state.potBB) &&
    isNonNegativeFinite(state.heroStackBB) &&
    isNonNegativeFinite(state.villainStackBB) &&
    isNonNegativeFinite(state.outstandingBetBB) &&
    isNonNegativeFinite(state.heroStreetContributionBB) &&
    isNonNegativeFinite(state.villainStreetContributionBB) &&
    (
      state.aggressor === null ||
      state.aggressor === "HERO" ||
      state.aggressor === "VILLAIN"
    ) &&
    typeof state.terminal === "boolean" &&
    (
      state.terminalReason === undefined ||
      state.terminalReason === "HERO_FOLD" ||
      state.terminalReason === "OPPONENT_FOLD" ||
      state.terminalReason === "STACK_EXHAUSTED" ||
      state.terminalReason === "SHOWDOWN"
    )
  );
}

function isPostflopStreet(value: unknown): value is PostflopStreet {
  return value === "FLOP" || value === "TURN" || value === "RIVER";
}

function isPostflopAction(value: unknown): value is PostflopAction {
  return (
    value === "CHECK" ||
    value === "BET_SMALL" ||
    value === "BET_BIG" ||
    value === "CALL" ||
    value === "RAISE" ||
    value === "FOLD"
  );
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalNonNegativeFinite(value: unknown): boolean {
  return value === undefined || isNonNegativeFinite(value);
}

function cloneLineAction(action: PostflopLineAction): PostflopLineAction {
  return {
    ...action,
    ...(action.sequence
      ? { sequence: action.sequence.map((step) => ({ ...step })) }
      : {}),
    ...(action.stateBefore ? { stateBefore: { ...action.stateBefore } } : {}),
    ...(action.stateAfter ? { stateAfter: { ...action.stateAfter } } : {}),
  };
}

function isValidSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
