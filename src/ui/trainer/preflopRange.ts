import type { ActionEvValue } from "../../core/actionEv";
import { ACTION_KEY_LABEL } from "../../core/actionKeyLabels";
import { GRID_SIZE, handLabel } from "../../core/poker";
import type { ActionKey, HandLabel, Spot } from "../../core/types";
import type { RangeEntry, RangeStore } from "../../data/rangeStore";
import { currentMttPreflopRangePack } from "../../data/ranges/mttPreflopRangePacks";
import { depthDoesNotChangeSelection } from "../../data/ranges/preflopDepthHonesty";
import { localizedText } from "../cs";
import { formatDecimal, formatSignedBb } from "../kit/format";
import { combosInClass } from "../kit/handMatrix";
import { openRangeDialog } from "../kit/rangeDialog";
import { formatLegendShare, rangeDetailLine, rangeView, type RangeLegendEntry } from "../kit/rangeView";
import {
  categoryForHand,
  colorForActionKey,
  gradedRangeKey,
  LEGEND_ORDER,
  RANGE_MATRIX_COLORS,
  rangeCategoryLabel,
  type ActionCategory,
} from "../rangeMatrixView";
import { el } from "./trainerFrame";

const TOTAL_COMBOS = 1326;

/** Podíl s jedním desetinným místem, česky „23,4 %“. */
function formatShareDecimal(share: number): string {
  const value = formatDecimal(share * 100);
  return localizedText(`${value}%`, `${value} %`);
}

function actionsText(keys: readonly ActionKey[]): string {
  return keys.length === 0 ? "Fold" : keys.map((key) => ACTION_KEY_LABEL[key]).join(" / ");
}

/** EV akcí ruky od nejlepší, v řádcích jako ve vyhodnocení. */
function evRows(doc: Document, values: readonly ActionEvValue<ActionKey>[], decimals: number): HTMLElement {
  const rows = el(doc, "div", "dx-trainer__ev");
  rows.setAttribute("role", "list");
  rows.setAttribute("aria-label", localizedText("EV of each action", "EV jednotlivých akcí"));
  const best = Math.max(...values.map((item) => item.evBb));
  for (const item of [...values].sort((left, right) => right.evBb - left.evBb)) {
    const row = el(doc, "div", "dx-trainer__ev-row");
    row.setAttribute("role", "listitem");
    row.dataset.action = item.action;
    row.dataset.best = String(item.evBb >= best);
    const name = el(doc, "span", "dx-trainer__ev-name");
    const dot = el(doc, "span", "dx-trainer__ev-dot");
    dot.setAttribute("aria-hidden", "true");
    dot.style.setProperty("--action-accent", colorForActionKey(item.action));
    name.append(dot, ACTION_KEY_LABEL[item.action]);
    row.append(name, el(doc, "span", "dx-trainer__ev-value", formatSignedBb(item.evBb, decimals)));
    rows.appendChild(row);
  }
  return rows;
}

function preflopDetail(doc: Document, entry: RangeEntry, hand: HandLabel): Node[] {
  const lenient = entry.actions[hand] ?? [];
  const strict = entry.strict[hand] ?? [];
  const recommended = strict.length > 0 ? strict : lenient;
  const parts: Node[] = [
    rangeDetailLine(doc, localizedText("Recommended", "Doporučeno"), actionsText(recommended)),
  ];
  const also = lenient.filter((key) => !recommended.includes(key));
  if (also.length > 0) {
    parts.push(rangeDetailLine(doc, localizedText("Also correct", "Také správně"), actionsText(also)));
  }
  const evs = entry.actionEvs?.[hand];
  if (evs !== undefined && evs.values.length > 0) {
    // Vyřešený strom nese desetiny blindu, setiny by předstíraly přesnost.
    parts.push(evRows(doc, evs.values, evs.source === "SOLVED_TREE" ? 1 : 2));
  }
  return parts;
}

/**
 * Preflopová range v novém GUI (Agents/ui-redesign-plan.md, fáze 2).
 *
 * Preflopový pack nese doporučené akce, ne frekvence. Buňka proto má plnou
 * barvu akce a nic se nevydává za mix. Víc přijatelných akcí ukáže detail;
 * barvu dá ta nejagresivnější, stejně jako ve staré matici (`categoryForHand`).
 */
