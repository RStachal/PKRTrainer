import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import { findMttPostflopPilotRuntimeEntry } from "../../src/data/ranges/mttPostflopPilotRuntime";

const pilotProfile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

describe("MTT postflop training runtime", () => {
  it("odemkne scoped pilot resolver pro PRO_PLUS bez heuristic fallbacku", () => {
    const runtime = buildMttPostflopTrainingRuntime({
      profile: pilotProfile,
      grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
      now: "2026-07-08T12:00:00.000Z",
    });
    const sbRule = findMttPostflopPilotRuntimeEntry("SB_vs_BB_SRP_OOP_FLOP_CBET")
      ?.packEntry.pack.rules[0];
    expect(sbRule).toBeDefined();
    const recommendation = runtime.resolver?.({
      street: "FLOP",
      textures: sbRule!.boardTextures,
      potType: sbRule!.potType,
      potBB: 6,
      effectiveStackBB: ((sbRule!.sprMin + sbRule!.sprMax) / 2) * 6,
      positionPattern: "SB_VS_BB",
      actionNode: sbRule!.actionNode,
    });

    expect(runtime.mode).toBe("SCOPED_PILOT");
    expect(runtime.allowFallback).toBe(false);
    expect(runtime.pilotScopes).toContain("SB_vs_BB_SRP_OOP_FLOP_CBET");
    expect(runtime.activeEntitlements).toContain("mtt.postflop.flop.srp_sb_bb_oop.cbet.pilot");
    expect(recommendation?.source?.kind).toBe("STRATEGY_PACK");
  });

  it("zamkne pilot lab pro FREE tier misto ticheho padu na heuristiku", () => {
    const runtime = buildMttPostflopTrainingRuntime({
      profile: pilotProfile,
      grants: grantsForTier("FREE", { startsAt: "2026-07-08T00:00:00.000Z" }),
      now: "2026-07-08T12:00:00.000Z",
    });

    expect(runtime.mode).toBe("LOCKED_PILOT");
    expect(runtime.resolver).toBeNull();
    expect(runtime.allowFallback).toBe(false);
    expect(runtime.missingEntitlements).toContain("mtt.postflop.flop.srp_sb_bb_oop.cbet.pilot");
  });
});
