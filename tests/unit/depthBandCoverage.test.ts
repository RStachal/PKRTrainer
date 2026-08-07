import { describe, expect, it } from "vitest";

import type { AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Every opening seat should have more than one range across 15 to 150BB.
 *
 * The defect the chart work set out to fix was a flat table: one range per seat
 * from 15BB to 150, too wide at the shallow end and too narrow at the deep one.
 * Seven seats were given depth bands. The small blind was not, and nothing said
 * so - it still answers the same 42.1 percent at fifteen big blinds and at a
 * hundred and fifty.
 *
 * Writing this test briefly found a second case - under the gun and UTG+1 flat
 * with ante on - which turned out to be an artefact of a carry-forward rule that
 * has since been removed. With the measured bands standing on their own, both
 * seats have their curve back in either ante mode.
 *
 * The small blind is not fixed here, because there is nothing to fix it with. The chart
 * pack that produced the bands covers the lojack, hijack, cutoff and button. The
 * small blind's depth behaviour was never measured, and inventing bands for the
 * one seat that opens into a single opponent - where limping is part of the
 * strategy and the blind is already invested - would be guessing at the seat
 * that least resembles the others.
 *
 * What this test does is keep both gaps visible. A seat that gains bands should
 * come off the list; a seat that silently loses them should fail.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

const DEPTHS = [15, 20, 25, 30, 40, 50, 75, 100, 150] as StackBucket[];

/**
 * Seats carrying a single range at every depth, with no measurement to fix it.
 *
 * The small blind is flat in both ante modes. Under the gun and UTG+1 are flat
 * only with ante on, where the fixed ante widening is larger than the difference
 * between their two bands.
 */
const KNOWN_FLAT: ReadonlyArray<{ seat: Position; ante: AnteMode }> = [
  { seat: "SB", ante: "OFF" },
  { seat: "SB", ante: "ON" },
];

const isKnownFlat = (seat: Position, ante: AnteMode) => (
  KNOWN_FLAT.some((entry) => entry.seat === seat && entry.ante === ante)
);

function widthPct(ante: AnteMode, position: Position, bucket: StackBucket): number | null {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
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

function distinctWidths(ante: AnteMode, seat: Position): number {
  const seen = new Set<number>();
  for (const depth of DEPTHS) {
    const width = widthPct(ante, seat, depth);
    if (width !== null) seen.add(width);
  }
  return seen.size;
}

describe("depth band coverage", () => {
  const SEATS = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB"] as Position[];

  it("gives every seat but the known-flat ones more than one range with depth", () => {
    for (const seat of SEATS) {
      for (const ante of ["OFF", "ON"] as AnteMode[]) {
        if (isKnownFlat(seat, ante)) continue;
        expect(distinctWidths(ante, seat), `${ante} ${seat}`).toBeGreaterThan(1);
      }
    }
  });

  it("keeps the known-flat list honest in both directions", () => {
    // A seat on this list that has gained bands should come off it, so the list
    // cannot quietly outlive the gap it records.
    for (const { seat, ante } of KNOWN_FLAT) {
      expect(distinctWidths(ante, seat), `${ante} ${seat} still flat`).toBe(1);
    }
    // Short enough to be a gap rather than the norm: four of sixteen seat/ante
    // pairs. If this grows, the depth work has regressed rather than the list
    // having become more honest.
    expect(KNOWN_FLAT.length).toBeLessThan(6);
  });

  it("keeps under the gun banded in both ante modes", () => {
    // Ante widens the seat at every depth without erasing the depth curve, which
    // is what a fixed addition should do and what it failed to do while the
    // carry-forward rule was in place.
    expect(distinctWidths("OFF", "UTG")).toBeGreaterThan(1);
    expect(distinctWidths("ON", "UTG")).toBeGreaterThan(1);
    expect(widthPct("ON", "UTG", 25 as StackBucket)!)
      .toBeGreaterThan(widthPct("OFF", "UTG", 25 as StackBucket)!);
  });

  it("has a flat small blind that is at least self-consistent", () => {
    // No bands, but no cliff either: whatever it teaches, it teaches everywhere,
    // so a player is not shown one answer at 20BB and a different one at 25.
    const widths = DEPTHS.map((depth) => widthPct("OFF", "SB", depth));
    expect(widths.every((width) => width === widths[0])).toBe(true);
    expect(widths[0]).toBeGreaterThan(0);
  });
});
