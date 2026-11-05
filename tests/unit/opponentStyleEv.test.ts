import { beforeAll, describe, expect, it } from "vitest";

import { computeActionEvs, priceActions, type PreflopPricingPlayers } from "../../src/core/preflop/preflopEv";
import { loadPreflopEquity, strengthOrder } from "../../src/core/preflopEquity";
import type { ActionContext, ActionKey, HandLabel, Position, StackBucket } from "../../src/core/types";
import type { VillainArchetype } from "../../src/core/villain/archetypes";
import { comboCount, preflopVillainModel, resizedRange } from "../../src/core/villain/preflopModel";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Naming an opponent has to move the number, and move it the right way.
 *
 * The style switch existed for a while and changed only a sentence of
 * explanation - the expected value was identical whether the player said they
 * faced a rock or a calling station, which makes the control decoration.
 *
 * A player type shifts the charted ranges (`preflopModel.ts`). That produces the
 * split this file pins: a bluff wants folds and gets worse against a caller, a value
 * hand wants calls and gets better. Both directions from the same change, which is
 * the check that the model is doing poker rather than arithmetic.
 */

function store() {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error("no full-ring pack");
  return createRangeStoreFromRangePack(pack);
}

const everyone = (archetype: VillainArchetype | undefined, seats: number): PreflopPricingPlayers => ({
  ...(archetype === undefined ? {} : { villain: archetype }),
  callers: Array.from({ length: seats }, () => archetype),
});

interface Priced {
  context: ActionContext;
  hero: Position;
  depth: StackBucket;
  action: string;
  seats: number;
}

const FIRST_IN: Priced = { context: "PUSH_FOLD", hero: "BTN", depth: 10, action: "JAM", seats: 2 };
const CALL: Priced = { context: "VS_ALLIN", hero: "BB", depth: 10, action: "CALL_JAM", seats: 1 };

function ev(spot: Priced, hand: HandLabel, archetype?: VillainArchetype): number | undefined {
  const players = archetype === undefined ? undefined : everyone(archetype, spot.seats);
  return priceActions(
    spot.context,
    spot.hero,
    hand,
    spot.depth,
    "OFF",
    1.5,
    [spot.action as ActionKey, "FOLD" as ActionKey],
    store(),
    players,
  )?.evs.values.find((value) => value.action === spot.action)?.evBb;
}

