import type { PostflopAction, PostflopPotType, PostflopStreet } from "../../core/postflopGenerator";
import { postflopDecisionPrices } from "../../core/postflopDecisionPrice";
import type {
  PostflopLineAction,
  PostflopLineActor,
  PostflopPolicyAction,
} from "../../core/postflopLineSimulator";
import { gradePostflopAction, type PostflopGrade } from "../../core/postflopScoring";
import { villainActionBeforeHero, type PostflopTrainingSpot } from "../../core/postflopTrainingSpot";
import { emptySessionScore, isHit, recordAnswer } from "../../core/sessionScore";
import { CS, localizedText } from "../cs";
import { formatBbAmount, formatDecimal, formatEvLoss, formatSignedBb } from "../kit/format";
import { outcomeChip, type OutcomeChipKind } from "../kit/outcomeChip";
import { playingCard } from "../kit/playingCard";
import { postflopPokerTable } from "../kit/pokerTable";
import { formatSharePercent, strategyBar, strategyLegend } from "../kit/strategyBar";
import { postflopModelNotes } from "../postflopModelNotes";
import { colorForPostflopAction } from "../rangeMatrixView";
import { POSITION_ORDER } from "../../core/types";
import { actionText, facingBetBb } from "./postflopActionText";
import { openPostflopRange } from "./postflopRange";
import { GTO_PLAYERS, postflopTablePlayers, type PlayerSettings } from "../../core/villain/tableCast";
import { actionButton, button, createTrainerFrame, el, nextSpotRow } from "./trainerFrame";

/**
 * Obrazovka jednoho postflopového spotu (Agents/ui-redesign-plan.md,
 * fáze 1, krok 3b). Spot rozdává `dealPostflopSpot` a hodnotí
 * `gradePostflopAction`; zápis do statistik dělá
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
  /** Režim a soupeř ve hře pro stůl; bez nich GTO (žetony s pozicí). */
  players?: () => PlayerSettings;
}

/**
 * Ulice uvnitř linky flop → turn → river (fáze 1, krok 3c).
 *
 * Linku vede volající (`postflopView.ts`): po
 * odpovědi ji podle zvolené akce přegeneruje, protože další ulice na volbě
 * závisí, a obrazovce řekne, co dál. Do statistik jde celá linka najednou na
 * konci, proto se u ulice linky `onAnswered` nevolá.
 */
export interface PostflopTrainerLineStep {
  /** Pořadí ulice v lince od nuly a kolik ulic linka má. */
  index: number;
  total: number;
  /** Co se v lince stalo na předchozích ulicích. */
  priorActions: readonly PostflopLineAction[];
  /** Odpověď na ulici; vrací, co dál. */
  answer(chosen: PostflopAction): PostflopLineContinuation;
}

export type PostflopLineContinuation =
  | { kind: "NEXT_STREET"; street: PostflopStreet; go: () => void }
  | {
      kind: "COMPLETE";
      /** Správně zahraných ulic, posouzených (bez neposouzených) a všech. */
      correct: number;
      judged: number;
      total: number;
      again: () => void;
    };

