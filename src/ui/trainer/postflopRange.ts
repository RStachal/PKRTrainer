import { GRID_SIZE, handLabel } from "../../core/poker";
import type { PostflopAction, PostflopActionFrequency, PostflopRangeBucket } from "../../core/postflopGenerator";
import type { PostflopTrainingSpot } from "../../core/postflopTrainingSpot";
import type { Card, HandLabel } from "../../core/types";
import { localizedText } from "../cs";
import { formatSignedBb } from "../kit/format";
import { combosInClass, type HandMatrixCell } from "../kit/handMatrix";
import { playingCard } from "../kit/playingCard";
import { openRangeDialog } from "../kit/rangeDialog";
import {
  formatLegendShare,
  rangeDetailLine,
  rangeView,
  type RangeLegendEntry,
  type RangeViewConfig,
} from "../kit/rangeView";
import { formatSharePercent, strategyBar, strategyLegend } from "../kit/strategyBar";
import {
  CATEGORY_ORDER,
  classifyFlopHand,
  comboEvsByHandClass,
  flopzillaCategoryColor,
  flopzillaCategoryLabel,
  postflopHandClassFromCards,
  type FlopzillaCategory,
} from "../postflopRangeMatrixView";
import { colorForPostflopAction } from "../rangeMatrixView";
import { actionText } from "./postflopActionText";
import { el } from "./trainerFrame";

/** Souhrn řadí akce od nejagresivnější, jako tlačítka. */
const ACTION_ORDER: readonly PostflopAction[] = ["RAISE", "BET_BIG", "BET_SMALL", "CALL", "CHECK", "FOLD"];
const AGGRESSIVE: ReadonlySet<PostflopAction> = new Set(["RAISE", "BET_BIG", "BET_SMALL"]);
const SUIT: Record<Card["suit"], string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function comboText(combo: string): string {
  return `${combo[0]}${SUIT[combo[1] as Card["suit"]] ?? combo[1]}${combo[2]}${SUIT[combo[3] as Card["suit"]] ?? combo[3]}`;
}

/**
 * Smí se ukázat frekvence? Jen u vyřešeného obsahu a jen přesné: heuristiku
 * za solver nevydávat (táž zásada jako pruh ve vyhodnocení).
 */
function exactMixes(spot: PostflopTrainingSpot, buckets: readonly PostflopRangeBucket[]): boolean {
  const source = spot.explanation.source;
  return source.kind === "STRATEGY_PACK"
    && source.provenance === "SOLVER_BACKED"
    && buckets.length > 0
    && buckets.every((bucket) => (
      bucket.actionMix !== undefined
      && bucket.actionMix.length > 0
      && bucket.actionMix.every((item) => item.visibility === "EXACT")
    ));
}

/** EV jednotlivých kombinací třídy; uvnitř třídy se EV rozchází o blindy. */
function comboEvRows(
  doc: Document,
  spot: PostflopTrainingSpot,
  rows: readonly { combo: string; values: readonly { action: PostflopAction; evBb: number }[] }[],
): HTMLElement[] {
  const heroCombo = spot.heroCards.map((card) => `${card.rank}${card.suit}`).join("");
  const list = el(doc, "div", "dx-trainer__ev");
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", localizedText("EV of each combo", "EV jednotlivých kombinací"));
  for (const row of rows) {
    const line = el(doc, "div", "dx-trainer__ev-row");
    line.setAttribute("role", "listitem");
    line.dataset.combo = row.combo;
    line.dataset.chosen = String(row.combo === heroCombo);
    const name = el(doc, "span", "dx-trainer__ev-name", comboText(row.combo));
    if (row.combo === heroCombo) {
      name.append(el(doc, "span", "dx-trainer__ev-tag", ` (${localizedText("yours", "tvoje")})`));
    }
    const values = [...row.values]
      .sort((left, right) => right.evBb - left.evBb)
      .map((value) => `${actionText(spot, value.action).label} ${formatSignedBb(value.evBb, 1)}`);
    line.append(name, el(doc, "span", "dx-trainer__ev-value", values.join(" · ")));
    list.appendChild(line);
  }
  return [el(doc, "h4", "dx-trainer__hands-title", localizedText("EV by combo", "EV po kombinacích")), list];
}

/** Akce směsi v pořadí souhrnu, od nejagresivnější. */
function ordered(mix: readonly PostflopActionFrequency[]): PostflopActionFrequency[] {
  return [...mix]
    .filter((item) => item.frequencyPct > 0)
    .sort((left, right) => ACTION_ORDER.indexOf(left.action) - ACTION_ORDER.indexOf(right.action));
}

