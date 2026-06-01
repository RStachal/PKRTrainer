import type { BlindSpeed, TableFormat } from "./trainingProfile";
import type { Position } from "./types";

export type IcmSpotType = "PUSH_FOLD" | "CALL_ALL_IN" | "REJAM";

export interface PayoutStructure {
  id: string;
  paidPlaces: number;
  payouts: readonly number[];
}

export interface IcmPlayerStack {
  position?: Position;
  stackBB: number;
}

export interface StackDistribution {
  remainingPlayers: number;
  heroIndex: number;
  stacks: readonly IcmPlayerStack[];
}

export interface SngIcmContext {
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  payoutStructure: PayoutStructure;
  stackDistribution: StackDistribution;
  bubbleFactor: number;
  spotType: IcmSpotType;
}

export const SNG_PAYOUT_PRESETS = {
  SNG_9_MAX_TOP_3: {
    id: "SNG_9_MAX_TOP_3",
    paidPlaces: 3,
    payouts: [0.5, 0.3, 0.2],
  },
  SNG_6_MAX_TOP_2: {
    id: "SNG_6_MAX_TOP_2",
    paidPlaces: 2,
    payouts: [0.65, 0.35],
  },
  WINNER_TAKE_ALL: {
    id: "WINNER_TAKE_ALL",
    paidPlaces: 1,
    payouts: [1],
  },
} as const satisfies Record<string, PayoutStructure>;

export interface BuildSngIcmContextInput {
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  payoutStructure: PayoutStructure;
  stackDistribution: StackDistribution;
  spotType: IcmSpotType;
  bubbleFactor?: number;
}

export function buildSngIcmContext(input: BuildSngIcmContextInput): SngIcmContext {
  const payoutErrors = validatePayoutStructure(input.payoutStructure);
  if (payoutErrors.length > 0) {
    throw new Error(`Invalid payout structure: ${payoutErrors.join("; ")}`);
  }

  const stackErrors = validateStackDistribution(input.stackDistribution);
  if (stackErrors.length > 0) {
    throw new Error(`Invalid stack distribution: ${stackErrors.join("; ")}`);
  }

  return {
    tableFormat: input.tableFormat,
    blindSpeed: input.blindSpeed,
    payoutStructure: normalizePayoutStructure(input.payoutStructure),
    stackDistribution: input.stackDistribution,
    spotType: input.spotType,
    bubbleFactor: input.bubbleFactor ?? estimateBubbleFactor(
      input.payoutStructure,
      input.stackDistribution,
    ),
  };
}

export function normalizePayoutStructure(structure: PayoutStructure): PayoutStructure {
  const total = structure.payouts.reduce((sum, payout) => sum + payout, 0);
  if (total <= 0) return structure;

  return {
    id: structure.id,
    paidPlaces: structure.paidPlaces,
    payouts: structure.payouts.map((payout) => payout / total),
  };
}

export function validatePayoutStructure(structure: PayoutStructure): string[] {
  const errors: string[] = [];

  if (structure.id.trim().length === 0) errors.push("id is required");
  if (!Number.isInteger(structure.paidPlaces) || structure.paidPlaces <= 0) {
    errors.push("paidPlaces must be a positive integer");
  }
  if (structure.payouts.length !== structure.paidPlaces) {
    errors.push("payouts length must equal paidPlaces");
  }
  if (structure.payouts.some((payout) => !Number.isFinite(payout) || payout <= 0)) {
    errors.push("all payouts must be positive finite numbers");
  }
  for (let i = 1; i < structure.payouts.length; i += 1) {
    if (structure.payouts[i] > structure.payouts[i - 1]) {
      errors.push("payouts must be sorted from highest to lowest");
      break;
    }
  }

  return errors;
}

export function validateStackDistribution(distribution: StackDistribution): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(distribution.remainingPlayers) || distribution.remainingPlayers <= 1) {
    errors.push("remainingPlayers must be an integer greater than 1");
  }
  if (distribution.stacks.length !== distribution.remainingPlayers) {
    errors.push("stacks length must equal remainingPlayers");
  }
  if (
    !Number.isInteger(distribution.heroIndex) ||
    distribution.heroIndex < 0 ||
    distribution.heroIndex >= distribution.stacks.length
  ) {
    errors.push("heroIndex must point to an existing stack");
  }
  if (distribution.stacks.some((stack) => !Number.isFinite(stack.stackBB) || stack.stackBB <= 0)) {
    errors.push("all stacks must be positive finite BB values");
  }

  return errors;
}

export function heroStackRank(distribution: StackDistribution): number {
  const hero = distribution.stacks[distribution.heroIndex];
  if (hero === undefined) return 0;

  return distribution.stacks
    .filter((stack) => stack.stackBB > hero.stackBB)
    .length + 1;
}

export function estimateBubbleFactor(
  payoutStructure: PayoutStructure,
  distribution: StackDistribution,
): number {
  const distanceToBubble = distribution.remainingPlayers - payoutStructure.paidPlaces;
  const rank = heroStackRank(distribution);
  const middleRank = Math.ceil(distribution.remainingPlayers / 2);

  let base = 1.05;
  if (distanceToBubble <= 0) base = 2.2;
  else if (distanceToBubble === 1) base = 2.0;
  else if (distanceToBubble === 2) base = 1.55;
  else if (distanceToBubble <= 4) base = 1.25;

  const stackPressure = rank === 1
    ? -0.2
    : rank >= middleRank
      ? 0.25
      : 0;

  return clampToTenth(base + stackPressure, 1, 3);
}

function clampToTenth(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}
