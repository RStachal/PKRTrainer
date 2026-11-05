import { describe, expect, it } from "vitest";

import type { AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * A hand playable from an early seat is playable from every later one.
 *
 * The later seat has strictly fewer players left to act, so it runs into a
 * better hand less often and acts after more of the table postflop. Nothing
 * about that reverses. So each seat's opening range should contain every seat
 * before it.
 *
 * This found two: with ante on, under the gun opened 87s while UTG+1, UTG+2 and
 * the lojack folded it, and UTG+1 opened 76s while UTG+2 folded it at every
 * depth from 25 to 150. Both lived in the ante widening rather than a measured
 * band - the sixth defect class found there, against none in the bands.
 *
 * The small blind is excluded, and not for convenience. It acts last preflop but
 * plays every flop out of position against one opponent, and limping is part of
 * its strategy, so "later" does not carry the same meaning and the property does
 * not apply.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

const ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"] as Position[];
const DEPTHS = [15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150] as StackBucket[];

function opened(ante: AnteMode, position: Position, bucket: StackBucket): Set<string> | null {
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
  return new Set(
    Object.entries(entry.actions)
      .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
      .map(([handClass]) => handClass),
  );
}

describe("positional containment", () => {
  it("never folds from a later seat what an earlier seat opens", () => {
    const violations: string[] = [];
    let compared = 0;
    for (const ante of ["OFF", "ON"] as AnteMode[]) {
      for (const bucket of DEPTHS) {
        for (let early = 0; early < ORDER.length; early += 1) {
          for (let late = early + 1; late < ORDER.length; late += 1) {
            const earlier = opened(ante, ORDER[early], bucket);
            const later = opened(ante, ORDER[late], bucket);
            if (earlier === null || later === null) continue;
            compared += 1;
            const lost = [...earlier].filter((hand) => !later.has(hand));
            if (lost.length > 0) {
              violations.push(
                `${ante} ${bucket}BB ${ORDER[early]}->${ORDER[late]}: ${lost.join(",")}`,
              );
            }
          }
        }
      }
    }
    expect(compared, "nothing was compared").toBeGreaterThan(300);
    expect(violations).toEqual([]);
  });

  it("widens monotonically through the seats", () => {
    // The weaker statement the containment implies, kept because it is the one a
    // player would notice: each seat opens at least as much as the one before.
    const width = (ante: AnteMode, seat: Position, bucket: StackBucket) => {
      const hands = opened(ante, seat, bucket);
      return hands === null
        ? null
        : [...hands].reduce((sum, hand) => sum + COMBOS(hand), 0);
    };
    for (const ante of ["OFF", "ON"] as AnteMode[]) {
      for (const bucket of DEPTHS) {
        for (let index = 1; index < ORDER.length; index += 1) {
          const earlier = width(ante, ORDER[index - 1], bucket);
          const later = width(ante, ORDER[index], bucket);
          if (earlier === null || later === null) continue;
          expect(later, `${ante} ${bucket}BB ${ORDER[index]}`).toBeGreaterThanOrEqual(earlier);
        }
      }
    }
  });
});
