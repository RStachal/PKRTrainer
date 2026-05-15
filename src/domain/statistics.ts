export type SpotStat = {
  readonly attempts: number;
  readonly correct: number;
};

export type TrainingStatistics = {
  readonly bySpot: Record<string, SpotStat>;
};

export const EMPTY_STATISTICS: TrainingStatistics = {
  bySpot: {},
};

export function getSpotStat(
  statistics: TrainingStatistics,
  spotId: string,
): SpotStat {
  return statistics.bySpot[spotId] ?? { attempts: 0, correct: 0 };
}

export function getSuccessRate(stat: SpotStat): number | null {
  if (stat.attempts === 0) return null;
  return stat.correct / stat.attempts;
}

export function recordSpotAnswer(
  statistics: TrainingStatistics,
  spotId: string,
  wasCorrect: boolean,
): TrainingStatistics {
  const current = getSpotStat(statistics, spotId);

  return {
    bySpot: {
      ...statistics.bySpot,
      [spotId]: {
        attempts: current.attempts + 1,
        correct: current.correct + (wasCorrect ? 1 : 0),
      },
    },
  };
}
