import { describe, expect, it } from "vitest";

import type { AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * A range may not play a kicker while folding a better one of the same shape.
 *
 * KJo dominates KTo. A range holding the second and not the first is not
 * describing a strategy, it is describing a misreading - and this scan found
 * eight of them, every one in the ante widening rather than in a measured band,
 * which is where a hand list gets typed rather than read off a chart.
 *
 * Suited hands are deliberately exempt. A5s over A6s is a real solver pattern:
 * the wheel ace makes straights and carries the same ace blocker, so a range
 * that plays A5s and folds A7s is doing something deliberate. Offsuit, the wheel
 * barely plays and the kicker is most of the hand, so the same shape has no
 * defence. Applying one rule to both would have deleted a correct pattern to fix
 * an incorrect one.
 *
 * Repairs went in the direction the external evidence points, per seat. The
 * cutoff lost A5o, because two published sets put it near 26 percent and it sat
 * at 32.4. The button gained K8o, because the same sets put it at 54.8 against
 * our 50.5 - the one seat we open too tight. The small blind gained K7o, K6o and
 * Q8o, because it has no depth bands at all and pruning the least-measured seat
 * in the table would be guessing.
 */

const RANKS = "23456789TJQKA";
const SEATS = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB"] as Position[];
const DEPTHS = [15, 20, 25, 30, 40, 50, 75, 100, 150] as StackBucket[];

function playedClasses(
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
): Set<string> | null {
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

describe("kicker order", () => {
  it("never opens a kicker while folding a better one of the same shape", () => {
    const violations: string[] = [];
    let checked = 0;
    for (const ante of ["OFF", "ON"] as AnteMode[]) {
      for (const seat of SEATS) {
        for (const depth of DEPTHS) {
          const played = playedClasses(ante, seat, depth);
          if (played === null) continue;
          checked += 1;
          for (const hand of played) {
            if (hand.length === 2) continue;
            const suit = hand[2];
            // The wheel defence is for suited aces only: A5s through A2s make
            // straights, so folding A7s while playing A5s is deliberate. A suited
            // king with a lower kicker has no such story, and neither does any
            // offsuit hand.
            if (suit === "s" && hand[0] === "A" && "5432".includes(hand[1])) continue;
            const high = RANKS.indexOf(hand[0]);
            for (let kicker = RANKS.indexOf(hand[1]) + 1; kicker < high; kicker += 1) {
              const better = `${hand[0]}${RANKS[kicker]}${suit}`;
              if (!played.has(better)) {
                violations.push(`${ante} ${seat} ${depth}BB plays ${hand}, folds ${better}`);
              }
            }
          }
        }
      }
    }
    expect(checked, "nothing was checked").toBeGreaterThan(80);
    expect([...new Set(violations)]).toEqual([]);
  });

  it("leaves the suited wheel aces alone", () => {
    // The exemption, asserted so it is a decision rather than an oversight: at
    // least one seat plays a suited wheel ace while folding a higher suited ace,
    // and that is allowed to stand.
    const played = playedClasses("OFF", "UTG", 50 as StackBucket);
    expect(played).not.toBeNull();
    expect(played!.has("A5s")).toBe(true);
    expect(played!.has("A7s")).toBe(false);
  });
});
