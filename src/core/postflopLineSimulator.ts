import {
  generatePostflopSpot,
  type PostflopAction,
  type PostflopConfig,
  type PostflopSpot,
  type PostflopStreet,
} from "./postflopGenerator";
import type { Card } from "./types";

export interface PostflopLineAction {
  street: PostflopStreet;
  action: PostflopAction;
  potBBBefore: number;
  effectiveStackBBBefore: number;
  potBBAfter: number;
  effectiveStackBBAfter: number;
}

export interface PostflopLineStreet {
  street: PostflopStreet;
  spot: PostflopSpot;
  actionHistory: readonly PostflopLineAction[];
}

export interface PostflopLine {
  seed: number;
  heroCards: [Card, Card];
  board: [Card, Card, Card, Card, Card];
  streets: readonly [PostflopLineStreet, PostflopLineStreet, PostflopLineStreet];
  actionHistory: readonly PostflopLineAction[];
}

export type PostflopLineConfig = Omit<
  PostflopConfig,
  "street" | "board" | "potBB" | "effectiveStackBB" | "priorFlopAction" | "priorTurnAction"
> & {
  board?: [Card, Card, Card, Card, Card];
  potBB?: number;
  effectiveStackBB?: number;
};

const LINE_STREETS = ["FLOP", "TURN", "RIVER"] as const satisfies readonly PostflopStreet[];

export function generatePostflopLine(config: PostflopLineConfig): PostflopLine {
  const riverSeedSpot = generatePostflopSpot({
    ...config,
    strategyResolver: undefined,
    street: "RIVER",
    board: config.board,
  });
  const heroCards = config.heroCards ?? riverSeedSpot.heroCards;
  const board = riverSeedSpot.board as [Card, Card, Card, Card, Card];
  const actionHistory: PostflopLineAction[] = [];
  const streets: PostflopLineStreet[] = [];
  let potBB = config.potBB ?? riverSeedSpot.potBB;
  let effectiveStackBB = config.effectiveStackBB ?? riverSeedSpot.effectiveStackBB;
  let priorFlopAction: PostflopAction | undefined;
  let priorTurnAction: PostflopAction | undefined;

  for (const street of LINE_STREETS) {
    const spot = generatePostflopSpot({
      ...config,
      seed: config.seed,
      street,
      heroCards,
      board,
      potBB,
      effectiveStackBB,
      priorFlopAction,
      priorTurnAction,
    });
    streets.push({
      street,
      spot,
      actionHistory: actionHistory.slice(),
    });

    const action = lineActionFromSpot(spot);
    actionHistory.push(action);
    potBB = action.potBBAfter;
    effectiveStackBB = action.effectiveStackBBAfter;
    if (street === "FLOP") priorFlopAction = spot.recommendedAction;
    if (street === "TURN") priorTurnAction = spot.recommendedAction;
  }

  return {
    seed: config.seed >>> 0,
    heroCards,
    board,
    streets: streets as [PostflopLineStreet, PostflopLineStreet, PostflopLineStreet],
    actionHistory,
  };
}

function lineActionFromSpot(spot: PostflopSpot): PostflopLineAction {
  const betBB = betSizeBB(spot.recommendedAction, spot.potBB, spot.effectiveStackBB);
  return {
    street: spot.street,
    action: spot.recommendedAction,
    potBBBefore: spot.potBB,
    effectiveStackBBBefore: spot.effectiveStackBB,
    potBBAfter: roundTenths(spot.potBB + betBB * 2),
    effectiveStackBBAfter: roundTenths(Math.max(0, spot.effectiveStackBB - betBB)),
  };
}

function betSizeBB(action: PostflopAction, potBB: number, effectiveStackBB: number): number {
  switch (action) {
    case "CHECK":
    case "CALL":
    case "FOLD":
      return 0;
    case "BET_SMALL":
      return Math.min(effectiveStackBB, roundTenths(potBB * 0.33));
    case "BET_BIG":
    case "RAISE":
      return Math.min(effectiveStackBB, roundTenths(potBB * 0.75));
  }
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}
