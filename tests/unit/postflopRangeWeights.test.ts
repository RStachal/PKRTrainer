import { describe, expect, it } from "vitest";

import {
  MTT_POSTFLOP_HERO_RANGE_WEIGHTS,
  heroRangeWeight,
} from "../../src/data/ranges/postflopRangeWeights.generated";
import { collectRangeWeights, heroRangeKey, parseRangeWeights } from "../../scripts/buildPostflopRangeWeights.mts";
import { generatePostflopSpot, type PostflopStrategyResolver } from "../../src/core/postflopGenerator";

// Both fixture classes are pairs, so the class is just the doubled rank. Written
// locally rather than exporting the generator's own helper, which is private and
// has no reason to become public for a test.
function pairClass(cards: readonly { rank: string }[]): string {
  const [first, second] = cards.map((card) => card.rank);
  return first === second ? `${first}${second}` : "";
}

// TexasSolver range strings accept `hand:weight`, and three families use it: the
// button opens 55 and 66 a quarter of the time. The trainer deals the hero from
// the solved range, so ignoring those weights meant practising a hand four times
// more often than the solve ever assumed it was held.

describe("hero range weights", () => {
  it("agrees with the parameter files it was generated from", () => {
    // The generated table is derived data. If a family is re-solved against a
    // different range this fails, rather than the app quietly dealing from a
    // distribution the solve no longer uses.
    const fromDisk = collectRangeWeights();
    const generated = new Map(
      Object.entries(MTT_POSTFLOP_HERO_RANGE_WEIGHTS)
        .map(([family, classes]) => [family, new Map(Object.entries(classes))] as const),
    );

    expect([...generated.keys()].sort()).toEqual([...fromDisk.keys()].sort());
    for (const [family, classes] of fromDisk) {
      expect(Object.fromEntries(classes), family).toEqual(
        Object.fromEntries(generated.get(family) ?? new Map()),
      );
    }
  });

  it("covers exactly the three families whose solve inputs carry weights", () => {
    expect(Object.keys(MTT_POSTFLOP_HERO_RANGE_WEIGHTS).sort()).toEqual([
      "MTT9_20BB_BTN_BB_SRP_LOWSPR",
      "MTT9_50BB_BTN_BB_SRP",
      "MTT9_80BB_BTN_BB_SRP_HIGHSPR",
    ]);
  });

  it("reads a class opened in full as weight one, listed or not", () => {
    // Absence must mean "opened in full", never "unknown": the uniform deal is
    // already correct for a pure range, and a missing entry has to keep it.
    expect(heroRangeWeight("MTT9_50BB_BTN_BB_SRP", "AA")).toBe(1);
    expect(heroRangeWeight("MTT9_50BB_CO_BB_SRP_CBET_MIDSPR", "55")).toBe(1);
    expect(heroRangeWeight("NO_SUCH_FAMILY", "72o")).toBe(1);
  });

  it("keeps the button's part-time opens at the weights the solve used", () => {
    expect(heroRangeWeight("MTT9_50BB_BTN_BB_SRP", "55")).toBe(0.25);
    expect(heroRangeWeight("MTT9_50BB_BTN_BB_SRP", "66")).toBe(0.25);
    expect(heroRangeWeight("MTT9_50BB_BTN_BB_SRP", "T9s")).toBe(0.75);
  });
});

describe("range weight parsing", () => {
  it("treats a bare hand as fully open and a suffixed one as weighted", () => {
    const parsed = parseRangeWeights("AA,99:0.75,T9s:0.25,AKo");
    expect(parsed.get("AA")).toBe(1);
    expect(parsed.get("99")).toBe(0.75);
    expect(parsed.get("T9s")).toBe(0.25);
    expect(parsed.get("AKo")).toBe(1);
  });

  it("falls back to fully open on a weight it cannot read", () => {
    // Dealing a hand too often is a smaller error than dropping it from training
    // altogether, so an unparseable weight opens the class rather than closing it.
    const parsed = parseRangeWeights("77:abc,88:-1,99:2");
    expect(parsed.get("77")).toBe(1);
    expect(parsed.get("88")).toBe(1);
    expect(parsed.get("99")).toBe(1);
  });

  it("takes the hero's side from the family name", () => {
    expect(heroRangeKey("MTT9_50BB_BTN_BB_SRP")).toBe("set_range_ip");
    expect(heroRangeKey("MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR")).toBe("set_range_oop");
  });
});

