import { describe, expect, it } from "vitest";

import {
  createPostflopStrategyResolver,
  selectBestPostflopRule,
} from "../../src/data/ranges/postflopStrategyResolver";
import {
  flopSingleRaisedPrototypeStrategyPack,
  matchingPostflopRules,
} from "../../src/data/ranges/postflopStrategyPack";

describe("postflopStrategyResolver", () => {
  it("prevede matching flop rule na podporovane doporuceni", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    });

    expect(result).toMatchObject({
      action: "BET_SMALL",
      explanation: "Suchy rainbow flop je vhodny pro maly c-bet, protoze casto drzi range advantage.",
      source: {
        kind: "STRATEGY_PACK",
        packId: flopSingleRaisedPrototypeStrategyPack.id,
        packVersion: flopSingleRaisedPrototypeStrategyPack.version,
        packVerifiedAt: flopSingleRaisedPrototypeStrategyPack.verifiedAt,
        ruleId: "flop-srp-dry-small-cbet",
        confidence: "LOW",
        matchedTextures: ["dry"],
        sprMin: 2,
        sprMax: 12,
        positionPattern: "IP_OR_RANGE_ADVANTAGE",
        sourceUrls: flopSingleRaisedPrototypeStrategyPack.sourceEvidence.map((evidence) => evidence.url),
        assumptions: flopSingleRaisedPrototypeStrategyPack.assumptions,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
      },
    });
    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.selectionScore).toBeGreaterThan(0);
    }
  });

  it("vrati null mimo street nebo mimo SPR packu", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    expect(resolver({
      street: "RIVER",
      textures: ["dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    })).toBeNull();
    expect(resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potBB: 1,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    })).toBeNull();
  });

  it("preferuje konkretnejsi low-SPR rule pred obecnym dry pravidlem", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potBB: 12,
      effectiveStackBB: 36,
      positionPattern: "EP_VS_BB",
    });

    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.ruleId).toBe("flop-srp-low-spr-range-advantage-small-cbet");
    }
  });

  it("vybere multi-texture dynamicke pravidlo deterministicky", () => {
    const input = {
      street: "FLOP" as const,
      textures: ["connected", "two-tone"] as const,
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "OOP_RAISER_VS_IP_CALLER" as const,
    };
    const matchingRules = matchingPostflopRules(flopSingleRaisedPrototypeStrategyPack, {
      actionNode: "SINGLE_RAISED_POT_CBET",
      boardTextures: input.textures,
      spr: 6.7,
      positionPattern: input.positionPattern,
    });

    expect(selectBestPostflopRule(matchingRules, input)?.id)
      .toBe("flop-srp-dynamic-check");
  });

  it("preferuje A-high disconnected pravidlo pred obecnym dry pravidlem", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    const result = resolver({
      street: "FLOP",
      textures: ["ace-high", "disconnected", "dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    });

    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.ruleId).toBe("flop-srp-ace-high-disconnected-small-cbet");
    }
  });

  it("nevybere IP c-bet pravidlo pro SB vs BB dry spot", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "SB_VS_BB",
    });

    expect(result).toBeNull();
  });
});
