import {
  generatePostflopSpot,
  type PostflopAction,
  type PostflopConfig,
  type PostflopRecommendationSource,
  type PostflopSpot,
  type PostflopStreet,
} from "./postflopGenerator";
import { solvedBetSizing, type SolvedBetSizing } from "../data/ranges/solvedBetSizing";
import type { PostflopActionNode } from "./postflopTrainingSpot";
import type { Card } from "./types";

export type PostflopLineActionSource = "RECOMMENDED" | "CHOSEN";
export type PostflopLineActor = "HERO" | "VILLAIN";
export type PostflopPolicyAction =
  | "CHECK"
  | "CALL"
  | "FOLD"
  | "BET_SMALL"
  | "BET_BIG"
  | "RAISE"
  | "ALL_IN";
export type PostflopOpponentResponse = PostflopPolicyAction;
export type PostflopPolicyDecisionPoint =
  | "AFTER_HERO_CHECK"
  | "FACING_HERO_BET"
  | "FACING_HERO_RAISE";
export type PostflopLineTerminalReason =
  | "HERO_FOLD"
  | "OPPONENT_FOLD"
  | "STACK_EXHAUSTED"
  | "SHOWDOWN";
export type PostflopLineActionPlan = Partial<Record<PostflopStreet, PostflopAction>>;

export interface PostflopStreetState {
  street: PostflopStreet;
  potBB: number;
  heroStackBB: number;
  villainStackBB: number;
  outstandingBetBB: number;
  heroStreetContributionBB: number;
  villainStreetContributionBB: number;
  aggressor: PostflopLineActor | null;
  terminal: boolean;
  terminalReason?: PostflopLineTerminalReason;
}

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
  amountToCallBB?: number;
  heroContributionBB?: number;
  villainContributionBB?: number;
  opponentResponse?: PostflopOpponentResponse;
  sequence?: readonly PostflopAtomicAction[];
  stateBefore?: PostflopStreetState;
  stateAfter?: PostflopStreetState;
}

export interface PostflopAtomicAction {
  actor: PostflopLineActor;
  action: PostflopPolicyAction;
  amountBB: number;
  contributionAfterBB: number;
  amountToCallBeforeBB: number;
  allIn: boolean;
  fullRaise: boolean;
  bettingReopened: boolean;
}

export interface PostflopLineStreet {
  street: PostflopStreet;
  spot: PostflopSpot;
  stateBefore: PostflopStreetState;
  actionHistory: readonly PostflopLineAction[];
}

export interface PostflopLine {
  seed: number;
  heroCards: [Card, Card];
  board: [Card, Card, Card, Card, Card];
  initialState: PostflopStreetState;
  finalState: PostflopStreetState;
  streets: readonly PostflopLineStreet[];
  actionHistory: readonly PostflopLineAction[];
  terminalReason?: PostflopLineTerminalReason;
}

export interface PostflopOpponentPolicyInput {
  street: PostflopStreet;
  actionNode?: PostflopActionNode;
  heroAction: PostflopAction;
  state: Readonly<PostflopStreetState>;
  amountToCallBB: number;
  proposedHeroContributionBB: number;
  defaultResponse: PostflopOpponentResponse;
  decisionPoint: PostflopPolicyDecisionPoint;
  legalActions: readonly PostflopPolicyAction[];
  sequence: readonly PostflopAtomicAction[];
}

export type PostflopOpponentPolicy = (
  input: PostflopOpponentPolicyInput,
) => PostflopOpponentResponse;

export interface PostflopHeroResponsePolicyInput {
  street: PostflopStreet;
  actionNode?: PostflopActionNode;
  state: Readonly<PostflopStreetState>;
  amountToCallBB: number;
  legalActions: readonly PostflopPolicyAction[];
  sequence: readonly PostflopAtomicAction[];
}

export type PostflopHeroResponsePolicy = (
  input: PostflopHeroResponsePolicyInput,
) => PostflopPolicyAction;

