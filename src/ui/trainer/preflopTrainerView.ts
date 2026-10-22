import {
  buildPreflopExplanationForSpot,
  preflopActionPlanForSpot,
} from "../../core/preflopExplanation";
import { isHotStreak, type SessionScore } from "../../core/sessionScore";
import type { ActionKey, Spot } from "../../core/types";
import type { PreflopAnswer, PreflopSession } from "../../training/preflopSession";
import { getAppLanguage, localizedText } from "../cs";
import { renderDecisionPrice } from "../decisionPricePanel";
import { formatSignedBb } from "../kit/format";
import { outcomeChip, type OutcomeChipKind } from "../kit/outcomeChip";
import { playingCard } from "../kit/playingCard";
import { colorForActionKey } from "../rangeMatrixView";
import { openRangeModal } from "../rangeModal";
import { renderTable } from "../tableRenderer";

/**
 * Nová obrazovka preflopového tréninku (Agents/ui-redesign-plan.md, fáze 1,
 * krok 2). Logiku relace bere z řadiče, který používá i starý pohled, takže
 * oba zapisují do statistik totéž; tahle vrstva jen kreslí a předává klávesy.
 *
 * Otázka: hlavička spotu, stůl a akce (klávesy 1–9). Po odpovědi stejné místo
 * ukáže verdikt, ztrátu EV, EV akcí a jednu větu plánu; zbytek vysvětlení je
 * v podrobnostech. Enter vede na další spot.
 */

export interface PreflopTrainerViewOptions {
  session: PreflopSession;
  /** Titulek spotu, jak ho skládá dnešní GUI (`spotTitle` v main.ts). */
  title: (spot: Spot) => string;
  /** Po každé zaznamenané odpovědi: počet spotů relace, dashboard. */
  onAnswered: () => void;
  /** Hráč chce zpět k nastavení. */
  onChangeSituation: () => void;
  /** Sekvence skončila (pojistka; neprázdná sekvence cyklí donekonečna). */
  onSessionEnded: () => void;
}

