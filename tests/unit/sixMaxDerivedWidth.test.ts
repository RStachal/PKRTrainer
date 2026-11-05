import { describe, expect, it } from "vitest";

import type { AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Where the derived six-max ranges sit against published six-max ranges.
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
 * Two public sources, and they do not agree, which is the first thing worth
 * recording. Point estimates for 6-max MTT at 100BB give UTG 17, HJ 21, CO 28,
 * BTN 43, SB 36 percent. A second summary gives 50BB *bands*: early 18-20,
 * middle 25-30, cutoff 30-40, button 50+, small blind 60+.
 *
 * Against the first, ours run 2 to 6 points wide at every seat. Against the
 * second, ours sit inside the band at the three early seats and *below* it at
 * the button and small blind. The small blind is the extreme case: 36 percent in
 * one source and 60-plus in the other, a 24-point disagreement between two
 * published references for the same seat.
 *
 * So there is no single number to calibrate to, and narrowing these ranges to
 * hit one would be picking a source rather than measuring. What the tests below
 * hold is the weaker claim that survives both: the derived ranges are in the
 * same region as published six-max play and are not drifting away from it.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

/** One source: 6-max MTT opening frequency at 100BB, in percent. */
const POINT_ESTIMATES: Readonly<Record<string, number>> = {
  UTG: 17, HJ: 21, CO: 28, BTN: 43, SB: 36,
};

/** Another source: 6-max opening bands at 50BB, low and high, in percent. */
const BANDS_50BB: Readonly<Record<string, readonly [number, number]>> = {
  UTG: [18, 20], HJ: [25, 30], CO: [30, 40], BTN: [50, 70], SB: [60, 80],
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
    for (const seat of Object.keys(POINT_ESTIMATES) as Position[]) {
      expect(openWidthPct("OFF", seat, 100 as StackBucket), seat).not.toBeNull();
      expect(openWidthPct("OFF", seat, 50 as StackBucket), seat).not.toBeNull();
    }
  });

  it("runs wider than the point-estimate source at every seat", () => {
    // True against that source, and it is why the player note no longer calls
    // these conservative. It is not true against the banded source below, which
    // is why the note does not call them loose either.
    for (const [seat, reference] of Object.entries(POINT_ESTIMATES)) {
      const ours = openWidthPct("OFF", seat as Position, 100 as StackBucket)!;
      expect(ours, `${seat}: ours ${ours}% vs point estimate ${reference}%`)
        .toBeGreaterThan(reference);
    }
  });

  it("sits inside the banded source at the early seats and below it late", () => {
    // The opposite verdict from the same ranges, against a source that gives
    // ranges instead of points. Asserted rather than smoothed over, because a
    // trainer that picks whichever reference flatters its data is not measuring.
    const inside = (seat: Position) => {
      const ours = openWidthPct("OFF", seat, 50 as StackBucket)!;
      const [low, high] = BANDS_50BB[seat];
      return ours >= low && ours <= high;
    };
    expect(inside("UTG"), "UTG").toBe(true);
    expect(inside("HJ"), "HJ").toBe(true);
    // The cutoff has dropped just below the band. It inherits the nine-handed
    // cutoff, which lost its offsuit wheel aces - a repair made on nine-handed
    // evidence that moves six-max the other way. Recorded rather than smoothed
    // over: the derivation carries every correction to its source seat, whether
    // or not that suits six-max.
    expect(openWidthPct("OFF", "CO", 50 as StackBucket)!)
      .toBeLessThan(BANDS_50BB.CO[0]);
    expect(openWidthPct("OFF", "CO", 50 as StackBucket)!)
      .toBeGreaterThan(BANDS_50BB.CO[0] - 3);
    // Below the band: the button and small blind open tighter here than either
    // source suggests a six-max player should.
    expect(openWidthPct("OFF", "BTN", 50 as StackBucket)!).toBeLessThan(BANDS_50BB.BTN[0]);
    expect(openWidthPct("OFF", "SB", 50 as StackBucket)!).toBeLessThan(BANDS_50BB.SB[0]);
  });

  it("stays in the same region as published six-max play", () => {
    // The claim that survives both sources. Loose enough to be true of a derived
    // pack, tight enough that a mapping error would break it.
    for (const seat of Object.keys(POINT_ESTIMATES) as Position[]) {
      const ours = openWidthPct("OFF", seat, 100 as StackBucket)!;
      const [low] = BANDS_50BB[seat];
      const point = POINT_ESTIMATES[seat];
      const lowest = Math.min(low, point);
      const highest = Math.max(low, point);
      expect(ours, `${seat}`).toBeGreaterThan(lowest - 10);
      expect(ours, `${seat}`).toBeLessThan(highest + 10);
    }
  });
});
