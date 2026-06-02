import type {
  BoardTexture,
  PostflopAction,
  PostflopStreet,
} from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type {
  EvModel,
  GameVariant,
  TableFormat,
} from "../../core/trainingProfile";

export type PostflopPotType =
  | "SINGLE_RAISED"
  | "THREE_BET_POT"
  | "LIMPED_POT";

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
  positionPattern: string;
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
  },
): PostflopStrategyRule[] {
  return pack.rules.filter((rule) => (
    rule.actionNode === input.actionNode &&
    input.spr >= rule.sprMin &&
    input.spr <= rule.sprMax &&
    rule.boardTextures.some((texture) => input.boardTextures.includes(texture))
  ));
}
