import { describe, expect, it } from "vitest";

import { createPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyResolver";
import { flopSingleRaisedPrototypeStrategyPack } from "../../src/data/ranges/postflopStrategyPack";

describe("postflopStrategyResolver", () => {
  it("prevede matching flop rule na podporovane doporuceni", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    expect(resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
    })).toEqual({
      action: "BET_SMALL",
      explanation: "Suchy rainbow flop je vhodny pro maly c-bet, protoze casto drzi range advantage.",
      source: {
        kind: "STRATEGY_PACK",
        packId: flopSingleRaisedPrototypeStrategyPack.id,
        ruleId: "flop-srp-dry-small-cbet",
        confidence: "LOW",
      },
    });
  });

  it("vrati null mimo street nebo mimo SPR packu", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    expect(resolver({
      street: "RIVER",
      textures: ["dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
    })).toBeNull();
    expect(resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potBB: 1,
      effectiveStackBB: 40,
    })).toBeNull();
  });
});
