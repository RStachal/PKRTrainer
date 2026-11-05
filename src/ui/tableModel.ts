/**
 * Popisky odznaků u sedadel; rozmístění akcí je v `core/tableSeats.ts`.
 */

import type { ActionKey } from "../core/types";

export { deriveSeats, seatSlot, type TableSeat } from "../core/tableSeats";

/** Poker-standardní text odznaku pro daný Akční_klíč. */
export const BADGE_LABEL: Readonly<Record<ActionKey, string>> = {
  FOLD: "FOLD",
  CALL: "CALL",
  LIMP: "LIMP",
  OVERLIMP: "OVERLIMP",
  OPEN_2X: "OPEN 2x",
  OPEN_25X: "OPEN 2.5x",
  OPEN_3X: "OPEN 3x",
  ISO_2X: "ISO 2x",
  ISO_25X: "ISO 2.5x",
  ISO_3X: "ISO 3x",
  "3BET": "3-BET",
  "4BET": "4-BET",
  SQUEEZE: "SQUEEZE",
  JAM: "ALL-IN",
  CALL_JAM: "CALL ALL-IN",
};
