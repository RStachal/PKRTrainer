import { beforeAll, describe, expect, it } from "vitest";

import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../../src/core/postflopGenerator";
import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
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
      const config = solvedTurnSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS);
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
    const config = solvedTurnSpotConfig(spot!, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS);
    expect(config).toBeDefined();

    const generated = generatePostflopSpot({ seed: 7, ...config!, allowFallback: true });
    expect(generated.board.map((card) => `${card.rank}${card.suit}`))
      .toEqual(config!.board.map((card) => `${card.rank}${card.suit}`));
    expect(generated.effectiveStackBB).toBe(config!.effectiveStackBB);
  });

  it("names the decision from the node's role, not the family's name", () => {
    // The defect this replaced: every family is named for the flop c-bet that
    // defines it, and the turn node inside holds the player who *called* that
    // c-bet. Filed by name, a cutoff would be shown the big blind's answers and
    // told they held the betting lead.
    //
    // The small blind family is the one that proves it is role and not seat: the
    // small blind opened and is out of position for the whole hand, so its turn
    // bet is a continuation, not a lead.
    const byPattern = new Map<string, Set<string>>();
    for (const spot of solvedTurnSpots()) {
      const seen = byPattern.get(spot.positionPattern) ?? new Set<string>();
      seen.add(spot.actionNode);
      byPattern.set(spot.positionPattern, seen);
    }
    expect([...(byPattern.get("SRP_SB_VS_BB") ?? [])]).toEqual(["TURN_BARREL"]);
    expect([...(byPattern.get("SRP_CO_VS_BB") ?? [])]).toEqual(["TURN_OOP_LEAD"]);
    expect([...(byPattern.get("3BP_BTN_VS_CO") ?? [])]).toEqual(["TURN_OOP_LEAD"]);
  });

  it("can deal every solved spot it offers", () => {
    // A spot the catalogue lists but the generator cannot build is content that
    // exists and is unreachable, which reads from outside exactly like content
    // that is broken. Three-bet families were in that state: their contexts were
    // absent from the single-raised list the catalogue was matched against.
    const undealable = solvedTurnSpots().filter((spot) => (
      solvedTurnSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS) === undefined
    ));
    expect(undealable).toHaveLength(0);
  });

  it("deals hero a hand they can actually hold, so the solve answers", () => {
    // The gap this closed: the catalogue chose a solved board and then let the
    // generator deal hero any two cards. A hand outside hero's solved range is
    // not merely unanswerable - holding it means hero folded before this turn -
    // so three quarters of solved spots asked the resolver an impossible
    // question, were refused, and fell through to the heuristic on a board that
    // had been picked precisely because it was solved.
    const candidates = solvedTurnSpots().filter((spot) => spot.actionNode === "TURN_OOP_LEAD");
    expect(candidates.length).toBeGreaterThan(0);

    let solverBacked = 0;
    const attempts = 120;
    for (let seed = 0; seed < attempts; seed += 1) {
      const random = (seed + 0.5) / attempts;
      const picked = pickSolvedTurnSpot(random, candidates)!;
      const config = solvedTurnSpotConfig(picked, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, random);
      if (config === undefined) continue;
      const generated = generatePostflopSpot({
        seed,
        strategyResolver: createDefaultPostflopStrategyResolver(),
        allowFallback: true,
        ...config,
      });
      const source = generated.strategySource;
      if (source.kind === "STRATEGY_PACK" && source.provenance === "SOLVER_BACKED") {
        solverBacked += 1;
      }
      // Hero's cards must be two of the board's absentees.
      const board = new Set(generated.board.map((c) => `${c.rank}${c.suit}`));
      for (const heroCard of generated.heroCards) {
        expect(board.has(`${heroCard.rank}${heroCard.suit}`)).toBe(false);
      }
    }
    expect(solverBacked).toBe(attempts);
  });

  it("picks the same spot for the same seed", () => {
    expect(pickSolvedTurnSpot(0.31)?.sourceDirectory)
      .toBe(pickSolvedTurnSpot(0.31)?.sourceDirectory);
  });
});
