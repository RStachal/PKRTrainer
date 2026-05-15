import {
  EMPTY_STATISTICS,
  type SpotStat,
  type TrainingStatistics,
} from "../domain/statistics";

export const APP_STATISTICS_KEY = "pkrtrainer_v2_statistics_v1";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function isSpotStat(value: unknown): value is SpotStat {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.attempts === "number" &&
    Number.isInteger(candidate.attempts) &&
    candidate.attempts >= 0 &&
    typeof candidate.correct === "number" &&
    Number.isInteger(candidate.correct) &&
    candidate.correct >= 0 &&
    candidate.correct <= candidate.attempts
  );
}

export function parseStatistics(value: string | null): TrainingStatistics {
  if (!value) return EMPTY_STATISTICS;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null) return EMPTY_STATISTICS;

    const bySpot = (parsed as Record<string, unknown>).bySpot;
    if (typeof bySpot !== "object" || bySpot === null) return EMPTY_STATISTICS;

    const entries = Object.entries(bySpot).filter((entry): entry is [string, SpotStat] =>
      isSpotStat(entry[1]),
    );

    return {
      bySpot: Object.fromEntries(entries),
    };
  } catch {
    return EMPTY_STATISTICS;
  }
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