export interface PostflopLineTransitionInput {
  street: PostflopStreet;
  potType: PostflopSpot["potType"];
  action: PostflopLineAction;
  priorFlopAction?: PostflopAction;
  priorTurnAction?: PostflopAction;
  /**
   * Jestli hrdina drží iniciativu, tedy jestli byl posledním, kdo zvedal.
   *
   * Bez toho nešlo odlišit pokračování v sázení od vedení bez iniciativy a
   * simulátor vyráběl `TURN_BARREL` pro obojí. Změřeno: 281 z 300 linek
   * postavených na vyřešeném turnu minulo, protože vyřešený uzel byl
   * `TURN_OOP_LEAD` a linka nabídla barrel - správný obsah, špatná otázka.
   */
  heroHasInitiative?: boolean;
}

export interface PostflopLineTransition {
  nextStreet?: PostflopStreet;
  nextActionNode?: PostflopActionNode;
  potBB: number;
  effectiveStackBB: number;
  state: PostflopStreetState;
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
  opponentPolicy?: PostflopOpponentPolicy;
  heroResponsePolicy?: PostflopHeroResponsePolicy;
};

const LINE_STREETS = ["FLOP", "TURN", "RIVER"] as const satisfies readonly PostflopStreet[];

export function generatePostflopLine(config: PostflopLineConfig): PostflopLine {
  const riverSeedSpot = generatePostflopSpot({
    ...config,
    strategyResolver: undefined,
    allowFallback: true,
    street: "RIVER",
    board: config.board,
  });
  const heroCards = config.heroCards ?? riverSeedSpot.heroCards;
  const board = riverSeedSpot.board as [Card, Card, Card, Card, Card];
  const initialPotBB = config.potBB ?? riverSeedSpot.potBB;
  const initialEffectiveStackBB = config.effectiveStackBB ?? riverSeedSpot.effectiveStackBB;
  const initialState = createPostflopStreetState(
    "FLOP",
    initialPotBB,
    initialEffectiveStackBB,
    initialEffectiveStackBB,
  );
  const actionHistory: PostflopLineAction[] = [];
  const streets: PostflopLineStreet[] = [];
  let state = initialState;
  let priorFlopAction: PostflopAction | undefined;
  let priorTurnAction: PostflopAction | undefined;
  let nextActionNode: PostflopActionNode | undefined = config.actionNode;
  let terminalReason: PostflopLineTerminalReason | undefined;

  for (const street of LINE_STREETS) {
    state = nextStreetState(state, street);
    const actionNode = street === "FLOP" ? config.actionNode : nextActionNode;
    const spot = generatePostflopSpot({
      ...config,
      seed: config.seed,
      street,
      heroCards,
      board,
      potBB: state.potBB,
      effectiveStackBB: effectiveStack(state),
      actionNode,
      priorFlopAction,
      priorTurnAction,
    });
    streets.push({
      street,
      spot,
      stateBefore: cloneState(state),
      actionHistory: actionHistory.slice(),
    });

    const action = resolveLineAction(
      spot,
      state,
      actionForStreet(spot, config.chosenActionsByStreet),
      config.opponentPolicy ??
        opponentPolicyFromStrategyPack(spot) ??
        defaultPostflopOpponentPolicy,
      config.heroResponsePolicy ?? defaultPostflopHeroResponsePolicy,
    );
    actionHistory.push(action);
    const transition = transitionPostflopLineState({
      street,
      potType: spot.potType,
      action,
      priorFlopAction,
      priorTurnAction,
      // Iniciativu drží ten, kdo naposledy zvedal. Spot ji zná v sedačkách:
      // hrdina ji má, právě když je sám agresorem.
      heroHasInitiative: spot.heroPosition === spot.aggressorPosition,
    });
    state = transition.state;
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
    initialState,
    finalState: cloneState(state),
    streets,
    actionHistory,
    terminalReason,
  };
}

