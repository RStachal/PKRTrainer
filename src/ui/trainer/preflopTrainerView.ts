import {
  buildPreflopExplanationForSpot,
  preflopActionPlanForSpot,
} from "../../core/preflopExplanation";
import type { ActionKey, Spot } from "../../core/types";
import type { PreflopAnswer, PreflopSession } from "../../training/preflopSession";
import { getAppLanguage, localizedText } from "../cs";
import { renderDecisionPrice } from "../decisionPricePanel";
import { formatEvLoss, formatSignedBb } from "../kit/format";
import { outcomeChip, type OutcomeChipKind } from "../kit/outcomeChip";
import { playingCard } from "../kit/playingCard";
import { pokerTable } from "../kit/pokerTable";
import { colorForActionKey } from "../rangeMatrixView";
import { openRangeModal } from "../rangeModal";
import { actionButton, button, createTrainerFrame, el, nextSpotRow } from "./trainerFrame";

/**
 * Nová obrazovka preflopového tréninku (Agents/ui-redesign-plan.md, fáze 1,
 * krok 2). Logiku relace bere z řadiče, který používá i starý pohled, takže
 * oba zapisují do statistik totéž; tahle vrstva jen kreslí. Kostru obrazovky
 * a klávesnici sdílí s postflopem (`trainerFrame.ts`).
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

/** Preflopová EV jde v setinách; vyřešený strom nese jen desetiny. */
function evDecimals(spot: Spot): number {
  return spot.actionEvs?.source === "SOLVED_TREE" ? 1 : 2;
}

function outcomeKind(answer: PreflopAnswer): OutcomeChipKind {
  const ev = answer.grade.actionEv;
  if (ev) return ev.outcome;
  return answer.grade.correct ? "CORRECT" : "MISTAKE";
}

export function createPreflopTrainerView(
  doc: Document,
  options: PreflopTrainerViewOptions,
): PreflopTrainerView {
  const { session } = options;
  const frame = createTrainerFrame(doc, {
    street: "Preflop",
    onChangeSituation: () => options.onChangeSituation(),
    isAnswered: () => session.answered,
  });

  function renderActions(spot: Spot): void {
    frame.actions.replaceChildren(...spot.answers.map((answer, index) => actionButton(doc, {
      action: answer.key,
      label: answer.label,
      color: colorForActionKey(answer.key),
      index,
      onClick: () => submit(answer.key),
    })));
  }

  function renderFeedback(result: PreflopAnswer): void {
    const { spot, grade } = result;
    const labels = new Map(spot.answers.map((answer) => [answer.key, answer.label] as const));
    const label = (key: ActionKey): string => labels.get(key) ?? key;
    const decimals = evDecimals(spot);
    const ev = grade.actionEv;

    const verdict = el(doc, "div", "dx-trainer__verdict");
    verdict.append(outcomeChip(doc, outcomeKind(result)));
    const loss = ev ? formatEvLoss(ev.evLossBb, decimals) : null;
    if (loss !== null) verdict.append(el(doc, "span", "dx-trainer__loss", loss));

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

    const extra: HTMLElement[] = [];
    const store = session.rangeStore;
    if (store !== null) {
      const range = button(doc, "dx-btn dx-btn--secondary", "Range");
      range.addEventListener("click", () => openRangeModal(doc, spot, store));
      extra.push(range);
    }
    const { row, next: nextButton } = nextSpotRow(doc, () => next(), extra);
    parts.push(row);

    frame.showFeedback(parts, nextButton);
  }

  function submit(key: ActionKey): void {
    const result = session.answer(key);
    if (!result) return;
    options.onAnswered();
    frame.markActions(result.chosen, result.grade.recommended);
    frame.renderScore(session.score);
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
    frame.title.textContent = options.title(spot);
    const ante = filters?.ante ?? spot.ante;
    frame.meta.textContent = `${spot.effStack} BB · ${ante === "ON" ? "ante" : localizedText("no ante", "bez ante")}`;
    frame.table.replaceChildren(pokerTable(doc, spot, ante));
    frame.prompt.replaceChildren(
      `${localizedText("How do you play", "Jak zahraješ")} `,
      ...spot.heroCards.map((card) => playingCard(doc, card, "sm")),
      el(doc, "span", "dx-trainer__qmark", "?"),
    );
    frame.hideFeedback();
    renderActions(spot);
    frame.renderScore(session.score);
    frame.focusFirstAction();
  }

  function clear(): void {
    frame.title.textContent = "";
    frame.meta.textContent = "";
    frame.prompt.replaceChildren();
    frame.table.replaceChildren();
    frame.actions.replaceChildren();
    frame.hideFeedback();
  }

  frame.renderScore(session.score);

  return {
    element: frame.root,
    show,
    clear,
    destroy: frame.destroy,
  };
}
