import { STACK_BUCKETS, type StackBucket } from "./types";
import type { BlindSpeed, GameVariant } from "./trainingProfile";

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMinutes: number;
}

export interface BlindSchedule {
  gameVariant: Extract<GameVariant, "MTT" | "SNG">;
  blindSpeed: BlindSpeed;
  startingStack: number;
  levels: readonly BlindLevel[];
}

const MTT_REGULAR_LEVELS: readonly BlindLevel[] = [
  { level: 1, smallBlind: 100, bigBlind: 200, ante: 200, durationMinutes: 12 },
  { level: 2, smallBlind: 150, bigBlind: 300, ante: 300, durationMinutes: 12 },
  { level: 3, smallBlind: 200, bigBlind: 400, ante: 400, durationMinutes: 12 },
  { level: 4, smallBlind: 300, bigBlind: 600, ante: 600, durationMinutes: 12 },
  { level: 5, smallBlind: 400, bigBlind: 800, ante: 800, durationMinutes: 12 },
  { level: 6, smallBlind: 500, bigBlind: 1_000, ante: 1_000, durationMinutes: 12 },
];

const MTT_TURBO_LEVELS: readonly BlindLevel[] = [
  { level: 1, smallBlind: 100, bigBlind: 200, ante: 200, durationMinutes: 5 },
  { level: 2, smallBlind: 200, bigBlind: 400, ante: 400, durationMinutes: 5 },
  { level: 3, smallBlind: 300, bigBlind: 600, ante: 600, durationMinutes: 5 },
  { level: 4, smallBlind: 500, bigBlind: 1_000, ante: 1_000, durationMinutes: 5 },
  { level: 5, smallBlind: 800, bigBlind: 1_600, ante: 1_600, durationMinutes: 5 },
  { level: 6, smallBlind: 1_200, bigBlind: 2_400, ante: 2_400, durationMinutes: 5 },
];

const SNG_REGULAR_LEVELS: readonly BlindLevel[] = [
  { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 8 },
  { level: 2, smallBlind: 15, bigBlind: 30, ante: 0, durationMinutes: 8 },
  { level: 3, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 8 },
  { level: 4, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 8 },
  { level: 5, smallBlind: 75, bigBlind: 150, ante: 15, durationMinutes: 8 },
  { level: 6, smallBlind: 100, bigBlind: 200, ante: 20, durationMinutes: 8 },
];

const SNG_TURBO_LEVELS: readonly BlindLevel[] = [
  { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationMinutes: 3 },
  { level: 2, smallBlind: 25, bigBlind: 50, ante: 5, durationMinutes: 3 },
  { level: 3, smallBlind: 50, bigBlind: 100, ante: 10, durationMinutes: 3 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 20, durationMinutes: 3 },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 30, durationMinutes: 3 },
  { level: 6, smallBlind: 250, bigBlind: 500, ante: 50, durationMinutes: 3 },
];

export const FIXED_BB_STACK_BUCKETS: readonly StackBucket[] = STACK_BUCKETS;

const SCHEDULES: Record<"MTT" | "SNG", Record<BlindSpeed, BlindSchedule>> = {
  MTT: {
    REGULAR: {
      gameVariant: "MTT",
      blindSpeed: "REGULAR",
      startingStack: 30_000,
      levels: MTT_REGULAR_LEVELS,
    },
    TURBO: {
      gameVariant: "MTT",
      blindSpeed: "TURBO",
      startingStack: 30_000,
      levels: MTT_TURBO_LEVELS,
    },
  },
  SNG: {
    REGULAR: {
      gameVariant: "SNG",
      blindSpeed: "REGULAR",
      startingStack: 1_500,
      levels: SNG_REGULAR_LEVELS,
    },
    TURBO: {
      gameVariant: "SNG",
      blindSpeed: "TURBO",
      startingStack: 1_500,
      levels: SNG_TURBO_LEVELS,
    },
  },
};

export function blindScheduleFor(
  gameVariant: Extract<GameVariant, "MTT" | "SNG">,
  blindSpeed: BlindSpeed,
): BlindSchedule {
  return SCHEDULES[gameVariant][blindSpeed];
}

export function levelByNumber(
  schedule: BlindSchedule,
  level: number,
): BlindLevel | undefined {
  return schedule.levels.find((item) => item.level === level);
}

export function stackInBigBlinds(chips: number, level: BlindLevel): number {
  if (!Number.isFinite(chips) || chips < 0) return 0;
  return chips / level.bigBlind;
}

export function roundedStackBucket(bb: number): StackBucket {
  let best = STACK_BUCKETS[0];
  let bestDistance = Math.abs(bb - best);

  for (const bucket of STACK_BUCKETS) {
    const distance = Math.abs(bb - bucket);
    if (distance < bestDistance) {
      best = bucket;
      bestDistance = distance;
    }
  }

  return best;
}

export function stackBucketAtLevel(chips: number, level: BlindLevel): StackBucket {
  return roundedStackBucket(stackInBigBlinds(chips, level));
}
