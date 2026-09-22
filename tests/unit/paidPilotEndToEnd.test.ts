import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { gradePostflopAction } from "../../src/core/postflopScoring";
import { grantsForTier } from "../../src/core/paymentEntitlements";
import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import type { TrainingProfile } from "../../src/core/trainingProfile";

// The thing people actually pay for: a subscriber picks a flop pilot and trains.
// Every part of that chain had been checked on its own - entitlement, runtime
// resolver, provenance, grading - but nothing asserted the chain end to end, so
// a break between two sound pieces would have shipped.

const profile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

function paidRuntime() {
  return buildMttPostflopTrainingRuntime({
    profile,
    grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
    now: "2026-07-08T12:00:00.000Z",
  });
}

// Přijatý pilot (UTG vs BB). Do 22. 9. 2026 tu stál BTN vs BB; toho čtenář
// 14. 9. odmítl, modul proto nese LOW (rozhodnutí vlastníka 9a) a resolver na
// něj neodpovídá. Řetěz placeného pilota se tedy zkouší na tom, který se
// doopravdy dodává - a že odmítnutý spot místo degradace **odmítne**, hlídá
// vlastní test níž.
const POSITION = {
  heroPosition: "UTG",
  villainPosition: "BB",
  aggressorPosition: "UTG",
  callerPosition: "BB",
  inPosition: false,
  callerType: "BIG_BLIND",
  positionPattern: "SRP_UTG_VS_BB",
} as const;

const REJECTED_POSITION = {
  heroPosition: "BTN",
  villainPosition: "BB",
  aggressorPosition: "BTN",
  callerPosition: "BB",
  inPosition: true,
  callerType: "BIG_BLIND",
  positionPattern: "BTN_VS_BB",
} as const;

function spotForSeed(seed: number) {
  const runtime = paidRuntime();
  return generatePostflopSpot({
    seed,
    street: "FLOP",
    potType: "SINGLE_RAISED",
    potBB: 6,
    effectiveStackBB: 40,
    positionContext: POSITION,
    strategyResolver: (input) => runtime.resolver?.(input) ?? null,
    allowFallback: runtime.allowFallback,
  });
}

describe("paid flop pilot, end to end", () => {
  it("serves a subscriber a spot on every seed rather than refusing some", () => {
    // With allowFallback false a gap anywhere in the chain does not degrade, it
    // throws - so a partial refusal rate is the symptom to watch for.
    let produced = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      expect(() => { spotForSeed(seed); produced += 1; }, `seed ${seed}`).not.toThrow();
    }
    expect(produced).toBe(40);
  });

  it("never answers a paying subscriber from the heuristic model", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const source = spotForSeed(seed).strategySource;
      expect(source.kind, `seed ${seed}`).toBe("STRATEGY_PACK");
      if (source.kind === "STRATEGY_PACK") {
        expect(source.provenance, `seed ${seed}`).toBe("SOLVER_BACKED");
      }
    }
  });

  it("grades the recommended action correct and a different legal one wrong", () => {
    // Without the second half this would pass against a grader that says yes to
    // everything, which is the failure that matters to someone being taught.
    for (let seed = 1; seed <= 20; seed += 1) {
      const spot = spotForSeed(seed);
      const training = postflopSpotToTrainingSpot(spot);
      expect(gradePostflopAction(training, spot.recommendedAction).correct, `seed ${seed}`).toBe(true);

      const other = spot.actions.find((action) => action !== spot.recommendedAction);
      expect(other, `seed ${seed}`).toBeDefined();
      if (other !== undefined && training.actionEvs === undefined) {
        // Only meaningful without action EV: with EV present a second action can
        // be genuinely equivalent, and calling it wrong would be the real defect.
        expect(gradePostflopAction(training, other).correct, `seed ${seed} ${other}`).toBe(false);
      }
    }
  });

  it("deals the hero a hand the pilot actually solved", () => {
    // The out-of-range refusal means a freely dealt hand would break the chain;
    // the re-deal is what keeps every seed trainable.
    for (let seed = 1; seed <= 20; seed += 1) {
      const source = spotForSeed(seed).strategySource;
      expect(source.kind).toBe("STRATEGY_PACK");
      if (source.kind === "STRATEGY_PACK") {
        expect(source.heroRangeBucket, `seed ${seed}`).toBeDefined();
      }
    }
  });

  it("odmítne spot v pilotu, kterého čtenář odmítl, místo tiché heuristiky", () => {
    // Placený tier má na ten pilot nárok dál, ale jeho obsah čtení neprošel.
    // Správná odpověď je „tady nic nemám", ne heuristika pod hlavičkou pilota:
    // řetěz s `allowFallback: false` proto padne, a to je ten fail-close.
    const runtime = paidRuntime();
    expect(() => generatePostflopSpot({
      seed: 1,
      street: "FLOP",
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
      positionContext: REJECTED_POSITION,
      strategyResolver: (input) => runtime.resolver?.(input) ?? null,
      allowFallback: runtime.allowFallback,
    })).toThrow(/No production postflop strategy matched/);
  });

  it("refuses the same profile without an active entitlement", () => {
    // The other half of the contract: paying gets solver content, not paying gets
    // nothing rather than a quiet heuristic substitute.
    const free = buildMttPostflopTrainingRuntime({
      profile,
      grants: grantsForTier("FREE", { startsAt: "2026-07-08T00:00:00.000Z" }),
      now: "2026-07-08T12:00:00.000Z",
    });
    expect(free.mode).toBe("LOCKED_PILOT");
    expect(free.resolver).toBeNull();
    expect(free.allowFallback).toBe(false);
  });
});
