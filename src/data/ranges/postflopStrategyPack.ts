import type {
  BoardTexture,
  PostflopAction,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopStrategyPositionPattern,
  PostflopStreet,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type {
  EvModel,
  GameVariant,
  TableFormat,
} from "../../core/trainingProfile";

export type PostflopStrategyAction =
  | PostflopAction
  | "RAISE"
  | "CALL"
  | "FOLD";

export interface PostflopStrategyPackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  street: PostflopStreet;
  evModel: EvModel;
  potType: PostflopPotType;
}

export interface PostflopStrategyRule {
  id: string;
  actionNode: PostflopActionNode;
  boardTextures: readonly BoardTexture[];
  sprMin: number;
  sprMax: number;
  positionPattern: PostflopStrategyPositionPattern;
  actions: readonly PostflopStrategyAction[];
  preferredAction: PostflopStrategyAction;
  explanation: string;
}

export interface PostflopStrategyPack {
  id: string;
  version: string;
  createdAt: string;
  verifiedAt: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  dimensions: PostflopStrategyPackDimensions;
  sourceEvidence: readonly PostflopStrategySourceEvidence[];
  assumptions: readonly string[];
  rules: readonly PostflopStrategyRule[];
}

export interface PostflopStrategySourceEvidence {
  url: string;
  verifiedAt: string;
  operator: string;
  gameVariant: GameVariant;
  tableFormat: TableFormat | "GENERAL";
  street: PostflopStreet;
  evModel: EvModel | "GENERAL";
  methodology: string;
  licenseNote: string;
}

export const POSTFLOP_STRATEGY_ACTIONS = [
  "CHECK",
  "BET_SMALL",
  "BET_BIG",
  "RAISE",
  "CALL",
  "FOLD",
] as const satisfies readonly PostflopStrategyAction[];

const CREATED_AT = "2026-06-02";
const TURN_RIVER_VERIFIED_AT = "2026-06-03";

