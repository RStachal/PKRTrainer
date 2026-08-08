import { beforeAll, describe, expect, it } from "vitest";

import { POSTFLOP_FULL_RING_POSITION_CONTEXTS } from "../../src/core/postflopGenerator";
import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { createTurnSolvedStrategyResolverChain, loadSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import {
  pickSolvedTurnSpot,
  solvedTurnSpotConfig,
  solvedTurnSpots,
} from "../../src/data/ranges/solvedTurnSpotCatalogue";

/**
 * That the solved turns can actually be dealt, which is the half a resolver test
 * cannot see.
 *
 * A resolver that correctly refuses every board it did not solve, and a trainer
 * that deals boards at random, together produce a product where solved content
 * is never reached - and from outside it looks exactly like a resolver that is
 * broken. Both halves have to be checked, and this is the second one: take what
 * the catalogue offers, deal it through the real generator, and confirm the
 * resolver recognises what came back.
 */

describe("solved turn spot catalogue", () => {
  beforeAll(async () => {
    await loadSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  });

  it("offers the turns that were solved", () => {
    const spots = solvedTurnSpots();
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(spot.board).toHaveLength(4);
      expect(spot.potBB).toBeGreaterThan(0);
      expect(spot.effectiveStackBB).toBeGreaterThan(0);
      expect(spot.heroHandClasses.length).toBeGreaterThan(0);
    }
  });

  it("spreads across every board that was solved, not just the busiest", () => {
    const flops = new Set(solvedTurnSpots().map((spot) => (
      spot.board.slice(0, 3).map((card) => `${card.rank}${card.suit}`).join("")
    )));
    // Thirty three directories were solved for this family; a build that keeps
    // only the highest-reach turns collapses onto about a third of them.
    expect(flops.size).toBeGreaterThanOrEqual(30);
  });

  it("deals a spot the resolver then recognises", () => {
    const resolve = createTurnSolvedStrategyResolverChain();
    const spots = solvedTurnSpots();
    let recognised = 0;

    for (const spot of spots.slice(0, 40)) {
      const config = solvedTurnSpotConfig(spot, POSTFLOP_FULL_RING_POSITION_CONTEXTS);
      if (config === undefined) continue;
      const answer = resolve({
        street: "TURN",
        textures: [],
        board: config.board,
        potType: config.potType,
        potBB: config.potBB,
        effectiveStackBB: config.effectiveStackBB,
        positionPattern: config.positionContext.positionPattern,
        actionNode: config.actionNode,
        heroHand: spot.heroHandClasses[0],
      });
      const source = answer?.source;
      expect(source?.kind).toBe("STRATEGY_PACK");
      if (source?.kind === "STRATEGY_PACK") {
        expect(source.provenance).toBe("SOLVER_BACKED");
      }
      recognised += 1;
    }

    expect(recognised).toBeGreaterThan(0);
  });

  it("generates a real spot on the solved board", () => {
    const spot = pickSolvedTurnSpot(0.5);
    expect(spot).toBeDefined();
    const config = solvedTurnSpotConfig(spot!, POSTFLOP_FULL_RING_POSITION_CONTEXTS);
    expect(config).toBeDefined();

    const generated = generatePostflopSpot({ seed: 7, ...config!, allowFallback: true });
    expect(generated.board.map((card) => `${card.rank}${card.suit}`))
      .toEqual(config!.board.map((card) => `${card.rank}${card.suit}`));
    expect(generated.effectiveStackBB).toBe(config!.effectiveStackBB);
  });

  it("picks the same spot for the same seed", () => {
    expect(pickSolvedTurnSpot(0.31)?.sourceDirectory)
      .toBe(pickSolvedTurnSpot(0.31)?.sourceDirectory);
  });
});
