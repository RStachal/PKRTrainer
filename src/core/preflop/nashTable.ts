import type { ActionEvSet } from "../actionEv";
import { ALL_HAND_CLASSES } from "../poker";
import { equityVsClass, nashRow } from "../preflopEquity";
import {
  POSITION_ORDER,
  type ActionContext,
  type ActionKey,
  type AnteMode,
  type HandLabel,
  type Position,
} from "../types";
import { allInEvs } from "./preflopEv";

/**
 * Hodnoty shovu a dorovnání z Nashovy rovnováhy (`nashPushFold.ts`) pro rozdaný spot.
 *
 * Tabulka nese z rovnováhy jen range, po desetinách: kolik hráč v které sedačce shovuje
 * a kolik proti komu dorovnává. Hodnota ruky se z nich dopočítá tady, stejným vzorcem
 * jako ve výpočtu, proto stačí malý soubor. Tabulka se generuje skriptem
 * `npm run mtt:nash-table`.
 *
 * Každá sedačka je samostatná hra, kdo před ní složil, na hodnotu nemá vliv. Sedačky
 * 6-max se tak dají číst z téže tabulky: 6-max UTG je 9-max LJ.
 */

/** Nad touhle hloubkou se hraje open, ne shove nebo fold, a model přestává platit. */
export const NASH_MAX_STACK = 20;
export const NASH_STACKS: readonly number[] = [5, 10, 15, 20];
export const NASH_ANTE_TOTAL: Readonly<Record<AnteMode, number>> = { ON: 1, OFF: 0 };

/** Kolik kombinací zbývá soupeři, když hráč drží dvě karty. */
export const OPPONENT_COMBOS = 1225;

const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const SIZE = HANDS.length;
const RANKS = "23456789TJQKA";

export function nashKey(ante: AnteMode, stack: number, shover: Position, caller?: Position): string {
  return caller === undefined ? `${ante}|${stack}|${shover}` : `${ante}|${stack}|${shover}>${caller}`;
}

/** Co která sedačka vložila před rozhodnutím: svůj díl ante a blind. */
export function postedBySeat(seats: readonly Position[], anteTotalBB: number): number[] {
  const anteEach = anteTotalBB / seats.length;
  return seats.map((_, index) => (
    anteEach + (index === seats.length - 2 ? 0.5 : index === seats.length - 1 ? 1 : 0)
  ));
}

function combosOf(hand: HandLabel): readonly (readonly [number, number])[] {
  const high = RANKS.indexOf(hand[0]);
  const low = RANKS.indexOf(hand[1]);
  const combos: [number, number][] = [];
  for (let first = 0; first < 4; first += 1) {
    for (let second = 0; second < 4; second += 1) {
      if (high === low && second <= first) continue;
      if (high !== low && (first === second) !== hand.endsWith("s")) continue;
      combos.push([high * 4 + first, low * 4 + second]);
    }
  }
  return combos;
}

const weightsCache = new Map<HandLabel, Float64Array>();

/** Průměrný počet kombinací každé třídy, které soupeři ruka hráče nechá (blokery). */
export function opponentWeights(hand: HandLabel): Float64Array {
  const cached = weightsCache.get(hand);
  if (cached !== undefined) return cached;
  const own = combosOf(hand);
  const weights = new Float64Array(SIZE);
  HANDS.forEach((villain, index) => {
    let open = 0;
    for (const [a, b] of own) {
      for (const [c, d] of combosOf(villain)) {
        if (a !== c && a !== d && b !== c && b !== d) open += 1;
      }
    }
    weights[index] = open / own.length;
  });
  weightsCache.set(hand, weights);
  return weights;
}

const decoded = new Map<string, Float64Array>();

function frequencies(key: string): Float64Array | undefined {
  const cached = decoded.get(key);
  if (cached !== undefined) return cached;
  const row = nashRow(key);
  if (row === undefined || row.length !== SIZE) return undefined;
  const values = Float64Array.from(row, (char) => (char === "A" ? 1 : Number(char) / 10));
  decoded.set(key, values);
  return values;
}

