import { describe, expect, it } from "vitest";

import type { AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * The derived six-max ranges run *wide*, and the app has to keep saying so.
 *
 * `tableFormatConversion` originally predicted the opposite - that a six-max
 * field is looser at equal seats-behind, so nine-handed ranges carried across
 * would be too tight - and the player-facing note repeated it. Checked against
 * published six-max opening frequencies it is wrong in the direction that
 * matters, so a player told "these are conservative" would have been widening a
 * range that was already too wide.
 *
 * The cause is in the mapping. Six-max under-the-gun inherits the nine-handed
 * lojack, a middle seat that opens like one, while the six-max seat with the
 * same players behind it is the earliest at its table. Seats-behind captures how
 * often you run into a better hand, not how the table responds to a raise.
 *
 * Reference frequencies for 6-max MTT at 100BB, from public preflop chart
 * summaries: UTG 17, HJ 21, CO 28, BTN 43, SB 36 percent. They are MTT figures
 * and so already include antes, while the comparison below is our ante-off pack
 * - which makes the gap a lower bound rather than an estimate.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

/** Published 6-max MTT opening frequency at 100BB, in percent. */
const REFERENCE: Readonly<Record<string, number>> = {
  UTG: 17, HJ: 21, CO: 28, BTN: 43, SB: 36,
};

function openWidthPct(ante: AnteMode, position: Position, bucket: StackBucket): number | null {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "SIX_MAX" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack)
    .lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return null;
  const combos = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
  return Math.round(combos / 1326 * 1000) / 10;
}

describe("derived six-max width against published references", () => {
  it("has ranges to measure at all", () => {
    for (const seat of Object.keys(REFERENCE) as Position[]) {
      expect(openWidthPct("OFF", seat, 100 as StackBucket), seat).not.toBeNull();
    }
  });

  it("runs wider than the reference at every seat", () => {
    for (const [seat, reference] of Object.entries(REFERENCE)) {
      const ours = openWidthPct("OFF", seat as Position, 100 as StackBucket)!;
      expect(ours, `${seat}: ours ${ours}% vs reference ${reference}%`)
        .toBeGreaterThan(reference);
    }
  });

  it("stays within a band worth previewing rather than drifting away", () => {
    // Wide, but not so wide the preview teaches something unrecognisable. Eight
    // points would no longer be the same strategy with a seat relabelled.
    for (const [seat, reference] of Object.entries(REFERENCE)) {
      const ours = openWidthPct("OFF", seat as Position, 100 as StackBucket)!;
      expect(ours - reference, `${seat} gap`).toBeLessThan(8);
    }
  });

  it("is wider still with ante, so the note cannot claim conservatism there either", () => {
    for (const seat of Object.keys(REFERENCE) as Position[]) {
      const off = openWidthPct("OFF", seat, 100 as StackBucket)!;
      const on = openWidthPct("ON", seat, 100 as StackBucket)!;
      expect(on, `${seat}`).toBeGreaterThanOrEqual(off);
      expect(on, `${seat} vs reference`).toBeGreaterThan(REFERENCE[seat]);
    }
  });
});
