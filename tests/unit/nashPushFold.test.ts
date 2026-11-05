import { beforeAll, describe, expect, it } from "vitest";

import { buildPool } from "../../src/core/drillEngine";
import { solvePushFold, type PushFoldSeat } from "../../src/core/preflop/nashPushFold";
import { NASH_ANTE_TOTAL, nashCallEv, nashJamEv } from "../../src/core/preflop/nashTable";
import { withRealPricing } from "../../src/core/preflop/realPricing";
import { ALL_HAND_CLASSES } from "../../src/core/poker";
import { combosInClass, loadPreflopEquity, TOTAL_COMBOS } from "../../src/core/preflopEquity";
import { grade } from "../../src/core/scoring";
import { POSITION_ORDER, type ActionKey, type AnteMode, type HandLabel, type Spot, type StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import { makeFilters } from "../properties/drillSupport";

/**
 * Nash push/fold (plán 7.1). Přesnost hlídá exploitability, ne opis tabulky: v rovnováze si
 * změnou strategie nesmí nikdo polepšit. Mezi blindy je výpočet přesný, u více hráčů platí
 * předpoklad, že dorovná nejvýš jeden.
 */

const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const share = (frequency: Readonly<Record<HandLabel, number>>) => (
  HANDS.reduce((sum, hand) => sum + frequency[hand] * combosInClass(hand), 0) / TOTAL_COMBOS
);
const solved = new Map<string, PushFoldSeat[]>();

function table(stack: number, ante: AnteMode): PushFoldSeat[] {
  const key = `${stack}|${ante}`;
  const cached = solved.get(key);
  if (cached !== undefined) return cached;
  const seats = solvePushFold({ seats: POSITION_ORDER, stackBB: stack, anteTotalBB: NASH_ANTE_TOTAL[ante] });
  if (seats === undefined) throw new Error("equity se nenačetla");
  solved.set(key, seats);
  return seats;
}

const seatOf = (seats: PushFoldSeat[], seat: string) => seats.find((item) => item.seat === seat)!;

describe("Nash push/fold", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it.each([[5, "ON"], [10, "ON"], [10, "OFF"], [20, "ON"]] as const)("rovnováha: změnou si nikdo nepolepší (%s BB, ante %s)", (stack, ante) => {
    for (const seat of table(stack, ante)) {
      expect(seat.exploitability, seat.seat).toBeLessThan(0.002);
    }
  });

  it("heads-up bez ante sedí na známých hodnotách", () => {
    const hu = solvePushFold({ seats: ["SB", "BB"], stackBB: 10, anteTotalBB: 0 })![0];
    expect(share(hu.jam)).toBeCloseTo(0.58, 1);
    expect(share(hu.calls.BB!.frequency)).toBeCloseTo(0.37, 1);
    for (const hand of ["AA", "AKs", "KQo", "A2o", "K9o"] as HandLabel[]) expect(hu.jam[hand], hand).toBe(1);
    expect(hu.jam["72o" as HandLabel]).toBe(0);
  });

  it("v každé sedačce je hra samostatná: SB v 9-max je heads-up", () => {
    const hu = solvePushFold({ seats: ["SB", "BB"], stackBB: 10, anteTotalBB: 0 })![0];
    const sb = seatOf(table(10, "OFF"), "SB");
    for (const hand of HANDS) expect(sb.jam[hand], hand).toBeCloseTo(hu.jam[hand], 1);
  });

  it("čím hlouběji, tím užší shove; čím později, tím širší", () => {
    const btn = [5, 10, 15, 20].map((stack) => share(seatOf(table(stack, "ON"), "BTN").jam));
    for (let index = 1; index < btn.length; index += 1) expect(btn[index]).toBeLessThan(btn[index - 1]);
    const seats = table(10, "ON").map((seat) => share(seat.jam));
    for (let index = 1; index < seats.length; index += 1) expect(seats[index]).toBeGreaterThan(seats[index - 1]);
  });

  it("ante rozšiřuje shove i dorovnání", () => {
    expect(share(seatOf(table(10, "ON"), "BTN").jam)).toBeGreaterThan(share(seatOf(table(10, "OFF"), "BTN").jam));
    expect(share(seatOf(table(10, "ON"), "BTN").calls.BB!.frequency))
      .toBeGreaterThan(share(seatOf(table(10, "OFF"), "BTN").calls.BB!.frequency));
  });

  it("dorovnání proti UTG je užší než proti buttonu", () => {
    const seats = table(10, "ON");
    expect(share(seats[0].calls.BB!.frequency)).toBeLessThan(share(seatOf(seats, "BTN").calls.BB!.frequency));
  });

  it("na 10 BB s ante se rovnováha drží chartů, aniž by je znala", () => {
    const store = createRangeStoreFromRangePack(currentMttPreflopRangePack("ON"));
    for (const seat of table(10, "ON")) {
      const entry = store.lookup({ ante: "ON", position: seat.seat, bucket: 10 as StackBucket, context: "PUSH_FOLD" })!;
      const agreed = HANDS.reduce((sum, hand) => (
        sum + ((seat.jam[hand] >= 0.5) === (entry.strict[hand] ?? []).includes("JAM" as ActionKey) ? combosInClass(hand) : 0)
      ), 0);
      expect(agreed / TOTAL_COMBOS, seat.seat).toBeGreaterThan(0.95);
    }
  });
});