describe("weighted hero deal", () => {
  const POSITION = {
    heroPosition: "BTN",
    villainPosition: "BB",
    aggressorPosition: "BTN",
    callerPosition: "BB",
    inPosition: true,
    callerType: "BIG_BLIND",
    positionPattern: "BTN_VS_BB",
  } as const;

  // Two pairs, so both hold six combos and only the solve weight can separate
  // them. The button opens AA in full and 55 a quarter of the time.
  function resolverFor(ruleId: string): PostflopStrategyResolver {
    return (input) => ({
      action: "CHECK",
      explanation: "Range weight fixture.",
      source: {
        kind: "STRATEGY_PACK",
        provenance: "SOLVER_BACKED",
        packId: "internal-weight-pack",
        packVersion: "v1",
        packVerifiedAt: "2026-07-30",
        ruleId,
        confidence: "HIGH",
        matchedTextures: input.textures,
        sprMin: 0,
        sprMax: 25,
        positionPattern: input.positionPattern,
        sourceUrls: [],
        assumptions: ["Range weight fixture."],
        selectionScore: 100,
        tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
        rangeBuckets: [
          { lane: "CHECK", label: "AA", action: "CHECK", handClasses: ["AA"], features: [] },
          { lane: "CHECK", label: "55", action: "CHECK", handClasses: ["55"], features: [] },
        ],
      },
    });
  }

  function dealtCounts(ruleId: string): { AA: number; "55": number } {
    const counts = { AA: 0, "55": 0 };
    for (let seed = 1; seed <= 900; seed += 1) {
      const spot = generatePostflopSpot({
        seed,
        street: "FLOP",
        potType: "SINGLE_RAISED",
        potBB: 5,
        effectiveStackBB: 50,
        positionContext: POSITION,
        strategyResolver: resolverFor(ruleId),
      });
      const hero = spot.heroCards;
      if (hero === undefined) continue;
      const handClass = pairClass(hero);
      if (handClass === "AA" || handClass === "55") counts[handClass] += 1;
    }
    return counts;
  }

  it("deals a quarter-weight hand about a quarter as often as a full one", () => {
    // The button opens 55 at 0.25 and AA at 1, both six combos, so across many
    // seeds AA should arrive roughly four times more often. Before the weights
    // were carried the two were indistinguishable.
    const counts = dealtCounts("mtt9_50bb_btn_bb_srp-check-aggregate");

    expect(counts.AA + counts["55"]).toBeGreaterThan(200);
    const ratio = counts.AA / Math.max(1, counts["55"]);
    expect(ratio, `AA ${counts.AA} vs 55 ${counts["55"]}`).toBeGreaterThan(2.5);
    expect(ratio, `AA ${counts.AA} vs 55 ${counts["55"]}`).toBeLessThan(6);
  });

  it("lets a pack state its own weight and believes it over the table", () => {
    // Nothing populates weightPct today. This is what stops the field becoming a
    // second source of truth that is silently ignored: the family below IS in the
    // generated table at 0.25 for 55, and the pack overrides it to parity.
    const counts = { AA: 0, "55": 0 };
    for (let seed = 1; seed <= 900; seed += 1) {
      const spot = generatePostflopSpot({
        seed,
        street: "FLOP",
        potType: "SINGLE_RAISED",
        potBB: 5,
        effectiveStackBB: 50,
        positionContext: POSITION,
        strategyResolver: (input) => {
          const base = resolverFor("mtt9_50bb_btn_bb_srp-check-aggregate")(input);
          if (base === null || base.source.kind !== "STRATEGY_PACK") return base;
          return {
            ...base,
            source: {
              ...base.source,
              rangeBuckets: (base.source.rangeBuckets ?? []).map((bucket) => ({
                ...bucket,
                weightPct: 100,
              })),
            },
          };
        },
      });
      const hero = spot.heroCards;
      if (hero === undefined) continue;
      const handClass = pairClass(hero);
      if (handClass === "AA" || handClass === "55") counts[handClass] += 1;
    }

    const ratio = counts.AA / Math.max(1, counts["55"]);
    expect(ratio, `AA ${counts.AA} vs 55 ${counts["55"]}`).toBeGreaterThan(0.7);
    expect(ratio, `AA ${counts.AA} vs 55 ${counts["55"]}`).toBeLessThan(1.4);
  });

  it("deals both equally for a family whose range carries no weights", () => {
    // The control. Without it the test above would also pass against code that
    // simply favoured aces, which is not what is being claimed.
    const counts = dealtCounts("mtt9_50bb_co_bb_srp_cbet_midspr-check-aggregate");

    expect(counts.AA + counts["55"]).toBeGreaterThan(200);
    const ratio = counts.AA / Math.max(1, counts["55"]);
    expect(ratio, `AA ${counts.AA} vs 55 ${counts["55"]}`).toBeGreaterThan(0.7);
    expect(ratio, `AA ${counts.AA} vs 55 ${counts["55"]}`).toBeLessThan(1.4);
  });
});
