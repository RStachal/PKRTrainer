import {
  isActionEvSetComplete,
  type ActionEvEvaluation,
  type ActionEvSet,
} from "../core/actionEv";

const BUBBLE_CLASS = "action-ev-bubble";

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
    !isActionEvSetComplete(actionEvs, actions as Action[])
  ) {
    return 0;
  }

  const values = new Map(actionEvs.values.map((item) => [item.action, item.evBb]));
  for (const [index, button] of buttons.entries()) {
    const action = actions[index]!;
    const evBb = values.get(action)!;
    const bubble = actionEvBubble(button);
    const isBest = evaluation.bestActions.includes(action);
    const isChosen = evaluation.chosenAction === action;
    const formatted = formatActionEvBb(evBb);

    bubble.hidden = false;
    bubble.textContent = `EV ${formatted} BB`;
    bubble.dataset.action = action;
    bubble.dataset.evBb = String(evBb);
    bubble.classList.toggle("action-ev-bubble--best", isBest);
    bubble.classList.toggle("action-ev-bubble--chosen", isChosen);
    button.dataset.evAvailable = "true";
    button.dataset.evBb = String(evBb);
    button.setAttribute(
      "aria-label",
      `${button.dataset.actionLabel ?? action}, EV ${formatted} BB`,
    );
  }
  return buttons.length;
}

export function formatActionEvBb(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(3)}`;
}

function resetActionEvButtonBubbles(buttons: readonly HTMLButtonElement[]): void {
  for (const button of buttons) {
    const bubble = actionEvBubble(button);
    bubble.hidden = true;
    bubble.textContent = "";
    bubble.classList.remove("action-ev-bubble--best", "action-ev-bubble--chosen");
    delete bubble.dataset.action;
    delete bubble.dataset.evBb;
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
  button.appendChild(bubble);
  return bubble;
}
