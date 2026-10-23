import type { PostflopAction, PostflopPotType, PostflopStreet } from "../../core/postflopGenerator";
import { postflopDecisionPrices } from "../../core/postflopDecisionPrice";
import { gradePostflopAction, type PostflopGrade } from "../../core/postflopScoring";
import { villainActionBeforeHero, type PostflopTrainingSpot } from "../../core/postflopTrainingSpot";
import { emptySessionScore, isHit, recordAnswer } from "../../core/sessionScore";
import { MODEL_BET_RATIO, solvedBetSizing } from "../../data/ranges/solvedBetSizing";
import { CS, localizedText } from "../cs";
import { formatBbAmount, formatDecimal, formatEvLoss, formatSignedBb } from "../kit/format";
import { outcomeChip, type OutcomeChipKind } from "../kit/outcomeChip";
import { playingCard } from "../kit/playingCard";
import { postflopPokerTable } from "../kit/pokerTable";
import { formatSharePercent, strategyBar, strategyLegend } from "../kit/strategyBar";
import { postflopModelNotes } from "../postflopModelNotes";
import { colorForPostflopAction } from "../rangeMatrixView";
import { actionButton, createTrainerFrame, el, nextSpotRow } from "./trainerFrame";

/**
 * Nová obrazovka jednoho postflopového spotu (Agents/ui-redesign-plan.md,
 * fáze 1, krok 3b). Spot rozdává `dealPostflopSpot` a hodnotí
 * `gradePostflopAction`, stejně jako starý pohled; zápis do statistik dělá
 * `main.ts` přes `onAnswered`. Tahle vrstva kreslí a vede skóre relace.
 *
 * Otázka: deska na stole, akce soupeře na téhle ulici a akce hráče
 * s velikostí sázky. Vyhodnocení: verdikt, ztráta EV a EV akcí tam, kde je
 * solver spočítal, cena dorovnání, strategie solveru pro ruce jako hráčova
 * a věta shrnutí. Ruce po lajnách, plán a poznámky k modelu jsou
 * v podrobnostech.
 */

export interface PostflopTrainerViewOptions {
  /** Další spot téže situace. */
  onNext: () => void;
  onChangeSituation: () => void;
  /** Po každé odpovědi; zápis do statistik je na volajícím. */
  onAnswered: (spot: PostflopTrainingSpot, chosen: PostflopAction, responseMs?: number) => void;
  /** Hodiny pro dobu rozhodnutí v ms; testy si dají vlastní. */
  now?: () => number;
}

export interface PostflopTrainerView {
  readonly element: HTMLElement;
  /** Ukáže otázku k novému spotu. */
  show(spot: PostflopTrainingSpot): void;
  /** Odpojí klávesnici; obrazovka se pak už nepoužije. */
  destroy(): void;
}

const STREET_LABEL: Record<PostflopStreet, string> = {
  FLOP: "Flop",
  TURN: "Turn",
  RIVER: "River",
};

const POT_TYPE_LABEL: Record<PostflopPotType, string> = {
  SINGLE_RAISED: "SRP",
  THREE_BET_POT: "3bet pot",
  LIMPED_POT: "limped pot",
};

/** EV postflopu jde v setinách, stejně jako preflopová bez vyřešeného stromu. */
const EV_DECIMALS = 2;

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Sázka, které hráč čelí, když ji vyřešené pravidlo nese. */
function facingBetBb(spot: PostflopTrainingSpot): number | undefined {
  const source = spot.explanation.source;
  return source.kind === "STRATEGY_PACK" ? source.facingBetBB : undefined;
}

/**
 * Název akce a částka, když akce stojí žetony.
 *
 * Velikost sázky je ta, kterou solve za tlačítkem hrál (`solvedBetSizing`);
 * bez vyřešené velikosti modelová, se kterou počítá i simulátor linky, takže
 * tlačítko a bank po akci mluví o téže sázce.
 */
