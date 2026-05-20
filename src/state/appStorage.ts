import type { CategoryOptionPhase } from "../domain/constants";
import {
  EMPTY_STATISTICS,
  type SpotStat,
  type TrainingStatistics,
} from "../domain/statistics";
import {
  EMPTY_TRAINING_PROGRESS,
  MAX_BLOCK_SIZE,
  MIN_BLOCK_SIZE,
  type QuestionProgress,
  type TrainingProgress,
} from "../domain/trainingSession";
import { TRAINING_FORMATS, type TrainingFormatId } from "../domain/trainingFormat";
import type { StrictMode, TrainingMode } from "../domain/types";

export const APP_STATE_KEY = "pkrtrainer_v2_app_state_v2";
export const APP_STATISTICS_KEY = "pkrtrainer_v2_statistics_v1";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type PersistedSessionSettings = {
  readonly format: TrainingFormatId;
  readonly phase: CategoryOptionPhase;
  readonly blockSize: number;
  readonly seed: number;
  readonly mode: TrainingMode;
  readonly strict: StrictMode;
};

export type AppStorageState = {
  readonly statistics: TrainingStatistics;
  readonly progress: TrainingProgress;
  readonly settings: PersistedSessionSettings | null;
};

type PersistedAppStateV2 = {
  readonly version: 2;
  readonly statistics: TrainingStatistics;
  readonly progress: TrainingProgress;
  readonly settings: PersistedSessionSettings;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTrueRecord(value: unknown): value is Readonly<Record<string, true>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => entry === true);
}

function isSpotStat(value: unknown): value is SpotStat {
  if (!isRecord(value)) return false;

  return (
    typeof value.attempts === "number" &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 0 &&
    typeof value.correct === "number" &&
    Number.isInteger(value.correct) &&
    value.correct >= 0 &&
    value.correct <= value.attempts
  );
}

function isQuestionProgress(value: unknown): value is QuestionProgress {
  if (!isRecord(value)) return false;

  return (
    typeof value.answered === "number" &&
    Number.isInteger(value.answered) &&
    value.answered >= 0 &&
    typeof value.correct === "number" &&
    Number.isInteger(value.correct) &&
    value.correct >= 0 &&
    value.correct <= value.answered
  );
}

function isFormat(value: unknown): value is TrainingFormatId {
  return (
    typeof value === "string" &&
    TRAINING_FORMATS.some((format) => format.id === value)
  );
}

function isPhase(value: unknown): value is CategoryOptionPhase {
  return (
    value === "ALL" ||
    value === "PREFLOP" ||
    value === "FLOP" ||
    value === "TURN" ||
    value === "RIVER"
  );
}

function isMode(value: unknown): value is TrainingMode {
  return value === "MIXED" || value === "MISSED";
}

function isStrict(value: unknown): value is StrictMode {
  return value === "LENIENT" || value === "STRICT";
}

function parseJson(value: string | null): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseStatisticsObject(value: unknown): TrainingStatistics {
  if (!isRecord(value) || !isRecord(value.bySpot)) return EMPTY_STATISTICS;

  const entries = Object.entries(value.bySpot).filter(
    (entry): entry is [string, SpotStat] => isSpotStat(entry[1]),
  );

  return {
    bySpot: Object.fromEntries(entries),
  };
}

function parseProgress(value: unknown): TrainingProgress {
  if (!isRecord(value)) return EMPTY_TRAINING_PROGRESS;
  if (
    typeof value.answered !== "number" ||
    !Number.isInteger(value.answered) ||
    value.answered < 0 ||
    typeof value.correct !== "number" ||
    !Number.isInteger(value.correct) ||
    value.correct < 0 ||
    value.correct > value.answered ||
    typeof value.streak !== "number" ||
    !Number.isInteger(value.streak) ||
    value.streak < 0 ||
    !isTrueRecord(value.seen) ||
    !isTrueRecord(value.missed) ||
    !isRecord(value.byCategory)
  ) {
    return EMPTY_TRAINING_PROGRESS;
  }

  const byCategory = Object.entries(value.byCategory).filter(
    (entry): entry is [string, QuestionProgress] => isQuestionProgress(entry[1]),
  );

  return {
    answered: value.answered,
    correct: value.correct,
    streak: value.streak,
    seen: value.seen,
    missed: value.missed,
    byCategory: Object.fromEntries(byCategory),
  };
}

function parseSettings(value: unknown): PersistedSessionSettings | null {
  if (!isRecord(value)) return null;

  const blockSize = value.blockSize;
  const seed = value.seed;

  if (
    !isFormat(value.format) ||
    !isPhase(value.phase) ||
    typeof blockSize !== "number" ||
    !Number.isInteger(blockSize) ||
    blockSize < MIN_BLOCK_SIZE ||
    blockSize > MAX_BLOCK_SIZE ||
    typeof seed !== "number" ||
    !Number.isInteger(seed) ||
    !isMode(value.mode) ||
    !isStrict(value.strict)
  ) {
    return null;
  }

  return {
    format: value.format,
    phase: value.phase,
    blockSize,
    seed,
    mode: value.mode,
    strict: value.strict,
  };
}

export function parseStatistics(value: string | null): TrainingStatistics {
  return parseStatisticsObject(parseJson(value));
}

export function parseAppStorageState(value: string | null): AppStorageState | null {
  const parsed = parseJson(value);
  if (!isRecord(parsed) || parsed.version !== 2) return null;

  const settings = parseSettings(parsed.settings);
  if (!settings) return null;

  return {
    statistics: parseStatisticsObject(parsed.statistics),
    progress: parseProgress(parsed.progress),
    settings,
  };
}

export function loadAppState(storage: StorageLike): AppStorageState {
  const persisted = parseAppStorageState(storage.getItem(APP_STATE_KEY));
  if (persisted) return persisted;

  return {
    statistics: loadStatistics(storage),
    progress: EMPTY_TRAINING_PROGRESS,
    settings: null,
  };
}

export function saveAppState(
  storage: StorageLike,
  state: PersistedAppStateV2,
): void {
  storage.setItem(APP_STATE_KEY, JSON.stringify(state));
}

export function resetAppState(storage: StorageLike): void {
  storage.removeItem(APP_STATE_KEY);
  storage.removeItem(APP_STATISTICS_KEY);
}

export function loadStatistics(storage: StorageLike): TrainingStatistics {
  return parseStatistics(storage.getItem(APP_STATISTICS_KEY));
}

export function saveStatistics(
  storage: StorageLike,
  statistics: TrainingStatistics,
): void {
  storage.setItem(APP_STATISTICS_KEY, JSON.stringify(statistics));
}

export function resetStatistics(storage: StorageLike): void {
  storage.removeItem(APP_STATISTICS_KEY);
}
