import {
  DISPLAYABLE_ACTION_EV_SOURCES,
  isActionEvSetUsable,
  type ActionEvEvaluation,
  type ActionEvSet,
} from "../core/actionEv";

const BUBBLE_CLASS = "action-ev-bubble";

/** Kolik desetinných míst nese který zdroj, aby se nepředstírala přesnost. */
function decimalsFor(source: ActionEvSet<string>["source"]): number {
  return source === "SOLVED_TREE" ? 1 : 3;
}

export function setActionEvButtonContent(
  button: HTMLButtonElement,
  label: string,
): void {
  const doc = button.ownerDocument ?? document;
  const labelNode = doc.createElement("span");
  labelNode.className = "action-button__label";
  labelNode.textContent = label;

  const bubble = doc.createElement("span");
  bubble.className = BUBBLE_CLASS;
  bubble.hidden = true;
  prepareBubbleContents(bubble);

  button.dataset.actionLabel = label;
  button.dataset.evAvailable = "false";
  button.setAttribute("aria-label", label);
  button.replaceChildren(labelNode, bubble);
}

export function revealActionEvButtonBubbles<Action extends string>(
  buttonsInput: Iterable<HTMLButtonElement>,
  actionEvs: ActionEvSet<Action> | undefined,
  evaluation: ActionEvEvaluation<Action> | undefined,
  /**
   * Co hráč zvolil, když se to nedá vyčíst z vyhodnocení.
   *
   * Vyhodnocení chybí právě tehdy, když hráč zvolil akci, kterou rozbor
   * nemodeluje - a to je nejhorší možná chvíle EV schovat: hráč zvolil něco, o
   * čem nic nevíme, a chce vidět, co byly ostatní možnosti hodné. Dokud tenhle
   * parametr nebyl, zmizela v tu chvíli všechna čísla, i ta, která máme.
   */
  chosenAction?: Action,
): number {
  const buttons = [...buttonsInput];
  const actions = buttons.map((button) => button.dataset.action as Action | undefined);
  resetActionEvButtonBubbles(buttons);

  const chosen = evaluation?.chosenAction ?? chosenAction;
  if (
    chosen === undefined ||
    actions.some((action) => action === undefined) ||
    // Zobrazovací seznam, ne ten pro import packů: sem chodí i čísla dopočítaná
    // za běhu a přísná podmínka je dřív zahazovala všechna.
    // Použitelná, ne úplná. Solve nemusí obsahovat akci, kterou trenažér
    // nabízí - typicky zvýšení tam, kde solver žádnou větev se zvýšením
    // nepočítal. Trvat na úplnosti znamenalo zatajit i čísla, která máme:
    // změřeno, EV se ukazovala jen ve 20 % riverových spotů.
    !isActionEvSetUsable(actionEvs, actions as Action[], DISPLAYABLE_ACTION_EV_SOURCES)
  ) {
    return 0;
  }

  const values = new Map(actionEvs.values.map((item) => [item.action, item.evBb]));
  const minimumEv = Math.min(...actionEvs.values.map((item) => item.evBb));
  const maximumEv = Math.max(...actionEvs.values.map((item) => item.evBb));
  let shown = 0;
  for (const [index, button] of buttons.entries()) {
    const action = actions[index]!;
    const bubble = actionEvBubble(button);
    const known = values.get(action);
    if (known === undefined) {
      // Akce, kterou solve nepočítal. **Musí to být vidět**, ne zůstat prázdná:
      // prázdno vedle čísel se čte jako „tahle akce nemá cenu", a to je nepravda
      // jiného druhu než chybějící údaj.
      bubble.hidden = false;
      bubble.classList.add("action-ev-bubble--unsolved");
      bubbleValue(bubble).textContent = "EV nespočítána";
      bubble.style.setProperty("--action-ev-strength", "0%");
      bubble.dataset.action = action;
      bubble.dataset.evUnsolved = "true";
      button.dataset.evAvailable = "unsolved";
      button.setAttribute(
        "aria-label",
        `${button.dataset.actionLabel ?? action}, EV nespočítána`,
      );
      continue;
    }
    const evBb = known;
    const isBest = evaluation?.bestActions.includes(action) ?? false;
    const isChosen = chosen === action;
    const formatted = formatActionEvBb(evBb, decimalsFor(actionEvs.source));

    bubble.hidden = false;
    const strength = isBest ? 100 : relativeEvStrength(evBb, minimumEv, maximumEv);
    bubbleValue(bubble).textContent = `EV ${formatted} BB`;
    bubble.style.setProperty("--action-ev-strength", `${strength}%`);
    bubble.dataset.action = action;
    bubble.dataset.evBb = String(evBb);
    bubble.dataset.evStrengthPct = String(strength);
    bubble.classList.toggle("action-ev-bubble--best", isBest);
    bubble.classList.toggle("action-ev-bubble--chosen", isChosen);
    button.dataset.evAvailable = "true";
    button.dataset.evBb = String(evBb);
    button.setAttribute(
      "aria-label",
      `${button.dataset.actionLabel ?? action}, EV ${formatted} BB`,
    );
    shown += 1;
  }
  return shown;
}

