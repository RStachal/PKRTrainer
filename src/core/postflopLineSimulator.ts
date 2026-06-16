import {
  generatePostflopSpot,
  type PostflopAction,
  type PostflopConfig,
  type PostflopSpot,
  type PostflopStreet,
} from "./postflopGenerator";
import type { PostflopActionNode } from "./postflopTrainingSpot";
import type { Card } from "./types";

export type PostflopLineActionSource = "RECOMMENDED" | "CHOSEN";
export type PostflopLineTerminalReason = "FOLD" | "STACK_EXHAUSTED";
export type PostflopLineActionPlan = Partial<Record<PostflopStreet, PostflopAction>>;

export interface PostflopLineAction {
  street: PostflopStreet;
  actionNode?: PostflopActionNode;
  action: PostflopAction;
  source: PostflopLineActionSource;
  potBBBefore: number;
  effectiveStackBBBefore: number;
  potBBAfter: number;
  effectiveStackBBAfter: number;
  terminal: boolean;
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
  streets: readonly PostflopLineStreet[];
  actionHistory: readonly PostflopLineAction[];
  terminalReason?: PostflopLineTerminalReason;
}

export interface PostflopLineTransitionInput {
  street: PostflopStreet;
  potType: PostflopSpot["potType"];
  action: PostflopLineAction;
  priorFlopAction?: PostflopAction;
  priorTurnAction?: PostflopAction;
}

export interface PostflopLineTransition {
  nextStreet?: PostflopStreet;
  nextActionNode?: PostflopActionNode;
  potBB: number;
  effectiveStackBB: number;
  priorFlopAction?: PostflopAction;
  priorTurnAction?: PostflopAction;
  terminalReason?: PostflopLineTerminalReason;
}

export type PostflopLineConfig = Omit<
  PostflopConfig,
  "street" | "board" | "potBB" | "effectiveStackBB" | "priorFlopAction" | "priorTurnAction"
> & {
  board?: [Card, Card, Card, Card, Card];
  potBB?: number;
  effectiveStackBB?: number;
  chosenActionsByStreet?: PostflopLineActionPlan;
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
  let nextActionNode: PostflopActionNode | undefined = config.actionNode;
  let terminalReason: PostflopLineTerminalReason | undefined;

  for (const street of LINE_STREETS) {
    const actionNode = street === "FLOP" ? config.actionNode : nextActionNode;
    const spot = generatePostflopSpot({
      ...config,
      seed: config.seed,
      street,
      heroCards,
      board,
      potBB,
      effectiveStackBB,
      actionNode,
      priorFlopAction,
      priorTurnAction,
    });
    streets.push({
      street,
      spot,
      actionHistory: actionHistory.slice(),
    });

    const action = lineActionFromSpot(spot, actionForStreet(spot, config.chosenActionsByStreet));
    actionHistory.push(action);
    const transition = transitionPostflopLineState({
      street,
      potType: spot.potType,
      action,
      priorFlopAction,
      priorTurnAction,
    });
    potBB = transition.potBB;
    effectiveStackBB = transition.effectiveStackBB;
    priorFlopAction = transition.priorFlopAction;
    priorTurnAction = transition.priorTurnAction;
    nextActionNode = transition.nextActionNode;
    terminalReason = transition.terminalReason;
    if (terminalReason !== undefined) break;
  }

  return {
    seed: config.seed >>> 0,
    heroCards,
    board,
    streets,
    actionHistory,
    terminalReason,
  };
}

export function transitionPostflopLineState(
  input: PostflopLineTransitionInput,
): PostflopLineTransition {
  const terminalReason = terminalReasonForAction(input.action);
  const nextStreet = terminalReason === undefined ? nextStreetAfter(input.street) : undefined;
  const priorFlopAction = input.street === "FLOP"
    ? input.action.action
    : input.priorFlopAction;
  const priorTurnAction = input.street === "TURN"
    ? input.action.action
    : input.priorTurnAction;

  return {
    nextStreet,
    nextActionNode: nextStreet
      ? actionNodeForLineStreet(nextStreet, input.potType, input.action.action, undefined)
      : undefined,
    potBB: input.action.potBBAfter,
    effectiveStackBB: input.action.effectiveStackBBAfter,
    priorFlopAction,
    priorTurnAction,
    terminalReason,
  };
}

function actionForStreet(
  spot: PostflopSpot,
  chosenActionsByStreet: PostflopLineActionPlan | undefined,
): { action: PostflopAction; source: PostflopLineActionSource } {
  const chosen = chosenActionsByStreet?.[spot.street];
  if (chosen !== undefined && spot.actions.includes(chosen)) {
    return { action: chosen, source: "CHOSEN" };
  }
  return { action: spot.recommendedAction, source: "RECOMMENDED" };
}

function lineActionFromSpot(
  spot: PostflopSpot,
  decision: { action: PostflopAction; source: PostflopLineActionSource },
): PostflopLineAction {
  const betBB = betSizeBB(decision.action, spot.potBB, spot.effectiveStackBB);
  const terminal = decision.action === "FOLD" || spot.effectiveStackBB - betBB <= 0;
  return {
    street: spot.street,
    actionNode: spot.actionNode,
    action: decision.action,
    source: decision.source,
    potBBBefore: spot.potBB,
    effectiveStackBBBefore: spot.effectiveStackBB,
    potBBAfter: roundTenths(spot.potBB + betBB * 2),
    effectiveStackBBAfter: roundTenths(Math.max(0, spot.effectiveStackBB - betBB)),
    terminal,
  };
}

function actionNodeForLineStreet(
  street: PostflopStreet,
  potType: PostflopSpot["potType"],
  previousAction: PostflopAction | undefined,
  initialActionNode: PostflopActionNode | undefined,
): PostflopActionNode | undefined {
  if (street === "FLOP") return initialActionNode;
  if (previousAction === "CALL") {
    return street === "TURN" ? "TURN_FACING_BET" : "RIVER_FACING_BET";
  }
  if (street === "TURN") return "TURN_BARREL";
  if (street === "RIVER") return "RIVER_PRESSURE";
  return potType === "THREE_BET_POT" ? "THREE_BET_POT_CBET" : "SINGLE_RAISED_POT_CBET";
}

function nextStreetAfter(street: PostflopStreet): PostflopStreet | undefined {
  switch (street) {
    case "FLOP":
      return "TURN";
    case "TURN":
      return "RIVER";
    case "RIVER":
      return undefined;
  }
}

function terminalReasonForAction(action: PostflopLineAction): PostflopLineTerminalReason | undefined {
  if (action.action === "FOLD") return "FOLD";
  if (action.effectiveStackBBAfter <= 0) return "STACK_EXHAUSTED";
  return undefined;
}

function betSizeBB(action: PostflopAction, potBB: number, effectiveStackBB: number): number {
  switch (action) {
    case "CHECK":
    case "FOLD":
      return 0;
    case "CALL":
      return Math.min(effectiveStackBB, roundTenths(potBB * 0.5));
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
