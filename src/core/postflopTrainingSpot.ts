import type { Card, Position } from "./types";
import type { ActionEvSet } from "./actionEv";
import { bestActionsForActionEv, cloneActionEvSet } from "./actionEv";
import type {
  BoardTexture,
  PostflopAction,
  PostflopCallerType,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopRecommendationSource,
  PostflopSpot,
  PostflopStreet,
} from "./postflopGenerator";

export type PostflopActionNode =
  | "SINGLE_RAISED_POT_CBET"
  | "THREE_BET_POT_CBET"
  | "FLOP_FACING_BET"
  | "TURN_BARREL"
  /**
   * The out-of-position caller's first decision on the turn: lead, or check.
   *
   * The product modelled the aggressor continuing and the defender facing it,
   * and had no name for the third turn decision - the player who called the
   * flop bet, out of position, acting first on the turn before anyone has bet.
   * That is what every solved turn family actually holds, which is how the
   * absence came to light: nine families of solved strategy had no node to be
   * filed under, and filing them as TURN_BARREL would have told a player they
   * held the betting lead when they held the opposite.
   */
  | "TURN_OOP_LEAD"
  | "TURN_FACING_BET"
  | "RIVER_PRESSURE"
  | "RIVER_FACING_BET";

export type PostflopExplanationLanguage = "CZ" | "EN";

export type PostflopSizing =
  | "CHECK"
  | "BET_SMALL"
  | "BET_BIG"
  | "CALL"
  | "RAISE"
  | "FOLD";

export interface PostflopActionOption {
  action: PostflopAction;
  sizing: PostflopSizing;
  label: string;
}

export interface PostflopExplanation {
  summary: string;
  valueHands: readonly string[];
  bluffHands: readonly string[];
  checkHands: readonly string[];
  nextStreetPlan: string;
  source: PostflopRecommendationSource;
}

export interface PostflopTrainingSpot {
  id: string;
  seed: number;
  street: PostflopStreet;
  actionNode: PostflopActionNode;
  heroCards: [Card, Card];
  board: readonly Card[];
  boardTextures: readonly BoardTexture[];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  spr: number;
  heroPosition: Position;
  villainPosition: Position;
  aggressorPosition: Position;
  callerPosition: Position;
  inPosition: boolean;
  callerType: PostflopCallerType;
  positionPattern: PostflopPositionPattern;
  actions: readonly PostflopActionOption[];
  recommendedAction: PostflopAction;
  actionEvs?: ActionEvSet<PostflopAction>;
  explanation: PostflopExplanation;
}

const ACTION_LABEL: Record<PostflopAction, string> = {
  CHECK: "Check",
  BET_SMALL: "Bet small",
  BET_BIG: "Bet big",
  CALL: "Call",
  RAISE: "Raise",
  FOLD: "Fold",
};

export function postflopSpotToTrainingSpot(
  spot: PostflopSpot,
  language: PostflopExplanationLanguage = "CZ",
): PostflopTrainingSpot {
  return {
    id: postflopTrainingSpotId(spot),
    seed: spot.seed,
    street: spot.street,
    actionNode: actionNodeForSpot(spot),
    heroCards: spot.heroCards,
    board: spot.board,
    boardTextures: spot.textures,
    potType: spot.potType,
    potBB: spot.potBB,
    effectiveStackBB: spot.effectiveStackBB,
    spr: roundedSpr(spot.effectiveStackBB, spot.potBB),
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    aggressorPosition: spot.aggressorPosition,
    callerPosition: spot.callerPosition,
    inPosition: spot.inPosition,
    callerType: spot.callerType,
    positionPattern: spot.positionPattern,
    actions: spot.actions.map((action) => ({
      action,
      sizing: action,
      label: ACTION_LABEL[action],
    })),
    recommendedAction: spot.recommendedAction,
    ...(spot.actionEvs ? { actionEvs: cloneActionEvSet(spot.actionEvs) } : {}),
    explanation: buildExplanation(spot, language),
  };
}

