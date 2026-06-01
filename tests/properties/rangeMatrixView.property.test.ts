import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  categoryForActionKey,
  categoryForHand,
  type ActionCategory,
} from "../../src/ui/rangeMatrixView";
import type { ActionKey } from "../../src/core/types";

const ACTION_KEYS: ActionKey[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
  "JAM",
  "CALL_JAM",
];

const EXPECTED_CATEGORY: Record<ActionKey, ActionCategory> = {
  FOLD: "FOLD",
  CALL: "CALL",
  LIMP: "LIMP",
  OVERLIMP: "OVERLIMP",
  OPEN_2X: "OPEN",
  OPEN_25X: "OPEN",
  OPEN_3X: "OPEN",
  ISO_2X: "ISO",
  ISO_25X: "ISO",
  ISO_3X: "ISO",
  "3BET": "3BET",
  "4BET": "4BET",
  SQUEEZE: "SQUEEZE",
  JAM: "JAM",
  CALL_JAM: "CALL_JAM",
};

describe("rangeMatrixView - action coloring", () => {
  // Feature: mtt-preflop-trainer, Property 23: Barveni mrizky podle Akcniho_klice
  // Validates: Requirements 10.2
  it("Property 23: ActionKey se mapuje na stabilni vizualni kategorii", () => {
    fc.assert(
      fc.property(fc.constantFrom<ActionKey>(...ACTION_KEYS), (key) => {
        expect(categoryForActionKey(key)).toBe(EXPECTED_CATEGORY[key]);
        expect(categoryForHand([key])).toBe(EXPECTED_CATEGORY[key]);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 23: ruka bez doporucene akce je Fold", () => {
    fc.assert(
      fc.property(fc.option(fc.constant<ActionKey[]>([]), { nil: undefined }), (keys) => {
        expect(categoryForHand(keys)).toBe("FOLD");
      }),
      { numRuns: 100 },
    );
  });
});