describe("player type moves the expected value", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it("ranks hands by how they run against the deck, not by hand", () => {
    const order = strengthOrder();
    expect(order.slice(0, 4)).toEqual(["AA", "KK", "QQ", "JJ"]);
    expect(order[order.length - 1]).toBe("32o");
  });

  it("orders the types as the approved table does, with the shark as equilibrium", () => {
    const calls = (type: VillainArchetype) => preflopVillainModel(type).callWidth;
    const raises = (type: VillainArchetype) => preflopVillainModel(type).raiseWidth;
    expect(preflopVillainModel("SHARK")).toEqual({ callWidth: 1, raiseWidth: 1 });
    expect(calls("ROCK")).toBeLessThan(calls("EAGLE"));
    expect(calls("EAGLE")).toBeLessThan(calls("SHARK"));
    expect(calls("SHARK")).toBeLessThan(calls("DICE"));
    expect(calls("DICE")).toBeLessThan(calls("WHALE"));
    // Passive types raise narrowly however much they call; the gambler does both.
    expect(raises("WHALE")).toBeLessThan(raises("ROCK"));
    expect(raises("ROCK")).toBeLessThan(raises("EAGLE"));
    expect(raises("DICE")).toBeGreaterThan(1);
  });

  it("takes an estimated stat at half strength", () => {
    // Rock against shark on the approved table: 27.5 against 47.5 percent continuing
    // to a 3-bet. Half of that distance from one, because the stat is an estimate.
    expect(preflopVillainModel("ROCK").callWidth).toBeCloseTo(1 + (27.5 / 47.5 - 1) / 2, 10);
  });

  it("shifts a range by strength and stays inside the pool", () => {
    const pool: HandLabel[] = ["AA", "KK", "QQ", "JJ", "TT"];
    const range: HandLabel[] = ["AA", "KK", "QQ"];
    expect(resizedRange(range, 1, pool)).toBe(range);
    expect(resizedRange(range, 0.6, pool)).toEqual(["AA", "KK"]);
    expect(resizedRange(range, 1.5, pool)).toEqual(["AA", "KK", "QQ", "JJ", "TT"]);
    expect(comboCount(resizedRange(range, 9, pool))).toBe(30);
  });

  it("makes a bluff worse against a caller and better against a folder", () => {
    // 52o shoved from the button is fold equity and nothing else.
    const hand = "52o" as HandLabel;
    expect(ev(FIRST_IN, hand, "ROCK")!).toBeGreaterThan(ev(FIRST_IN, hand)!);
    expect(ev(FIRST_IN, hand, "WHALE")!).toBeLessThan(ev(FIRST_IN, hand)!);
  });

  it("makes a value hand better against a caller and worse against a folder", () => {
    // The opposite direction from the same change. A pair wants to be called;
    // if both moved the same way the model would be measuring range width
    // rather than playing poker.
    const hand = "99" as HandLabel;
    expect(ev(FIRST_IN, hand, "ROCK")!).toBeLessThan(ev(FIRST_IN, hand)!);
    expect(ev(FIRST_IN, hand, "WHALE")!).toBeGreaterThan(ev(FIRST_IN, hand)!);
  });

  it("calls a shove wider against the gambler and tighter against the rock", () => {
    const hand = "A7o" as HandLabel;
    expect(ev(CALL, hand, "DICE")!).toBeGreaterThan(ev(CALL, hand)!);
    expect(ev(CALL, hand, "ROCK")!).toBeLessThan(ev(CALL, hand)!);
  });

  it("is monotone in how wide the opponent calls", () => {
    const hand = "52o" as HandLabel;
    const order: VillainArchetype[] = ["ROCK", "EAGLE", "SHARK", "DICE", "WHALE"];
    const evs = order.map((type) => ev(FIRST_IN, hand, type)!);
    for (let index = 1; index < evs.length; index += 1) {
      expect(evs[index], order[index]).toBeLessThanOrEqual(evs[index - 1]);
    }
  });

  it("leaves the charts in place without a player type, and against the shark", () => {
    // With no read the shipped range stands. This is what GTO teaches, and a type
    // must be something the player opts into rather than a quiet adjustment.
    for (const spot of [FIRST_IN, CALL]) {
      const offered = [spot.action as ActionKey, "FOLD" as ActionKey];
      const plain = computeActionEvs(spot.context, spot.hero, "66" as HandLabel, spot.depth, "OFF", 1.5, offered, store());
      expect(plain).toBeDefined();
      expect(ev(spot, "66" as HandLabel, "SHARK")).toBe(plain!.values[0].evBb);
      expect(ev(spot, "66" as HandLabel)).toBe(plain!.values[0].evBb);
    }
  });

  it("prices each player behind by their own type", () => {
    const hand = "52o" as HandLabel;
    const price = (callers: (VillainArchetype | undefined)[]) => priceActions(
      "PUSH_FOLD", "BTN", hand, 10, "OFF", 1.5, ["JAM", "FOLD"] as ActionKey[], store(), { callers },
    )!;
    const rocks = price(["ROCK", "ROCK"]);
    const mixed = price(["ROCK", "WHALE"]);
    const whales = price(["WHALE", "WHALE"]);
    expect(rocks.foldFrequency!).toBeGreaterThan(mixed.foldFrequency!);
    expect(mixed.foldFrequency!).toBeGreaterThan(whales.foldFrequency!);
    expect(rocks.evs.values[0].evBb).toBeGreaterThan(mixed.evs.values[0].evBb);
    expect(mixed.evs.values[0].evBb).toBeGreaterThan(whales.evs.values[0].evBb);
  });
});
