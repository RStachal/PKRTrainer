import { ALL_BOARD_TEXTURES } from "../../core/postflopGenerator";
import type {
  BoardTexture,
  PostflopAction,
  PostflopOpponentPolicyBranch,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopStrategyPositionPattern,
  PostflopStreet,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { Card, HandLabel } from "../../core/types";
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
  opponentPolicy?: PostflopOpponentPolicyBranch;
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

export interface ProductionHandClassOverlapPolicy {
  handClass: HandLabel;
  lanes: readonly ("VALUE" | "BLUFF" | "CHECK")[];
  rationale: string;
}

export interface ProductionCardRemovalSample {
  board: readonly Card[];
  heroCards: readonly [Card, Card];
  handClass: HandLabel;
  rationale: string;
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
      id: "flop-srp-oop-lead-default-check",
      actionNode: "FLOP_OOP_LEAD",
      // Checking to the raiser is the default the whole spot turns on, and the
      // flop is where it is strongest: the opener has bet almost their whole
      // range on many textures and the defender has not yet learned anything.
      boardTextures: ALL_BOARD_TEXTURES,
      sprMin: 0,
      sprMax: 60,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Po dorovnani preflopu a mimo pozici je check zaklad: agresor sazi na flopu velkou cast range a vedeni do nej z capovane range zve raise, na ktery nemame odpoved.",
    },
    {
      id: "flop-srp-oop-lead-low-connected-small",
      actionNode: "FLOP_OOP_LEAD",
      // The one shape where the defender's range is genuinely ahead: a wholly
      // low board that the opener's high cards missed.
      boardTextures: ["low"],
      sprMin: 0,
      sprMax: 60,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "Cely nizky flop mine vetsinu otviraci range a sedne obrane blindu. Male vedeni je proto obhajitelne - velke ne, protoze nase range nema dost nejsilnejsich kombinaci.",
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
    // The lead rules are the one part of this pack that the cited material does
    // not speak to directly - it is written about the aggressor's turn, not the
    // caller's. They are a conservative default from range-advantage reasoning:
    // check unless the turn card moved the advantage. Solved content exists for
    // this node and outranks these rules wherever it reaches.
    "Out-of-position lead rules are a conservative default from range-advantage reasoning, not from the cited sources, which discuss the aggressor's turn decision.",
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

    // The caller's turn, out of position, with no bet in front of them.
    //
    // The default is checking, and it is a strong default: the player who raised
    // before the flop and bet the flop holds the stronger range, and leading into
    // them with a capped range invites a raise the caller cannot answer. Betting
    // into the aggressor is the exception, and these rules are written so the
    // exception has to be earned by the turn card.
    {
      id: "turn-srp-oop-lead-aggressor-card-check",
      actionNode: "TURN_OOP_LEAD",
      // High and disconnected cards belong to the range that raised before the
      // flop. Leading them is betting into the player they helped.
      boardTextures: ["dry", "disconnected", "ace-high", "broadway-high"],
      sprMin: 1,
      sprMax: 20,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Vysoka nebo nespojena karta na turnu sedi range agresora, ne nasi. Bez iniciativy a mimo pozici je check disciplinovana volba; vedeni sem zve raise, na ktery nemame cim odpovedet.",
    },
    {
      id: "turn-srp-oop-lead-paired-check",
      actionNode: "TURN_OOP_LEAD",
      // A paired turn keeps the aggressor's range advantage intact and gives the
      // caller's trips more value from checking than from announcing them.
      boardTextures: ["paired"],
      sprMin: 1,
      sprMax: 20,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Sparovany turn nemeni pomer sil ve prospech callera a nase silne kombinace vydelaji vic z checku nez z okamziteho vedeni.",
    },
    {
      id: "turn-srp-oop-lead-connecting-card-small",
      actionNode: "TURN_OOP_LEAD",
      // Low connecting and draw-completing cards are the ones the caller holds
      // more of: they defended with suited and connected hands the opener folds.
      // Small, because a lead from a capped range cannot profitably face a raise.
      // Only a wholly low board, which is the clearest signal the turn belongs
      // to the defender's range rather than the opener's. Widening this to every
      // connected or straight-possible board put the lead at half of all turns,
      // and leading half the time out of position without the initiative is the
      // classic leak this rule is meant to teach against.
      boardTextures: ["low"],
      sprMin: 1,
      sprMax: 20,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "BET_SMALL",
      explanation:
        "Nizka spojujici karta trefuje obranu velkeho blindu casteji nez otviraci range. Male vedeni proto dava smysl - velke ne, protoze proti raisu ma nase range strop.",
    },
    {
      id: "turn-srp-oop-lead-default-check",
      actionNode: "TURN_OOP_LEAD",
      // Every texture, which is what makes this the last rule standing: the
      // resolver scores a rule by how specifically it matched, so a rule naming
      // the whole taxonomy is outranked by any rule that named a texture. It
      // exists so a board outside the three shapes above still gets the answer
      // this spot defaults to, instead of the bare fallback.
      boardTextures: ALL_BOARD_TEXTURES,
      sprMin: 0,
      sprMax: 60,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Bez iniciativy a mimo pozici je check vychozi volba. Vedeni do hrace, ktery zvedal pred flopem a sazel na flopu, je vyjimka, kterou musi ospravedlnit karta na turnu.",
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
    {
      id: "river-srp-oop-lead-default-check",
      actionNode: "RIVER_OOP_LEAD",
      // On the river the defender's range is at its most capped, and a lead
      // gets called by everything better and folded to by everything worse.
      boardTextures: ALL_BOARD_TEXTURES,
      sprMin: 0,
      sprMax: 60,
      positionPattern: "OOP_CALLER_VS_IP_RAISER",
      actions: ["CHECK", "BET_SMALL", "BET_BIG"],
      preferredAction: "CHECK",
      explanation:
        "Na riveru je nase range nejvic capovana. Vedeni bez iniciativy dostane call od vseho lepsiho a fold od vseho horsiho; check nechava agresorovi prostor blafovat.",
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
  if (rule.opponentPolicy) {
    errors.push(...validatePostflopOpponentPolicyBranch(rule.opponentPolicy, rule.id));
  }

  return errors;
}

export function validatePostflopOpponentPolicyBranch(
  policy: PostflopOpponentPolicyBranch,
  prefix = "opponentPolicy",
): string[] {
  const errors: string[] = [];
  if (!["CHECK", "BET_SMALL", "BET_BIG", "ALL_IN"].includes(policy.afterHeroCheck)) {
    errors.push(`${prefix}: afterHeroCheck is invalid.`);
  }
  if (!["CALL", "FOLD", "RAISE", "ALL_IN"].includes(policy.facingHeroBet)) {
    errors.push(`${prefix}: facingHeroBet is invalid.`);
  }
  if (!["CALL", "FOLD"].includes(policy.facingHeroRaise)) {
    errors.push(`${prefix}: facingHeroRaise is invalid.`);
  }
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
      return spotPattern === "EP_VS_BB" || spotPattern === "BTN_VS_BB" || isSrpIpRaiserVsBigBlind(spotPattern);
    case "EP_VS_BLINDS_OR_STRONG_RANGE_ADVANTAGE":
      return spotPattern === "EP_VS_BB" || isSrpNonBlindRaiserVsBigBlind(spotPattern);
    case "OOP_CALLER_VS_IP_RAISER":
      // The caller is out of position: any single-raised pot the big blind
      // defended against a seat that acts after them, plus the three-bet pot
      // where the caller is out of position against the three-bettor.
      return isSrpIpRaiserVsBigBlind(spotPattern) || isThreeBetIpAggressorVsOopCaller(spotPattern);
    case "OOP_OR_DYNAMIC_BOARD":
      return (
        spotPattern === "SB_VS_BB" ||
        spotPattern === "OOP_RAISER_VS_IP_CALLER" ||
        isSrpSmallBlindVsBigBlind(spotPattern) ||
        isSrpOopRaiserVsIpCaller(spotPattern) ||
        isThreeBetIpAggressorVsOopCaller(spotPattern)
      );
    case "EP_VS_BB":
      return isSrpNonBlindRaiserVsBigBlind(spotPattern) && spotPattern !== "SRP_BTN_VS_BB";
    case "BTN_VS_BB":
      return spotPattern === "SRP_BTN_VS_BB";
    case "SB_VS_BB":
      return spotPattern === "SRP_SB_VS_BB";
    case "OOP_RAISER_VS_IP_CALLER":
      return isSrpOopRaiserVsIpCaller(spotPattern);
    case "OOP_CALLER_VS_IP_3BETTOR":
      return isThreeBetIpAggressorVsOopCaller(spotPattern);
  }

  return false;
}

function isSrpIpRaiserVsBigBlind(pattern: PostflopPositionPattern): boolean {
  return pattern.startsWith("SRP_") && pattern.endsWith("_VS_BB") && pattern !== "SRP_SB_VS_BB";
}

function isSrpNonBlindRaiserVsBigBlind(pattern: PostflopPositionPattern): boolean {
  return isSrpIpRaiserVsBigBlind(pattern) && pattern !== "SRP_BTN_VS_BB";
}

function isSrpSmallBlindVsBigBlind(pattern: PostflopPositionPattern): boolean {
  return pattern === "SRP_SB_VS_BB";
}

function isSrpOopRaiserVsIpCaller(pattern: PostflopPositionPattern): boolean {
  return pattern.startsWith("SRP_") && !pattern.endsWith("_VS_BB");
}

function isThreeBetIpAggressorVsOopCaller(pattern: PostflopPositionPattern): boolean {
  return pattern.startsWith("3BP_");
}