/**
 * Matice podle akce, blaf je šrafovaný.
 *
 * Pack nese strategii po kbelících: všechny třídy se stejnou převažující akcí
 * a průměr jejich směsi (`classesByDominantAction`). Pruh frekvencí v buňce
 * proto kreslí jen `handMix` - strategie po třídách ze souboru vedle packu
 * (`solvedClassMix.ts`, majitel 3. 11. 2026: „chci to. Rozšířit"). Bez něj má
 * buňka plnou barvu akce, kterou ruka hraje nejčastěji, a frekvence jsou
 * v souhrnu a v detailu jako průměr skupiny, s tím, že jím jsou.
 */
function strategyConfig(
  doc: Document,
  spot: PostflopTrainingSpot,
  bucketOf: ReadonlyMap<HandLabel, PostflopRangeBucket>,
  exact: boolean,
  handMix?: ReadonlyMap<HandLabel, readonly PostflopActionFrequency[]>,
): Omit<RangeViewConfig, "label" | "hero"> {
  const label = (action: PostflopAction): string => actionText(spot, action).label;
  /** „Bet 33 % 64 %, Check 36 %“ - pro čtečku a bublinu buňky. */
  const mixText = (mix: readonly PostflopActionFrequency[]): string => {
    const items = ordered(mix);
    const total = items.reduce((sum, item) => sum + item.frequencyPct, 0);
    return items.map((item) => `${label(item.action)} ${formatSharePercent(item.frequencyPct / total)}`).join(", ");
  };
  const shares = new Map<PostflopAction, number>();
  const dominant = new Set<PostflopAction>();
  let betCombos = 0;
  let bluffCombos = 0;
  const bluffActions = new Map<PostflopAction, number>();
  for (const [hand, bucket] of bucketOf) {
    const combos = combosInClass(hand);
    dominant.add(bucket.action);
    if (exact) {
      for (const item of bucket.actionMix ?? []) {
        shares.set(item.action, (shares.get(item.action) ?? 0) + combos * item.frequencyPct);
      }
    } else {
      shares.set(bucket.action, (shares.get(bucket.action) ?? 0) + combos);
    }
    if (AGGRESSIVE.has(bucket.action)) {
      betCombos += combos;
      if (bucket.lane === "BLUFF") {
        bluffCombos += combos;
        bluffActions.set(bucket.action, (bluffActions.get(bucket.action) ?? 0) + combos);
      }
    }
  }
  const total = [...shares.values()].reduce((sum, value) => sum + value, 0);
  const order = ACTION_ORDER.filter((action) => (shares.get(action) ?? 0) > 0 || dominant.has(action));
  const legend: RangeLegendEntry[] = order.map((action) => ({
    group: action,
    label: label(action),
    color: colorForPostflopAction(action),
    value: formatLegendShare(total > 0 ? (shares.get(action) ?? 0) / total : 0),
  }));
  if (bluffCombos > 0) {
    const [bluffAction] = [...bluffActions].sort((left, right) => right[1] - left[1])[0];
    legend.push({
      group: "BLUFF",
      label: localizedText("Bluff", "Blaf"),
      color: colorForPostflopAction(bluffAction),
      hatched: true,
      value: localizedText(
        `${formatLegendShare(bluffCombos / betCombos)} of bets`,
        `${formatLegendShare(bluffCombos / betCombos)} sázek`,
      ),
    });
  }

  const comboEvs = comboEvsByHandClass(spot);
  const perHand = handMix !== undefined && handMix.size > 0;
  const notes = [perHand
    ? localizedText(
      "Bars in a cell show how often the hand takes each action, in whole percent.",
      "Pruhy v buňce ukazují, jak často ruka hraje každou akci, v celých procentech.",
    )
    : localizedText(
      "A cell shows the action the hand takes most often.",
      "Buňka má barvu akce, kterou ruka hraje nejčastěji.",
    )];
  if (bluffCombos > 0) {
    notes.push(localizedText(
      "Hatched cells are bluffs: bets with a hand that is not betting for value.",
      "Šrafované buňky jsou blafy: sázky s rukou, která nesází pro hodnotu.",
    ));
  }
  if (exact && !perHand) {
    notes.push(localizedText(
      "Frequencies are averages over hands that share their most frequent action; the pack does not store them hand by hand.",
      "Frekvence jsou průměry skupin rukou se stejnou převažující akcí; po jednotlivých rukou je pack nenese.",
    ));
  }

  return {
    cell: (hand): HandMatrixCell => {
      const bucket = bucketOf.get(hand);
      if (bucket === undefined) {
        return { description: localizedText("not in the range", "mimo range") };
      }
      const bluff = bucket.lane === "BLUFF";
      const lane = !AGGRESSIVE.has(bucket.action)
        ? ""
        : bluff ? localizedText(", bluff", ", blaf") : localizedText(", value", ", hodnota");
      const own = handMix?.get(hand);
      return {
        color: colorForPostflopAction(bucket.action),
        hatched: bluff,
        groups: bluff ? [bucket.action, "BLUFF"] : [bucket.action],
        ...(own === undefined
          ? {}
          : {
            mix: ordered(own).map((item) => ({
              color: colorForPostflopAction(item.action),
              share: item.frequencyPct,
            })),
          }),
        description: `${own === undefined ? label(bucket.action) : mixText(own)}${lane}`,
      };
    },
    summary: {
      title: localizedText("Whole range", "Celá range"),
      segments: order.map((action) => ({
        label: label(action),
        share: shares.get(action) ?? 0,
        color: colorForPostflopAction(action),
      })),
      text: exact
        ? localizedText("How often the whole range takes each action.", "Jak často celá range volí každou akci.")
        : localizedText(
          "Share of combos by the action they take most often.",
          "Podíl kombinací podle akce, kterou hrají nejčastěji.",
        ),
      legend,
    },
    detail: (hand) => {
      const parts: Node[] = [];
      const bucket = bucketOf.get(hand);
      const category = classifyFlopHand(hand, spot.board);
      if (bucket === undefined) {
        parts.push(el(doc, "p", "dx-trainer__note", localizedText(
          "This hand is not in the range on this street.",
          "Tahle ruka v range na téhle ulici není.",
        )));
      } else {
        const lane = !AGGRESSIVE.has(bucket.action)
          ? ""
          : bucket.lane === "BLUFF" ? localizedText(" · bluff", " · blaf") : localizedText(" · value", " · hodnota");
        parts.push(rangeDetailLine(doc, localizedText("Most often", "Nejčastěji"), `${label(bucket.action)}${lane}`));
      }
      parts.push(rangeDetailLine(doc, localizedText("On the board", "Na desce"), flopzillaCategoryLabel(category)));
      const own = bucket === undefined ? undefined : handMix?.get(hand);
      if (own !== undefined) {
        const segments = ordered(own).map((item) => ({
          label: label(item.action),
          share: item.frequencyPct,
          color: colorForPostflopAction(item.action),
        }));
        const title = localizedText(`How the solver plays ${hand}`, `Jak solver hraje ${hand}`);
        parts.push(
          el(doc, "h4", "dx-trainer__hands-title", title),
          strategyBar(doc, segments, { label: title }),
          strategyLegend(doc, segments),
        );
      } else if (exact && bucket?.actionMix !== undefined) {
        const segments = bucket.actionMix.map((item) => ({
          label: label(item.action),
          share: item.frequencyPct,
          color: colorForPostflopAction(item.action),
        }));
        const title = localizedText(
          `Hands mostly playing ${label(bucket.action)}, on average`,
          `Ruce, které nejčastěji hrají ${label(bucket.action)}, v průměru`,
        );
        parts.push(
          el(doc, "h4", "dx-trainer__hands-title", title),
          strategyBar(doc, segments, { label: title }),
          strategyLegend(doc, segments),
        );
      }
      const evs = comboEvs.get(hand);
      if (evs !== undefined && evs.length > 0) parts.push(...comboEvRows(doc, spot, evs));
      return parts;
    },
    notes,
  };
}