export function preflopRangeContent(doc: Document, spot: Spot, store: RangeStore): HTMLElement {
  const entry = store.isLoaded() ? store.lookup(gradedRangeKey(spot)) : undefined;
  if (entry === undefined) {
    const note = el(
      doc,
      "p",
      "dx-trainer__note",
      localizedText("No range data is available for this spot.", "Pro tenhle spot nejsou dostupná data range."),
    );
    note.setAttribute("role", "status");
    return note;
  }

  const combos = new Map<ActionCategory, number>();
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const hand = handLabel(row, column);
      const category = categoryForHand(entry.actions[hand]);
      combos.set(category, (combos.get(category) ?? 0) + combosInClass(hand));
    }
  }
  const played = TOTAL_COMBOS - (combos.get("FOLD") ?? 0);
  const playedOrder = LEGEND_ORDER.filter((category) => category !== "FOLD" && (combos.get(category) ?? 0) > 0);
  const legend: RangeLegendEntry[] = playedOrder.map((category) => ({
    group: category,
    label: rangeCategoryLabel(category),
    color: RANGE_MATRIX_COLORS[category],
    value: formatLegendShare((combos.get(category) ?? 0) / played),
  }));
  // Fold bez čísla: kolik se ho hraje, říká věta nad legendou, a podíl
  // z range by u něj nedával smysl.
  if ((combos.get("FOLD") ?? 0) > 0) {
    legend.push({ group: "FOLD", label: rangeCategoryLabel("FOLD"), color: RANGE_MATRIX_COLORS.FOLD });
  }

  const notes: string[] = [];
  const vsSeat = spot.tableState?.vsSeat;
  if (vsSeat !== undefined) {
    notes.push(entry.vsSeat === vsSeat
      ? localizedText(`Range against ${vsSeat}.`, `Range proti ${vsSeat}.`)
      : localizedText(
        `General range: there is no range refined against ${vsSeat} here.`,
        `Obecná range: zpřesněnou proti ${vsSeat} tu nemáme.`,
      ));
  }
  // Hloubka, která nic nemění, se hráči musí říct (viz `renderRangeModelSummary`).
  if (depthDoesNotChangeSelection(currentMttPreflopRangePack(spot.ante), spot.ante, spot.heroPos)) {
    notes.push(localizedText(
      "On this seat the opening range is the same at every stack depth; depth changes the size, not which hands open.",
      "Na téhle sedačce je otevírací range na všech hloubkách stejná; hloubka mění velikost otevření, ne to, které ruce se otevírají.",
    ));
  }

  return rangeView(doc, {
    label: localizedText(`Range matrix ${spot.heroPos}`, `Matice range ${spot.heroPos}`),
    cell: (hand) => {
      const category = categoryForHand(entry.actions[hand]);
      return {
        color: RANGE_MATRIX_COLORS[category],
        groups: [category],
        description: actionsText(entry.actions[hand] ?? []),
      };
    },
    hero: spot.hand,
    summary: {
      title: localizedText("Whole range", "Celá range"),
      segments: playedOrder.map((category) => ({
        label: rangeCategoryLabel(category),
        share: combos.get(category) ?? 0,
        color: RANGE_MATRIX_COLORS[category],
      })),
      text: localizedText(
        `You play ${formatShareDecimal(played / TOTAL_COMBOS)} of hands (${formatDecimal(played)} of ${formatDecimal(TOTAL_COMBOS)} combos), the rest folds.`,
        `Hraješ ${formatShareDecimal(played / TOTAL_COMBOS)} rukou (${formatDecimal(played)} z ${formatDecimal(TOTAL_COMBOS)} kombinací), zbytek je fold.`,
      ),
      legend,
    },
    detail: (hand) => preflopDetail(doc, entry, hand),
    notes,
  });
}

/** Otevře range v dialogu; nové GUI ho volá z tlačítka „Range“. */
export function openPreflopRange(doc: Document, spot: Spot, store: RangeStore): void {
  openRangeDialog(doc, `${spot.context} ${spot.heroPos} ${spot.effStack} BB`, (dialog) => {
    dialog.appendChild(preflopRangeContent(doc, spot, store));
  });
}
