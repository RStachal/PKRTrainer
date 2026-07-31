import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { offeredActions } from "../../src/core/actionTree";
import { POSITION_ORDER } from "../../src/core/types";
import type { ActionKind, FacingAction, Position, TableState } from "../../src/core/types";

/**
 * Generátor libovolného validního stavu stolu.
 *
 * - heroPos: jedna z 9 pozic,
 * - pushFold: bool,
 * - limpsBefore: 0..8,
 * - callsBefore: 0..7,
 * - facing: NONE | OPEN | 3BET | 4BET | ALLIN,
 * - isBvB: bool.
 */
const FACINGS: FacingAction[] = ["NONE", "OPEN", "3BET", "4BET", "ALLIN"];

const arbTableState: fc.Arbitrary<TableState> = fc.record({
  heroPos: fc.constantFrom<Position>(...POSITION_ORDER),
  pushFold: fc.boolean(),
  shortStack: fc.boolean(),
  limpsBefore: fc.integer({ min: 0, max: 8 }),
  callsBefore: fc.integer({ min: 0, max: 7 }),
  facing: fc.constantFrom<FacingAction>(...FACINGS),
  isBvB: fc.boolean(),
});

describe("actionTree — stavové stráže nabídky akcí", () => {
  // Feature: mtt-preflop-trainer, Property 5: Stavové stráže nabízejí očekávané akce
  // Pro libovolný TableState splňující stavovou stráž daného kontextu je
  // odpovídající množina akcí PODMNOŽINOU nabídnutých akcí dle tabulky.
  // Stráže platí jen pro facing != ALLIN a (kde uvedeno) not pushFold.
  // Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.13
  it("Property 5: očekávané akce jsou podmnožinou offeredActions", () => {
    fc.assert(
      fc.property(arbTableState, (state) => {
        const offered = new Set<ActionKind>(offeredActions(state));

        // Vs-all-in pokrývá Property 6; stráže Property 5 zde neplatí.
        if (state.facing === "ALLIN") return;
        // Všechny stráže Property 5 vyžadují režim NOT push/fold.
        if (state.pushFold) return;

        const heroIsBB = state.heroPos === "BB";
        const hasLimps = state.limpsBefore >= 1 && state.limpsBefore <= 8;

        if (state.facing === "NONE") {
          if (!hasLimps && !heroIsBB) {
            // 0 limpů, hero≠BB ⇒ OPEN (3.1) a LIMP (3.2)
            expect(offered.has("OPEN")).toBe(true);
            expect(offered.has("LIMP")).toBe(true);
          }
          if (hasLimps) {
            // 1–8 limpů ⇒ ISO (3.4)
            expect(offered.has("ISO")).toBe(true);
            if (heroIsBB) {
              // hero=BB ⇒ {LIMP, ISO} ⊆ offered (3.3)
              expect(offered.has("LIMP")).toBe(true);
              expect(offered.has("ISO")).toBe(true);
            } else {
              // hero≠BB ⇒ navíc OVERLIMP (3.13)
              expect(offered.has("OVERLIMP")).toBe(true);
            }
          }
        }

        if (state.facing === "OPEN") {
          // {FOLD, CALL, 3BET} ⊆ offered (3.5)
          for (const a of ["FOLD", "CALL", "3BET"] as const) {
            expect(offered.has(a)).toBe(true);
          }
          // 1–7 callů ⇒ SQUEEZE (3.6)
          if (state.callsBefore >= 1 && state.callsBefore <= 7) {
            expect(offered.has("SQUEEZE")).toBe(true);
          }
        }

        if (state.facing === "3BET") {
          // {FOLD, CALL, 4BET} ⊆ offered (3.7)
          for (const a of ["FOLD", "CALL", "4BET"] as const) {
            expect(offered.has(a)).toBe(true);
          }
        }

        if (state.facing === "4BET") {
          // {FOLD, CALL, JAM} ⊆ offered (3.8)
          for (const a of ["FOLD", "CALL", "JAM"] as const) {
            expect(offered.has(a)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 6: Vs-all-in nabízí výhradně Call-jam a Fold
  // Pro libovolný TableState s facing = ALLIN je nabídka akcí přesně
  // {CALL_JAM, FOLD}, nezávisle na režimu Push/Fold.
  // Validates: Requirements 3.10
  it("Property 6: facing=ALLIN ⇒ offeredActions === {CALL_JAM, FOLD}", () => {
    const arbAllInState: fc.Arbitrary<TableState> = fc.record({
      heroPos: fc.constantFrom<Position>(...POSITION_ORDER),
      pushFold: fc.boolean(),
      shortStack: fc.boolean(),
      limpsBefore: fc.integer({ min: 0, max: 8 }),
      callsBefore: fc.integer({ min: 0, max: 7 }),
      facing: fc.constant<FacingAction>("ALLIN"),
      isBvB: fc.boolean(),
    });

    fc.assert(
      fc.property(arbAllInState, (state) => {
        const offered = offeredActions(state);
        expect(offered.length).toBe(2);
        expect(new Set(offered)).toEqual(new Set<ActionKind>(["CALL_JAM", "FOLD"]));
      }),
      { numRuns: 100 },
    );
  });
});
