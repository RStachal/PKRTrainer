import type {
  ActionContext,
  ActionKey,
  HandLabel,
  Position,
  Spot,
  StackBucket,
  TableState,
} from "./types";
import { bestActionsForActionEv } from "./actionEv";

export type PreflopExplanationMode = "BEGINNER" | "STANDARD" | "ADVANCED";
export type PreflopExplanationLanguage = "CZ" | "EN";

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
  VS_LIMP: "Proti limpu",
  VS_OPEN: "Proti openu",
  VS_3BET: "Proti 3-betu",
  VS_4BET: "Proti 4-betu",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Proti all-inu",
};

export function buildPreflopExplanation(
  input: PreflopExplanationInput,
  mode: PreflopExplanationMode = "STANDARD",
  language: PreflopExplanationLanguage = "CZ",
): string {
  return language === "EN"
    ? buildPreflopExplanationEn(input, mode)
    : buildPreflopExplanationCs(input, mode);
}

export function buildPreflopExplanationForSpot(
  spot: Pick<
    Spot,
    "context" | "heroPos" | "effStack" | "hand" | "strictCorrect" | "tableState" | "actionEvs"
  >,
  language: PreflopExplanationLanguage,
  mode: PreflopExplanationMode = "STANDARD",
): string {
  return buildPreflopExplanation({
    context: spot.context,
    heroPos: spot.heroPos,
    effStack: spot.effStack,
    hand: spot.hand,
    recommended: spot.actionEvs
      ? bestActionsForActionEv(spot.actionEvs)
      : spot.strictCorrect,
    tableState: spot.tableState,
  }, mode, language);
}

function buildPreflopExplanationCs(
  input: PreflopExplanationInput,
  mode: PreflopExplanationMode,
): string {
  const recommended = input.recommended.map((action) => ACTION_LABEL[action]).join(" / ");
  const intro =
    `${CONTEXT_LABEL[input.context]}${input.importedFromHandHistory ? " HH spot" : ""}: ` +
    `${input.heroPos}, ${input.effStack} BB, ${input.hand}. Doporučení: ${recommended}.`;

  if (mode === "BEGINNER") {
    return `${intro} ${beginnerReason(input)}`;
  }

  const parts = [
    intro,
    `Pozice: ${positionReason(input.heroPos, input.context)}.`,
    `Stack: ${stackReason(input.effStack, input.context)}.`,
    `Třída handy: ${handReason(input.hand)}.`,
    `Plán: ${actionPlan(input.recommended, input.context, input.tableState)}.`,
  ];

  if (mode === "ADVANCED") {
    parts.push(`Poznámka k range: ${advancedRangeNote(input)}.`);
  }

  return parts.join(" ");
}

function buildPreflopExplanationEn(
  input: PreflopExplanationInput,
  mode: PreflopExplanationMode,
): string {
  const contextLabel: Record<ActionContext, string> = {
    RFI: "RFI / Open",
    VS_LIMP: "Versus limp",
    VS_OPEN: "Versus open",
    VS_3BET: "Versus 3-bet",
    VS_4BET: "Versus 4-bet",
    SQUEEZE: "Squeeze",
    BVB: "Blind vs blind",
    PUSH_FOLD: "Push / Fold",
    VS_ALLIN: "Versus all-in",
  };
  const recommended = input.recommended.map((action) => ACTION_LABEL[action]).join(" / ");
  const intro =
    `${contextLabel[input.context]}${input.importedFromHandHistory ? " HH spot" : ""}: ` +
    `${input.heroPos}, ${input.effStack} BB, ${input.hand}. Recommended: ${recommended}.`;

  if (mode === "BEGINNER") return `${intro} ${beginnerReasonEn(input)}`;
  const parts = [
    intro,
    `Position: ${positionReasonEn(input.heroPos, input.context)}.`,
    `Stack: ${stackReasonEn(input.effStack, input.context)}.`,
    `Hand class: ${handReasonEn(input.hand)}.`,
    `Plan: ${actionPlanEn(input.recommended, input.context, input.tableState)}.`,
  ];
  if (mode === "ADVANCED") parts.push(`Range note: ${advancedRangeNoteEn(input)}.`);
  return parts.join(" ");
}

function beginnerReason(input: PreflopExplanationInput): string {
  if (input.recommended.includes("FOLD")) {
    return "Držte disciplinovanou range a chraňte stack.";
  }
  if (input.recommended.some(isRaiseAction)) {
    return "Využijte fold equity a vytvořte tlak s handou, která patří do aktivní range.";
  }
  if (input.recommended.some((action) => action === "CALL" || action === "CALL_JAM")) {
    return "Pokračujte, protože handa má dostatečnou sílu nebo cenu pro realizaci equity.";
  }
  return "Zvolte nejméně rizikovou line odpovídající spotu.";
}

