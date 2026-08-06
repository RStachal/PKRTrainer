import { beforeAll, describe, expect, it } from "vitest";

import { generateSpot } from "../../src/core/drillEngine";
import { loadPreflopEquity } from "../../src/core/preflopEquity";
import { mulberry32 } from "../../src/core/rng";
import type { ActionKey, Filters, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * The computed value of a re-jam should agree with the sheet it is priced from.
 *
 * These are two independent things: the shipped ranges are read off the owner's
 * charts, and the expected value is arithmetic over a sampled equity table that
 * shares no code with them. Where they disagree about a hand, one of them is
 * wrong, and this file exists because that has already been true twice.
 *
 * Fold equity is the opener's calling range as a share of *the opener's range*,
 * so the seat assumed to have opened decides the answer. Pricing against the
 * button - a 39.7 percent opening range - made every hand profitable including
 * 52o. Pricing against under the gun, chosen as a safe tightest case, called 167
 * hands negative that the sheets jam.
 *
 * Neither was needed: `REJAM_CALIBRATION_OPENER` names the opener each sheet was
 * drawn against, and had done since the ranges were extracted. Using it takes
 * agreement to 96 percent, and what remains sits within a tenth of a big blind
 * of zero - marginal hands at the edge of a range, which is where they belong.
 */

const BUCKETS = [15, 20, 25, 30] as StackBucket[];

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

const filters = (bucket: StackBucket): Filters => ({
  positions: [], buckets: [bucket], contexts: ["VS_OPEN"], ante: "OFF", scoringMode: "STRICT",
});

interface Row { label: string; evBb: number; saysJam: boolean; saysFold: boolean }

function sample(): Row[] {
  const rows: Row[] = [];
  const active = store();
  for (const bucket of BUCKETS) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 600; seed += 1) {
      const spot = generateSpot(mulberry32(seed), "VS_OPEN", filters(bucket), active);
      const jam = spot?.actionEvs?.values.find((value) => value.action === ("JAM" as ActionKey));
      if (spot === null || jam === undefined) continue;
      const key = `${bucket}|${spot.heroPos}|${spot.hand}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        label: `${bucket}BB ${spot.heroPos} ${spot.hand}`,
        evBb: jam.evBb,
        saysJam: spot.strictCorrect.includes("JAM" as ActionKey),
        // A sheet that says 3BET is not saying the shove is bad, so only a bare
        // fold counts as the chart rejecting aggression.
        saysFold: spot.strictCorrect.length === 1 && spot.strictCorrect[0] === ("FOLD" as ActionKey),
      });
    }
  }
  return rows;
}

describe("re-jam EV against the sheets", () => {
  let rows: Row[];
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
    rows = sample();
  });

  it("prices enough spots for the agreement figure to mean anything", () => {
    expect(rows.length).toBeGreaterThan(1000);
  });

  it("agrees with the sheet on the overwhelming majority of spots", () => {
    const disagreements = rows.filter((row) => (
      (row.saysJam && row.evBb <= 0) || (row.saysFold && row.evBb > 0)
    ));
    const rate = 1 - disagreements.length / rows.length;
    expect(rate, `${disagreements.length} of ${rows.length} disagree`).toBeGreaterThan(0.9);
  });

  it("never contradicts the sheet by a margin the model can resolve", () => {
    // The equity table is sampled to about half a point, which on a fifteen big
    // blind shove is a tenth of a blind - the same figure the grader uses to call
    // two actions equivalent. A hand the sheet jams may sit slightly below zero
    // and mean nothing. One that sits a long way below means the two sources
    // genuinely disagree, and that is what this catches.
    const severe = rows
      .filter((row) => row.saysJam && row.evBb < -1)
      .map((row) => `${row.label} EV ${row.evBb}`);
    expect(severe).toEqual([]);
  });
});
