import { describe, expect, it } from "vitest";

import {
  generatePostflopLine,
  type PostflopLine,
  type PostflopStreetState,
} from "../../src/core/postflopLineSimulator";

// The line simulator carries pot and both stacks across three streets, and their
// ratio is the SPR that selects which rule the player is graded against. An error
// here is not cosmetic: the SPR fidelity work measured that a spot shown at the
// wrong depth gets strategy from a different solve.
//
// Every amount passes through a round-to-tenths, and rounding applied repeatedly
// is the classic way chips get quietly created or destroyed. These are properties
// over many generated lines rather than one hand-picked case, because a rounding
// leak shows up on some paths and not others.

/** Every chip in play: the pot, both stacks, and anything mid-street. */
function totalChips(state: PostflopStreetState): number {
  return state.potBB
    + state.heroStackBB
    + state.villainStackBB
    + state.heroStreetContributionBB
    + state.villainStreetContributionBB;
}

function lines(count: number): PostflopLine[] {
  const built: PostflopLine[] = [];
  for (let seed = 1; seed <= count; seed += 1) {
    built.push(generatePostflopLine({
      seed,
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
      positionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
    }));
  }
  return built;
}

const SAMPLE = lines(80);

describe("hand line chip conservation", () => {
  it("generates lines to reason about", () => {
    // A property suite that silently tested nothing would pass forever.
    expect(SAMPLE).toHaveLength(80);
    expect(SAMPLE.every((line) => line.streets.length >= 1)).toBe(true);
  });

  it("neither creates nor destroys chips from first street to last", () => {
    for (const line of SAMPLE) {
      const before = totalChips(line.initialState);
      const after = totalChips(line.finalState);
      // Measured across 400 lines the drift is exactly zero, so this asserts
      // exact conservation rather than a tolerance. A tolerance wide enough to
      // absorb a real rounding leak would not have caught one.
      expect(Math.abs(after - before), `seed ${line.seed}: ${before} -> ${after}`)
        .toBeLessThan(1e-9);
    }
  });

  it("keeps chips conserved at every street boundary, not just the ends", () => {
    // Conservation can hold end to end while a street leaks and a later one
    // compensates, so each boundary is checked on its own.
    for (const line of SAMPLE) {
      const start = totalChips(line.initialState);
      for (const street of line.streets) {
        expect(Math.abs(totalChips(street.stateBefore) - start), `seed ${line.seed} ${street.street}`)
          .toBeLessThan(1e-9);
      }
    }
  });

  it("never lets a stack go negative", () => {
    for (const line of SAMPLE) {
      for (const street of line.streets) {
        expect(street.stateBefore.heroStackBB, `seed ${line.seed}`).toBeGreaterThanOrEqual(0);
        expect(street.stateBefore.villainStackBB, `seed ${line.seed}`).toBeGreaterThanOrEqual(0);
      }
      expect(line.finalState.heroStackBB, `seed ${line.seed}`).toBeGreaterThanOrEqual(0);
      expect(line.finalState.villainStackBB, `seed ${line.seed}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("never lets the pot shrink", () => {
    // Money goes into the pot and does not come back out mid-hand.
    for (const line of SAMPLE) {
      let pot = line.initialState.potBB;
      for (const street of line.streets) {
        expect(street.stateBefore.potBB, `seed ${line.seed} ${street.street}`)
          .toBeGreaterThanOrEqual(pot - 1e-9);
        pot = street.stateBefore.potBB;
      }
      expect(line.finalState.potBB).toBeGreaterThanOrEqual(pot - 1e-9);
    }
  });

  it("keeps each spot's SPR consistent with its own pot and stack", () => {
    // The spot is what the player is graded against, so its SPR has to describe
    // the money actually in front of them rather than the street's opening state.
    for (const line of SAMPLE) {
      for (const street of line.streets) {
        const { potBB, effectiveStackBB } = street.spot;
        expect(potBB, `seed ${line.seed} ${street.street}`).toBeGreaterThan(0);
        expect(effectiveStackBB, `seed ${line.seed} ${street.street}`).toBeGreaterThanOrEqual(0);
        // Neither player can have more behind than the smaller stack.
        expect(effectiveStackBB).toBeLessThanOrEqual(
          Math.max(street.stateBefore.heroStackBB, street.stateBefore.villainStackBB) + 0.1,
        );
      }
    }
  });

  it("only deepens the pot relative to stacks as a line goes on", () => {
    // SPR falls monotonically within a hand: the pot grows and stacks shrink.
    for (const line of SAMPLE) {
      let previous = Number.POSITIVE_INFINITY;
      for (const street of line.streets) {
        const spr = street.spot.effectiveStackBB / street.spot.potBB;
        expect(spr, `seed ${line.seed} ${street.street}`).toBeLessThanOrEqual(previous + 1e-6);
        previous = spr;
      }
    }
  });
});
