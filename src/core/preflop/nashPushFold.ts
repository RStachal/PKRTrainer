import { ALL_HAND_CLASSES } from "../poker";
import { combosInClass, equityVsClass, TOTAL_COMBOS } from "../preflopEquity";
import type { HandLabel, Position } from "../types";
import { OPPONENT_COMBOS, opponentWeights, postedBySeat } from "./nashTable";

/**
 * Nashova rovnováha pro shove nebo fold (Agents/plan-gto-real-2026-11.md, 7.1).
 *
 * TexasSolver řeší jen postflop, takže na krátkých stacích neexistuje výstup solveru,
 * kterým by se daly ověřit charty ani vlastní odhad all-inu. Shove nebo fold se ale dá
 * spočítat přímo: po all-inu už žádné rozhodování nezbývá a hodnotu určí equity z tabulky.
 *
 * ## Model
 *
 * - Všichni mají stejný stack a ten zahrnuje blind a ante (běžná konvence kalkulaček).
 * - První, kdo vstoupí do potu, jde all-in, nebo složí. Open a limp model nezná, takže
 *   hloubku nad 15 až 20 BB popisuje čím dál hůř.
 * - **Dorovná nejvýš jeden.** Po prvním dorovnání už další hráči skládají. Tabulka nese
 *   jen equity jedna proti jedné, a kdo dorovnává, nevidí riziko, že ho za ním někdo
 *   přezvedne, takže dorovnání z raných pozic vychází trochu širší než v plné rovnováze.
 *   Mezi blindy, kde víc hráčů není, je výpočet přesný.
 * - Blokery se počítají přes přesný počet kombinací, které hráčovi karty soupeři nechají.
 *   Mezi soupeři navzájem se neuvažují, stejně jako informace ze složených karet.
 *
 * ## Výpočet
 *
 * Každá sedačka je samostatná hra: kdo složil před ní, na hodnotu nemá vliv. Fictitious
 * play: dorovnávající odpoví na průměrný shove, shover na průměrná dorovnání a průměr
 * konverguje k rovnováze. Mezní ruce v ní hrají smíšeně, proto frekvence, ne seznam.
 * Kvalitu říká `exploitability`: o kolik BB by si kdokoli polepšil změnou strategie.
 */

const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const SIZE = HANDS.length;
const DEFAULT_ITERATIONS = 2000;

export interface PushFoldTable {
  /** Sedačky v preflopovém pořadí; poslední dvě jsou malý a velký blind. */
  seats: readonly Position[];
  stackBB: number;
  /** Všechna ante dohromady. */
  anteTotalBB: number;
}

export interface PushFoldCall {
  /** Jak často ruka dorovná; podle tříd z `ALL_HAND_CLASSES`. */
  frequency: Readonly<Record<HandLabel, number>>;
  /** Hodnota dorovnání proti složení v BB. */
  ev: Readonly<Record<HandLabel, number>>;
}

export interface PushFoldSeat {
  seat: Position;
  /** Jak často ruka shovuje, když do hráče všichni složili. */
  jam: Readonly<Record<HandLabel, number>>;
  /** Hodnota shovu proti složení v BB. */
  jamEv: Readonly<Record<HandLabel, number>>;
  /** Dorovnání hráčů za shoverem, podle jejich sedačky. */
  calls: Readonly<Partial<Record<Position, PushFoldCall>>>;
  /** Největší zlepšení, které by komukoli v téhle hře přinesla změna strategie, v BB. */
  exploitability: number;
}

interface Tables {
  /** Průměrný počet kombinací soupeřovy třídy, které nechá ruka hráče. */
  weight: Float64Array;
  /** Totéž násobené equity: maticový součin pak dá vážený podíl potu. */
  weightedEquity: Float64Array;
  combos: Float64Array;
}

let cachedTables: Tables | undefined;

function buildTables(): Tables | undefined {
  if (cachedTables !== undefined) return cachedTables;
  const weight = new Float64Array(SIZE * SIZE);
  const weightedEquity = new Float64Array(SIZE * SIZE);
  for (let hero = 0; hero < SIZE; hero += 1) {
    const row = opponentWeights(HANDS[hero]);
    for (let villain = 0; villain < SIZE; villain += 1) {
      const equity = equityVsClass(HANDS[hero], HANDS[villain]);
      if (equity === undefined) return undefined;
      weight[hero * SIZE + villain] = row[villain];
      weightedEquity[hero * SIZE + villain] = row[villain] * equity;
    }
  }
  cachedTables = { weight, weightedEquity, combos: Float64Array.from(HANDS, combosInClass) };
  return cachedTables;
}

