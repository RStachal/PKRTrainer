import { beforeAll, describe, expect, it } from "vitest";

import { generateSpot } from "../../src/core/drillEngine";
import { OPPONENT_STYLES, type OpponentStyleId } from "../../src/core/opponentStyle";
import { ALL_HAND_CLASSES } from "../../src/core/poker";
import { loadPreflopEquity, strengthOrder, strongestSlice } from "../../src/core/preflopEquity";
import { mulberry32 } from "../../src/core/rng";
import type { ActionKey, Filters, HandLabel } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Naming an opponent has to move the number, and move it the right way.
 *
 * The style switch existed for a while and changed only a sentence of
 * explanation - the expected value was identical whether the player said they
 * faced a rock or a calling station, which makes the control decoration.
 *
 * A style is one number, how often they fold to a shove, and the calling range
 * is the strongest slice of what they can hold. That produces the split this
 * file pins: a bluff wants folds and gets worse against a caller, a value hand
 * wants calls and gets better. Both directions from the same change, which is
 * the check that the model is doing poker rather than arithmetic.
 */

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

const filters = (style?: OpponentStyleId): Filters => ({
  positions: ["BTN"], buckets: [10], contexts: ["PUSH_FOLD"],
  ante: "OFF", scoringMode: "STRICT", opponentStyle: style,
});

/** Jam EV for one hand at one style, or undefined if that hand never came up. */
function jamEv(hand: HandLabel, style?: OpponentStyleId): number | undefined {
  const active = store();
  for (let seed = 1; seed <= 800; seed += 1) {
    const spot = generateSpot(mulberry32(seed), "PUSH_FOLD", filters(style), active);
    if (spot?.hand !== hand) continue;
    const jam = spot.actionEvs?.values.find((value) => value.action === ("JAM" as ActionKey));
    if (jam !== undefined) return jam.evBb;
  }
  return undefined;
}

describe("opponent style moves the expected value", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it("ranks hands by how they run against the deck, not by hand", () => {
    const order = strengthOrder();
    expect(order.slice(0, 4)).toEqual(["AA", "KK", "QQ", "JJ"]);
    expect(order[order.length - 1]).toBe("32o");
  });

  it("gives a looser opponent a wider calling range", () => {
    const width = (style: OpponentStyleId) => strongestSlice(
      ALL_HAND_CLASSES as unknown as HandLabel[],
      1 - OPPONENT_STYLES[style].foldsToShove,
    ).reduce((sum, hand) => sum + COMBOS(hand), 0) / 1326;

    expect(width("TIGHT_PASSIVE")).toBeLessThan(width("TIGHT_AGGRESSIVE"));
    expect(width("TIGHT_AGGRESSIVE")).toBeLessThan(width("LOOSE_AGGRESSIVE"));
    expect(width("LOOSE_AGGRESSIVE")).toBeLessThan(width("LOOSE_PASSIVE"));
  });

  it("makes a bluff worse against a caller and better against a folder", () => {
    // 52o shoved from the button is fold equity and nothing else.
    const baseline = jamEv("52o" as HandLabel);
    const rock = jamEv("52o" as HandLabel, "TIGHT_PASSIVE");
    const fish = jamEv("52o" as HandLabel, "LOOSE_PASSIVE");
    expect(baseline).toBeDefined();
    expect(rock!).toBeGreaterThan(baseline!);
    expect(fish!).toBeLessThan(baseline!);
  });

  it("makes a value hand better against a caller and worse against a folder", () => {
    // The opposite direction from the same change. A pair wants to be called;
    // if both moved the same way the model would be measuring range width
    // rather than playing poker.
    const baseline = jamEv("66" as HandLabel);
    const rock = jamEv("66" as HandLabel, "TIGHT_PASSIVE");
    const fish = jamEv("66" as HandLabel, "LOOSE_PASSIVE");
    expect(baseline).toBeDefined();
    expect(rock!).toBeLessThan(baseline!);
    expect(fish!).toBeGreaterThan(baseline!);
  });

  it("leaves the measured sheet in place when no opponent is named", () => {
    // With no read the shipped range stands. This is the default the trainer
    // teaches, and a style must be something the player opts into rather than
    // an adjustment applied quietly.
    const withoutStyle = jamEv("66" as HandLabel);
    const again = jamEv("66" as HandLabel);
    expect(withoutStyle).toBe(again);
    expect(withoutStyle).not.toBe(jamEv("66" as HandLabel, "LOOSE_PASSIVE"));
  });
});