describe("tabulka rovnováhy v trenažéru", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it.each([[10, "ON", "UTG"], [5, "OFF", "BTN"], [20, "ON", "SB"]] as const)("hodnota shovu sedí na výpočet (%s BB, ante %s, %s)", (stack, ante, seatName) => {
    const seat = seatOf(table(stack, ante), seatName);
    for (const hand of HANDS) {
      expect(nashJamEv(hand, seatName, stack, ante), hand).toBeCloseTo(seat.jamEv[hand], 1);
    }
  });

  it("hodnota dorovnání sedí na výpočet", () => {
    const seat = seatOf(table(10, "ON"), "BTN");
    for (const hand of HANDS) {
      expect(nashCallEv(hand, "BB", "BTN", 10, "ON"), hand).toBeCloseTo(seat.calls.BB!.ev[hand], 1);
    }
  });

  it("bez sedačky za shoverem a mimo tabulku nic netvrdí", () => {
    expect(nashJamEv("AA" as HandLabel, "BB", 10, "ON")).toBeUndefined();
    expect(nashJamEv("AA" as HandLabel, "BTN", 40, "ON")).toBeUndefined();
    expect(nashCallEv("AA" as HandLabel, "UTG", "BTN", 10, "ON")).toBeUndefined();
  });

  const nashSpots = (context: "PUSH_FOLD" | "VS_ALLIN", ante: AnteMode): Spot[] => {
    const store = createRangeStoreFromRangePack(currentMttPreflopRangePack(ante));
    return buildPool(1, context, makeFilters({ ante, contexts: [context], scoringMode: "STRICT" }), store, { maxSize: 400 })
      .filter((spot) => spot.actionEvs?.source === "NASH_PUSH_FOLD");
  };

  it("shove a dorovnání na krátkém stacku hodnotí rovnováha", () => {
    expect(nashSpots("PUSH_FOLD", "ON").length).toBeGreaterThan(200);
    expect(nashSpots("VS_ALLIN", "ON").length).toBeGreaterThan(50);
  });

  it("kde se chart rozejde s rovnováhou, známka i vysvětlení říkají totéž", () => {
    const spots = nashSpots("PUSH_FOLD", "OFF");
    const split = spots.filter((spot) => (
      spot.strictCorrect.length === 1 && !grade(spot, spot.strictCorrect[0], "STRICT").correct
    ));
    expect(split.length, "žádný rozpor nad prahem").toBeGreaterThan(0);
    for (const spot of split) {
      const [best] = grade(spot, spot.strictCorrect[0], "STRICT").recommended;
      expect(best, spot.id).not.toBe(spot.strictCorrect[0]);
      const told = /Doporučení: ([^.]+)\./.exec(spot.explanation ?? "")?.[1] ?? "";
      expect(told.toLowerCase(), spot.id).not.toContain(spot.strictCorrect[0] === "FOLD" ? "fold" : "all-in");
    }
  });

  it("rozdíl pod prahem hodnotí obě akce jako správné", () => {
    const spots = nashSpots("PUSH_FOLD", "ON").filter((spot) => {
      const jam = spot.actionEvs!.values.find((item) => item.action === ("JAM" as ActionKey))!;
      return Math.abs(jam.evBb) <= 0.05;
    });
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(grade(spot, "JAM" as ActionKey, "STRICT").correct, spot.id).toBe(true);
      expect(grade(spot, "FOLD" as ActionKey, "STRICT").correct, spot.id).toBe(true);
    }
  });

  it("v REAL zůstává rovnováha kotvou a typ ji jen posune", () => {
    const store = createRangeStoreFromRangePack(currentMttPreflopRangePack("ON"));
    const [spot] = nashSpots("PUSH_FOLD", "ON").filter((item) => item.heroPos !== "BB");
    const real = withRealPricing(spot, { mode: "REAL", focus: "ROCK" }, store);
    expect(real.real?.gtoEvs).toEqual(spot.actionEvs);
    expect(real.actionEvs?.source).toBe("VILLAIN_MODEL");
    const jam = (priced: Spot) => priced.actionEvs!.values.find((item) => item.action === ("JAM" as ActionKey))!.evBb;
    expect(jam(real)).toBeGreaterThanOrEqual(jam(spot));
  });
});
