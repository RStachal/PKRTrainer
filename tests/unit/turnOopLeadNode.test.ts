import { describe, expect, it } from "vitest";

import {
  ALL_BOARD_TEXTURES,
  OOP_CALLER_POSITION_CONTEXTS,
  generatePostflopSpot,
  postflopDefenderContextsForFormat,
} from "../../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
import { turnSingleRaisedPrototypeStrategyPack } from "../../src/data/ranges/postflopStrategyPack";

/**
 * The turn decision the product did not have a name for.
 *
 * Every solved turn family holds the same node: the player who called the last
 * raise, out of position, acting first before anyone has bet. The product
 * modelled the aggressor continuing and the defender facing a bet, and nothing
 * in between - so nine families of solved strategy had nowhere to be filed, and
 * filing them under the barrel would have told a caller they held the initiative.
 *
 * Three things have to hold for the node to mean what it says, and each of them
 * was broken at some point while it was being added.
 */
describe("turn out-of-position lead", () => {
  it("is only dealt in seatings where it can happen", () => {
    // Drawing seats and a decision independently produced hands that contradict
    // themselves: three quarters of randomly seated lead spots put the raiser
    // out of position, where acting first is a continuation bet, not a lead.
    for (let seed = 0; seed < 200; seed += 1) {
      const spot = generatePostflopSpot({ seed, street: "TURN", actionNode: "TURN_OOP_LEAD" });
      expect(spot.inPosition).toBe(false);
      expect(spot.heroPosition).not.toBe(spot.aggressorPosition);
    }
  });

  it("seats the defender, who had no chair in the model at all", () => {
    // Every single-raised context was written from the raiser's side, so
    // SRP_CO_VS_BB seated hero at the cutoff. A spot built for the big blind's
    // turn therefore sat the player in the wrong chair.
    const defenders = postflopDefenderContextsForFormat("FULL_RING_9");
    expect(defenders.length).toBeGreaterThan(0);
    for (const context of defenders) {
      expect(context.heroPosition).toBe("BB");
      expect(context.callerPosition).toBe("BB");
      expect(context.aggressorPosition).toBe(context.villainPosition);
    }
    // The blind pair is the exception: the big blind acts after the small blind.
    const vsSb = defenders.find((context) => context.villainPosition === "SB");
    expect(vsSb?.inPosition).toBe(true);
    expect(OOP_CALLER_POSITION_CONTEXTS.every((context) => !context.inPosition)).toBe(true);
  });

  it("answers every board, and checks on nearly all of them", () => {
    const resolver = createDefaultPostflopStrategyResolver();
    let fallback = 0;
    let leads = 0;
    const attempts = 400;
    for (let seed = 0; seed < attempts; seed += 1) {
      const spot = generatePostflopSpot({
        seed,
        street: "TURN",
        actionNode: "TURN_OOP_LEAD",
        strategyResolver: resolver,
        allowFallback: true,
      });
      if (spot.strategySource.kind === "FALLBACK") fallback += 1;
      if (spot.recommendedAction !== "CHECK") leads += 1;
    }
    expect(fallback).toBe(0);
    // Leading out of position without the initiative is the exception the turn
    // card has to earn. An earlier version of these rules led on half of all
    // turns, which is the leak the spot exists to teach against.
    expect(leads / attempts).toBeLessThan(0.15);
    expect(leads).toBeGreaterThan(0);
  });

  it("does not let the default rule outrank the specific ones", () => {
    // Rule score counts matched textures, so a rule naming the whole taxonomy
    // matches all of a board's and beats any rule that named one - the catch-all
    // won everywhere and every specific rule went dead.
    const catchAlls = turnSingleRaisedPrototypeStrategyPack.rules.filter((rule) => (
      ALL_BOARD_TEXTURES.every((texture) => rule.boardTextures.includes(texture))
    ));
    expect(catchAlls.length).toBeGreaterThan(0);
    for (const rule of catchAlls) expect(rule.preferredAction).toBe("CHECK");
  });
});