/**
 * EV v blindech na pevný počet desetinných míst.
 *
 * Tři jsou tu kvůli preflopu, kde jsou rozdíly setinové a zaokrouhlení na
 * desetinu by je smazalo. Vyřešená riverová EV se ale **ukládá po desetinách**,
 * takže `+3,400` by u ní předstíralo přesnost, kterou ta data nemají.
 */
export function formatActionEvBb(value: number, decimals = 3): string {
  const scale = 10 ** decimals;
  const rounded = Math.round(value * scale) / scale;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(decimals)}`;
}

function resetActionEvButtonBubbles(buttons: readonly HTMLButtonElement[]): void {
  for (const button of buttons) {
    const bubble = actionEvBubble(button);
    bubble.hidden = true;
    bubbleValue(bubble).textContent = "";
    bubble.style.removeProperty("--action-ev-strength");
    bubble.classList.remove("action-ev-bubble--best", "action-ev-bubble--chosen");
    delete bubble.dataset.action;
    delete bubble.dataset.evBb;
    delete bubble.dataset.evStrengthPct;
    button.dataset.evAvailable = "false";
    delete button.dataset.evBb;
    button.setAttribute("aria-label", button.dataset.actionLabel ?? button.textContent ?? "");
  }
}

function actionEvBubble(button: HTMLButtonElement): HTMLElement {
  const existing = button.querySelector<HTMLElement>(`.${BUBBLE_CLASS}`);
  if (existing) return existing;
  const bubble = (button.ownerDocument ?? document).createElement("span");
  bubble.className = BUBBLE_CLASS;
  bubble.hidden = true;
  prepareBubbleContents(bubble);
  button.appendChild(bubble);
  return bubble;
}

function prepareBubbleContents(bubble: HTMLElement): void {
  if (bubble.querySelector(".action-ev-bubble__value")) return;
  const doc = bubble.ownerDocument ?? document;
  const value = doc.createElement("span");
  value.className = "action-ev-bubble__value";
  const meter = doc.createElement("span");
  meter.className = "action-ev-bubble__meter";
  meter.setAttribute("aria-hidden", "true");
  const fill = doc.createElement("span");
  fill.className = "action-ev-bubble__fill";
  meter.appendChild(fill);
  bubble.replaceChildren(value, meter);
}

function bubbleValue(bubble: HTMLElement): HTMLElement {
  prepareBubbleContents(bubble);
  return bubble.querySelector<HTMLElement>(".action-ev-bubble__value")!;
}

function relativeEvStrength(value: number, minimum: number, maximum: number): number {
  const spread = maximum - minimum;
  if (spread <= Number.EPSILON) return 100;
  return Math.round(8 + ((value - minimum) / spread) * 92);
}
