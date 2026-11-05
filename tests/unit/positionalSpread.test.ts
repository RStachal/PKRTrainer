import { describe, expect, it } from "vitest";

import type { AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * How far apart the seats are, measured against a published nine-handed set.
 *
 * Checked at 75BB with antes, our production table has the right shape at the
 * two earliest seats and the wrong one in between:
 *
 *   seat    ours    published    gap
 *   UTG     14.5      11.4      +3.1
 *   UTG+1   14.8      13.2      +1.6
 *   LJ      21.6      15.7      +5.9
 *   HJ      26.7      19.6      +7.1
 *   CO      33.9      26.1      +7.8
 *   BTN     50.5      54.8      -4.3
 *
 * The middle is six to eight points too wide and the button four points too
 * tight, which is one defect rather than two: the curve is too flat. The step
 * from cutoff to button is 16.6 points here and 28.7 in the reference, so a
 * player drilling this learns less separation between a middle seat and the best
 * seat at the table than the game actually rewards.
 *
 * Nothing is corrected from this. One published set is not enough to rewrite six
 * seats, and the last attempt to fix a range from a single comparison had to be
 * reverted the same day. What these tests do is hold the shape that is already
 * right and pin the gap where it is, so a future change is measured against a
 * recorded starting point rather than against an impression.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

/** Published 9-max MTT RFI at 75BB with antes, in percent. */
const PUBLISHED: Readonly<Record<string, number>> = {
  UTG: 11.4, "UTG+1": 13.2, LJ: 15.7, HJ: 19.6, CO: 26.1, BTN: 54.8,
};

function widthPct(ante: AnteMode, position: Position, bucket: StackBucket): number {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return 0;
  const entry = createRangeStoreFromRangePack(pack)
    .lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return 0;
  const combos = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .reduce((sum, [handClass]) => sum + COMBOS(handClass), 0);
  return Math.round(combos / 1326 * 1000) / 10;
}

const DEPTH = 75 as StackBucket;

describe("positional spread against a published set", () => {
  it("keeps every seat wider than the one before it", () => {
    // The ordering is not in doubt anywhere, and it is what a player would
    // notice first if it broke.
    const order = ["UTG", "UTG+1", "LJ", "HJ", "CO", "BTN"] as Position[];
    for (const ante of ["OFF", "ON"] as AnteMode[]) {
      for (let index = 1; index < order.length; index += 1) {
        const earlier = widthPct(ante, order[index - 1], DEPTH);
        const later = widthPct(ante, order[index], DEPTH);
        expect(later, `${ante} ${order[index]} vs ${order[index - 1]}`)
          .toBeGreaterThan(earlier);
      }
    }
  });

  it("matches the published set at the two earliest seats", () => {
    // Within three and a half points, which is where the table is on firmest
    // ground and where a regression would be a real loss.
    for (const seat of ["UTG", "UTG+1"] as Position[]) {
      const gap = widthPct("ON", seat, DEPTH) - PUBLISHED[seat];
      expect(Math.abs(gap), `${seat} gap ${gap.toFixed(1)}`).toBeLessThan(3.5);
    }
  });

  it("records the middle seats running wide and the button running tight", () => {
    // Pinned as it stands rather than asserted to be correct. Widening the
    // middle or narrowing the button further would be moving away from the only
    // external check this table has.
    for (const seat of ["LJ", "HJ", "CO"] as Position[]) {
      const gap = widthPct("ON", seat, DEPTH) - PUBLISHED[seat];
      expect(gap, `${seat} should still be wide`).toBeGreaterThan(0);
      expect(gap, `${seat} drifting wider`).toBeLessThan(9);
    }
    const button = widthPct("ON", "BTN", DEPTH) - PUBLISHED.BTN;
    expect(button, "button should still be tight").toBeLessThan(0);
    expect(button, "button drifting tighter").toBeGreaterThan(-7);
  });

  it("has a flatter cutoff-to-button step than the published set", () => {
    // The single number that captures the shape problem: 16.6 here against 28.7
    // published. Recorded so a change that steepens it can be seen to have done
    // so, since that is the direction the evidence points.
    const ours = widthPct("ON", "BTN", DEPTH) - widthPct("ON", "CO", DEPTH);
    const published = PUBLISHED.BTN - PUBLISHED.CO;
    expect(ours, `ours ${ours.toFixed(1)} vs published ${published.toFixed(1)}`)
      .toBeLessThan(published);
    expect(ours).toBeGreaterThan(10);
  });
});