export function transitionPostflopLineState(
  input: PostflopLineTransitionInput,
): PostflopLineTransition {
  const state = input.action.stateAfter
    ? cloneState(input.action.stateAfter)
    : createPostflopStreetState(
    input.street,
    input.action.potBBAfter,
    input.action.effectiveStackBBAfter,
    input.action.effectiveStackBBAfter,
    input.action.terminal,
    legacyTerminalReason(input.action),
  );
  const actionTerminalReason = input.action.action === "FOLD"
    ? "HERO_FOLD"
    : state.terminalReason;
  const terminalReason = actionTerminalReason ?? (
    input.street === "RIVER" ? "SHOWDOWN" : undefined
  );
  state.terminal = terminalReason !== undefined;
  state.terminalReason = terminalReason;
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
      ? actionNodeForLineStreet(
        nextStreet,
        input.action.action,
        input.heroHasInitiative ?? true,
      )
      : undefined,
    potBB: state.potBB,
    effectiveStackBB: effectiveStack(state),
    state: cloneState(state),
    priorFlopAction,
    priorTurnAction,
    terminalReason,
  };
}

export function defaultPostflopOpponentPolicy(
  input: PostflopOpponentPolicyInput,
): PostflopOpponentResponse {
  return input.defaultResponse;
}

export function defaultPostflopHeroResponsePolicy(
  input: PostflopHeroResponsePolicyInput,
): PostflopPolicyAction {
  return input.legalActions.includes("CALL") ? "CALL" : input.legalActions[0];
}

function opponentPolicyFromStrategyPack(
  spot: PostflopSpot,
): PostflopOpponentPolicy | undefined {
  if (spot.strategySource.kind !== "STRATEGY_PACK") return undefined;
  const branch = spot.strategySource.opponentPolicy;
  if (!branch) return undefined;
  return (input) => {
    switch (input.decisionPoint) {
      case "AFTER_HERO_CHECK":
        return branch.afterHeroCheck;
      case "FACING_HERO_BET":
        return branch.facingHeroBet;
      case "FACING_HERO_RAISE":
        return branch.facingHeroRaise;
    }
  };
}