/**
 * Bez kbelíků (heuristika, spot mimo vyřešený obsah) by byla matice podle
 * akce jednobarevná. Ukáže proto sílu rukou na desce a řekne to: dvě osy pod
 * jedním nadpisem by byly horší než jedna přiznaná (stejně jako stará matice).
 */
function strengthConfig(doc: Document, spot: PostflopTrainingSpot): Omit<RangeViewConfig, "label" | "hero"> {
  const combos = new Map<FlopzillaCategory, number>();
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const hand = handLabel(row, column);
      const category = classifyFlopHand(hand, spot.board);
      combos.set(category, (combos.get(category) ?? 0) + combosInClass(hand));
    }
  }
  const total = [...combos.values()].reduce((sum, value) => sum + value, 0);
  return {
    cell: (hand) => {
      const category = classifyFlopHand(hand, spot.board);
      return {
        color: flopzillaCategoryColor(category),
        groups: [category],
        description: flopzillaCategoryLabel(category),
      };
    },
    summary: {
      title: localizedText("Hand strength on the board", "Síla rukou na desce"),
      segments: [],
      legend: CATEGORY_ORDER.filter((category) => combos.has(category)).map((category) => ({
        group: category,
        label: flopzillaCategoryLabel(category),
        color: flopzillaCategoryColor(category),
        value: formatLegendShare((combos.get(category) ?? 0) / total),
      })),
    },
    detail: (hand) => [rangeDetailLine(
      doc,
      localizedText("On the board", "Na desce"),
      flopzillaCategoryLabel(classifyFlopHand(hand, spot.board)),
    )],
    notes: [localizedText(
      "There is no hand-by-hand strategy for this spot; the matrix shows how the hands hit the board.",
      "Strategii po rukou pro tenhle spot nemáme; matice ukazuje, jak ruce zasáhly desku.",
    )],
  };
}