function positionReason(position: Position, context: ActionContext): string {
  if (position === "SB" || position === "BB") {
    return context === "BVB"
      ? "blind vs blind range jsou širší, ale stále záleží na pozici a realizaci equity"
      : "obrana blindu vyžaduje správné pot odds, blockery a postflop realizaci";
  }
  if (position === "BTN" || position === "CO") {
    return "pozdní pozice může tlačit na blindy širší value i bluff částí range";
  }
  if (position === "LJ" || position === "HJ") {
    return "střední pozice preferuje hratelné handy a omezuje slabá dominovaná pokračování";
  }
  return "časná pozice drží užší range, protože za hráčem zbývá mnoho soupeřů";
}

function stackReason(stack: StackBucket, context: ActionContext): string {
  if (context === "PUSH_FOLD" || context === "VS_ALLIN" || stack <= 10) {
    return "short-stack rozhodnutí určují fold equity, blockery a bezprostřední riziko all-inu";
  }
  if (stack <= 25) {
    return "reshove tlak je vysoký, takže marginální openy a cally rychle ztrácejí hodnotu";
  }
  if (stack <= 60) {
    return "střední stack může vytvářet tlak a současně zachovat postflop hratelnost";
  }
  return "deep stack zvýhodňuje suited handy, nut potenciál a pozici, protože více záleží na realizaci equity";
}

function handReason(hand: HandLabel): string {
  if (hand.length === 2 && hand[0] === hand[1]) {
    return `${hand} je pocket pár se set value a čistým showdown potenciálem`;
  }
  const suited = hand.endsWith("s");
  const ranks = hand.slice(0, 2);
  const broadway = /[AKQJT]/.test(ranks[0]) && /[AKQJT]/.test(ranks[1]);
  const ace = ranks.includes("A");
  if (suited && broadway) return `${hand} nabízí suited broadway hratelnost, blockery a nut potenciál`;
  if (suited && ace) return `${hand} má hodnotu ace blockeru a nut-flush potenciál`;
  if (suited) return `${hand} realizuje equity lépe než offsuit handy díky flush a straight potenciálu`;
  if (broadway) return `${hand} má high-card hodnotu, ale proti agresi může být dominována`;
  return `${hand} je určována především cenou, pozicí a fold equity`;
}

function actionPlan(
  recommended: readonly ActionKey[],
  context: ActionContext,
  tableState: TableState,
): string {
  if (recommended.includes("FOLD")) {
    return "foldněte spodní část range a zachovejte si využitelný stack";
  }
  if (recommended.includes("JAM")) {
    return "jamněte pro maximalizaci fold equity a vyhněte se nepříjemnému postflop SPR";
  }
  if (recommended.includes("CALL_JAM")) {
    return "callněte all-in s dostatečnou equity proti shoving range";
  }
  if (recommended.includes("4BET")) {
    return "4-betujte nejsilnější pokračování a tlakové handy s kvalitními blockery";
  }
  if (recommended.includes("3BET") || recommended.includes("SQUEEZE")) {
    return tableState.callsBefore > 0
      ? "útočte na dead money a izolujte polarizovanou nebo lineární tlakovou range"
      : "vytvořte tlak a odepřete openerovi realizaci equity";
  }
  if (recommended.some((action) => action.startsWith("OPEN") || action.startsWith("ISO"))) {
    return context === "VS_LIMP"
      ? "izolujte limpery a převezměte iniciativu jasným sizingem"
      : "otevřete jako první a využijte pozici spolu s fold equity";
  }
  if (recommended.includes("CALL")) {
    return "pokračujte s handami, které při nabídnuté ceně dokážou realizovat equity";
  }
  return "zvolte pasivní line a nevytvářejte dominovaný pot";
}

function advancedRangeNote(input: PreflopExplanationInput): string {
  switch (input.context) {
    case "RFI":
      return "opening range určuje počet hráčů za vámi, tlak blindů a pokrytí blockerů";
    case "VS_LIMP":
      return "iso range má oddělit value izolaci od over-limp hand s dobrou realizací";
    case "VS_OPEN":
      return "obranná range vyvažuje přímé pot odds, 3-bet blockery a riziko dominovaného callu";
    case "VS_3BET":
      return "pokračovací range se zužuje podle blockerů, realizace equity a stack-off hranic";
    case "VS_4BET":
      return "range se koncentruje na premium handy, blocker jamy a cally s dostatečnou equity";
    case "SQUEEZE":
      return "squeeze těží z dead money, ale potřebuje blockery a dostatečný stack leverage";
    case "BVB":
      return "blind range jsou široké, takže kvalita blockerů a postflop pozice rozhodují těsné handy";
    case "PUSH_FOLD":
      return "push-fold EV závisí na fold equity, calling range a zachování stacku";
    case "VS_ALLIN":
      return "calling range musí po započtení pot odds a turnajového rizika porážet shoving range";
  }
}

