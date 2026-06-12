import { describe, expect, it } from "vitest";

import {
  createPostflopStrategyResolver,
  createPostflopStrategyResolverChain,
  selectBestPostflopRule,
} from "../../src/data/ranges/postflopStrategyResolver";
import {
  flopSingleRaisedPrototypeStrategyPack,
  matchingPostflopRules,
  postflopPublicHeuristicStrategyPacks,
  riverSingleRaisedPrototypeStrategyPack,
  turnSingleRaisedPrototypeStrategyPack,
  type PostflopStrategyPack,
} from "../../src/data/ranges/postflopStrategyPack";

describe("postflopStrategyResolver", () => {
  it("prevede matching flop rule na podporovane doporuceni", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potType: "SINGLE_RAISED",
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
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    })).toBeNull();
    expect(resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potType: "SINGLE_RAISED",
      potBB: 1,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    })).toBeNull();
  });

  it("resolver chain vybere turn a river StrategyPack podle streety", () => {
    const resolver = createPostflopStrategyResolverChain(postflopPublicHeuristicStrategyPacks);

    const turn = resolver({
      street: "TURN",
      textures: ["dry", "disconnected", "ace-high", "rainbow"],
      potType: "SINGLE_RAISED",
      potBB: 8,
      effectiveStackBB: 40,
      positionPattern: "BTN_VS_BB",
    });
    const river = resolver({
      street: "RIVER",
      textures: ["dry", "disconnected", "rainbow"],
      potType: "SINGLE_RAISED",
      potBB: 14,
      effectiveStackBB: 45,
      positionPattern: "BTN_VS_BB",
    });

    expect(turn?.source?.kind).toBe("STRATEGY_PACK");
    expect(river?.source?.kind).toBe("STRATEGY_PACK");
    if (turn?.source?.kind === "STRATEGY_PACK") {
      expect(turn.source.packId).toBe(turnSingleRaisedPrototypeStrategyPack.id);
      expect(turn.source.ruleId).toBe("turn-srp-dry-range-advantage-big-barrel");
    }
    if (river?.source?.kind === "STRATEGY_PACK") {
      expect(river.source.packId).toBe(riverSingleRaisedPrototypeStrategyPack.id);
      expect(river.source.ruleId).toBe("river-srp-dry-polarized-big-bet");
    }
  });

  it("preferuje konkretnejsi low-SPR rule pred obecnym dry pravidlem", () => {
    const resolver = createPostflopStrategyResolver(flopSingleRaisedPrototypeStrategyPack);

    const result = resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potType: "SINGLE_RAISED",
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
      potType: "SINGLE_RAISED" as const,
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
      potType: "SINGLE_RAISED",
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
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
      positionPattern: "SB_VS_BB",
    });

    expect(result).toBeNull();
  });

  it("nepouzije single-raised StrategyPack pro 3bet pot", () => {
    const resolver = createPostflopStrategyResolverChain(postflopPublicHeuristicStrategyPacks);

    expect(resolver({
      street: "FLOP",
      textures: ["dry", "rainbow"],
      potType: "THREE_BET_POT",
      potBB: 18,
      effectiveStackBB: 40,
      positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
    })).toBeNull();
  });

  it("matchuje explicitni facing-bet action node pro call/raise/fold rules", () => {
    const pack: PostflopStrategyPack = {
      ...flopSingleRaisedPrototypeStrategyPack,
      rules: [
        {
          id: "flop-facing-bet-dynamic-call",
          actionNode: "FLOP_FACING_BET",
          boardTextures: ["connected"],
          sprMin: 2,
          sprMax: 12,
          positionPattern: "OOP_RAISER_VS_IP_CALLER",
          actions: ["FOLD", "CALL", "RAISE"],
          preferredAction: "CALL",
          explanation: "Continue against pressure on dynamic boards.",
        },
      ],
    };
    const resolver = createPostflopStrategyResolver(pack);

    const facing = resolver({
      street: "FLOP",
      actionNode: "FLOP_FACING_BET",
      textures: ["connected", "two-tone"],
      potType: "SINGLE_RAISED",
      potBB: 8,
      effectiveStackBB: 40,
      positionPattern: "OOP_RAISER_VS_IP_CALLER",
    });
    const defaultNode = resolver({
      street: "FLOP",
      textures: ["connected", "two-tone"],
      potType: "SINGLE_RAISED",
      potBB: 8,
      effectiveStackBB: 40,
      positionPattern: "OOP_RAISER_VS_IP_CALLER",
    });

    expect(facing?.action).toBe("CALL");
    expect(facing?.source?.kind).toBe("STRATEGY_PACK");
    if (facing?.source?.kind === "STRATEGY_PACK") {
      expect(facing.source.ruleId).toBe("flop-facing-bet-dynamic-call");
    }
    expect(defaultNode).toBeNull();
  });
});
