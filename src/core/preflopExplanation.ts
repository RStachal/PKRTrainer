import type {
  ActionContext,
  ActionKey,
  HandLabel,
  Position,
  StackBucket,
  TableState,
} from "./types";

export type PreflopExplanationMode = "BEGINNER" | "STANDARD" | "ADVANCED";

export interface PreflopExplanationInput {
  context: ActionContext;
  heroPos: Position;
  effStack: StackBucket;
  hand: HandLabel;
  recommended: readonly ActionKey[];
  tableState: TableState;
  importedFromHandHistory?: boolean;
}

const ACTION_LABEL: Record<ActionKey, string> = {
  FOLD: "Fold",
  CALL: "Call",
  LIMP: "Limp / check",
  OVERLIMP: "Over-limp",
  OPEN_2X: "Open 2x",
  OPEN_25X: "Open 2.5x",
  OPEN_3X: "Open 3x",
  ISO_2X: "Iso-raise 2x",
  ISO_25X: "Iso-raise 2.5x",
  ISO_3X: "Iso-raise 3x",
  "3BET": "3-bet",
  "4BET": "4-bet",
  SQUEEZE: "Squeeze",
  JAM: "Jam",
  CALL_JAM: "Call jam",
};

const CONTEXT_LABEL: Record<ActionContext, string> = {
  RFI: "RFI / Open",
  VS_LIMP: "Vs limp",
  VS_OPEN: "Vs open",
  VS_3BET: "Vs 3-bet",
  VS_4BET: "Vs 4-bet",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Vs all-in",
};

export function buildPreflopExplanation(
  input: PreflopExplanationInput,
  mode: PreflopExplanationMode = "STANDARD",
): string {
  const recommended = input.recommended.map((action) => ACTION_LABEL[action]).join(" / ");
  const intro =
    `${CONTEXT_LABEL[input.context]}${input.importedFromHandHistory ? " HH spot" : ""}: ` +
    `${input.heroPos}, ${input.effStack} BB, ${input.hand}. Recommended: ${recommended}.`;

  if (mode === "BEGINNER") {
    return `${intro} ${beginnerReason(input)}`;
  }

  const parts = [
    intro,
    `Position: ${positionReason(input.heroPos, input.context)}.`,
    `Stack: ${stackReason(input.effStack, input.context)}.`,
    `Hand class: ${handReason(input.hand)}.`,
    `Plan: ${actionPlan(input.recommended, input.context, input.tableState)}.`,
  ];

  if (mode === "ADVANCED") {
    parts.push(`Range note: ${advancedRangeNote(input)}.`);
  }

  return parts.join(" ");
}

function beginnerReason(input: PreflopExplanationInput): string {
  if (input.recommended.includes("FOLD")) {
    return "Keep the range disciplined and protect the stack.";
  }
  if (input.recommended.some(isRaiseAction)) {
    return "Use fold equity and apply pressure with a hand that belongs in the active range.";
  }
  if (input.recommended.some((action) => action === "CALL" || action === "CALL_JAM")) {
    return "Continue because the hand has enough strength or price to realize equity.";
  }
  return "Choose the lowest-risk line that fits the spot.";
}

function positionReason(position: Position, context: ActionContext): string {
  if (position === "SB" || position === "BB") {
    return context === "BVB"
      ? "blind versus blind ranges are wider, but position and realization still matter"
      : "blind defense needs pot odds, blockers and postflop realization";
  }
  if (position === "BTN" || position === "CO") {
    return "late position can pressure blinds with wider value and bluff components";
  }
  if (position === "LJ" || position === "HJ") {
    return "middle position wants playable hands and avoids thin dominated continues";
  }
  return "early position keeps the range tighter because many players are left to act";
}

function stackReason(stack: StackBucket, context: ActionContext): string {
  if (context === "PUSH_FOLD" || context === "VS_ALLIN" || stack <= 10) {
    return "short-stack decisions are driven by fold equity, blockers and immediate all-in risk";
  }
  if (stack <= 25) {
    return "reshove pressure is high, so marginal opens and calls lose value quickly";
  }
  if (stack <= 60) {
    return "medium stacks can apply pressure while still preserving postflop playability";
  }
  return "deep stacks reward suitedness, nut potential and position because realization matters more";
}

function handReason(hand: HandLabel): string {
  if (hand.length === 2 && hand[0] === hand[1]) {
    return `${hand} is a pocket pair with set value and clean showdown potential`;
  }
  const suited = hand.endsWith("s");
  const ranks = hand.slice(0, 2);
  const broadway = /[AKQJT]/.test(ranks[0]) && /[AKQJT]/.test(ranks[1]);
  const ace = ranks.includes("A");
  if (suited && broadway) return `${hand} has suited broadway playability, blockers and nut potential`;
  if (suited && ace) return `${hand} has ace blocker value and nut-flush potential`;
  if (suited) return `${hand} realizes better than offsuit hands through flush and straight equity`;
  if (broadway) return `${hand} has high-card value but can be dominated when facing aggression`;
  return `${hand} is mostly driven by price, position and fold equity`;
}

function actionPlan(
  recommended: readonly ActionKey[],
  context: ActionContext,
  tableState: TableState,
): string {
  if (recommended.includes("FOLD")) {
    return "fold the bottom of range and keep future stack leverage";
  }
  if (recommended.includes("JAM")) {
    return "jam to maximize fold equity and avoid awkward postflop SPR";
  }
  if (recommended.includes("CALL_JAM")) {
    return "call the all-in with enough equity against the shoving range";
  }
  if (recommended.includes("4BET")) {
    return "4-bet the strongest continues and blocker-heavy pressure hands";
  }
  if (recommended.includes("3BET") || recommended.includes("SQUEEZE")) {
    return tableState.callsBefore > 0
      ? "attack dead money and isolate with a polarized or linear pressure range"
      : "apply pressure while denying equity to the opener";
  }
  if (recommended.some((action) => action.startsWith("OPEN") || action.startsWith("ISO"))) {
    return context === "VS_LIMP"
      ? "isolate limpers and take initiative with a clear sizing"
      : "open first in and use position plus fold equity";
  }
  if (recommended.includes("CALL")) {
    return "continue with hands that can realize equity at the offered price";
  }
  return "take the passive line and avoid building a dominated pot";
}

function advancedRangeNote(input: PreflopExplanationInput): string {
  switch (input.context) {
    case "RFI":
      return "opening range is shaped by players left to act, blind pressure and blocker coverage";
    case "VS_LIMP":
      return "iso range should separate value isolation from over-limp hands with realization";
    case "VS_OPEN":
      return "defense range balances direct pot odds, 3-bet blockers and dominated flatting risk";
    case "VS_3BET":
      return "continue range tightens around blockers, equity realization and stack-off thresholds";
    case "VS_4BET":
      return "range is condensed toward premiums, blocker jams and calls with enough equity";
    case "SQUEEZE":
      return "squeeze pressure benefits from dead money but needs blockers and stack leverage";
    case "BVB":
      return "blind ranges are wide, so blocker quality and postflop position swing close hands";
    case "PUSH_FOLD":
      return "push-fold EV depends on fold equity, calling ranges and stack preservation";
    case "VS_ALLIN":
      return "calling range must beat the shoving range after pot odds and tournament risk";
  }
}

function isRaiseAction(action: ActionKey): boolean {
  return action.startsWith("OPEN") ||
    action.startsWith("ISO") ||
    action === "3BET" ||
    action === "4BET" ||
    action === "SQUEEZE" ||
    action === "JAM";
}