export function postflopTrainingSpotId(spot: Pick<PostflopSpot, "seed" | "street" | "board">): string {
  return [
    "POSTFLOP",
    spot.street,
    spot.seed,
    spot.board.map((card) => `${card.rank}${card.suit}`).join("-"),
  ].join("|");
}

function actionNodeForSpot(
  spot: Pick<PostflopSpot, "street" | "potType" | "actionNode">,
): PostflopActionNode {
  if (spot.actionNode) return spot.actionNode;
  switch (spot.street) {
    case "FLOP":
      if (spot.potType === "THREE_BET_POT") return "THREE_BET_POT_CBET";
      return "SINGLE_RAISED_POT_CBET";
    case "TURN":
      return "TURN_BARREL";
    case "RIVER":
      return "RIVER_PRESSURE";
  }
}

function roundedSpr(effectiveStackBB: number, potBB: number): number {
  if (!Number.isFinite(effectiveStackBB) || !Number.isFinite(potBB) || potBB <= 0) {
    return 0;
  }
  return Math.round((effectiveStackBB / potBB) * 10) / 10;
}

function buildExplanation(
  spot: PostflopSpot,
  language: PostflopExplanationLanguage,
): PostflopExplanation {
  return {
    summary: language === "EN" ? postflopSummaryEn(spot) : postflopSummaryCs(spot),
    valueHands: language === "EN" ? valueHandsForSpotEn(spot) : valueHandsForSpot(spot),
    bluffHands: language === "EN" ? bluffHandsForSpotEn(spot) : bluffHandsForSpot(spot),
    checkHands: language === "EN" ? checkHandsForSpotEn(spot) : checkHandsForSpot(spot),
    nextStreetPlan: language === "EN"
      ? nextStreetPlanForStreetEn(spot.street, spot.recommendedAction)
      : nextStreetPlanForStreet(spot.street, spot.recommendedAction),
    source: spot.strategySource,
  };
}

function postflopSummaryEn(spot: PostflopSpot): string {
  const bestActions = spot.actionEvs ? bestActionsForActionEv(spot.actionEvs) : [];
  if (bestActions.length > 0) {
    const actions = bestActions.map((action) => ACTION_LABEL[action]).join(" / ");
    return `Reviewed best actions for this hand and node: ${actions}. The values are equivalent within the configured EV threshold.`;
  }
  const action = ACTION_LABEL[spot.recommendedAction];
  return `The reviewed strategy for this hand and node recommends ${action}. Compare the EV of the other actions when the solver export provides them.`;
}

function postflopSummaryCs(spot: PostflopSpot): string {
  const bestActions = spot.actionEvs ? bestActionsForActionEv(spot.actionEvs) : [];
  if (bestActions.length > 0) {
    const actions = bestActions.map((action) => ACTION_LABEL[action]).join(" / ");
    return `Kontrolované nejlepší akce pro tuto handu a tento node: ${actions}. Hodnoty jsou rovnocenné v nastaveném EV prahu.`;
  }
  const action = ACTION_LABEL[spot.recommendedAction];
  return `Kontrolovaná strategie pro tuto handu a tento node doporučuje ${action}. Porovnejte také EV ostatních akcí, pokud je solverový export obsahuje.`;
}

function valueHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return spot.recommendedAction === "CHECK"
        ? ["overpairy s pot-control", "top pair s dobrým kickerem", "střední páry s backdoory"]
        : ["overpairy", "top pair top kicker", "silné combo draw"];
    }
    if (spot.positionPattern === "BTN_VS_BB" || spot.positionPattern === "EP_VS_BB") {
      if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
        return ["top pair", "second pair", "overpairy z preflop range"];
      }
      return ["top pair s dobrým kickerem", "overpairy", "silná pair+draw"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return spot.recommendedAction === "CHECK"
        ? ["top pair se slabým kickerem", "second pair", "check-call část overpairů"]
        : ["top pair+", "overpairy", "silné made hands"];
    }
    if (spot.positionPattern === "SB_VS_BB") {
      return ["top pair+", "dobré second pairy", "draw se silnou equity"];
    }
  }

  switch (spot.recommendedAction) {
    case "BET_BIG":
      return ["top pair+", "overpair", "silné made hands"];
    case "BET_SMALL":
      return ["top pair", "middle pair", "handy s range výhodou"];
    case "CALL":
      return ["showdown value", "páry podpořené blockery", "draw se správnou cenou"];
    case "RAISE":
      return ["silná value", "handy s nut výhodou", "prémiové blockery"];
    case "FOLD":
      return ["handy bez dostatečné equity nebo blockerů"];
    case "CHECK":
      return ["marginální showdown value", "pot-control handy"];
  }
}

function bluffHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.recommendedAction === "CHECK") {
    if (spot.street === "FLOP" && spot.potType === "THREE_BET_POT") {
      return ["A-high backdoor blockery", "gutshot s overkartami"];
    }
    return [];
  }
  if (spot.recommendedAction === "CALL" || spot.recommendedAction === "FOLD") {
    return [];
  }
  if (spot.recommendedAction === "RAISE") {
    return ["nut blockery", "combo draw", "bluffy s nízkou showdown value a removalem"];
  }

  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["nut flush draw", "A-high blocker handy", "gutshot + overkarty"];
    }
    if (spot.positionPattern === "BTN_VS_BB") {
      return spot.textures.includes("connected") || spot.textures.includes("two-tone")
        ? ["open-ended draw", "flush draw", "overkarty s backdoor equity"]
        : ["backdoor flush draw", "BDFD + overkarta", "blocker handy"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return ["silná draw bez showdown value", "overkarty s backdoor equity", "top-pair blockery"];
    }
  }

  if (spot.textures.includes("connected") || spot.textures.includes("two-tone")) {
    return ["open-ended draw", "flush draw", "overkarty"];
  }
  return ["backdoor draw", "blocker handy"];
}

function checkHandsForSpot(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["underpairy bez backdoorů", "A-high showdown", "air bez blockerů"];
    }
    if (!spot.inPosition || spot.textures.includes("connected") || spot.textures.includes("monotone")) {
      return ["slabší páry", "střední showdown value", "air bez dobrých backdoorů"];
    }
    if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
      return ["nejhorší air", "slowplay část", "slabá backdoor komba"];
    }
  }

  if (spot.textures.includes("monotone") || spot.textures.includes("connected")) {
    return ["slabé páry", "air bez blockerů", "střední showdown value"];
  }
  return ["nejhorší air", "slowplay část"];
}

function nextStreetPlanForStreet(
  street: PostflopStreet,
  action: PostflopAction,
): string {
  if (street === "RIVER") {
    return "River je poslední street; vyhodnoťte showdown value a sizing.";
  }
  if (action === "CHECK") {
    return "Na další streetě znovu vyhodnoťte texturu, range výhodu a SPR.";
  }
  if (action === "CALL") {
    return "Po další kartě znovu vyhodnoťte pot odds, blockery a showdown value.";
  }
  if (action === "RAISE") {
    return "Po raisu plánujte turn nebo river barrely podle nut výhody a kvality blockerů.";
  }
  if (action === "FOLD") {
    return "Fold ukončí tuto větev; ověřte, zda equity, blockery nebo pot odds opravňovaly pokračování.";
  }
  return "Na blank runoutech můžete pokračovat v tlaku; na dynamických kartách zpomalte.";
}