export interface PreflopTrainerView {
  readonly element: HTMLElement;
  /** Ukáže otázku k novému spotu relace. */
  show(spot: Spot): void;
  /** Vyprázdní obrazovku, když relace skončí. */
  clear(): void;
  /** Odpojí klávesnici; obrazovka se pak už nepoužije. */
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
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

function button(doc: Document, className: string, text: string): HTMLButtonElement {
  const node = el(doc, "button", className, text);
  node.type = "button";
  return node;
}

function kbd(doc: Document, text: string): HTMLElement {
  const node = el(doc, "kbd", "dx-kbd", text);
  node.setAttribute("aria-hidden", "true");
  return node;
}

/** Preflopová EV jde v setinách; vyřešený strom nese jen desetiny. */
function evDecimals(spot: Spot): number {
  return spot.actionEvs?.source === "SOLVED_TREE" ? 1 : 2;
}

function outcomeKind(answer: PreflopAnswer): OutcomeChipKind {
  const ev = answer.grade.actionEv;
  if (ev) return ev.outcome;
  return answer.grade.correct ? "CORRECT" : "MISTAKE";
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

export function createPreflopTrainerView(
  doc: Document,
  options: PreflopTrainerViewOptions,
): PreflopTrainerView {
  const { session } = options;

  const root = el(doc, "section", "dx-root dx-trainer");
  root.setAttribute("aria-label", localizedText("Training", "Trénink"));

  const head = el(doc, "header", "dx-trainer__head");
  const spotBox = el(doc, "div", "dx-trainer__spot");
  const title = el(doc, "h2", "dx-trainer__title");
  const meta = el(doc, "p", "dx-trainer__meta");
  spotBox.append(el(doc, "span", "dx-chip", "Preflop"), title, meta);

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
  // Otázka i s kartami hráče přímo nad akcemi: na mobilu panel akcí zakryje
  // spodek stolu, kde hráč sedí, a karty by jinak nebyly vidět.
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

  function renderScore(): void {
    streak.textContent = streakText(session.score);
    streak.dataset.hot = String(isHotStreak(session.score));
    tally.textContent = tallyText(session.score);
  }

  function renderActions(spot: Spot): void {
    actions.replaceChildren();
    spot.answers.forEach((answer, index) => {
      const action = button(doc, "dx-btn dx-btn--action", "");
      action.dataset.action = answer.key;
      action.setAttribute("aria-pressed", "false");
      action.style.setProperty("--action-accent", colorForActionKey(answer.key));
      action.append(el(doc, "span", "dx-trainer__action-label", answer.label));
      if (index < 9) action.append(kbd(doc, String(index + 1)));
      action.addEventListener("click", () => submit(answer.key));
      actions.appendChild(action);
    });
  }

  function markActions(result: PreflopAnswer): void {
    for (const action of actions.querySelectorAll<HTMLButtonElement>("button")) {
      const key = action.dataset.action as ActionKey;
      action.disabled = true;
      action.setAttribute("aria-pressed", String(key === result.chosen));
      if (result.grade.recommended.includes(key)) action.dataset.recommended = "true";
    }
  }

  function renderFeedback(result: PreflopAnswer): void {
    const { spot, grade } = result;
    const labels = new Map(spot.answers.map((answer) => [answer.key, answer.label] as const));
    const label = (key: ActionKey): string => labels.get(key) ?? key;
    const decimals = evDecimals(spot);
    const ev = grade.actionEv;

    const verdict = el(doc, "div", "dx-trainer__verdict");
    verdict.append(outcomeChip(doc, outcomeKind(result)));
    if (ev && ev.evLossBb > 0) {
      verdict.append(el(doc, "span", "dx-trainer__loss", formatSignedBb(-ev.evLossBb, decimals)));
    }

    const choice = el(doc, "p", "dx-trainer__choice");
    choice.append(
      `${localizedText("Your choice", "Tvoje volba")} `,
      el(doc, "strong", "", label(result.chosen)),
      ` · ${localizedText("recommended", "doporučení")} `,
      el(doc, "strong", "", grade.recommended.map(label).join(" / ")),
    );

    const parts: HTMLElement[] = [verdict, choice];

    if (ev && spot.actionEvs) {
      const rows = el(doc, "div", "dx-trainer__ev");
      rows.setAttribute("role", "list");
      rows.setAttribute("aria-label", localizedText("EV of each action", "EV jednotlivých akcí"));
      const sorted = [...spot.actionEvs.values].sort((left, right) => right.evBb - left.evBb);
      for (const item of sorted) {
        const row = el(doc, "div", "dx-trainer__ev-row");
        row.setAttribute("role", "listitem");
        row.dataset.action = item.action;
        row.dataset.chosen = String(item.action === result.chosen);
        row.dataset.best = String(ev.bestActions.includes(item.action));
        const name = el(doc, "span", "dx-trainer__ev-name");
        const dot = el(doc, "span", "dx-trainer__ev-dot");
        dot.setAttribute("aria-hidden", "true");
        dot.style.setProperty("--action-accent", colorForActionKey(item.action));
        name.append(dot, label(item.action));
        if (item.action === result.chosen) {
          name.append(el(doc, "span", "dx-trainer__ev-tag", ` (${localizedText("yours", "tvoje")})`));
        }
        row.append(name, el(doc, "span", "dx-trainer__ev-value", formatSignedBb(item.evBb, decimals)));
        rows.appendChild(row);
      }
      parts.push(rows);
    } else {
      parts.push(el(
        doc,
        "p",
        "dx-trainer__note",
        localizedText(
          "EV of each action is not available for this spot.",
          "EV jednotlivých akcí pro tenhle spot nemáme.",
        ),
      ));
    }

    const language = getAppLanguage();
    parts.push(el(doc, "p", "dx-trainer__plan", preflopActionPlanForSpot(spot, language)));

    const more = el(doc, "details", "dx-trainer__more");
    more.append(el(doc, "summary", "", localizedText("Details", "Podrobnosti")));
    more.append(el(
      doc,
      "p",
      "",
      grade.explanationAvailable
        ? buildPreflopExplanationForSpot(spot, language)
        : localizedText("No explanation for this spot.", "K tomuhle spotu vysvětlení nemáme."),
    ));
    const filters = session.filters;
    const price = filters === null ? null : renderDecisionPrice(doc, spot, filters);
    if (price !== null) more.append(price);
    parts.push(more);

    if (!result.saved) {
      const warning = el(
        doc,
        "p",
        "dx-trainer__warning",
        localizedText(
          "The answer could not be saved to statistics.",
          "Odpověď se nepodařilo uložit do statistik.",
        ),
      );
      warning.setAttribute("role", "alert");
      parts.push(warning);
    }

    const row = el(doc, "div", "dx-trainer__next-row");
    const store = session.rangeStore;
    if (store !== null) {
      const range = button(doc, "dx-btn dx-btn--secondary", "Range");
      range.addEventListener("click", () => openRangeModal(doc, spot, store));
      row.append(range);
    }
    nextButton = button(doc, "dx-btn dx-btn--primary dx-trainer__next", localizedText("Next spot", "Další spot"));
    nextButton.append(kbd(doc, "Enter"));
    nextButton.addEventListener("click", () => next());
    row.append(nextButton);
    parts.push(row);

    feedback.replaceChildren(...parts);
    feedback.hidden = false;
    nextButton.focus();
  }

  function submit(key: ActionKey): void {
    const result = session.answer(key);
    if (!result) return;
    options.onAnswered();
    markActions(result);
    renderScore();
    renderFeedback(result);
  }

  function next(): void {
    const spot = session.next();
    if (!spot) {
      options.onSessionEnded();
      return;
    }
    show(spot);
  }

  function show(spot: Spot): void {
    const filters = session.filters;
    title.textContent = options.title(spot);
    const ante = filters?.ante ?? spot.ante;
    meta.textContent = `${spot.effStack} BB · ${ante === "ON" ? "ante" : localizedText("no ante", "bez ante")}`;
    renderTable(spot, ante, table);
    prompt.replaceChildren(
      `${localizedText("How do you play", "Jak zahraješ")} `,
      ...spot.heroCards.map((card) => playingCard(doc, card, "sm")),
      el(doc, "span", "dx-trainer__qmark", "?"),
    );
    feedback.hidden = true;
    feedback.replaceChildren();
    nextButton = null;
    renderActions(spot);
    renderScore();
    actions.querySelector<HTMLButtonElement>("button")?.focus();
  }

  function clear(): void {
    title.textContent = "";
    meta.textContent = "";
    prompt.replaceChildren();
    table.replaceChildren();
    actions.replaceChildren();
    feedback.replaceChildren();
    feedback.hidden = true;
    nextButton = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!root.isConnected || root.closest("[hidden]") !== null) return;
    if (event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
    if (/^[1-9]$/.test(event.key) && !session.answered) {
      const action = actions.querySelectorAll<HTMLButtonElement>("button")[Number(event.key) - 1];
      if (action) {
        event.preventDefault();
        action.click();
      }
      return;
    }
    // Enter na tlačítku si prohlížeč obslouží sám; obsloužit ho i tady by
    // přeskočilo spot.
    if (event.key === "Enter" && session.answered && nextButton !== null && !isControl(event.target)) {
      event.preventDefault();
      nextButton.click();
    }
  }

  doc.addEventListener("keydown", onKeyDown);
  renderScore();

  return {
    element: root,
    show,
    clear,
    destroy: () => doc.removeEventListener("keydown", onKeyDown),
  };
}