function actionText(spot: PostflopTrainingSpot, action: PostflopAction): { label: string; detail?: string } {
  switch (action) {
    case "BET_SMALL":
    case "BET_BIG": {
      const sizing = solvedBetSizing(spot.explanation.source, action);
      if (sizing?.allIn === true) return { label: "All-in", detail: formatBbAmount(spot.effectiveStackBB) };
      const ratio = sizing?.ratio ?? MODEL_BET_RATIO[action];
      return {
        label: `Bet ${formatSharePercent(ratio)}`,
        detail: formatBbAmount(Math.min(spot.effectiveStackBB, spot.potBB * ratio)),
      };
    }
    case "CALL": {
      const bet = facingBetBb(spot);
      return bet === undefined ? { label: "Call" } : { label: "Call", detail: formatBbAmount(bet) };
    }
    case "CHECK":
      return { label: "Check" };
    case "RAISE":
      return { label: "Raise" };
    case "FOLD":
      return { label: "Fold" };
  }
}

/**
 * Verdikt. Akce, kterou rozbor nepočítal, je „neposouzeno“, ne chyba: solver
 * na tom uzlu takovou větev nemá (`PostflopGrade.unsolved`).
 */
function outcomeKind(grade: PostflopGrade): OutcomeChipKind {
  if (grade.unsolved) return "UNSOLVED";
  if (grade.actionEv) return grade.actionEv.outcome;
  return grade.correct ? "CORRECT" : "MISTAKE";
}

/** Co se na téhle ulici stalo před hráčem, jednou větou nad otázkou. */
function situationText(spot: PostflopTrainingSpot): string {
  const villain = spot.villainPosition;
  switch (villainActionBeforeHero(spot)) {
    case "BET": {
      const bet = facingBetBb(spot);
      const amount = bet === undefined ? "" : ` ${formatBbAmount(bet)}`;
      return localizedText(`${villain} bets${amount}.`, `${villain} vsadil${amount}.`);
    }
    case "CHECK":
      return localizedText(`${villain} checks.`, `${villain} checknul.`);
    case "NONE":
      return localizedText("You act first.", "Jednáš první.");
  }
}

/** Frekvence solveru pro kbelík hráčovy ruky, když je smí ukázat přesně. */
function solverMix(spot: PostflopTrainingSpot): readonly { action: PostflopAction; share: number }[] {
  const source = spot.explanation.source;
  // Heuristiku nikdy nevydávat za solver: pruh jen u vyřešeného obsahu.
  if (source.kind !== "STRATEGY_PACK" || source.provenance !== "SOLVER_BACKED") return [];
  const mix = source.heroRangeBucket?.actionMix;
  if (mix === undefined || mix.length === 0) return [];
  if (!mix.every((item) => item.visibility === "EXACT")) return [];
  return mix.map((item) => ({ action: item.action, share: item.frequencyPct }));
}

function handList(doc: Document, title: string, hands: readonly string[]): HTMLElement {
  const block = el(doc, "div", "dx-trainer__hands");
  block.append(el(doc, "h3", "dx-trainer__hands-title", title));
  block.append(el(
    doc,
    "p",
    "",
    hands.length > 0 ? hands.join(", ") : localizedText("None.", "Žádné."),
  ));
  return block;
}

