import { describe, expect, it } from "vitest";

import { createFlopProductionStrategyResolver } from "../../src/data/ranges/flopProductionStrategyResolver";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
import { btnBbSrpFlopCbetPilotPack } from "../../src/data/ranges/pilots/btnBbSrpFlopCbetPilot.generated";
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
    const resolver = createFlopProductionStrategyResolver(
      btnBbSrpFlopCbetPilotPack as unknown as FlopProductionStrategyPack,
    );
    const result = resolver(flopInput);

    expect(result?.source?.kind).toBe("STRATEGY_PACK");
    if (result?.source?.kind === "STRATEGY_PACK") {
      expect(result.source.provenance).toBe("SOLVER_BACKED");
    }
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
});