export const flopSingleRaisedPrototypeStrategyPack: PostflopStrategyPack = {
  id: "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
  version: "public-heuristic-v1",
  createdAt: CREATED_AT,
  verifiedAt: CREATED_AT,
  confidence: "LOW",
  dimensions: {
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "FLOP",
    evModel: "CHIP_EV",
    potType: "SINGLE_RAISED",
  },
  sourceEvidence: [
    {
      url: "https://blog.gtowizard.com/flop-heuristics-ip-c-betting-in-mtts/",
      verifiedAt: CREATED_AT,
      operator: "GTO Wizard",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "FLOP",
      evModel: "CHIP_EV",
      methodology: "Public aggregate flop heuristic article; no chart values copied.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
    {
      url: "https://blog.gtowizard.com/the-mechanics-of-c-bet-sizing/",
      verifiedAt: CREATED_AT,
      operator: "GTO Wizard",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "FLOP",
      evModel: "GENERAL",
      methodology: "Public sizing mechanics article; range/nut advantage principles only.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
    {
      url: "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
      verifiedAt: CREATED_AT,
      operator: "GTO Wizard",
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      street: "FLOP",
      evModel: "CHIP_EV",
      methodology: "Public MTT EP vs BB c-bet discussion; ICM marked as future dimension.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
    {
      url: "https://upswingpoker.com/continuation-bet-c-bet-strategy-position/",
      verifiedAt: CREATED_AT,
      operator: "Upswing Poker",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "FLOP",
      evModel: "GENERAL",
      methodology: "Public education article used as cross-check for IP/OOP and texture concepts.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
  ],
  assumptions: [
    "Public heuristic StrategyPack only; no paid chart values or exact solver frequencies are copied.",
    "Flop first: board texture, position pattern, pot type, SPR and effective stack are explicit dimensions.",
    "Turn and river packs should be added only after the flop model is stable.",
  ],
  rules: [
    {
      id: "flop-srp-dry-small-cbet",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["dry"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "IP_OR_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "Suchy rainbow flop je vhodny pro maly c-bet, protoze casto drzi range advantage.",
    },
    {
      id: "flop-srp-ace-high-disconnected-small-cbet",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["ace-high", "disconnected"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "IP_OR_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "A-high disconnected flop casteji drzi preflop agresor; maly c-bet je verejne obhajitelny zaklad.",
    },
    {
      id: "flop-srp-paired-small-cbet",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["paired"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "IP_OR_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "Sparovany rainbow flop casto min pomaha callerovi; maly c-bet je jednoduchy zaklad.",
    },
    {
      id: "flop-srp-straight-flush-draw-heavy-check",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["straight-possible", "flush-draw-heavy"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "OOP_OR_DYNAMIC_BOARD",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Board s rovnou i flush draw meni equity rychle; bez presne range je check disciplinovany zaklad.",
    },
    {
      id: "flop-srp-dynamic-check",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["connected", "two-tone"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "OOP_OR_DYNAMIC_BOARD",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Dynamicky flop meni equity casteji; bez solveroveho packu je check konzervativni zaklad.",
    },
    {
      id: "flop-srp-monotone-check",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["monotone"],
      sprMin: 2,
      sprMax: 12,
      positionPattern: "OOP_OR_DYNAMIC_BOARD",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Monotone flop zveda riziko silnych flush kombinaci a check-raise; bez presne range volime check.",
    },
    {
      id: "flop-srp-low-spr-range-advantage-small-cbet",
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: ["dry", "rainbow", "paired"],
      sprMin: 1,
      sprMax: 4,
      positionPattern: "EP_VS_BLINDS_OR_STRONG_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "Pri nizsim SPR staci maly flop bet k tlaku a stacky lze dostat dovnitr pozdeji.",
    },
  ],
};

export const turnSingleRaisedPrototypeStrategyPack: PostflopStrategyPack = {
  id: "mtt-full-ring-9-turn-single-raised-chip-ev-public-heuristic-v1",
  version: "public-heuristic-v1",
  createdAt: TURN_RIVER_VERIFIED_AT,
  verifiedAt: TURN_RIVER_VERIFIED_AT,
  confidence: "LOW",
  dimensions: {
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "TURN",
    evModel: "CHIP_EV",
    potType: "SINGLE_RAISED",
  },
  sourceEvidence: [
    {
      url: "https://blog.gtowizard.com/turn-barreling-in-3-bet-pots/",
      verifiedAt: TURN_RIVER_VERIFIED_AT,
      operator: "GTO Wizard",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "TURN",
      evModel: "GENERAL",
      methodology: "Public turn barreling principles; used for texture and geometric-barrel concepts only.",
      licenseNote: "Citation and heuristic interpretation only; no solver frequencies copied.",
    },
    {
      url: "https://upswingpoker.com/podcast/ep8-double-barreling/",
      verifiedAt: TURN_RIVER_VERIFIED_AT,
      operator: "Upswing Poker",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "TURN",
      evModel: "GENERAL",
      methodology: "Public double-barrel discussion used as cross-check for turn texture simplification.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
    {
      url: "https://upswingpoker.com/bet-size-strategy-tips-rules/",
      verifiedAt: TURN_RIVER_VERIFIED_AT,
      operator: "Upswing Poker",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "TURN",
      evModel: "GENERAL",
      methodology: "Public sizing principles used for simple small/big bucket selection.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
  ],
  assumptions: [
    "Public heuristic turn StrategyPack only; no paid chart values or exact solver frequencies are copied.",
    "Applies only to single-raised pots after a flop c-bet decision; multiway and 3bet-pot turns stay future work.",
    "Rules are texture-level training prompts, not production equilibrium strategy.",
  ],
  rules: [
    {
      id: "turn-srp-dry-range-advantage-big-barrel",
      actionNode: "TURN_BARREL",
      boardTextures: ["dry", "disconnected", "ace-high"],
      sprMin: 2,
      sprMax: 10,
      positionPattern: "IP_OR_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_BIG",
      explanation:
        "Na stabilnim dry turnu muze agresor s range advantage pokracovat vetsim barrelem; bez frekvenci jde jen o ucici heuristiku.",
    },
    {
      id: "turn-srp-paired-controlled-small-barrel",
      actionNode: "TURN_BARREL",
      boardTextures: ["paired", "rainbow"],
      sprMin: 2,
      sprMax: 10,
      positionPattern: "IP_OR_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "Sparovany stabilni turn casto snizuje pocet silnych kombinaci callera; maly bet drzi tlak bez prestreleni range.",
    },
    {
      id: "turn-srp-dynamic-check",
      actionNode: "TURN_BARREL",
      boardTextures: ["connected", "flush-draw-heavy", "straight-possible"],
      sprMin: 1,
      sprMax: 12,
      positionPattern: "OOP_OR_DYNAMIC_BOARD",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Dynamicky turn meni equity a zvysuje check-raise riziko; bez licencovaneho solver packu volime disciplinovany check.",
    },
  ],
};

export const riverSingleRaisedPrototypeStrategyPack: PostflopStrategyPack = {
  id: "mtt-full-ring-9-river-single-raised-chip-ev-public-heuristic-v1",
  version: "public-heuristic-v1",
  createdAt: TURN_RIVER_VERIFIED_AT,
  verifiedAt: TURN_RIVER_VERIFIED_AT,
  confidence: "LOW",
  dimensions: {
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    street: "RIVER",
    evModel: "CHIP_EV",
    potType: "SINGLE_RAISED",
  },
  sourceEvidence: [
    {
      url: "https://upswingpoker.com/river-poker-strategy-tips/",
      verifiedAt: TURN_RIVER_VERIFIED_AT,
      operator: "Upswing Poker",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "RIVER",
      evModel: "GENERAL",
      methodology: "Public river strategy article used for polarized pressure and blocker concepts.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
    {
      url: "https://blog.gtowizard.com/blockers-unblockers-the-secret-to-picking-great-bluffs/",
      verifiedAt: TURN_RIVER_VERIFIED_AT,
      operator: "GTO Wizard",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "RIVER",
      evModel: "GENERAL",
      methodology: "Public blocker/unblocker article; used only for warning that river bluffs need blocker discipline.",
      licenseNote: "Citation and heuristic interpretation only; no hand-frequency output copied.",
    },
    {
      url: "https://upswingpoker.com/bet-size-strategy-tips-rules/",
      verifiedAt: TURN_RIVER_VERIFIED_AT,
      operator: "Upswing Poker",
      gameVariant: "MTT",
      tableFormat: "GENERAL",
      street: "RIVER",
      evModel: "GENERAL",
      methodology: "Public bet-sizing rules used for broad small/big river sizing buckets.",
      licenseNote: "Citation and heuristic interpretation only.",
    },
  ],
  assumptions: [
    "Public heuristic river StrategyPack only; no paid chart values or exact solver frequencies are copied.",
    "River decisions are simplified to check, small value/block bet, or large polarized pressure.",
    "Specific blocker/card-removal selection remains future solver/import work.",
  ],
  rules: [
    {
      id: "river-srp-dry-polarized-big-bet",
      actionNode: "RIVER_PRESSURE",
      boardTextures: ["dry", "disconnected"],
      sprMin: 1,
      sprMax: 8,
      positionPattern: "IP_OR_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_BIG",
      explanation:
        "Na dry riveru bez novych draw muze agresor trenovat polarizovany tlak; realne bluff combo vyzaduje blocker kontrolu.",
    },
    {
      id: "river-srp-low-spr-value-pressure",
      actionNode: "RIVER_PRESSURE",
      boardTextures: ["ace-high", "broadway-high"],
      sprMin: 0.5,
      sprMax: 3,
      positionPattern: "EP_VS_BLINDS_OR_STRONG_RANGE_ADVANTAGE",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_BIG",
      explanation:
        "Pri nizkem SPR a silnem range advantage dava v prototypu smysl trenovat velky river tlak.",
    },
    {
      id: "river-srp-dynamic-showdown-check",
      actionNode: "RIVER_PRESSURE",
      boardTextures: ["monotone", "flush-draw-heavy", "straight-possible"],
      sprMin: 1,
      sprMax: 12,
      positionPattern: "OOP_OR_DYNAMIC_BOARD",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Na riveru s dokoncenymi draw bez presnych blockeru a value/bluff pomeru zustava check nejbezpecnejsi vyukova heuristika.",
    },
  ],
};

export const postflopPublicHeuristicStrategyPacks = [
  flopSingleRaisedPrototypeStrategyPack,
  turnSingleRaisedPrototypeStrategyPack,
  riverSingleRaisedPrototypeStrategyPack,
] as const;

export function validatePostflopStrategyPack(pack: PostflopStrategyPack): string[] {
  const errors: string[] = [];

  if (pack.id.trim().length === 0) errors.push("StrategyPack id is required.");
  if (pack.version.trim().length === 0) errors.push("StrategyPack version is required.");
  if (pack.sourceEvidence.length < 2) errors.push("StrategyPack needs at least two source evidence entries.");
  if (pack.assumptions.length === 0) errors.push("StrategyPack assumptions are required.");
  if (pack.rules.length === 0) errors.push("StrategyPack must contain at least one rule.");

  for (const rule of pack.rules) {
    errors.push(...validatePostflopStrategyRule(rule));
  }

  return errors;
}

export function validatePostflopStrategyRule(rule: PostflopStrategyRule): string[] {
  const errors: string[] = [];

  if (rule.id.trim().length === 0) errors.push("rule id is required.");
  if (rule.boardTextures.length === 0) errors.push(`${rule.id}: boardTextures are required.`);
  if (rule.actions.length === 0) errors.push(`${rule.id}: actions are required.`);
  if (!rule.actions.includes(rule.preferredAction)) {
    errors.push(`${rule.id}: preferredAction must be present in actions.`);
  }
  if (!Number.isFinite(rule.sprMin) || !Number.isFinite(rule.sprMax)) {
    errors.push(`${rule.id}: SPR bounds must be finite.`);
  }
  if (rule.sprMin < 0 || rule.sprMax < rule.sprMin) {
    errors.push(`${rule.id}: SPR bounds are invalid.`);
  }
  if (rule.explanation.trim().length === 0) errors.push(`${rule.id}: explanation is required.`);

  return errors;
}

export function matchingPostflopRules(
  pack: PostflopStrategyPack,
  input: {
    actionNode: PostflopActionNode;
    boardTextures: readonly BoardTexture[];
    spr: number;
    positionPattern?: PostflopPositionPattern;
  },
): PostflopStrategyRule[] {
  return pack.rules.filter((rule) => (
    rule.actionNode === input.actionNode &&
    input.spr >= rule.sprMin &&
    input.spr <= rule.sprMax &&
    rule.boardTextures.some((texture) => input.boardTextures.includes(texture)) &&
    positionPatternMatches(rule.positionPattern, input.positionPattern)
  ));
}

export function positionPatternMatches(
  rulePattern: PostflopStrategyPositionPattern,
  spotPattern?: PostflopPositionPattern,
): boolean {
  if (spotPattern === undefined) return true;
  if (rulePattern === spotPattern) return true;

  switch (rulePattern) {
    case "IP_OR_RANGE_ADVANTAGE":
      return spotPattern === "EP_VS_BB" || spotPattern === "BTN_VS_BB";
    case "EP_VS_BLINDS_OR_STRONG_RANGE_ADVANTAGE":
      return spotPattern === "EP_VS_BB";
    case "OOP_OR_DYNAMIC_BOARD":
      return spotPattern === "SB_VS_BB" || spotPattern === "OOP_RAISER_VS_IP_CALLER";
    case "EP_VS_BB":
    case "BTN_VS_BB":
    case "SB_VS_BB":
    case "OOP_RAISER_VS_IP_CALLER":
    case "OOP_CALLER_VS_IP_3BETTOR":
      return false;
  }
}