function multiply(matrix: Float64Array, vector: Float64Array, out: Float64Array): void {
  for (let row = 0; row < SIZE; row += 1) {
    const offset = row * SIZE;
    let sum = 0;
    for (let column = 0; column < SIZE; column += 1) sum += matrix[offset + column] * vector[column];
    out[row] = sum;
  }
}

function asRecord(values: Float64Array, digits: number): Record<HandLabel, number> {
  const scale = 10 ** digits;
  return Object.fromEntries(HANDS.map((hand, index) => [hand, Math.round(values[index] * scale) / scale]));
}

function solveSeat(tables: Tables, table: PushFoldTable, shover: number, iterations: number): PushFoldSeat {
  const { seats, stackBB: stack, anteTotalBB } = table;
  const posted = postedBySeat(seats, anteTotalBB);
  const pot = anteTotalBB + 1.5;
  const callers = seats.map((_, index) => index).filter((index) => index > shover);
  const showdownPot = (caller: number) => 2 * stack + pot - posted[shover] - posted[caller];

  const jam = new Float64Array(SIZE).fill(0.5);
  const calls = callers.map(() => new Float64Array(SIZE).fill(0.1));
  const reach = new Float64Array(SIZE);
  const share = new Float64Array(SIZE);
  const jamValue = new Float64Array(SIZE);
  const stillIn = new Float64Array(SIZE);
  const callValues = callers.map(() => new Float64Array(SIZE));

  const priceCalls = (): void => {
    multiply(tables.weight, jam, reach);
    multiply(tables.weightedEquity, jam, share);
    callers.forEach((caller, order) => {
      const prize = showdownPot(caller);
      const risk = stack - posted[caller];
      const values = callValues[order];
      for (let hand = 0; hand < SIZE; hand += 1) {
        values[hand] = reach[hand] > 0 ? (share[hand] / reach[hand]) * prize - risk : -risk;
      }
    });
  };

  const priceJam = (): void => {
    stillIn.fill(1);
    jamValue.fill(0);
    const risk = stack - posted[shover];
    callers.forEach((caller, order) => {
      const prize = showdownPot(caller);
      multiply(tables.weight, calls[order], reach);
      multiply(tables.weightedEquity, calls[order], share);
      for (let hand = 0; hand < SIZE; hand += 1) {
        const called = reach[hand] / OPPONENT_COMBOS;
        jamValue[hand] += stillIn[hand] * ((share[hand] / OPPONENT_COMBOS) * prize - called * risk);
        stillIn[hand] *= 1 - called;
      }
    });
    for (let hand = 0; hand < SIZE; hand += 1) jamValue[hand] += stillIn[hand] * pot;
  };

  for (let round = 1; round <= iterations; round += 1) {
    // Pozdější odpovědi váží víc: průměr tak rychleji zapomene špatný začátek.
    const step = 2 / (round + 1);
    priceCalls();
    calls.forEach((call, order) => {
      const values = callValues[order];
      for (let hand = 0; hand < SIZE; hand += 1) call[hand] += step * ((values[hand] > 0 ? 1 : 0) - call[hand]);
    });
    priceJam();
    for (let hand = 0; hand < SIZE; hand += 1) jam[hand] += step * ((jamValue[hand] > 0 ? 1 : 0) - jam[hand]);
  }

  priceCalls();
  priceJam();
  const gain = (frequency: Float64Array, values: Float64Array): number => {
    let total = 0;
    for (let hand = 0; hand < SIZE; hand += 1) {
      total += (tables.combos[hand] / TOTAL_COMBOS) * (Math.max(values[hand], 0) - frequency[hand] * values[hand]);
    }
    return total;
  };
  const exploitability = Math.max(gain(jam, jamValue), ...calls.map((call, order) => gain(call, callValues[order])));

  return {
    seat: seats[shover],
    jam: asRecord(jam, 3),
    jamEv: asRecord(jamValue, 3),
    calls: Object.fromEntries(callers.map((caller, order) => [
      seats[caller],
      { frequency: asRecord(calls[order], 3), ev: asRecord(callValues[order], 3) },
    ])),
    exploitability,
  };
}

/**
 * Rovnováha pro každou sedačku, která může jít první. Velký blind mezi nimi není: když
 * všichni složí, pot je jeho. Bez načtené tabulky equity vrací `undefined`.
 */
export function solvePushFold(table: PushFoldTable, iterations = DEFAULT_ITERATIONS): PushFoldSeat[] | undefined {
  const tables = buildTables();
  if (tables === undefined) return undefined;
  return table.seats.slice(0, -1).map((_, shover) => solveSeat(tables, table, shover, iterations));
}
