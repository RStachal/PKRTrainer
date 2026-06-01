import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { grade } from "../../src/core/scoring";
import type {
  ActionKey,
  AnteMode,
  Card,
  Spot,
  StackBucket,
  TableState,
} from "../../src/core/types";

/** Všechny Akční_klíče (Req 3.12). */
const ALL_ACTION_KEYS: ActionKey[] = [
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

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "h" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "OPEN",
  isBvB: false,
};

/**
 * Sestaví minimální validní Spot s rozumnými default hodnotami všech
 * povinných polí; sady správnosti se předají parametricky.
 */
function makeSpot(strictCorrect: ActionKey[], correctKeys: ActionKey[]): Spot {
  return {
    id: "RFI|BTN|100|AKs|OFF",
    context: "VS_OPEN",
    heroPos: "BTN",
    effStack: 100 as StackBucket,
    ante: "OFF" as AnteMode,
    pushFold: false,
    hand: "AKs",
    heroCards,
    tableState,
    answers: ALL_ACTION_KEYS.map((key) => ({ key, label: key })),
    correctKeys,
    strictCorrect,
    explanation: "Zdůvodnění pro testovací Spot.",
  };
}

/** Neprázdná podmnožina Akčních_klíčů. */
const arbNonEmptyKeys: fc.Arbitrary<ActionKey[]> = fc
  .uniqueArray(fc.constantFrom<ActionKey>(...ALL_ACTION_KEYS), { minLength: 1 })
  .map((arr) => arr as ActionKey[]);

const arbChosen: fc.Arbitrary<ActionKey> = fc.constantFrom<ActionKey>(...ALL_ACTION_KEYS);

describe("scoring — členství v sadách správnosti", () => {
  // Feature: mtt-preflop-trainer, Property 19: STRICT správnost je členství v přesné sadě
  // grade(spot, chosen, "STRICT").correct === spot.strictCorrect.includes(chosen),
  // a recommended je neprázdné.
  // Validates: Requirements 7.2, 7.7
  it("Property 19: STRICT correct ⇔ chosen ∈ strictCorrect", () => {
    fc.assert(
      fc.property(arbNonEmptyKeys, arbNonEmptyKeys, arbChosen, (strict, lenient, chosen) => {
        const spot = makeSpot(strict, lenient);
        const result = grade(spot, chosen, "STRICT");

        expect(result.correct).toBe(spot.strictCorrect.includes(chosen));
        expect(result.recommended.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 20: LENIENT správnost je členství v přijatelné sadě
  // grade(spot, chosen, "LENIENT").correct === spot.correctKeys.includes(chosen),
  // a recommended je neprázdné.
  // Validates: Requirements 7.3, 7.7
  it("Property 20: LENIENT correct ⇔ chosen ∈ correctKeys", () => {
    fc.assert(
      fc.property(arbNonEmptyKeys, arbNonEmptyKeys, arbChosen, (strict, lenient, chosen) => {
        const spot = makeSpot(strict, lenient);
        const result = grade(spot, chosen, "LENIENT");

        expect(result.correct).toBe(spot.correctKeys.includes(chosen));
        expect(result.recommended.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});
