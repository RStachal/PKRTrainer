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

/**
 * Prize-pool equity of each stack, by Malmuth-Harville.
 *
 * The chance of finishing first is a player's share of the chips; the chance of
 * finishing second is, for each other player finishing first, their share times
 * this player's share of what remains. Recursing that over the places that pay
 * gives an equity per player. Memoised on the set of players already placed, so
 * a nine-handed table costs a few hundred steps rather than nine factorial.
 */
export function icmEquity(
  stacks: readonly number[],
  payouts: readonly number[],
): number[] {
  const n = stacks.length;
  const paid = Math.min(payouts.length, n);
  const equity = new Array<number>(n).fill(0);
  const memo = new Map<number, number>();

  const remainingChips = (placed: number): number => {
    const cached = memo.get(placed);
    if (cached !== undefined) return cached;
    let total = 0;
    for (let i = 0; i < n; i += 1) if ((placed & (1 << i)) === 0) total += stacks[i];
    memo.set(placed, total);
    return total;
  };

  const walk = (placed: number, place: number, probability: number): void => {
    if (place >= paid || probability <= 1e-12) return;
    const pool = remainingChips(placed);
    if (pool <= 0) return;
    for (let i = 0; i < n; i += 1) {
      if ((placed & (1 << i)) !== 0) continue;
      const chance = probability * (stacks[i] / pool);
      equity[i] += chance * payouts[place];
      walk(placed | (1 << i), place + 1, chance);
    }
  };

  walk(0, 0, 1);
  return equity;
}

/**
 * How much more equity a call needs because of the payout structure.
 *
 * Bubble factor is the ratio of what a call risks to what it gains, both in
 * prize-pool equity rather than chips. Divide chip pot odds by it to get the real
 * odds, which is the whole adjustment:
 *
 *   odds_icm = odds_chips / bubbleFactor
 *   requiredEquity = 1 / (1 + odds_icm)
 *
 * The previous version of this function was a table of invented constants - 1.05
 * early, 2.2 on the bubble, plus a fudge for stack rank - with no derivation
 * behind any of them. They were also wrong in a consistent direction: it put a
 * chip leader at 1.8 to 2.0 where the real figure is 1.3, because a leader risks
 * far less than the short stacks do. That is exactly the asymmetry the concept
 * exists to express, and a per-player constant cannot express it at all.
 *
 * It is deliberately pairwise. A call is against a particular opponent, and how
 * much it costs depends on that opponent's stack as well as the hero's.
 *
 * Cash games fall out at 1: with no ladder, equity is linear in chips, so risk
 * and reward are equal and the adjustment vanishes. That is the hook for a cash
 * conversion later - the same code path with a flat payout.
 */
export function bubbleFactor(
  stacks: readonly number[],
  payouts: readonly number[],
  heroIndex: number,
  villainIndex: number,
): number {
  const hero = stacks[heroIndex];
  const villain = stacks[villainIndex];
  if (hero === undefined || villain === undefined || hero <= 0 || villain <= 0) return 1;

  const atRisk = Math.min(hero, villain);
  const onFold = icmEquity(stacks, payouts)[heroIndex];

  const lost = stacks.slice();
  lost[heroIndex] = hero - atRisk;
  lost[villainIndex] = villain + atRisk;
  const onLoss = icmEquity(lost, payouts)[heroIndex];

  const won = stacks.slice();
  won[heroIndex] = hero + atRisk;
  won[villainIndex] = villain - atRisk;
  const onWin = icmEquity(won, payouts)[heroIndex];

  const gain = onWin - onFold;
  if (gain <= 1e-9) return 1;
  return (onFold - onLoss) / gain;
}

/** Chip pot odds adjusted for the payout ladder, and the equity they demand. */
export function requiredEquityWithIcm(chipOdds: number, factor: number): number {
  const realOdds = chipOdds / Math.max(factor, 1e-9);
  return 1 / (1 + realOdds);
}

/**
 * Kept for callers that only know the shape of the tournament, not the stacks.
 *
 * Now derived rather than guessed: it builds an even-stack table of the size and
 * payout given and measures the factor on it.
 */
export function estimateBubbleFactor(
  payoutStructure: PayoutStructure,
  distribution: StackDistribution,
): number {
  const stacks = distribution.stacks.map((stack) => stack.stackBB);
  if (stacks.length < 2) return 1;
  const villain = distribution.heroIndex === 0 ? 1 : 0;
  const factor = bubbleFactor(
    stacks,
    normalizePayoutStructure(payoutStructure).payouts,
    distribution.heroIndex,
    villain,
  );
  return Math.round(factor * 10) / 10;
}
