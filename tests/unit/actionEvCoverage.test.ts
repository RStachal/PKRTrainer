import { beforeAll, describe, expect, it } from "vitest";

import { generateSpot } from "../../src/core/drillEngine";
import { loadPreflopEquity } from "../../src/core/preflopEquity";
import { mulberry32 } from "../../src/core/rng";
import type { ActionContext, ActionKey, Filters } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Where expected value can be shown, and where it honestly cannot.
 *
 * The owner's report was that EV is missing for the other actions after
 * answering. It was: 26 percent of spots carried any, and RFI - the context seen
 * most - carried none. The rule now is that **every spot offering a shove shows
 * one**, because a shove fixes the hero's side of the price and the pot is
 * whatever the spot already records.
 *
 * VS_4BET used to be the first exception: the pot needs a three-bet and a
 * four-bet size, and the action keys carry neither. That was a missing decision
 * rather than missing data, and the decision is now made and stated in
 * `drillEngine` - roughly two and a bit times the previous raise in position,
 * three times out of it. Every four-bet jam is priced.
 *
 * VS_LIMP stays unpriced, and for a different reason than this file used to
 * give. The old note said no limping range was modelled; there is one, a hundred
 * and five classes of it. What is actually true was found by measuring: every
 * limp spot that offers a jam is the big blind's, and none of them offers a
 * fold, because the big blind has already posted and can check into a limped pot
 * for free. Every other branch scores a jam against folding, worth zero. Here
 * the alternative is a free flop, worth something no model in this product can
 * compute - so a zero baseline would flatter jamming in exactly the spot where
 * the alternative is cheapest.
 *
 * Non-shove actions - open, call, three-bet, iso - have no EV at all and will
 * not until a postflop model stands behind these packs. What they get instead is
 * the decision price, which needs no opponent range.
 */

const CONTEXTS = [
  "RFI", "VS_OPEN", "VS_3BET", "VS_4BET", "VS_LIMP",
  "SQUEEZE", "BVB", "PUSH_FOLD", "VS_ALLIN",
] as ActionContext[];

/** Contexts where a shove is offered and the comparison it needs does not exist. */
const UNPRICEABLE_SHOVES = new Set<ActionContext>(["VS_LIMP"]);

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

const filters: Filters = {
  positions: [], buckets: [], contexts: [], ante: "OFF", scoringMode: "STRICT",
};

interface Row { context: ActionContext; offersJam: boolean; hasEv: boolean }

function sample(): Row[] {
  const active = store();
  const rows: Row[] = [];
  for (let seed = 1; seed <= 3600; seed += 1) {
    const context = CONTEXTS[seed % CONTEXTS.length];
    const spot = generateSpot(mulberry32(seed), context, filters, active);
    if (spot === null) continue;
    rows.push({
      context,
      offersJam: spot.answers.some((answer) => answer.key === ("JAM" as ActionKey)),
      hasEv: spot.actionEvs !== undefined,
    });
  }
  return rows;
}

describe("action EV coverage", () => {
  let rows: Row[];
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
    rows = sample();
    expect(rows.length).toBeGreaterThan(2000);
  });

  it("prices every shove the data can price", () => {
    const unpriced = rows.filter((row) => (
      row.offersJam && !row.hasEv && !UNPRICEABLE_SHOVES.has(row.context)
    ));
    expect([...new Set(unpriced.map((row) => row.context))]).toEqual([]);
  });

  it("keeps the two unpriceable contexts honest", () => {
    // They must still offer shoves - otherwise the exemption is stale and should
    // be deleted rather than carried.
    for (const context of UNPRICEABLE_SHOVES) {
      const jams = rows.filter((row) => row.context === context && row.offersJam);
      expect(jams.length, `${context} no longer offers a shove`).toBeGreaterThan(0);
      expect(jams.every((row) => !row.hasEv), `${context} now prices some`).toBe(true);
    }
  });

  it("covers the contexts a player meets most", () => {
    for (const context of ["PUSH_FOLD", "VS_ALLIN"] as ActionContext[]) {
      const inContext = rows.filter((row) => row.context === context);
      expect(inContext.every((row) => row.hasEv), context).toBe(true);
    }
  });
});