/** Jak často má soupeř range `row` a jaký podíl potu v něm hráč vyhraje, ve váze kombinací. */
function against(hand: HandLabel, row: Float64Array): { reach: number; share: number } | undefined {
  const weights = opponentWeights(hand);
  let reach = 0;
  let share = 0;
  for (let index = 0; index < SIZE; index += 1) {
    if (row[index] === 0) continue;
    const equity = equityVsClass(hand, HANDS[index]);
    if (equity === undefined) return undefined;
    const weight = weights[index] * row[index];
    reach += weight;
    share += weight * equity;
  }
  return { reach, share };
}

/** Hodnota shovu proti složení v BB; `undefined`, když tabulka tu sedačku nezná. */
export function nashJamEv(
  hand: HandLabel,
  seat: Position,
  stack: number,
  ante: AnteMode,
  order: readonly Position[] = POSITION_ORDER,
): number | undefined {
  const shover = order.indexOf(seat);
  if (shover < 0 || shover === order.length - 1) return undefined;
  const anteTotal = NASH_ANTE_TOTAL[ante];
  const posted = postedBySeat(order, anteTotal);
  const pot = anteTotal + 1.5;
  let stillIn = 1;
  let value = 0;
  for (let caller = shover + 1; caller < order.length; caller += 1) {
    const row = frequencies(nashKey(ante, stack, seat, order[caller]));
    if (row === undefined) return undefined;
    const met = against(hand, row);
    if (met === undefined) return undefined;
    const called = met.reach / OPPONENT_COMBOS;
    const prize = 2 * stack + pot - posted[shover] - posted[caller];
    value += stillIn * ((met.share / OPPONENT_COMBOS) * prize - called * (stack - posted[shover]));
    stillIn *= 1 - called;
  }
  return value + stillIn * pot;
}

/** Hodnota dorovnání shovu proti složení v BB. */
export function nashCallEv(
  hand: HandLabel,
  seat: Position,
  shoverSeat: Position,
  stack: number,
  ante: AnteMode,
  order: readonly Position[] = POSITION_ORDER,
): number | undefined {
  const caller = order.indexOf(seat);
  const shover = order.indexOf(shoverSeat);
  if (shover < 0 || caller <= shover) return undefined;
  const row = frequencies(nashKey(ante, stack, shoverSeat));
  if (row === undefined) return undefined;
  const met = against(hand, row);
  if (met === undefined || met.reach === 0) return undefined;
  const anteTotal = NASH_ANTE_TOTAL[ante];
  const posted = postedBySeat(order, anteTotal);
  const prize = 2 * stack + anteTotal + 1.5 - posted[shover] - posted[caller];
  return (met.share / met.reach) * prize - (stack - posted[caller]);
}

export interface NashSpot {
  context: ActionContext;
  heroPos: Position;
  hand: HandLabel;
  effStack: number;
  ante: AnteMode;
  offered: readonly ActionKey[];
  /** Kdo šel all-in, u dorovnání. */
  shover?: Position;
}

/**
 * EV pro spot, kde se rozhoduje jen mezi all-inem a složením, jinak `undefined`.
 *
 * Tady chart neomezuje hodnocení jako u odhadu all-inu (`agreesWithChart`): rovnováha je
 * samostatný výpočet, ne jednokrokový odhad, a majitel 5. 11. 2026 rozhodl, že chart je
 * základ, ne zákon. Rozdíl pod prahem `equivalentThresholdBb` hodnotí obě akce jako správné,
 * takže mezní ruce, kde na model nelze spoléhat, se nikomu nepočítají jako chyba.
 */
export function nashActionEvs(spot: NashSpot): ActionEvSet<ActionKey> | undefined {
  if (spot.effStack > NASH_MAX_STACK || spot.offered.length !== 2 || !spot.offered.includes("FOLD" as ActionKey)) {
    return undefined;
  }
  if ((spot.context === "PUSH_FOLD" || spot.context === "RFI") && spot.offered.includes("JAM" as ActionKey)) {
    const ev = nashJamEv(spot.hand, spot.heroPos, spot.effStack, spot.ante);
    return ev === undefined ? undefined : allInEvs("JAM" as ActionKey, ev, "NASH_PUSH_FOLD");
  }
  if (spot.context === "VS_ALLIN" && spot.offered.includes("CALL_JAM" as ActionKey) && spot.shover !== undefined) {
    const ev = nashCallEv(spot.hand, spot.heroPos, spot.shover, spot.effStack, spot.ante);
    return ev === undefined ? undefined : allInEvs("CALL_JAM" as ActionKey, ev, "NASH_PUSH_FOLD");
  }
  return undefined;
}