export function postflopStateChipTotal(state: PostflopStreetState): number {
  return roundTenths(
    state.potBB +
    state.heroStackBB +
    state.villainStackBB +
    state.heroStreetContributionBB +
    state.villainStreetContributionBB,
  );
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

function resolveLineAction(
  spot: PostflopSpot,
  stateBefore: PostflopStreetState,
  decision: { action: PostflopAction; source: PostflopLineActionSource },
  opponentPolicy: PostflopOpponentPolicy,
  heroResponsePolicy: PostflopHeroResponsePolicy,
): PostflopLineAction {
  const sequence: PostflopAtomicAction[] = [];
  const facingBet = isFacingBetNode(spot.actionNode)
    ? Math.min(effectiveStack(stateBefore), roundTenths(stateBefore.potBB * 0.5))
    : 0;
  let stateAfter = cloneState(stateBefore);
  let lastFullRaiseBB = 0;
  let opponentResponse: PostflopOpponentResponse | undefined;
  let terminalReason: PostflopLineTerminalReason | undefined;

  if (facingBet > 0) {
    const lead = applyAtomicAction(
      stateAfter,
      "VILLAIN",
      "BET_BIG",
      facingBet,
      lastFullRaiseBB,
    );
    stateAfter = lead.state;
    lastFullRaiseBB = lead.lastFullRaiseBB;
    sequence.push(lead.action);
  }

  if (decision.action === "FOLD") {
    sequence.push(passiveAtomicAction(stateAfter, "HERO", "FOLD"));
    terminalReason = "HERO_FOLD";
  } else {
    const heroInitial = applyPlannedAction(
      stateAfter,
      "HERO",
      decision.action,
      lastFullRaiseBB,
      spot.strategySource,
    );
    stateAfter = heroInitial.state;
    lastFullRaiseBB = heroInitial.lastFullRaiseBB;
    sequence.push(heroInitial.action);

    if (decision.action === "CHECK") {
      const legal = legalPolicyActions(stateAfter, "VILLAIN", true, true);
      opponentResponse = chooseOpponentAction(
        opponentPolicy,
        spot,
        decision.action,
        stateAfter,
        "AFTER_HERO_CHECK",
        legal,
        "CHECK",
        sequence,
      );
      const villain = applyPlannedAction(
        stateAfter,
        "VILLAIN",
        opponentResponse,
        lastFullRaiseBB,
      );
      stateAfter = villain.state;
      lastFullRaiseBB = villain.lastFullRaiseBB;
      sequence.push(villain.action);
      if (isAggressivePolicyAction(opponentResponse)) {
        const heroResult = continueAgainstAggression(
          spot,
          stateAfter,
          "HERO",
          decision.action,
          lastFullRaiseBB,
          sequence,
          opponentPolicy,
          heroResponsePolicy,
        );
        stateAfter = heroResult.state;
        lastFullRaiseBB = heroResult.lastFullRaiseBB;
        terminalReason = heroResult.terminalReason;
      }
    } else if (isAggressivePolicyAction(decision.action)) {
      const villainResult = continueAgainstAggression(
        spot,
        stateAfter,
        "VILLAIN",
        decision.action,
        lastFullRaiseBB,
        sequence,
        opponentPolicy,
        heroResponsePolicy,
      );
      stateAfter = villainResult.state;
      lastFullRaiseBB = villainResult.lastFullRaiseBB;
      terminalReason = villainResult.terminalReason;
      opponentResponse = villainResult.firstOpponentAction;
    }
  }

  if (terminalReason === undefined) {
    stateAfter = refundUncalledContribution(stateAfter);
  }
  stateAfter = settleStreetContributions(stateAfter);
  if (
    terminalReason === undefined &&
    (stateAfter.heroStackBB <= 0 || stateAfter.villainStackBB <= 0)
  ) {
    terminalReason = "STACK_EXHAUSTED";
  }
  stateAfter.outstandingBetBB = 0;
  stateAfter.terminal = terminalReason !== undefined;
  stateAfter.terminalReason = terminalReason;

  return {
    street: spot.street,
    actionNode: spot.actionNode,
    action: decision.action,
    source: decision.source,
    potBBBefore: stateBefore.potBB,
    effectiveStackBBBefore: effectiveStack(stateBefore),
    potBBAfter: stateAfter.potBB,
    effectiveStackBBAfter: effectiveStack(stateAfter),
    terminal: stateAfter.terminal,
    amountToCallBB: facingBet,
    heroContributionBB: roundTenths(stateBefore.heroStackBB - stateAfter.heroStackBB),
    villainContributionBB: roundTenths(stateBefore.villainStackBB - stateAfter.villainStackBB),
    opponentResponse,
    sequence,
    stateBefore: cloneState(stateBefore),
    stateAfter: cloneState(stateAfter),
  };
}

function continueAgainstAggression(
  spot: PostflopSpot,
  state: PostflopStreetState,
  respondingActor: PostflopLineActor,
  heroAction: PostflopAction,
  lastFullRaiseBB: number,
  sequence: PostflopAtomicAction[],
  opponentPolicy: PostflopOpponentPolicy,
  heroResponsePolicy: PostflopHeroResponsePolicy,
): {
  state: PostflopStreetState;
  lastFullRaiseBB: number;
  terminalReason?: PostflopLineTerminalReason;
  firstOpponentAction?: PostflopOpponentResponse;
} {
  let next = cloneState(state);
  let lastRaise = lastFullRaiseBB;
  const canRaise = sequence[sequence.length - 1]?.bettingReopened === true;
  const legal = legalPolicyActions(next, respondingActor, false, canRaise);
  const response = respondingActor === "VILLAIN"
    ? chooseOpponentAction(
      opponentPolicy,
      spot,
      heroAction,
      next,
      heroAction === "RAISE" ? "FACING_HERO_RAISE" : "FACING_HERO_BET",
      legal,
      "CALL",
      sequence,
    )
    : chooseHeroResponse(heroResponsePolicy, spot, next, legal, sequence);
  const applied = applyPlannedAction(next, respondingActor, response, lastRaise, spot.strategySource);
  next = applied.state;
  lastRaise = applied.lastFullRaiseBB;
  sequence.push(applied.action);

  if (response === "FOLD") {
    return {
      state: next,
      lastFullRaiseBB: lastRaise,
      terminalReason: respondingActor === "HERO" ? "HERO_FOLD" : "OPPONENT_FOLD",
      firstOpponentAction: respondingActor === "VILLAIN" ? response : undefined,
    };
  }

  if (!isAggressivePolicyAction(response)) {
    return {
      state: next,
      lastFullRaiseBB: lastRaise,
      firstOpponentAction: respondingActor === "VILLAIN" ? response : undefined,
    };
  }

  const finalActor: PostflopLineActor = respondingActor === "HERO" ? "VILLAIN" : "HERO";
  const finalLegal = legalPolicyActions(
    next,
    finalActor,
    false,
    applied.action.bettingReopened,
  );
  const finalResponse = finalActor === "VILLAIN"
    ? chooseOpponentAction(
      opponentPolicy,
      spot,
      heroAction,
      next,
      "FACING_HERO_RAISE",
      finalLegal.filter((action) => action === "CALL" || action === "FOLD"),
      "CALL",
      sequence,
    )
    : chooseHeroResponse(
      heroResponsePolicy,
      spot,
      next,
      finalLegal,
      sequence,
    );
  const finalApplied = applyPlannedAction(next, finalActor, finalResponse, lastRaise, spot.strategySource);
  next = finalApplied.state;
  lastRaise = finalApplied.lastFullRaiseBB;
  sequence.push(finalApplied.action);

  return {
    state: next,
    lastFullRaiseBB: lastRaise,
    terminalReason: finalResponse === "FOLD"
      ? finalActor === "HERO" ? "HERO_FOLD" : "OPPONENT_FOLD"
      : undefined,
    firstOpponentAction: respondingActor === "VILLAIN" ? response : undefined,
  };
}

function chooseOpponentAction(
  policy: PostflopOpponentPolicy,
  spot: PostflopSpot,
  heroAction: PostflopAction,
  state: PostflopStreetState,
  decisionPoint: PostflopPolicyDecisionPoint,
  legalActions: readonly PostflopPolicyAction[],
  defaultResponse: PostflopPolicyAction,
  sequence: readonly PostflopAtomicAction[],
): PostflopPolicyAction {
  const fallback = legalActions.includes(defaultResponse)
    ? defaultResponse
    : legalActions[0];
  return safeOpponentResponse(policy({
    street: spot.street,
    actionNode: spot.actionNode,
    heroAction,
    state: cloneState(state),
    amountToCallBB: amountToCall(state, "VILLAIN"),
    proposedHeroContributionBB: state.heroStreetContributionBB,
    defaultResponse: fallback,
    decisionPoint,
    legalActions,
    sequence: sequence.map((action) => ({ ...action })),
  }), legalActions, fallback);
}

function chooseHeroResponse(
  policy: PostflopHeroResponsePolicy,
  spot: PostflopSpot,
  state: PostflopStreetState,
  legalActions: readonly PostflopPolicyAction[],
  sequence: readonly PostflopAtomicAction[],
): PostflopPolicyAction {
  const fallback = legalActions.includes("CALL") ? "CALL" : legalActions[0];
  const response = policy({
    street: spot.street,
    actionNode: spot.actionNode,
    state: cloneState(state),
    amountToCallBB: amountToCall(state, "HERO"),
    legalActions,
    sequence: sequence.map((action) => ({ ...action })),
  });
  return legalActions.includes(response) ? response : fallback;
}

function applyPlannedAction(
  state: PostflopStreetState,
  actor: PostflopLineActor,
  action: PostflopPolicyAction,
  lastFullRaiseBB: number,
  // Zdroj pravidla spotu: z něj se bere velikost hrdinovy sázky. Soupeřovy
  // sázky jdou dál modelem - tabulka velikostí popisuje tlačítka hrdiny.
  source?: PostflopRecommendationSource,
): {
  state: PostflopStreetState;
  action: PostflopAtomicAction;
  lastFullRaiseBB: number;
} {
  if (action === "CHECK" || action === "FOLD") {
    return {
      state: cloneState(state),
      action: passiveAtomicAction(state, actor, action),
      lastFullRaiseBB,
    };
  }

  const actorContribution = streetContribution(state, actor);
  const currentBet = currentStreetBet(state);
  let targetContributionBB: number;
  switch (action) {
    case "CALL":
      targetContributionBB = currentBet;
      break;
    case "BET_SMALL":
    case "BET_BIG":
      targetContributionBB = roundTenths(
        actorContribution + betSizeBB(
          action,
          livePotBB(state),
          actorStack(state, actor),
          actor === "HERO" ? solvedBetSizing(source, action) : undefined,
        ),
      );
      break;
    case "RAISE":
      targetContributionBB = raiseTargetContributionBB(state, actor, lastFullRaiseBB);
      break;
    case "ALL_IN":
      targetContributionBB = roundTenths(actorContribution + actorStack(state, actor));
      break;
    default:
      targetContributionBB = actorContribution;
  }
  return applyAtomicAction(
    state,
    actor,
    action,
    targetContributionBB,
    lastFullRaiseBB,
  );
}

function applyAtomicAction(
  state: PostflopStreetState,
  actor: PostflopLineActor,
  action: PostflopPolicyAction,
  requestedTargetContributionBB: number,
  lastFullRaiseBB: number,
): {
  state: PostflopStreetState;
  action: PostflopAtomicAction;
  lastFullRaiseBB: number;
} {
  const beforeContribution = streetContribution(state, actor);
  const beforeBet = currentStreetBet(state);
  const callBefore = amountToCall(state, actor);
  const maxTarget = roundTenths(beforeContribution + actorStack(state, actor));
  const target = Math.min(
    maxTarget,
    roundTenths(Math.max(beforeContribution, requestedTargetContributionBB)),
  );
  const amount = roundTenths(target - beforeContribution);
  const next = commitChips(state, actor, amount, false);
  const raiseIncrement = roundTenths(Math.max(0, target - beforeBet));
  const fullRaiseThreshold = beforeBet === 0
    ? 0.1
    : Math.max(0.1, lastFullRaiseBB);
  const fullRaise = raiseIncrement >= fullRaiseThreshold;
  const aggressive = target > beforeBet;
  next.outstandingBetBB = roundTenths(
    Math.abs(next.heroStreetContributionBB - next.villainStreetContributionBB),
  );
  if (!aggressive) {
    next.aggressor = state.aggressor;
  }

  return {
    state: next,
    action: {
      actor,
      action,
      amountBB: amount,
      contributionAfterBB: target,
      amountToCallBeforeBB: callBefore,
      allIn: actorStack(next, actor) === 0,
      fullRaise: aggressive && fullRaise,
      bettingReopened: aggressive && fullRaise,
    },
    lastFullRaiseBB: aggressive && fullRaise ? raiseIncrement : lastFullRaiseBB,
  };
}

function passiveAtomicAction(
  state: PostflopStreetState,
  actor: PostflopLineActor,
  action: Extract<PostflopPolicyAction, "CHECK" | "FOLD">,
): PostflopAtomicAction {
  return {
    actor,
    action,
    amountBB: 0,
    contributionAfterBB: streetContribution(state, actor),
    amountToCallBeforeBB: amountToCall(state, actor),
    allIn: actorStack(state, actor) === 0,
    fullRaise: false,
    bettingReopened: false,
  };
}

function legalPolicyActions(
  state: PostflopStreetState,
  actor: PostflopLineActor,
  allowBet: boolean,
  allowRaise: boolean,
): PostflopPolicyAction[] {
  const toCall = amountToCall(state, actor);
  const stack = actorStack(state, actor);
  if (toCall <= 0) {
    if (!allowBet || stack <= 0) return ["CHECK"];
    return ["CHECK", "BET_SMALL", "BET_BIG", "ALL_IN"];
  }

  const legal: PostflopPolicyAction[] = ["FOLD", "CALL"];
  if (stack > toCall) {
    if (allowRaise) legal.push("RAISE", "ALL_IN");
  }
  return legal;
}

function refundUncalledContribution(
  state: PostflopStreetState,
): PostflopStreetState {
  const next = cloneState(state);
  const matched = Math.min(
    next.heroStreetContributionBB,
    next.villainStreetContributionBB,
  );
  const heroRefund = roundTenths(next.heroStreetContributionBB - matched);
  const villainRefund = roundTenths(next.villainStreetContributionBB - matched);
  next.heroStackBB = roundTenths(next.heroStackBB + heroRefund);
  next.villainStackBB = roundTenths(next.villainStackBB + villainRefund);
  next.heroStreetContributionBB = matched;
  next.villainStreetContributionBB = matched;
  next.outstandingBetBB = 0;
  return next;
}

function raiseTargetContributionBB(
  state: PostflopStreetState,
  actor: PostflopLineActor,
  lastFullRaiseBB: number,
): number {
  const currentBet = currentStreetBet(state);
  const pressureRaise = roundTenths(
    currentBet + livePotBB(state) * 0.75,
  );
  const minimumFullRaise = roundTenths(
    currentBet + Math.max(lastFullRaiseBB, currentBet),
  );
  return Math.min(
    roundTenths(streetContribution(state, actor) + actorStack(state, actor)),
    Math.max(pressureRaise, minimumFullRaise),
  );
}

function currentStreetBet(state: PostflopStreetState): number {
  return Math.max(
    state.heroStreetContributionBB,
    state.villainStreetContributionBB,
  );
}

function amountToCall(
  state: PostflopStreetState,
  actor: PostflopLineActor,
): number {
  return roundTenths(
    Math.max(0, currentStreetBet(state) - streetContribution(state, actor)),
  );
}

function streetContribution(
  state: PostflopStreetState,
  actor: PostflopLineActor,
): number {
  return actor === "HERO"
    ? state.heroStreetContributionBB
    : state.villainStreetContributionBB;
}

function actorStack(
  state: PostflopStreetState,
  actor: PostflopLineActor,
): number {
  return actor === "HERO" ? state.heroStackBB : state.villainStackBB;
}

function livePotBB(state: PostflopStreetState): number {
  return roundTenths(
    state.potBB +
    state.heroStreetContributionBB +
    state.villainStreetContributionBB,
  );
}

function isAggressivePolicyAction(
  action: PostflopPolicyAction,
): action is Extract<PostflopPolicyAction, "BET_SMALL" | "BET_BIG" | "RAISE" | "ALL_IN"> {
  return action === "BET_SMALL" ||
    action === "BET_BIG" ||
    action === "RAISE" ||
    action === "ALL_IN";
}

/**
 * Který uzel čeká na hrdinu na další ulici.
 *
 * Tři různá rozhodnutí, ne dvě. Kdo dorovnal sázku, čelí na další ulici další;
 * kdo drží iniciativu a nikdo nesázel, pokračuje; a kdo iniciativu nemá a hraje
 * první, vede bez ní - to je uzel, který dostal jméno teprve nedávno a tahle
 * funkce o něm nevěděla. Vyráběla `TURN_BARREL` i pro hráče, který na flopu jen
 * dorovnal, takže mu nabízela pokračování v sázení, které nikdy nezačal.
 */
function actionNodeForLineStreet(
  street: PostflopStreet,
  previousAction: PostflopAction,
  heroHasInitiative: boolean,
): PostflopActionNode {
  if (previousAction === "CALL") {
    // Dorovnání znamená, že iniciativu má někdo jiný. Na další ulici se buď
    // čelí další sázce, nebo se hraje první bez iniciativy; co z toho, rozhodne
    // až soupeř, a spot se generuje dřív. Bere se ta možnost, kterou hrdina
    // ovlivní: hraje první.
    if (!heroHasInitiative) {
      return street === "TURN" ? "TURN_OOP_LEAD" : "RIVER_OOP_LEAD";
    }
    return street === "TURN" ? "TURN_FACING_BET" : "RIVER_FACING_BET";
  }
  if (!heroHasInitiative) {
    return street === "TURN" ? "TURN_OOP_LEAD" : "RIVER_OOP_LEAD";
  }
  return street === "TURN" ? "TURN_BARREL" : "RIVER_PRESSURE";
}

function nextStreetAfter(street: PostflopStreet): PostflopStreet | undefined {
  if (street === "FLOP") return "TURN";
  if (street === "TURN") return "RIVER";
  return undefined;
}

function createPostflopStreetState(
  street: PostflopStreet,
  potBB: number,
  heroStackBB: number,
  villainStackBB: number,
  terminal = false,
  terminalReason?: PostflopLineTerminalReason,
): PostflopStreetState {
  return {
    street,
    potBB: roundTenths(Math.max(0, potBB)),
    heroStackBB: roundTenths(Math.max(0, heroStackBB)),
    villainStackBB: roundTenths(Math.max(0, villainStackBB)),
    outstandingBetBB: 0,
    heroStreetContributionBB: 0,
    villainStreetContributionBB: 0,
    aggressor: null,
    terminal,
    terminalReason,
  };
}

function nextStreetState(
  state: PostflopStreetState,
  street: PostflopStreet,
): PostflopStreetState {
  return {
    ...cloneState(state),
    street,
    outstandingBetBB: 0,
    heroStreetContributionBB: 0,
    villainStreetContributionBB: 0,
    aggressor: null,
  };
}

function commitChips(
  state: PostflopStreetState,
  actor: PostflopLineActor,
  requestedBB: number,
  settle: boolean,
): PostflopStreetState {
  const next = cloneState(state);
  const stackKey = actor === "HERO" ? "heroStackBB" : "villainStackBB";
  const contributionKey = actor === "HERO"
    ? "heroStreetContributionBB"
    : "villainStreetContributionBB";
  const amount = Math.min(next[stackKey], roundTenths(Math.max(0, requestedBB)));
  next[stackKey] = roundTenths(next[stackKey] - amount);
  next[contributionKey] = roundTenths(next[contributionKey] + amount);
  next.aggressor = actor;
  return settle ? settleStreetContributions(next) : next;
}

function settleStreetContributions(state: PostflopStreetState): PostflopStreetState {
  const next = cloneState(state);
  next.potBB = roundTenths(
    next.potBB + next.heroStreetContributionBB + next.villainStreetContributionBB,
  );
  next.heroStreetContributionBB = 0;
  next.villainStreetContributionBB = 0;
  return next;
}

function effectiveStack(state: PostflopStreetState): number {
  return roundTenths(Math.min(state.heroStackBB, state.villainStackBB));
}

function isFacingBetNode(node: PostflopActionNode | undefined): boolean {
  return node === "FLOP_FACING_BET" ||
    node === "TURN_FACING_BET" ||
    node === "RIVER_FACING_BET";
}

/**
 * Kolik hráč vsadí - **velikostí, kterou hrál solver**, když ji známe.
 *
 * Do 15. 10. 2026 tu byl jen model 0,33 / 0,75 potu natvrdo, a „Bank po akci"
 * se tím rozcházel s tlačítkem, které velikost ze stromu bralo: `BET_BIG` u 63
 * z 63 rodin (ve stromě 0,50), `BET_SMALL` u 17 z 20. Velikosti ve stromech
 * jsou čtyři (0,25, 0,33, 0,5, 0,75) a vlastník rozhodl nechat všechny - model
 * zůstává jen jako záloha pro spot bez vyřešené velikosti.
 */
function betSizeBB(
  action: Extract<PostflopAction, "BET_SMALL" | "BET_BIG">,
  potBB: number,
  stackBB: number,
  solved?: SolvedBetSizing,
): number {
  if (solved?.allIn === true) return stackBB;
  const ratio = solved?.ratio ?? (action === "BET_SMALL" ? 0.33 : 0.75);
  return Math.min(stackBB, roundTenths(potBB * ratio));
}

function safeOpponentResponse(
  response: PostflopOpponentResponse,
  allowed: readonly PostflopOpponentResponse[],
  fallback: PostflopOpponentResponse,
): PostflopOpponentResponse {
  return allowed.includes(response) ? response : fallback;
}

function cloneState(state: PostflopStreetState): PostflopStreetState {
  return { ...state };
}

function legacyTerminalReason(
  action: PostflopLineAction,
): PostflopLineTerminalReason | undefined {
  if (action.action === "FOLD") return "HERO_FOLD";
  if (action.effectiveStackBBAfter <= 0) return "STACK_EXHAUSTED";
  return undefined;
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}