export function createPostflopTrainerView(
  doc: Document,
  options: PostflopTrainerViewOptions,
): PostflopTrainerView {
  const now = options.now ?? defaultNow;
  let current: PostflopTrainingSpot | null = null;
  let answered = false;
  let shownAt = 0;
  let score = emptySessionScore();

  const frame = createTrainerFrame(doc, {
    street: "Flop",
    onChangeSituation: () => options.onChangeSituation(),
    isAnswered: () => answered,
  });

  function renderActions(spot: PostflopTrainingSpot): void {
    frame.actions.replaceChildren(...spot.actions.map((option, index) => {
      const text = actionText(spot, option.action);
      return actionButton(doc, {
        action: option.action,
        label: text.label,
        ...(text.detail === undefined ? {} : { detail: text.detail }),
        color: colorForPostflopAction(option.action),
        index,
        onClick: () => submit(option.action),
      });
    }));
  }

  function renderFeedback(spot: PostflopTrainingSpot, chosen: PostflopAction, grade: PostflopGrade): void {
    const label = (action: PostflopAction): string => actionText(spot, action).label;
    const ev = grade.actionEv;

    const verdict = el(doc, "div", "dx-trainer__verdict");
    verdict.append(outcomeChip(doc, outcomeKind(grade)));
    const loss = ev ? formatEvLoss(ev.evLossBb, EV_DECIMALS) : null;
    if (loss !== null) verdict.append(el(doc, "span", "dx-trainer__loss", loss));

    const choice = el(doc, "p", "dx-trainer__choice");
    choice.append(
      `${localizedText("Your choice", "Tvoje volba")} `,
      el(doc, "strong", "", label(chosen)),
      ` · ${localizedText("recommended", "doporučení")} `,
      el(doc, "strong", "", grade.recommended.map(label).join(" / ")),
    );

    const parts: HTMLElement[] = [verdict, choice];

    if (grade.unsolved) parts.push(el(doc, "p", "dx-trainer__note", CS.postflop.unsolved));

    if (ev && spot.actionEvs) {
      const rows = el(doc, "div", "dx-trainer__ev");
      rows.setAttribute("role", "list");
      rows.setAttribute("aria-label", localizedText("EV of each action", "EV jednotlivých akcí"));
      const sorted = [...spot.actionEvs.values].sort((left, right) => right.evBb - left.evBb);
      for (const item of sorted) {
        const row = el(doc, "div", "dx-trainer__ev-row");
        row.setAttribute("role", "listitem");
        row.dataset.action = item.action;
        row.dataset.chosen = String(item.action === chosen);
        row.dataset.best = String(ev.bestActions.includes(item.action));
        const name = el(doc, "span", "dx-trainer__ev-name");
        const dot = el(doc, "span", "dx-trainer__ev-dot");
        dot.setAttribute("aria-hidden", "true");
        dot.style.setProperty("--action-accent", colorForPostflopAction(item.action));
        name.append(dot, label(item.action));
        if (item.action === chosen) {
          name.append(el(doc, "span", "dx-trainer__ev-tag", ` (${localizedText("yours", "tvoje")})`));
        }
        row.append(name, el(doc, "span", "dx-trainer__ev-value", formatSignedBb(item.evBb, EV_DECIMALS)));
        rows.appendChild(row);
      }
      parts.push(rows);
    }

    // Cena dorovnání ze skutečné linie solveru. Na flopu a turnu je to vedle
    // frekvencí jediné číslo, které tam být může: EV se tam nepočítá.
    for (const price of postflopDecisionPrices(spot)) {
      const required = price.requiredWithIcm ?? price.required;
      if (price.kind !== "EQUITY_NEEDED" || required === undefined) continue;
      parts.push(el(
        doc,
        "p",
        "dx-trainer__price",
        localizedText(
          `Call needs at least ${formatSharePercent(required)} equity.`,
          `Call potřebuje aspoň ${formatSharePercent(required)} ekvity.`,
        ),
      ));
    }

    const mix = solverMix(spot);
    if (mix.length > 0) {
      const strategy = el(doc, "div", "dx-trainer__strategy");
      const title = localizedText("How the solver plays hands like yours", "Jak solver hraje ruce jako tvoje");
      const segments = mix.map((item) => ({
        label: label(item.action),
        share: item.share,
        color: colorForPostflopAction(item.action),
      }));
      strategy.append(
        el(doc, "p", "dx-trainer__strategy-title", title),
        strategyBar(doc, segments, { label: title }),
        strategyLegend(doc, segments),
      );
      parts.push(strategy);
    } else if (!ev) {
      parts.push(el(
        doc,
        "p",
        "dx-trainer__note",
        localizedText(
          "Neither EV nor solver frequencies are available for this spot.",
          "Pro tenhle spot nemáme EV akcí ani frekvence solveru.",
        ),
      ));
    }

    parts.push(el(doc, "p", "dx-trainer__plan", spot.explanation.summary));

    const more = el(doc, "details", "dx-trainer__more");
    more.append(el(doc, "summary", "", localizedText("Details", "Podrobnosti")));
    // Proti sázce jsou lajny zvýšení a dorovnání, ne sázky a checku.
    const facingBet = villainActionBeforeHero(spot) === "BET";
    more.append(
      handList(doc, facingBet ? "Value raise" : CS.postflop.blocks.value, spot.explanation.valueHands),
      handList(doc, facingBet ? "Bluff raise" : CS.postflop.blocks.bluffs, spot.explanation.bluffHands),
      handList(
        doc,
        facingBet ? localizedText("Call or fold", "Call nebo fold") : CS.postflop.blocks.check,
        spot.explanation.checkHands,
      ),
      handList(doc, CS.postflop.blocks.plan, [spot.explanation.nextStreetPlan]),
    );
    const notes = el(doc, "div", "dx-trainer__hands");
    notes.append(el(doc, "h3", "dx-trainer__hands-title", CS.postflop.blocks.model));
    const list = el(doc, "ul", "dx-trainer__notes");
    list.append(...postflopModelNotes(spot).map((note) => el(doc, "li", "", note)));
    notes.append(list);
    more.append(notes);
    parts.push(more);

    const { row, next } = nextSpotRow(doc, () => options.onNext());
    parts.push(row);
    frame.showFeedback(parts, next);
  }

  function submit(action: PostflopAction): void {
    if (current === null || answered) return;
    const spot = current;
    const responseMs = Math.max(0, Math.round(now() - shownAt));
    const grade = gradePostflopAction(spot, action);
    answered = true;
    // Neposouzená akce se do skóre nepočítá: není to chyba hráče, jen větev,
    // kterou solver nemá.
    if (!grade.unsolved) score = recordAnswer(score, isHit(grade.correct, grade.actionEv?.outcome));
    options.onAnswered(spot, action, Number.isFinite(responseMs) ? responseMs : undefined);
    frame.markActions(action, grade.recommended);
    frame.renderScore(score);
    renderFeedback(spot, action, grade);
  }

  function show(spot: PostflopTrainingSpot): void {
    current = spot;
    answered = false;
    frame.root.dataset.seed = String(spot.seed);
    frame.root.dataset.street = spot.street;
    frame.root.dataset.actionNode = spot.actionNode;
    frame.street.textContent = STREET_LABEL[spot.street];
    frame.title.textContent =
      `${spot.heroPosition} vs ${spot.villainPosition} · ${POT_TYPE_LABEL[spot.potType]}`;
    frame.meta.textContent = [
      formatBbAmount(spot.effectiveStackBB),
      `pot ${formatBbAmount(spot.potBB)}`,
      `SPR ${formatDecimal(spot.spr)}`,
      spot.inPosition ? "IP" : "OOP",
    ].join(" · ");
    frame.table.replaceChildren(postflopPokerTable(doc, spot));
    frame.prompt.replaceChildren(
      el(doc, "span", "dx-trainer__situation", situationText(spot)),
      `${localizedText("How do you play", "Jak zahraješ")} `,
      ...spot.heroCards.map((card) => playingCard(doc, card, "sm")),
      el(doc, "span", "dx-trainer__qmark", "?"),
    );
    frame.hideFeedback();
    renderActions(spot);
    frame.renderScore(score);
    frame.focusFirstAction();
    shownAt = now();
  }

  frame.renderScore(score);

  return {
    element: frame.root,
    show,
    destroy: frame.destroy,
  };
}
