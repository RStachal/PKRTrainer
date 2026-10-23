import { isHotStreak, type SessionScore } from "../../core/sessionScore";
import { localizedText } from "../cs";

/**
 * Kostra obrazovky tréninku, společná preflopu i postflopu
 * (Agents/ui-redesign-plan.md, fáze 1).
 *
 * Hlavička spotu se skóre relace a tlačítkem „Změnit situaci“, místo pro stůl
 * a dok s otázkou, akcemi a vyhodnocením. Klávesnice je tu jednou: 1–9
 * odpovídá, Enter mimo ovládací prvek vede na další spot. Co se v kostře
 * kreslí, řeší obrazovka konkrétní ulice.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(doc: Document, className: string, text: string): HTMLButtonElement {
  const node = el(doc, "button", className, text);
  node.type = "button";
  return node;
}

export function kbd(doc: Document, text: string): HTMLElement {
  const node = el(doc, "kbd", "dx-kbd", text);
  node.setAttribute("aria-hidden", "true");
  return node;
}

/**
 * Tlačítko akce: název, volitelně druhý řádek (velikost sázky) a zkratka.
 * Barva akce jde přes `--action-accent` z jediného zdroje barev akcí.
 */
export function actionButton(
  doc: Document,
  options: { action: string; label: string; detail?: string; color: string; index: number; onClick: () => void },
): HTMLButtonElement {
  const action = button(doc, "dx-btn dx-btn--action", "");
  action.dataset.action = options.action;
  action.setAttribute("aria-pressed", "false");
  action.style.setProperty("--action-accent", options.color);
  action.append(el(doc, "span", "dx-trainer__action-label", options.label));
  if (options.detail !== undefined) action.append(el(doc, "span", "dx-btn__hint", options.detail));
  if (options.index < 9) action.append(kbd(doc, String(options.index + 1)));
  action.addEventListener("click", options.onClick);
  return action;
}

/** Řádek pod vyhodnocením: případná další tlačítka a „Další spot“ s Enterem. */
export function nextSpotRow(
  doc: Document,
  onNext: () => void,
  extra: readonly HTMLElement[] = [],
): { row: HTMLElement; next: HTMLButtonElement } {
  const row = el(doc, "div", "dx-trainer__next-row");
  const next = button(doc, "dx-btn dx-btn--primary dx-trainer__next", localizedText("Next spot", "Další spot"));
  next.append(kbd(doc, "Enter"));
  next.addEventListener("click", onNext);
  row.append(...extra, next);
  return { row, next };
}

function streakText(score: SessionScore): string {
  return localizedText(`Streak ${score.streak}`, `Série ${score.streak}`);
}

