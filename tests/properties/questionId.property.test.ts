import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { questionId } from "../../src/core/questionId";
import type { QuestionIdParams } from "../../src/core/questionId";
import { POSITION_ORDER, STACK_BUCKETS } from "../../src/core/types";
import type { ActionContext, AnteMode, Position, StackBucket } from "../../src/core/types";
import { ALL_HAND_CLASSES } from "../../src/core/poker";

const CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

const ANTES: AnteMode[] = ["ON", "OFF"];

const arbParams: fc.Arbitrary<QuestionIdParams> = fc.record({
  context: fc.constantFrom<ActionContext>(...CONTEXTS),
  heroPos: fc.constantFrom<Position>(...POSITION_ORDER),
  effStack: fc.constantFrom<StackBucket>(...STACK_BUCKETS),
  hand: fc.constantFrom<string>(...ALL_HAND_CLASSES),
  ante: fc.constantFrom<AnteMode>(...ANTES),
});

/** True právě tehdy, když jsou všechna 4 + 1 parametrická pole shodná. */
function sameParams(a: QuestionIdParams, b: QuestionIdParams): boolean {
  return (
    a.context === b.context &&
    a.heroPos === b.heroPos &&
    a.effStack === b.effStack &&
    a.hand === b.hand &&
    a.ante === b.ante
  );
}

describe("questionId — determinismus a injektivita", () => {
  // Feature: mtt-preflop-trainer, Property 16: Question_ID je deterministická funkce parametrů
  // Shodné parametry ⇒ shodné ID; lišící se aspoň v jednom z parametrů
  // (context, heroPos, effStack, hand, ante) ⇒ různé ID (formát je injektivní).
  // Validates: Requirements 6.4
  it("Property 16: stejné parametry ⇒ stejné ID, jiné parametry ⇒ jiné ID", () => {
    fc.assert(
      fc.property(arbParams, arbParams, (a, b) => {
        // Determinismus: opakované volání nad stejnou sadou je stabilní.
        expect(questionId(a)).toBe(questionId(a));

        const idA = questionId(a);
        const idB = questionId(b);

        if (sameParams(a, b)) {
          // Shodné parametry ⇒ shodné ID.
          expect(idA).toBe(idB);
        } else {
          // Liší se aspoň jeden parametr ⇒ ID se musí lišit (injektivita).
          expect(idA).not.toBe(idB);
        }
      }),
      { numRuns: 300 },
    );
  });
});