function valueHandsForSpotEn(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return spot.recommendedAction === "CHECK"
        ? ["overpairs with pot control", "top pair with a good kicker", "medium pairs with backdoors"]
        : ["overpairs", "top pair top kicker", "strong combo draws"];
    }
    if (spot.positionPattern === "BTN_VS_BB" || spot.positionPattern === "EP_VS_BB") {
      if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
        return ["top pair", "second pair", "overpairs from the preflop range"];
      }
      return ["top pair with a good kicker", "overpairs", "strong pair plus draw"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return spot.recommendedAction === "CHECK"
        ? ["top pair with a weak kicker", "second pair", "check-call portion of overpairs"]
        : ["top pair or better", "overpairs", "strong made hands"];
    }
    if (spot.positionPattern === "SB_VS_BB") {
      return ["top pair or better", "good second pairs", "draws with strong equity"];
    }
  }

  switch (spot.recommendedAction) {
    case "BET_BIG":
      return ["top pair or better", "overpairs", "strong made hands"];
    case "BET_SMALL":
      return ["top pair", "middle pair", "hands supported by range advantage"];
    case "CALL":
      return ["showdown value", "pairs supported by blockers", "draws with the right price"];
    case "RAISE":
      return ["strong value", "hands supported by nut advantage", "premium blockers"];
    case "FOLD":
      return ["hands without enough equity or relevant blockers"];
    case "CHECK":
      return ["marginal showdown value", "pot-control hands"];
  }
}

function bluffHandsForSpotEn(spot: PostflopSpot): readonly string[] {
  if (spot.recommendedAction === "CHECK") {
    if (spot.street === "FLOP" && spot.potType === "THREE_BET_POT") {
      return ["ace-high backdoor blockers", "gutshots with overcards"];
    }
    return [];
  }
  if (spot.recommendedAction === "CALL" || spot.recommendedAction === "FOLD") return [];
  if (spot.recommendedAction === "RAISE") {
    return ["nut blockers", "combo draws", "low-showdown-value bluffs with removal"];
  }
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["nut flush draws", "ace-high blocker hands", "gutshot plus overcards"];
    }
    if (spot.positionPattern === "BTN_VS_BB") {
      return spot.textures.includes("connected") || spot.textures.includes("two-tone")
        ? ["open-ended draws", "flush draws", "overcards with backdoor equity"]
        : ["backdoor flush draws", "BDFD plus overcard", "blocker hands"];
    }
    if (spot.positionPattern === "OOP_RAISER_VS_IP_CALLER") {
      return ["strong draws without showdown value", "overcards with backdoor equity", "top-pair blockers"];
    }
  }
  if (spot.textures.includes("connected") || spot.textures.includes("two-tone")) {
    return ["open-ended draws", "flush draws", "overcards"];
  }
  return ["backdoor draws", "blocker hands"];
}

function checkHandsForSpotEn(spot: PostflopSpot): readonly string[] {
  if (spot.street === "FLOP") {
    if (spot.potType === "THREE_BET_POT") {
      return ["underpairs without backdoors", "ace-high showdown value", "air without blockers"];
    }
    if (!spot.inPosition || spot.textures.includes("connected") || spot.textures.includes("monotone")) {
      return ["weaker pairs", "medium showdown value", "air without useful backdoors"];
    }
    if (spot.textures.includes("ace-high") || spot.textures.includes("dry")) {
      return ["the weakest air", "slowplays", "weak backdoor combinations"];
    }
  }
  if (spot.textures.includes("monotone") || spot.textures.includes("connected")) {
    return ["weak pairs", "air without blockers", "medium showdown value"];
  }
  return ["the weakest air", "slowplays"];
}

function nextStreetPlanForStreetEn(
  street: PostflopStreet,
  action: PostflopAction,
): string {
  if (street === "RIVER") {
    return "The river is the final street; evaluate showdown value and sizing.";
  }
  if (action === "CHECK") {
    return "Reassess texture, range advantage, and SPR on the next street.";
  }
  if (action === "CALL") {
    return "After the next card, reassess pot odds, blockers, and showdown value.";
  }
  if (action === "RAISE") {
    return "After raising, plan turn or river barrels around nut advantage and blocker quality.";
  }
  if (action === "FOLD") {
    return "Folding ends this branch; verify whether equity, blockers, or pot odds justified continuing.";
  }
  return "Keep applying pressure on blank runouts and slow down on dynamic cards.";
}