function tallyText(score: SessionScore): string {
  if (score.answered === 0) return localizedText("No answers yet", "Zatím bez odpovědí");
  return localizedText(
    `${score.correct}/${score.answered} correct · best streak ${score.bestStreak}`,
    `${score.correct} z ${score.answered} správně · nejdelší série ${score.bestStreak}`,
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, summary") !== null;
}

export interface TrainerFrameOptions {
  /** Štítek ulice v hlavičce. */
  street: string;
  onChangeSituation: () => void;
  /** Je odpověď na aktuální spot už daná? Klávesy 1–9 pak nic nedělají. */
  isAnswered: () => boolean;
}

export interface TrainerFrame {
  readonly root: HTMLElement;
  readonly street: HTMLElement;
  readonly title: HTMLElement;
  readonly meta: HTMLElement;
  readonly table: HTMLElement;
  /** Otázka nad akcemi; na mobilu zakryje dok spodek stolu i s kartami hráče. */
  readonly prompt: HTMLElement;
  readonly actions: HTMLElement;
  readonly feedback: HTMLElement;
  renderScore(score: SessionScore): void;
  /** Ukáže vyhodnocení a zaměří „Další spot“, na který pak vede Enter. */
  showFeedback(parts: readonly HTMLElement[], next: HTMLButtonElement): void;
  /** Schová vyhodnocení před novou otázkou. */
  hideFeedback(): void;
  /** Zamkne akce po odpovědi a vyznačí zvolenou a doporučené. */
  markActions(chosen: string, recommended: readonly string[]): void;
  /** Zaměří první akci otázky. */
  focusFirstAction(): void;
  /** Odpojí klávesnici; obrazovka se pak už nepoužije. */
  destroy(): void;
}

export function createTrainerFrame(doc: Document, options: TrainerFrameOptions): TrainerFrame {
  const root = el(doc, "section", "dx-root dx-trainer");
  root.setAttribute("aria-label", localizedText("Training", "Trénink"));

  const head = el(doc, "header", "dx-trainer__head");
  const spotBox = el(doc, "div", "dx-trainer__spot");
  const street = el(doc, "span", "dx-chip", options.street);
  const title = el(doc, "h2", "dx-trainer__title");
  const meta = el(doc, "p", "dx-trainer__meta");
  spotBox.append(street, title, meta);

  const score = el(doc, "div", "dx-trainer__score");
  score.setAttribute("aria-live", "polite");
  const streak = el(doc, "span", "dx-trainer__streak");
  const tally = el(doc, "span", "dx-trainer__tally");
  score.append(streak, tally);

  const change = button(
    doc,
    "dx-btn dx-btn--secondary dx-trainer__change",
    localizedText("Change situation", "Změnit situaci"),
  );
  change.addEventListener("click", () => options.onChangeSituation());
  head.append(spotBox, score, change);

  const table = el(doc, "div", "dx-trainer__table");
  const dock = el(doc, "div", "dx-trainer__dock");
  const prompt = el(doc, "p", "dx-trainer__prompt");
  const actions = el(doc, "div", "dx-trainer__actions");
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", localizedText("Your action", "Tvoje akce"));
  const feedback = el(doc, "section", "dx-trainer__feedback");
  feedback.setAttribute("aria-label", localizedText("Result", "Vyhodnocení"));
  feedback.hidden = true;
  dock.append(prompt, actions, feedback);
  root.append(head, table, dock);

  let nextButton: HTMLButtonElement | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    if (!root.isConnected || root.closest("[hidden]") !== null) return;
    if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
    if (/^[1-9]$/.test(event.key) && !options.isAnswered()) {
      const action = actions.querySelectorAll<HTMLButtonElement>("button")[Number(event.key) - 1];
      if (action) {
        event.preventDefault();
        action.click();
      }
      return;
    }
    // Enter na tlačítku si prohlížeč obslouží sám; obsloužit ho i tady by
    // přeskočilo spot.
    if (event.key === "Enter" && options.isAnswered() && nextButton !== null && !isControl(event.target)) {
      event.preventDefault();
      nextButton.click();
    }
  }

  doc.addEventListener("keydown", onKeyDown);

  return {
    root,
    street,
    title,
    meta,
    table,
    prompt,
    actions,
    feedback,
    renderScore(current) {
      streak.textContent = streakText(current);
      streak.dataset.hot = String(isHotStreak(current));
      tally.textContent = tallyText(current);
    },
    showFeedback(parts, next) {
      feedback.replaceChildren(...parts);
      feedback.hidden = false;
      nextButton = next;
      next.focus();
    },
    hideFeedback() {
      feedback.hidden = true;
      feedback.replaceChildren();
      nextButton = null;
    },
    markActions(chosen, recommended) {
      for (const action of actions.querySelectorAll<HTMLButtonElement>("button")) {
        const key = action.dataset.action ?? "";
        action.disabled = true;
        action.setAttribute("aria-pressed", String(key === chosen));
        if (recommended.includes(key)) action.dataset.recommended = "true";
      }
    },
    focusFirstAction() {
      actions.querySelector<HTMLButtonElement>("button")?.focus();
    },
    destroy: () => doc.removeEventListener("keydown", onKeyDown),
  };
}
