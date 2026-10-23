import { beforeAll, describe, expect, it } from "vitest";

import { generateSpot } from "../../src/core/drillEngine";
import { loadPreflopEquity } from "../../src/core/preflopEquity";
import { mulberry32 } from "../../src/core/rng";
import type { Filters } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

// The EV bubbles are wired to `spot.actionEvs` and every shipped record leaves it
// empty, so until the engine computes one there is nothing to show. The equity
// table it computes from is fetched rather than imported, which means the whole
// feature can be switched off by a missing call and nothing else would fail -
// generation still succeeds, the bubbles are just blank again. That is what this
// pins.

const filters = (bucket: number): Filters => ({
  positions: [],
  buckets: [bucket as never],
  contexts: ["PUSH_FOLD"],
  ante: "OFF",
  scoringMode: "STRICT",
});

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

function spots(count: number) {
  const found = [];
  for (let seed = 1; seed <= 300 && found.length < count; seed += 1) {
    const spot = generateSpot(mulberry32(seed), "PUSH_FOLD", filters(10), store());
    if (spot !== null) found.push(spot);
  }
  return found;
}

describe("action EV on a generated spot", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it("prices every push-or-fold spot once equity is available", () => {
    const generated = spots(12);
    expect(generated.length).toBe(12);
    for (const spot of generated) {
      expect(spot.actionEvs, `${spot.heroPos} ${spot.hand}`).toBeDefined();
      const actions = spot.actionEvs!.values.map((value) => value.action);
      expect(actions).toContain("JAM");
      expect(actions).toContain("FOLD");
      // Computed here, not reviewed from a solver export. The distinction is the
      // reason ActionEvSource has two members.
      expect(spot.actionEvs!.source).toBe("ALL_IN_EQUITY");
    }
  });

  it("agrees with the charts it was not derived from", () => {
    // The equity table and the shipped ranges come from different places - one is
    // sampled by scripts/generatePreflopEquity.mts, the other read off the
    // owner's charts. Where they disagree about a hand this obvious, one of them
    // is wrong.
    const jamEv = (hand: string): number => {
      for (let seed = 1; seed <= 4000; seed += 1) {
        const spot = generateSpot(mulberry32(seed), "PUSH_FOLD", filters(10), store());
        if (spot?.hand !== hand || spot.heroPos !== "UTG") continue;
        const jam = spot.actionEvs?.values.find((value) => value.action === "JAM");
        if (jam !== undefined) return jam.evBb;
      }
      throw new Error(`no UTG ${hand} spot in the sampled seeds`);
    };

    expect(jamEv("AA")).toBeGreaterThan(0);
    expect(jamEv("72o")).toBeLessThan(0);
  });
});
