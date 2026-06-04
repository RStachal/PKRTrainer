/**
 * Pokerová primitiva: hodnoty karet a třídy startovních rukou.
 *
 * Tento modul je čisté jádro (žádné I/O): definuje pořadí hodnot `RANKS`,
 * mapování hodnota → číselná síla (`R2V`), barvy (`SUITS`), generování všech
 * 169 tříd startovních rukou a helpery pro standardní rozložení mřížky 13×13
 * (páry na diagonále, suited nad diagonálou, offsuit pod diagonálou).
 *
 * Logika `handLabel(i, j)` a tabulky `RANKS`/`R2V` jsou portovány z legacy
 * baseline (`Legacy/PKRTrainer.html`) pro zachování shodného formátu labelů
 * ("AA", "AKs", "AKo", ...).
 *
 * _Requirements: 1.5, 8.3, 10.1, 10.4_
 */

import type { Rank, Suit, HandLabel } from "./types";

// ---------------------------------------------------------------------------
// Hodnoty a barvy (Req 8.3)
// ---------------------------------------------------------------------------

/**
 * Hodnoty karet seřazené od nejvyšší po nejnižší (A → 2).
 * Toto pořadí definuje i osy mřížky 13×13 (Req 10.1, 10.4).
 */
export const RANKS: Rank[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** Mapování hodnoty na číselnou sílu (A = 14 … 2 = 2). Portováno z baseline. */
export const R2V: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

/** Čtyři barvy (spade, heart, diamond, club) — pro rozdávání karet. */
export const SUITS: Suit[] = ["s", "h", "d", "c"];

/** Velikost mřížky startovních rukou (13 hodnot × 13 hodnot). */
export const GRID_SIZE = 13;

/** Počet všech tříd startovních rukou (13 párů + 78 suited + 78 offsuit). */
export const HAND_CLASS_COUNT = 169;

// ---------------------------------------------------------------------------
// Hodnota a index hodnoty
// ---------------------------------------------------------------------------

/**
 * Vrátí číselnou sílu hodnoty (A = 14 … 2 = 2).
 *
 * @param rank Hodnota karty.
 * @returns Číselná síla v rozsahu 2–14.
 */
export function rankValue(rank: Rank): number {
  return R2V[rank];
}

/**
 * Vrátí index hodnoty v poli `RANKS` (A = 0 … 2 = 12).
 *
 * @param rank Hodnota karty.
 * @returns Index 0–12 v `RANKS`.
 */
export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

// ---------------------------------------------------------------------------
// Rozložení mřížky 13×13 (Req 10.1, 10.4)
// ---------------------------------------------------------------------------

/** Kategorie buňky mřížky podle vzájemné polohy indexů. */
export type HandClassType = "pair" | "suited" | "offsuit";

/**
 * Určí kategorii buňky (i, j) ve standardním rozložení mřížky:
 * i = j ⇒ pár (diagonála), i < j ⇒ suited (nad diagonálou),
 * i > j ⇒ offsuit (pod diagonálou). (Req 10.4)
 *
 * @param i Index řádku (0–12, odpovídá `RANKS[i]`).
 * @param j Index sloupce (0–12, odpovídá `RANKS[j]`).
 * @returns Kategorie ruky pro danou buňku.
 */
export function cellType(i: number, j: number): HandClassType {
  if (i === j) return "pair";
  return i < j ? "suited" : "offsuit";
}

/**
 * Vrátí `HandLabel` pro buňku mřížky (i, j) ve standardním rozložení.
 *
 * - i = j ⇒ pár, např. "AA" (diagonála).
 * - i < j ⇒ suited, vyšší hodnota první, např. "AKs" (nad diagonálou).
 * - i > j ⇒ offsuit, vyšší hodnota první, např. "AKo" (pod diagonálou).
 *
 * Vyšší hodnota stojí vždy první, protože `RANKS` je seřazeno sestupně, a tak
 * `RANKS[min(i,j)]` je vždy ta vyšší. Portováno z baseline `handLabel`.
 * (Req 10.1, 10.4)
 *
 * @param i Index řádku (0–12).
 * @param j Index sloupce (0–12).
 * @returns Label třídy ruky ("AA", "AKs", "AKo", …).
 * @throws RangeError pokud je některý index mimo rozsah 0–12.
 */
export function handLabel(i: number, j: number): HandLabel {
  if (i < 0 || i >= GRID_SIZE || j < 0 || j >= GRID_SIZE) {
  throw new RangeError(`Grid index outside 0-${GRID_SIZE - 1}: (${i}, ${j})`);
  }
  const r1 = RANKS[i];
  const r2 = RANKS[j];
  if (i === j) return r1 + r2; // pár, např. "AA"
  if (i < j) return r1 + r2 + "s"; // suited, vyšší první, "AKs"
  return r2 + r1 + "o"; // offsuit, vyšší první, "AKo"
}

/**
 * Sestaví celou mřížku 13×13 labelů tříd rukou.
 *
 * Výsledek `grid[i][j]` odpovídá `handLabel(i, j)`. Mřížka pokrývá přesně
 * všech 169 tříd startovních rukou (Req 10.1, 10.4).
 *
 * @returns Dvourozměrné pole 13×13 s `HandLabel` v každé buňce.
 */
export function buildHandGrid(): HandLabel[][] {
  const grid: HandLabel[][] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    const row: HandLabel[] = [];
    for (let j = 0; j < GRID_SIZE; j++) {
      row.push(handLabel(i, j));
    }
    grid.push(row);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Všech 169 tříd startovních rukou (Req 10.1)
// ---------------------------------------------------------------------------

/**
 * Vygeneruje všech 169 unikátních tříd startovních rukou v deterministickém
 * pořadí (řádek po řádku přes mřížku 13×13). (Req 10.1)
 *
 * @returns Pole 169 unikátních `HandLabel` ("AA", "AKs", …, "22").
 */
export function allHandClasses(): HandLabel[] {
  const hands: HandLabel[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      hands.push(handLabel(i, j));
    }
  }
  return hands;
}

/** Všech 169 tříd startovních rukou (předpočítaná konstanta). */
export const ALL_HAND_CLASSES: HandLabel[] = allHandClasses();

// ---------------------------------------------------------------------------
// Klasifikace labelu
// ---------------------------------------------------------------------------

/**
 * Zjistí, zda je label pár (dvě stejné hodnoty, např. "AA").
 *
 * @param label Třída startovní ruky.
 */
export function isPair(label: HandLabel): boolean {
  return label.length === 2 && label[0] === label[1];
}

/**
 * Zjistí, zda je label suited (končí na "s", např. "AKs").
 *
 * @param label Třída startovní ruky.
 */
export function isSuited(label: HandLabel): boolean {
  return label.length === 3 && label[2] === "s";
}

/**
 * Zjistí, zda je label offsuit (končí na "o", např. "AKo").
 *
 * @param label Třída startovní ruky.
 */
export function isOffsuit(label: HandLabel): boolean {
  return label.length === 3 && label[2] === "o";
}
