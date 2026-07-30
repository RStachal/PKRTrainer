import { describe, expect, it } from "vitest";

import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import type { AnteMode, Position, StackBucket } from "../../src/core/types";

// The button acts last after the flop in every pot it opens, so its range is
// meant to be materially wider than any earlier seat's. The shipped table had it
// at 39.7 percent without ante against an owner reference of 50.2 with, and
// applied one range from 15BB to 150BB. See
// Agents/reference-ranges/btn-rfi-mtt-regular.md.

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

function openWidthPct(ante: AnteMode, position: Position, bucket: StackBucket): number | null {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack).lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return null;
  const combos = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
  return Math.round(combos / 1326 * 1000) / 10;
}

describe("button opening range width", () => {
  it("matches the purchased charts exactly, ante-off, at both measured depths", () => {
    // The charts are the benchmark and these are their measured widths. Ante-off
    // carries the depth curve by the owner's decision; ante-on sits above it.
    for (const bucket of [25, 30, 40] as StackBucket[]) {
      expect(openWidthPct("OFF", "BTN", bucket), `${bucket}BB`).toBe(40.3);
    }
    for (const bucket of [50, 100, 150] as StackBucket[]) {
      expect(openWidthPct("OFF", "BTN", bucket), `${bucket}BB`).toBe(46.9);
    }
  });

  it("widens every seat with depth, which is what the flat table did not", () => {
    // The defect the charts exposed: one range from 25BB to 150BB per seat, so
    // the same number was too wide at the shallow end and too narrow at the deep
    // one. Stated as a property rather than as eight figures.
    for (const seat of ["LJ", "HJ", "CO", "BTN"] as Position[]) {
      for (const ante of ["OFF", "ON"] as AnteMode[]) {
        const mid = openWidthPct(ante, seat, 25 as StackBucket);
        const deep = openWidthPct(ante, seat, 100 as StackBucket);
        expect(mid, `${ante} ${seat}`).not.toBeNull();
        expect(deep, `${ante} ${seat}`).not.toBeNull();
        expect(deep!, `${ante} ${seat} deep vs mid`).toBeGreaterThan(mid!);
      }
    }
  });

  it("holds a band flat between the depths the charts measure", () => {
    // The bands are the chart pack's own - 20-40BB and 40-100BB. Interpolating
    // between two measurements would invent values the source does not contain.
    expect(openWidthPct("OFF", "CO", 25 as StackBucket)).toBe(openWidthPct("OFF", "CO", 40 as StackBucket));
    expect(openWidthPct("OFF", "CO", 50 as StackBucket)).toBe(openWidthPct("OFF", "CO", 150 as StackBucket));
  });

  it("leaves the shallow buckets alone", () => {
    // At 15-20BB a single open range stops being the model - the strategy mixes
    // minraise, raise-fold, raise-call and open shove - so widening these would
    // be answering a question nobody has asked yet.
    expect(openWidthPct("OFF", "BTN", 15 as StackBucket)).toBe(39.7);
    expect(openWidthPct("OFF", "BTN", 20 as StackBucket)).toBe(39.7);
    expect(openWidthPct("ON", "BTN", 15 as StackBucket)).toBe(44.5);
    expect(openWidthPct("ON", "BTN", 20 as StackBucket)).toBe(44.5);
  });

  it("keeps the button wider than every earlier seat at the same depth", () => {
    // The property the original defect violated, stated directly rather than as
    // a number: position buys width, and the button has the most of it.
    for (const ante of ["ON", "OFF"] as AnteMode[]) {
      const button = openWidthPct(ante, "BTN", 50 as StackBucket);
      expect(button).not.toBeNull();
      for (const seat of ["UTG", "LJ", "HJ", "CO"] as Position[]) {
        const earlier = openWidthPct(ante, seat, 50 as StackBucket);
        if (earlier === null) continue;
        expect(button!, `${ante} ${seat}`).toBeGreaterThan(earlier);
      }
    }
  });

  it("widens with ante at every depth", () => {
    for (const bucket of [15, 25, 50, 150] as StackBucket[]) {
      const on = openWidthPct("ON", "BTN", bucket);
      const off = openWidthPct("OFF", "BTN", bucket);
      expect(on, `${bucket}BB`).not.toBeNull();
      expect(off, `${bucket}BB`).not.toBeNull();
      expect(on!, `${bucket}BB`).toBeGreaterThan(off!);
    }
  });
});
