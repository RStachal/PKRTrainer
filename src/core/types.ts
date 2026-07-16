/**
 * Základní doménové typy MTT Preflop Traineru.
 *
 * Tento modul je čistě typový + několik `const` polí (žádná runtime logika).
 * Slouží jako jediný zdroj pravdy pro pozice, hloubkové koše, akční kontexty,
 * Akční_klíče a strukturu Spotu.
 */

// ---------------------------------------------------------------------------
// Pozice (Req 1.1, 1.2)
// ---------------------------------------------------------------------------

/** Jedna z 9 pozic full ring stolu. */
export type Position =
  | "UTG"
  | "UTG+1"
  | "UTG+2"
  | "LJ"
  | "HJ"
  | "CO"
  | "BTN"
  | "SB"
  | "BB";

/** Fixní pořadí preflop akce (Req 1.2): UTG jedná první, BB poslední. */
export const POSITION_ORDER: Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];

// ---------------------------------------------------------------------------
// Hloubkové koše a push/fold (Req 2.1, 2.2, 2.3)
// ---------------------------------------------------------------------------

/** 13 diskrétních hloubkových košů v BB (Req 2.1). */
export type StackBucket = 5 | 10 | 15 | 20 | 25 | 30 | 40 | 50 | 60 | 75 | 100 | 125 | 150;

/** Všechny hloubkové koše ve vzestupném pořadí. */
export const STACK_BUCKETS: StackBucket[] = [
  5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150,
];

/** Horní hranice (včetně) pro režim Push/Fold v BB (Req 2.3). */
export const PUSH_FOLD_MAX = 12;

// ---------------------------------------------------------------------------
// Ante (Req 5)
// ---------------------------------------------------------------------------

export type AnteMode = "ON" | "OFF";

// ---------------------------------------------------------------------------
// Akční kontext / kategorie (Req 13.3)
// ---------------------------------------------------------------------------

/** Akční kontext (kategorie tréninku). */
export type ActionContext =
  | "RFI" // RFI/Open
  | "VS_LIMP" // Iso-raise vs limp(s)
  | "VS_OPEN" // Fold/Call/3bet
  | "VS_3BET" // Fold/Call/4bet
  | "VS_4BET" // Fold/Call/Jam
  | "SQUEEZE" // 3bet s callery v potu
  | "BVB" // Blind-vs-blind
  | "PUSH_FOLD" // <=12 BB: Jam/Fold
  | "VS_ALLIN"; // Call-jam/Fold

// ---------------------------------------------------------------------------
// Akční klíče a druhy akcí (Req 3.12)
// ---------------------------------------------------------------------------

/** Strojové identifikátory akcí vč. sizingu (Req 3.12, ASCII). */
export type ActionKey =
  | "FOLD"
  | "CALL"
  | "LIMP"
  | "OVERLIMP"
  | "OPEN_2X"
  | "OPEN_25X"
  | "OPEN_3X"
  | "ISO_2X"
  | "ISO_25X"
  | "ISO_3X"
  | "3BET"
  | "4BET"
  | "SQUEEZE"
  | "JAM"
  | "CALL_JAM";

/** Druh akce (bez sizingu) — výstup actionTree. */
export type ActionKind =
  | "FOLD"
  | "CALL"
  | "LIMP"
  | "OVERLIMP"
  | "OPEN"
  | "ISO"
  | "3BET"
  | "4BET"
  | "SQUEEZE"
  | "JAM"
  | "CALL_JAM";

// ---------------------------------------------------------------------------
// Karty (Req 8.3, 10)
// ---------------------------------------------------------------------------

export type Rank = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
export type Suit = "s" | "h" | "d" | "c";

export interface Card {
  rank: Rank;
  suit: Suit;
}

/** Označení třídy startovní ruky — 169 tříd: "AA".."22", "AKs", "AKo", ... */
export type HandLabel = string;

// ---------------------------------------------------------------------------
// Stav stolu a nabídka akcí (Req 3)
// ---------------------------------------------------------------------------

/** Akce, které mohou stát před hrdinou. */
export type FacingAction = "NONE" | "OPEN" | "3BET" | "4BET" | "ALLIN";

export interface TableState {
  heroPos: Position;
  pushFold: boolean; // eff <= 12 BB
  limpsBefore: number; // 0..8
  callsBefore: number; // 0..7
  facing: FacingAction;
  isBvB: boolean;
}

// ---------------------------------------------------------------------------
// Spot a odpovědi (Req 3.12, 7)
// ---------------------------------------------------------------------------

import type { ActionEvSet } from "./actionEv";

/** Jedna nabízená odpověď: 1 Akční_klíč + popisek. */
export interface Answer {
  key: ActionKey;
  label: string; // český text
}

export interface Spot {
  id: string; // Question_ID
  context: ActionContext;
  heroPos: Position;
  effStack: StackBucket;
  ante: AnteMode;
  pushFold: boolean;
  hand: HandLabel;
  heroCards: [Card, Card]; // konkrétní karty pro vykreslení
  tableState: TableState; // pro render + odvození nabídky akcí
  answers: Answer[]; // nabízené možnosti (1 ActionKey každá)
  correctKeys: ActionKey[]; // LENIENT (Req 7.3)
  strictCorrect: ActionKey[]; // STRICT (Req 7.2)
  /** Solver EV for every offered action; absent until a reviewed export provides it. */
  actionEvs?: ActionEvSet<ActionKey>;
  explanation: string; // české zdůvodnění
  hint?: string;
  /**
   * Startovní velikost potu v BB před akcí hrdiny (Req 5.3, 5.4).
   *
   * Volitelné pole: při generování Spotu jej `Drill_Engine` vždy vyplní podle
   * stavu ante — ON ⇒ 2,5 BB (SB 0,5 + BB 1 + ante 1), OFF ⇒ 1,5 BB
   * (SB 0,5 + BB 1). Spoty sestavené jinde (např. HH_Parser) jej mohou vynechat
   * a nechat Table_Renderer dopočítat. (Property 13)
   */
  startingPot?: number;
}

// ---------------------------------------------------------------------------
// Filtry a konfigurace relace (Req 13, 6)
// ---------------------------------------------------------------------------

export type ScoringMode = "LENIENT" | "STRICT";

export interface Filters {
  positions: Position[]; // [] = neomezeno (Req 13.7)
  buckets: StackBucket[]; // [] = neomezeno
  contexts: ActionContext[]; // [] = neomezeno
  ante: AnteMode;
  scoringMode: ScoringMode;
}

export interface SessionConfig {
  seed: number; // 0..4294967295
  filters: Filters;
}
