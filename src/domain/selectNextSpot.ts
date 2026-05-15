import type { TrainingSpot } from "./spot";
import { getSpotStat, getSuccessRate, type TrainingStatistics } from "./statistics";
import type { TrainingFormatId } from "./trainingFormat";
import type { CategoryPhase } from "./constants";

export type SpotSelectionFilter = {
  readonly format?: TrainingFormatId;
  readonly phase?: CategoryPhase;
};

export function getSpotWeight(
  spot: TrainingSpot,
  statistics: TrainingStatistics,
): number {
  const stat = getSpotStat(statistics, spot.id);
  const successRate = getSuccessRate(stat);

  if (successRate === null) return 5;

  const weaknessWeight = 1 + (1 - successRate) * 3;
  const practiceDecay = 1 / Math.sqrt(stat.attempts);

  return weaknessWeight + practiceDecay;
}

export function selectNextSpot(
  spots: readonly TrainingSpot[],
  statistics: TrainingStatistics,
  random: () => number,
  filter: SpotSelectionFilter = {},
): TrainingSpot | null {
  const candidates = spots.filter((spot) => {
    if (filter.format && spot.format !== filter.format) return false;
    if (filter.phase && spot.phase !== filter.phase) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  const weighted = candidates.map((spot) => ({
    spot,
    weight: getSpotWeight(spot, statistics),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * totalWeight;

  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.spot;
  }

  return weighted[weighted.length - 1].spot;
}