/**
 * Postflopová range v novém GUI (Agents/ui-redesign-plan.md, fáze 2).
 *
 * Matice se ukáže hned s tím, co nese pack. Frekvence po třídách rukou se
 * stahují zvlášť (`solvedClassMixLoader.ts`) a až dorazí, matice se překreslí
 * s pruhy v buňkách a s toutéž vybranou rukou. `data-class-mix` na obalu říká,
 * jak to dopadlo: `loading`, `ready`, nebo `none` (rodina je nenese, soubor
 * k packu nepatří, nebo se nestáhl).
 */
export function postflopRangeContent(doc: Document, spot: PostflopTrainingSpot): HTMLElement {
  const source = spot.explanation.source;
  const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets ?? [] : [];
  // První kbelík vyhrává, stejně jako ve staré matici: buňka a souhrn pak
  // mluví o téže akci.
  const bucketOf = new Map<HandLabel, PostflopRangeBucket>();
  for (const bucket of buckets) {
    for (const hand of bucket.handClasses) if (!bucketOf.has(hand)) bucketOf.set(hand, bucket);
  }
  const exact = exactMixes(spot, buckets);
  const host = el(doc, "div", "dx-range-host");

  const render = (handMix?: ReadonlyMap<HandLabel, readonly PostflopActionFrequency[]>): void => {
    const previous = host.querySelector<HTMLElement>(".dx-range__detail")?.dataset.hand as HandLabel | undefined;
    const focused = host.contains(doc.activeElement);
    const config = bucketOf.size > 0
      ? strategyConfig(doc, spot, bucketOf, exact, handMix)
      : strengthConfig(doc, spot);
    const board = el(doc, "div", "dx-range__board");
    board.setAttribute("aria-label", localizedText("Board", "Deska"));
    board.append(...spot.board.map((card) => playingCard(doc, card, "sm")));
    const view = rangeView(doc, {
      ...config,
      label: localizedText("Range matrix", "Matice range"),
      hero: postflopHandClassFromCards(spot.heroCards),
      ...(previous === undefined ? {} : { selected: previous }),
    });
    view.prepend(board);
    host.replaceChildren(view);
    if (focused) host.querySelector<HTMLElement>('.dx-matrix__cell[aria-selected="true"]')?.focus();
  };
  render();

  const ref = source.kind === "STRATEGY_PACK" ? source.classMix : undefined;
  if (ref === undefined || bucketOf.size === 0) {
    host.dataset.classMix = "none";
    return host;
  }
  host.dataset.classMix = "loading";
  void import("../../data/ranges/solvedClassMixLoader")
    .then((module) => module.loadClassMix(ref))
    .then((mix) => {
      if (mix === undefined) {
        host.dataset.classMix = "none";
        return;
      }
      render(mix);
      host.dataset.classMix = "ready";
    })
    .catch(() => {
      host.dataset.classMix = "none";
    });
  return host;
}

/** Otevře range k desce v dialogu; nové GUI ho volá z tlačítka „Range“. */
export function openPostflopRange(doc: Document, spot: PostflopTrainingSpot, title: string): void {
  openRangeDialog(doc, title, (dialog) => {
    dialog.appendChild(postflopRangeContent(doc, spot));
  });
}
