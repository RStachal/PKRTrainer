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

function isRaiseAction(action: ActionKey): boolean {
  return action.startsWith("OPEN") ||
    action.startsWith("ISO") ||
    action === "3BET" ||
    action === "4BET" ||
    action === "SQUEEZE" ||
    action === "JAM";
}
