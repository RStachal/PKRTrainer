import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import type { PostflopPositionContext } from "../../src/core/postflopGenerator";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import {
  dealPostflopSpot,
  primePostflopDeal,
  type PostflopDealContext,
} from "../../src/training/postflopDeal";

/**
 * Rozdání jednoho postflopového spotu bez DOM (fáze 1 redesignu, krok 3a).
 *
 * Táž situace jako `resolvingPilotNotice.test.ts`, jen bez vykreslení: tam se
 * hlídá věta pro hráče, tady výsledek rozdání, ze kterého věta vzniká - a ten
 * teď sdílí dnešní pohled i nové GUI.
 */

const profile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

function context(positionPattern: string): PostflopDealContext {
  const runtime = buildMttPostflopTrainingRuntime({
    profile,
    grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
    now: "2026-07-08T12:00:00.000Z",
  });
  const btn = positionPattern.includes("BTN");
  return {
    potType: "SINGLE_RAISED",
    potBB: 6,
    effectiveStackBB: 40,
    positionContext: {
      heroPosition: btn ? "BTN" : "UTG",
      villainPosition: "BB",
      aggressorPosition: btn ? "BTN" : "UTG",
      callerPosition: "BB",
      inPosition: btn,
      callerType: "BIG_BLIND",
      positionPattern,
    } as unknown as PostflopPositionContext,
    strategyResolver: (input) => runtime.resolver?.(input) ?? null,
    allowFallback: runtime.allowFallback,
  };
}

const request = { seed: 1, street: "FLOP" as const, actionNode: "SINGLE_RAISED_POT_CBET" as const };

describe("rozdání postflopového spotu", () => {
  it("přijatý pilot spot rozdá", () => {
    const dealt = dealPostflopSpot(request, context("SRP_UTG_VS_BB"));
    expect(dealt.kind).toBe("SPOT");
    if (dealt.kind === "SPOT") expect(dealt.spot.street).toBe("FLOP");
  });

  it("pilota, který se přesolvuje, odmítne a řekne proč - ne že chybí produkce", () => {
    expect(dealPostflopSpot(request, context("SRP_BTN_VS_BB"))).toEqual({
      kind: "UNAVAILABLE",
      resolvingPilot: true,
    });
  });

  it("flop nečeká na žádnou tabulku EV, takže se rozdá synchronně", () => {
    // Na tom stojí okamžité vykreslení spotu po kliknutí (viz primePostflopDeal).
    expect(primePostflopDeal(request, context("SRP_UTG_VS_BB"))).toBeUndefined();
  });

  it("se stejným seedem rozdá tutéž desku", () => {
    const first = dealPostflopSpot(request, context("SRP_UTG_VS_BB"));
    const second = dealPostflopSpot(request, context("SRP_UTG_VS_BB"));
    if (first.kind !== "SPOT" || second.kind !== "SPOT") throw new Error("spot se nerozdal");
    expect(second.spot.board).toEqual(first.spot.board);
    expect(second.spot.heroCards).toEqual(first.spot.heroCards);
  });
});
