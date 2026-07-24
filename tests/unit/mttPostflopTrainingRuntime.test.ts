import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import {
  findMttPostflopPilotRuntimeEntry,
  mttPostflopPilotRuntimeEntries,
} from "../../src/data/ranges/mttPostflopPilotRuntime";
import type { PostflopPositionPattern } from "../../src/core/postflopGenerator";

const pilotProfile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

// The packs carry no position pattern of their own, so the sweep below maps each
// pilot scope to the pattern a caller would arrive with. Already-normalized
// values are used, which pass through `normalizePilotPositionPattern` unchanged.
const PILOT_SCOPE_POSITION_PATTERNS: Record<string, PostflopPositionPattern> = {
  BTN_vs_BB_SRP_FLOP_CBET: "SRP_BTN_VS_BB",
  BTN_vs_BB_SRP_FLOP_FACING_BET: "SRP_BTN_VS_BB",
  UTG_vs_BB_SRP_FLOP_CBET: "SRP_UTG_VS_BB",
  CO_vs_BB_SRP_FLOP_CBET: "SRP_CO_VS_BB",
  SB_vs_BB_SRP_OOP_FLOP_CBET: "SRP_SB_VS_BB",
  BTN_vs_CO_3BP_FLOP_CBET: "3BP_BTN_VS_CO",
  BTN_vs_CO_3BP_FLOP_FACING_BET: "3BP_BTN_VS_CO",
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

  it("nevrati placenemu tieru heuristiku v zadnem pilotnim spotu", () => {
    // `allowFallback: false` sam o sobe nestaci: pilot-aware resolver umi prijmout
    // heuristicky fallback jako parametr, takze by ho slo pozdeji pripojit a
    // priznakovy test by dal prochazel. Tenhle test drzi vlastnost, na ktere
    // zalezi - co resolver skutecne vrati - a projede kazde pilotni pravidlo.
    const runtime = buildMttPostflopTrainingRuntime({
      profile: pilotProfile,
      grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
      now: "2026-07-08T12:00:00.000Z",
    });
    expect(runtime.mode).toBe("SCOPED_PILOT");

    const entries = mttPostflopPilotRuntimeEntries();
    expect(entries.length).toBeGreaterThan(0);

    let answered = 0;
    for (const entry of entries) {
      const positionPattern = PILOT_SCOPE_POSITION_PATTERNS[entry.packEntry.scope];
      expect(positionPattern, `no position pattern mapped for ${entry.packEntry.scope}`)
        .toBeDefined();
      for (const rule of entry.packEntry.pack.rules) {
        const potBB = 6;
        const recommendation = runtime.resolver?.({
          street: "FLOP",
          textures: rule.boardTextures,
          potType: rule.potType,
          potBB,
          effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * potBB,
          positionPattern,
          actionNode: rule.actionNode,
        });
        if (recommendation?.source === undefined) continue;
        answered += 1;
        expect(recommendation.source.kind).toBe("STRATEGY_PACK");
        if (recommendation.source.kind === "STRATEGY_PACK") {
          expect(recommendation.source.provenance).toBe("SOLVER_BACKED");
        }
      }
    }

    // A guard on the guard: if the sweep ever stopped matching rules it would
    // pass vacuously, so require every pilot to have answered at least once.
    expect(answered).toBeGreaterThanOrEqual(entries.length);
  });
});
