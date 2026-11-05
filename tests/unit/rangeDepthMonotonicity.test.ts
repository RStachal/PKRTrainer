import { describe, expect, it } from "vitest";

import type { ActionContext, AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * A pair or a suited hand must not disappear as stacks get deeper.
 *
 * Both live on implied odds - a small pair wants to flop a set, a suited hand
 * wants to flop a flush - and implied odds improve with depth. A range that
 * plays them shallow and folds them deep has the relationship backwards.
 *
 * This found a real defect in the opening ranges: four early seats stepped down
 * by about four points at the 20 to 25BB seam, losing 22 through 66. It found
 * nothing anywhere else, and that negative result is the reason this file exists
 * as a test rather than as a one-off script - it is a statement about the whole
 * table that has to keep holding.
 *
 * Two exclusions, both deliberate:
 *
 * - Shoves. A re-jam range narrows with depth by design: each hand carries the
 *   deepest stack at which it shoves, so a hand leaving as stacks grow is the
 *   sheet being applied, not a hand being lost. Comparing raw ranges here
 *   reported twelve violations, all of them jams, and every one a false alarm.
 * - Offsuit hands. An offsuit broadway plays worse deep, not better; it is the
 *   hand that gets dominated when the money goes in on later streets.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

const BUCKETS = [15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150] as StackBucket[];
const SEATS = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as Position[];

function pack(ante: AnteMode) {
  return allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
}

/** Hand classes played by a non-shove action, or null when there is no record. */
function nonShoveClasses(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
  context: ActionContext,
): Set<string> | null {
  const found = pack(ante);
  if (found === undefined) return null;
  const entry = createRangeStoreFromRangePack(found)
    .lookup({ ante, position, bucket, context });
  if (entry === undefined) return null;
  return new Set(
    Object.entries(entry.actions)
      .filter(([, actions]) => actions.some((action) => (
        action !== "FOLD" && action !== "JAM" && action !== "CALL_JAM"
      )))
      .map(([handClass]) => handClass),
  );
}

function widthPct(classes: Set<string>): number {
  return Math.round([...classes].reduce((sum, hand) => sum + COMBOS(hand), 0) / 1326 * 1000) / 10;
}

describe("range depth monotonicity", () => {
  it("never folds a pair or suited hand that a shallower stack played", () => {
    const failures: string[] = [];
    for (const context of ["VS_OPEN", "VS_LIMP", "VS_3BET", "SQUEEZE"] as ActionContext[]) {
      for (const seat of SEATS) {
        for (const ante of ["OFF", "ON"] as AnteMode[]) {
          for (let index = 1; index < BUCKETS.length; index += 1) {
            const shallow = nonShoveClasses(ante, seat, BUCKETS[index - 1], context);
            const deep = nonShoveClasses(ante, seat, BUCKETS[index], context);
            if (shallow === null || deep === null) continue;
            const lost = [...shallow]
              .filter((hand) => !hand.endsWith("o"))
              .filter((hand) => !deep.has(hand));
            if (lost.length > 0) {
              failures.push(
                `${context} ${seat} ${ante} ${BUCKETS[index - 1]}->${BUCKETS[index]}BB ` +
                `(${widthPct(shallow)}%->${widthPct(deep)}%) loses ${lost.join(",")}`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("checks enough of the table for the empty result to mean something", () => {
    // A pass proves nothing if the lookups all returned null. This counts the
    // comparisons that actually happened, so the test cannot go quiet by
    // silently finding no data.
    let compared = 0;
    for (const context of ["VS_OPEN", "VS_LIMP", "VS_3BET", "SQUEEZE"] as ActionContext[]) {
      for (const seat of SEATS) {
        for (let index = 1; index < BUCKETS.length; index += 1) {
          const shallow = nonShoveClasses("OFF", seat, BUCKETS[index - 1], context);
          const deep = nonShoveClasses("OFF", seat, BUCKETS[index], context);
          if (shallow !== null && deep !== null) compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
});
