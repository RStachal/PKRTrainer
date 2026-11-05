import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { createFlopProductionStrategyResolver } from "../../src/data/ranges/flopProductionStrategyResolver";
import {
  createDefaultPostflopStrategyResolver,
  createPostflopStrategyResolverWithProductionFallback,
} from "../../src/data/ranges/postflopStrategyRegistry";
import { btnBbSrpFlopCbetPilotPack } from "../../src/data/ranges/pilots/btnBbSrpFlopCbetPilot.generated";
import { utgBbSrpFlopCbetPilotPack } from "../../src/data/ranges/pilots/utgBbSrpFlopCbetPilot.generated";
import { flopSingleRaisedPrototypeStrategyPack } from "../../src/data/ranges/postflopStrategyPack";
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";

const flopInput = {
  street: "FLOP" as const,
  textures: ["dry", "rainbow"] as const,
  potType: "SINGLE_RAISED" as const,
  potBB: 10,
  effectiveStackBB: 55,
  positionPattern: "SRP_BTN_VS_BB" as const,
  actionNode: "SINGLE_RAISED_POT_CBET" as const,
};

describe("postflop strategy provenance", () => {
  it("marks a solved pilot pack as solver backed", () => {
    const rule = utgBbSrpFlopCbetPilotPack.rules[0];
    const resolver = createFlopProductionStrategyResolver(
      utgBbSrpFlopCbetPilotPack as unknown as FlopProductionStrategyPack,
    );
    const result = resolver({
      ...flopInput,
      textures: rule.boardTextures,
      positionPattern: rule.positionPattern,
      actionNode: rule.actionNode,
      effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * flopInput.potBB,
    });

    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.provenance).toBe("SOLVER_BACKED");
    }
  });

  it("nechá pilota, kterého čtenář odmítl, mlčet místo tvrzení „solver backed“", () => {
    // Rozhodnutí vlastníka 9a (22. 9. 2026): šest pilotů odmítnutých při čtení
    // nese LOW. Resolver na LOW pack neodpovídá - obsah, o kterém čtenář řekl
    // „nesedí", se k hráči nedostane ani s poctivou nálepkou.
    expect(btnBbSrpFlopCbetPilotPack.confidence).toBe("LOW");
    const resolver = createFlopProductionStrategyResolver(
      btnBbSrpFlopCbetPilotPack as unknown as FlopProductionStrategyPack,
    );
    expect(resolver(flopInput)).toBeNull();
  });

  it("marks the public heuristic model as heuristic, whatever its assumptions say", () => {
    // The label used to be inferred by matching an assumption string, so
    // rewording one sentence would have silently promoted the heuristic model to
    // production. Provenance is now recorded by the resolver instead.
    const resolver = createDefaultPostflopStrategyResolver();
    const result = resolver({
      ...flopInput,
      positionPattern: "BTN_VS_BB",
      textures: ["dry", "rainbow"],
      potBB: 6,
      effectiveStackBB: 40,
    });

    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.provenance).toBe("PUBLIC_HEURISTIC");
      expect(result.source.assumptions.some((item) => /^Public heuristic /i.test(item))).toBe(true);
    }
  });

  it("does not claim a solver answer for a replayed hand outside the solved range", () => {
    // A hand history supplies the hand the player actually held, so it cannot be
    // re-dealt into range. If that hand was never solved here, the answer must
    // come from the heuristic model and say so, rather than passing off a
    // rule-wide average as a solver result.
    const resolver = createPostflopStrategyResolverWithProductionFallback(
      [btnBbSrpFlopCbetPilotPack as unknown as FlopProductionStrategyPack],
      [flopSingleRaisedPrototypeStrategyPack],
    );
    const spot = generatePostflopSpot({
      seed: 3,
      street: "FLOP",
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
      board: [
        { rank: "A", suit: "s" },
        { rank: "7", suit: "d" },
        { rank: "2", suit: "c" },
      ],
      // 32o is not in any BTN opening range the pilot solved.
      heroCards: [
        { rank: "3", suit: "h" },
        { rank: "2", suit: "s" },
      ],
      positionContext: {
        heroPosition: "BTN",
        villainPosition: "BB",
        aggressorPosition: "BTN",
        callerPosition: "BB",
        inPosition: true,
        callerType: "BIG_BLIND",
        positionPattern: "BTN_VS_BB",
      },
      strategyResolver: resolver,
    });

    expect(spot.strategySource.kind).toBe("STRATEGY_PACK");
    if (spot.strategySource.kind === "STRATEGY_PACK") {
      expect(spot.strategySource.provenance).toBe("PUBLIC_HEURISTIC");
    }
  });
});
