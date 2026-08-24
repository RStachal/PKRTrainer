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

export const ACTION_EV_BUTTON_STYLES = `
.action-button__label{line-height:1.15;text-align:center;overflow-wrap:anywhere;}
.action-ev-bubble{box-sizing:border-box;display:grid;grid-template-columns:auto minmax(32px,1fr);
  align-items:center;gap:8px;width:100%;min-width:0;min-height:24px;padding:6px 1px 0;
  border-top:1px solid rgba(255,255,255,.13);color:#ddecff;font-size:10px;font-weight:950;
  font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;}
.action-ev-bubble[hidden]{display:grid!important;visibility:hidden;}
.action-ev-bubble__value{min-width:82px;text-align:left;}
.action-ev-bubble__meter{display:block;position:relative;height:5px;overflow:hidden;border-radius:3px;
  background:rgba(148,163,184,.2);box-shadow:inset 0 1px 2px rgba(0,0,0,.28);}
.action-ev-bubble__fill{display:block;width:var(--action-ev-strength,0%);height:100%;border-radius:inherit;
  background:#7bd3ff;box-shadow:0 0 8px rgba(123,211,255,.34);transition:width 180ms ease;}
.action-ev-bubble--best{color:#a8f2c3;border-top-color:rgba(43,213,118,.48);}
/* Akce, kterou solve nepočítal: zřetelně jiná než číslo, ale ne prázdná. */
.action-ev-bubble--unsolved{color:#9fb2d5;font-style:italic;font-weight:800;}
.action-ev-bubble--unsolved .action-ev-bubble__meter{opacity:.25;}
.action-ev-bubble--best .action-ev-bubble__fill{background:#2bd576;box-shadow:0 0 9px rgba(43,213,118,.42);}
.action-ev-bubble--chosen .action-ev-bubble__value{text-decoration:underline;text-decoration-color:#7bd3ff;
  text-decoration-thickness:2px;text-underline-offset:3px;}
`;

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
): number {
  const buttons = [...buttonsInput];
  const actions = buttons.map((button) => button.dataset.action as Action | undefined);
  resetActionEvButtonBubbles(buttons);

  if (
    !evaluation ||
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
    const isBest = evaluation.bestActions.includes(action);
    const isChosen = evaluation.chosenAction === action;
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
