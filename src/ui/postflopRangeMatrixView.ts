import { RANKS } from "../core/poker";
import type { Card, HandLabel } from "../core/types";
import type { PostflopTrainingSpot } from "../core/postflopTrainingSpot";
import type { PostflopAction } from "../core/postflopGenerator";
import {
  classifyFlopHand,
  flopzillaLaneForCategory,
  type FlopzillaCategory,
  type FlopzillaLane,
} from "../core/flopHandCategory";

// Classification lives in core so the range matrix and the solver-content
// importer label hands the same way.
export {
  classifyFlopHand,
  flopzillaLaneForCategory,
  type FlopzillaCategory,
  type FlopzillaLane,
};

interface CategoryDef {
  label: string;
  color: string;
}

/**
 * Colours taken from the owner's own range charts, sampled from the images.
 *
 * The charts read at a glance because they use two families and a neutral tail
 * rather than a thirteen-step rainbow: a salmon-red for the hands you commit
 * with, greens for the hands still carrying equity, and near-white for the ones
 * you give up. The previous palette ran red-orange-yellow-green-blue-purple-grey
 * in category order, so a top pair was a brighter green than an overpair was
 * yellow and nothing about the colour told you how strong the hand was.
 *
 * Three of these are the chart colours exactly - #D87878 openraise, #304830 and
 * #90A890 the jam tiers, #F0F0F0 fold - with the rest interpolated inside those
 * families so the ramp stays monotonic in strength.
 */
const CATEGORY_DEFS: Record<FlopzillaCategory, CategoryDef> = {
  // Made hands: the salmon-red family, darkening with strength.
  SET_PLUS: { label: "Set+", color: "#a63a32" },
  // Barva sedí mezi setem a postupkou: silnější než postupka, slabší než set+
  // (do kterého padá i full house a lepší).
  MADE_FLUSH: { label: "Made flush", color: "#b2423a" },
  MADE_STRAIGHT: { label: "Made straight", color: "#be4a3e" },
  TWO_PAIR: { label: "Two pair", color: "#cf5f50" },
  OVERPAIR: { label: "Overpair", color: "#d87878" },
  TOP_PAIR: { label: "Top pair", color: "#e29a8e" },
  PAIR: { label: "Pair", color: "#ebb9af" },
  UNDERPAIR: { label: "Underpair", color: "#f0d2cb" },
  // Draws: the jam greens, kept a distinct hue so equity reads apart from made
  // strength rather than blending into the same ramp.
  FLUSH_DRAW: { label: "Flush draw", color: "#304830" },
  OESD: { label: "OESD", color: "#4e7050" },
  GUTSHOT: { label: "Gutshot", color: "#90a890" },
  BACKDOOR_DRAW: { label: "Backdoor draw", color: "#b8c9b6" },
  // Nothing: the charts' fold shades.
  OVERCARDS: { label: "Overcards", color: "#d6d6ce" },
  AIR: { label: "Air", color: "#f0f0f0" },
};

/** Pořadí kategorií pro režim, ve kterém akci neznáme: od nejsilnější dolů. */
export const CATEGORY_ORDER: readonly FlopzillaCategory[] = [
  "SET_PLUS",
  // Chyběl, takže buňka s barvou na desce měla barvu bez položky v legendě.
  "MADE_FLUSH",
  "MADE_STRAIGHT",
  "TWO_PAIR",
  "OVERPAIR",
  "TOP_PAIR",
  "PAIR",
  "UNDERPAIR",
  "FLUSH_DRAW",
  "OESD",
  "GUTSHOT",
  "BACKDOOR_DRAW",
  "OVERCARDS",
  "AIR",
];


/**
 * Kombinace jedné třídy s jejich EV, seřazené od nejlepší.
 *
 * Klíčem je třída ruky, protože matice ukazuje 169 buněk - ale uvnitř buňky se
 * vypisují **jednotlivé kombinace**, ne jejich průměr. Průměr přes třídu by
 * neodpovídal žádné konkrétní ruce: změřeno, uvnitř jedné třídy se EV rozchází
 * až o čtrnáct blindů, protože `76` se dvěma srdci na srdcové desce je jiná ruka
 * než `76` bez nich.
 */
export function comboEvsByHandClass(
  spot: PostflopTrainingSpot,
): Map<HandLabel, { combo: string; values: readonly { action: PostflopAction; evBb: number }[] }[]> {
  const byClass = new Map<HandLabel, {
    combo: string; values: readonly { action: PostflopAction; evBb: number }[];
  }[]>();
  for (const row of spot.comboEvs ?? []) {
    const cards = comboToCards(row.combo);
    if (cards === undefined) continue;
    const hand = postflopHandClassFromCards(cards);
    const list = byClass.get(hand) ?? [];
    list.push(row);
    byClass.set(hand, list);
  }
  for (const list of byClass.values()) {
    list.sort((left, right) => bestEvOf(right.values) - bestEvOf(left.values));
  }
  return byClass;
}

function bestEvOf(values: readonly { evBb: number }[]): number {
  return values.reduce((best, item) => Math.max(best, item.evBb), Number.NEGATIVE_INFINITY);
}

/** `"AhKh"` na dvě karty, nebo `undefined`, když to není kombinace. */
function comboToCards(combo: string): [Card, Card] | undefined {
  if (combo.length !== 4) return undefined;
  return [
    { rank: combo[0] as Card["rank"], suit: combo[1] as Card["suit"] },
    { rank: combo[2] as Card["rank"], suit: combo[3] as Card["suit"] },
  ];
}

export function flopzillaCategoryLabel(category: FlopzillaCategory): string {
  return CATEGORY_DEFS[category].label;
}

/** Barva síly ruky pro matici bez strategie (heuristika, spot mimo obsah). */
export function flopzillaCategoryColor(category: FlopzillaCategory): string {
  return CATEGORY_DEFS[category].color;
}

export function postflopHandClassFromCards(cards: readonly [Card, Card]): HandLabel {
  const [a, b] = cards;
  const ai = RANKS.indexOf(a.rank);
  const bi = RANKS.indexOf(b.rank);
  if (ai === bi) return `${a.rank}${b.rank}`;
  const high = ai < bi ? a : b;
  const low = ai < bi ? b : a;
  return `${high.rank}${low.rank}${high.suit === low.suit ? "s" : "o"}`;
}