function beginnerReasonEn(input: PreflopExplanationInput): string {
  if (input.recommended.includes("FOLD")) {
    return "Keep a disciplined range and preserve the stack.";
  }
  if (input.recommended.some(isRaiseAction)) {
    return "Use fold equity and apply pressure with a hand that belongs in the active range.";
  }
  if (input.recommended.some((action) => action === "CALL" || action === "CALL_JAM")) {
    return "Continue because the hand has enough strength or a sufficient price to realize equity.";
  }
  return "Choose the lowest-risk line that fits the spot.";
}

function positionReasonEn(position: Position, context: ActionContext): string {
  if (position === "SB" || position === "BB") {
    return context === "BVB"
      ? "blind-vs-blind ranges are wider, while position and equity realization still matter"
      : "blind defense depends on pot odds, blockers, and postflop equity realization";
  }
  if (position === "BTN" || position === "CO") {
    return "late position can pressure the blinds with wider value and bluff ranges";
  }
  if (position === "LJ" || position === "HJ") {
    return "middle position favors playable hands and limits weak dominated continues";
  }
  return "early position uses a tighter range because many opponents remain behind";
}

function stackReasonEn(stack: StackBucket, context: ActionContext): string {
  if (context === "PUSH_FOLD" || context === "VS_ALLIN" || stack <= 10) {
    return "short-stack decisions are driven by fold equity, blockers, and immediate all-in risk";
  }
  if (stack <= 25) {
    return "reshove pressure is high, so marginal opens and calls lose value quickly";
  }
  if (stack <= 60) {
    return "a medium stack can apply pressure while retaining postflop playability";
  }
  return "deep stacks favor suited hands, nut potential, and position because equity realization matters more";
}

function handReasonEn(hand: HandLabel): string {
  if (hand.length === 2 && hand[0] === hand[1]) {
    return `${hand} is a pocket pair with set value and clear showdown potential`;
  }
  const suited = hand.endsWith("s");
  const ranks = hand.slice(0, 2);
  const broadway = /[AKQJT]/.test(ranks[0]) && /[AKQJT]/.test(ranks[1]);
  const ace = ranks.includes("A");
  if (suited && broadway) return `${hand} offers suited broadway playability, blockers, and nut potential`;
  if (suited && ace) return `${hand} benefits from an ace blocker and nut-flush potential`;
  if (suited) return `${hand} realizes equity better than offsuit hands through flush and straight potential`;
  if (broadway) return `${hand} has high-card value but can be dominated against aggression`;
  return `${hand} is driven mainly by price, position, and fold equity`;
}

function actionPlanEn(
  recommended: readonly ActionKey[],
  context: ActionContext,
  tableState: TableState,
): string {
  if (recommended.includes("FOLD")) return "fold the bottom of the range and preserve a useful stack";
  if (recommended.includes("JAM")) return "jam to maximize fold equity and avoid an awkward postflop SPR";
  if (recommended.includes("CALL_JAM")) return "call the all-in with sufficient equity against the shoving range";
  if (recommended.includes("4BET")) return "4-bet the strongest continues and pressure hands with high-quality blockers";
  if (recommended.includes("3BET") || recommended.includes("SQUEEZE")) {
    return tableState.callsBefore > 0
      ? "attack the dead money and isolate with a polarized or linear pressure range"
      : "apply pressure and deny the opener equity realization";
  }
  if (recommended.some((action) => action.startsWith("OPEN") || action.startsWith("ISO"))) {
    return context === "VS_LIMP"
      ? "isolate the limpers and take initiative with a clear size"
      : "open first in and combine position with fold equity";
  }
  if (recommended.includes("CALL")) {
    return "continue with hands that can realize equity at the offered price";
  }
  return "choose the passive line and avoid building a dominated pot";
}

function advancedRangeNoteEn(input: PreflopExplanationInput): string {
  switch (input.context) {
    case "RFI":
      return "the opening range is shaped by players behind, blind pressure, and blocker coverage";
    case "VS_LIMP":
      return "the iso range separates value isolation from over-limp hands with strong realization";
    case "VS_OPEN":
      return "the defense balances direct pot odds, 3-bet blockers, and dominated-call risk";
    case "VS_3BET":
      return "the continuing range narrows according to blockers, equity realization, and stack-off thresholds";
    case "VS_4BET":
      return "the range concentrates on premium hands, blocker jams, and calls with sufficient equity";
    case "SQUEEZE":
      return "a squeeze benefits from dead money but needs blockers and enough stack leverage";
    case "BVB":
      return "blind ranges are wide, so blocker quality and postflop position decide close hands";
    case "PUSH_FOLD":
      return "push-fold EV depends on fold equity, the calling range, and stack preservation";
    case "VS_ALLIN":
      return "after pot odds and tournament risk, the calling range must beat the shoving range";
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