export interface PostflopTrainerView {
  readonly element: HTMLElement;
  /** Ukáže otázku k novému spotu; s `line` jako ulici linky. */
  show(spot: PostflopTrainingSpot, line?: PostflopTrainerLineStep): void;
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

/** Akce v historii linky; pokerové termíny zůstávají anglicky (směr, bod 8). */
const POLICY_LABEL: Record<PostflopPolicyAction, string> = {
  CHECK: "check",
  CALL: "call",
  FOLD: "fold",
  BET_SMALL: "bet",
  BET_BIG: "bet",
  RAISE: "raise",
  ALL_IN: "all-in",
};

/**
 * Předchozí ulice linky, jedna věta na ulici: kdo co zahrál a pot po ní.
 * Hráče a soupeře jmenuje pozicemi, ne „Hero/Villain“ jako dřív starý pohled.
 */
function lineHistory(spot: PostflopTrainingSpot, actions: readonly PostflopLineAction[]): string[] {
  const seat = (actor: PostflopLineActor): string => (actor === "HERO" ? spot.heroPosition : spot.villainPosition);
  return actions.map((action) => {
    const steps = action.sequence?.length
      ? action.sequence.map((entry) => (
        `${seat(entry.actor)} ${POLICY_LABEL[entry.action]}`
        + (entry.amountBB > 0 ? ` ${formatBbAmount(entry.amountBB)}` : "")
      ))
      : [`${spot.heroPosition} ${POLICY_LABEL[action.action]}`];
    return `${STREET_LABEL[action.street]}: ${steps.join(", ")} · pot ${formatBbAmount(action.potBBAfter)}`;
  });
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
  let line: PostflopTrainerLineStep | null = null;
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

  /**
   * Matice range k desce v dialogu, jako u preflopu. Přímo ve vyhodnocení by
   * ho protáhla daleko za dvě sekundy čtení (směr, bod 3), takže je za
   * tlačítkem.
   */
  function rangeButton(spot: PostflopTrainingSpot): HTMLButtonElement {
    const range = button(doc, "dx-btn dx-btn--secondary dx-trainer__range", "Range");
    range.addEventListener("click", () => openPostflopRange(
      doc,
      spot,
      `${spot.heroPosition} vs ${spot.villainPosition} · ${STREET_LABEL[spot.street]}`,
    ));
    return range;
  }

  /** Řádek pod vyhodnocením: další spot, další ulice linky, nebo konec linky. */
  function nextRow(
    spot: PostflopTrainingSpot,
    continuation: PostflopLineContinuation | null,
  ): { parts: HTMLElement[]; next: HTMLButtonElement } {
    const extra = [rangeButton(spot)];
    if (continuation === null) {
      const { row, next } = nextSpotRow(doc, () => options.onNext(), extra);
      return { parts: [row], next };
    }
    if (continuation.kind === "NEXT_STREET") {
      const { row, next } = nextSpotRow(
        doc,
        continuation.go,
        extra,
        localizedText(`Continue: ${STREET_LABEL[continuation.street]}`, `Pokračovat: ${STREET_LABEL[continuation.street]}`),
      );
      return { parts: [row], next };
    }
    const unsolved = continuation.total - continuation.judged;
    const done = el(
      doc,
      "p",
      "dx-trainer__line-done",
      localizedText(
        `Line complete: ${continuation.correct} of ${continuation.judged} correct`,
        `Linka hotová: ${continuation.correct} z ${continuation.judged} správně`,
      ) + (unsolved > 0 ? localizedText(`, ${unsolved} not judged.`, `, ${unsolved} neposouzeno.`) : "."),
    );
    done.dataset.correct = String(continuation.correct);
    done.dataset.judged = String(continuation.judged);
    done.dataset.total = String(continuation.total);
    const { row, next } = nextSpotRow(doc, continuation.again, extra, localizedText("Next line", "Další linka"));
    return { parts: [done, row], next };
  }

  function renderFeedback(
    spot: PostflopTrainingSpot,
    chosen: PostflopAction,
    grade: PostflopGrade,
    continuation: PostflopLineContinuation | null,
  ): void {
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

    const after = nextRow(spot, continuation);
    parts.push(...after.parts);
    frame.showFeedback(parts, after.next);
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
    // Ulice linky do statistik nejde po jedné: celou linku zapíše volající na
    // jejím konci (`onLineCompleted`).
    const continuation = line === null ? null : line.answer(action);
    if (line === null) options.onAnswered(spot, action, Number.isFinite(responseMs) ? responseMs : undefined);
    frame.markActions(action, grade.recommended);
    frame.renderScore(score);
    renderFeedback(spot, action, grade, continuation);
  }

  function show(spot: PostflopTrainingSpot, step?: PostflopTrainerLineStep): void {
    current = spot;
    line = step ?? null;
    answered = false;
    frame.root.dataset.seed = String(spot.seed);
    frame.root.dataset.street = spot.street;
    frame.root.dataset.actionNode = spot.actionNode;
    // Typ potu a vzor pozic, ať test i E2E poznají, že spot odpovídá vybrané
    // situaci.
    frame.root.dataset.potType = spot.potType;
    frame.root.dataset.positionPattern = spot.positionPattern;
    frame.root.dataset.mode = line === null ? "single" : "line";
    if (line === null) {
      delete frame.root.dataset.lineIndex;
      delete frame.root.dataset.lineTotal;
    } else {
      frame.root.dataset.lineIndex = String(line.index);
      frame.root.dataset.lineTotal = String(line.total);
    }
    frame.street.textContent = line === null
      ? STREET_LABEL[spot.street]
      : `${STREET_LABEL[spot.street]} ${line.index + 1}/${line.total}`;
    frame.title.textContent =
      `${spot.heroPosition} vs ${spot.villainPosition} · ${POT_TYPE_LABEL[spot.potType]}`;
    frame.meta.textContent = [
      formatBbAmount(spot.effectiveStackBB),
      `pot ${formatBbAmount(spot.potBB)}`,
      `SPR ${formatDecimal(spot.spr)}`,
      spot.inPosition ? "IP" : "OOP",
    ].join(" · ");
    const players = postflopTablePlayers(spot, options.players?.() ?? GTO_PLAYERS);
    frame.table.replaceChildren(postflopPokerTable(doc, spot, POSITION_ORDER, players));
    const history = line === null ? [] : lineHistory(spot, line.priorActions);
    frame.prompt.replaceChildren(
      ...history.map((sentence) => el(doc, "span", "dx-trainer__line-history", sentence)),
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
