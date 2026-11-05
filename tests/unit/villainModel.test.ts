import { describe, expect, it } from "vitest";

import { POSITION_ORDER } from "../../src/core/types";
import { SIX_MAX_POSITION_ORDER } from "../../src/core/trainingProfile";
import {
  ARCHETYPES,
  VILLAIN_ARCHETYPES,
  isVillainArchetype,
  type VillainArchetype,
} from "../../src/core/villain/archetypes";
import { castTable, LIVE_TABLE_NINE } from "../../src/core/villain/tableCast";
import { shiftContinueShare, type ContinueRow } from "../../src/core/villain/strategyShift";

const mid = (band: { min: number; max: number }) => (band.min + band.max) / 2;

describe("typy hráčů (plán GTO/REAL, 3.2)", () => {
  it("má pět typů a každé rozpětí dává smysl", () => {
    expect(VILLAIN_ARCHETYPES).toEqual(["SHARK", "EAGLE", "ROCK", "DICE", "WHALE"]);
    for (const id of VILLAIN_ARCHETYPES) {
      const { stats, basis } = ARCHETYPES[id];
      for (const band of [stats.vpip, stats.pfr, stats.threeBet, stats.foldToThreeBet, stats.foldToCbet]) {
        expect(band.min, id).toBeLessThanOrEqual(band.max);
        expect(band.min, id).toBeGreaterThanOrEqual(0);
        expect(band.max, id).toBeLessThanOrEqual(100);
      }
      expect(mid(stats.pfr), `${id}: PFR nad VPIP`).toBeLessThanOrEqual(mid(stats.vpip));
      // Žádný typ zatím není změřený; kotvy nese styl (opponentStyle.ts).
      expect(basis).toBe("INTERPOLATED");
    }
  });

  it("řadí typy tak, jak je majitel popsal", () => {
    const vpip = (id: VillainArchetype) => mid(ARCHETYPES[id].stats.vpip);
    const foldToCbet = (id: VillainArchetype) => mid(ARCHETYPES[id].stats.foldToCbet);
    // Kámen hraje nejméně rukou, velryba nejvíc.
    expect(vpip("ROCK")).toBeLessThan(vpip("EAGLE"));
    expect(vpip("EAGLE")).toBeLessThanOrEqual(vpip("SHARK"));
    expect(vpip("SHARK")).toBeLessThan(vpip("DICE"));
    expect(vpip("DICE")).toBeLessThan(vpip("WHALE"));
    // Na c-bet nejvíc folduje kámen, nejméně velryba.
    expect(foldToCbet("WHALE")).toBeLessThan(foldToCbet("DICE"));
    expect(foldToCbet("DICE")).toBeLessThan(foldToCbet("SHARK"));
    expect(foldToCbet("SHARK")).toBeLessThan(foldToCbet("EAGLE"));
    expect(foldToCbet("EAGLE")).toBeLessThan(foldToCbet("ROCK"));
  });

  it("pozná typ podle jména", () => {
    expect(isVillainArchetype("DICE")).toBe(true);
    expect(isVillainArchetype("FISH")).toBe(false);
    expect(isVillainArchetype(undefined)).toBe(false);
  });
});

describe("obsazení stolu", () => {
  const count = (cast: Partial<Record<string, VillainArchetype>>) => {
    const counts: Record<string, number> = {};
    for (const archetype of Object.values(cast)) {
      if (archetype !== undefined) counts[archetype] = (counts[archetype] ?? 0) + 1;
    }
    return counts;
  };

  it("na devět míst dá schválený mix a hráče vynechá", () => {
    const cast = castTable(42, POSITION_ORDER, "BTN");
    expect(cast.BTN).toBeUndefined();
    expect(Object.keys(cast)).toHaveLength(8);
    expect(count(cast)).toEqual({ SHARK: 1, EAGLE: 2, ROCK: 2, DICE: 1, WHALE: 2 });
    expect(LIVE_TABLE_NINE).toHaveLength(8);
  });

  it("na šest míst od každého typu jednoho", () => {
    const cast = castTable(7, SIX_MAX_POSITION_ORDER, "CO");
    expect(count(cast)).toEqual({ SHARK: 1, EAGLE: 1, ROCK: 1, DICE: 1, WHALE: 1 });
  });

  it("stejný seed dá stejný stůl, různé seedy různé stoly", () => {
    expect(castTable(1234, POSITION_ORDER, "SB")).toEqual(castTable(1234, POSITION_ORDER, "SB"));
    const layouts = new Set(
      Array.from({ length: 20 }, (_, seed) => JSON.stringify(castTable(seed, POSITION_ORDER, "SB"))),
    );
    expect(layouts.size).toBeGreaterThan(10);
  });

  it("trénink proti typu přepíše jen soupeře ve hře", () => {
    const base = castTable(99, POSITION_ORDER, "BTN");
    const focused = castTable(99, POSITION_ORDER, "BTN", { focus: "WHALE", focusSeat: "CO" });
    expect(focused.CO).toBe("WHALE");
    for (const seat of POSITION_ORDER) {
      if (seat !== "CO") expect(focused[seat], seat).toBe(base[seat]);
    }
    // Hráčovo sedadlo typ nikdy nedostane.
    expect(castTable(99, POSITION_ORDER, "BTN", { focus: "ROCK", focusSeat: "BTN" }).BTN).toBeUndefined();
  });
});

describe("uspořádaný přesun", () => {
  const rows = (entries: Array<[string, number, number]>): ContinueRow[] => entries.map(
    ([hand, weight, continueFrequency]) => ({ hand, weight, continueFrequency }),
  );
  const share = (list: readonly ContinueRow[]) => {
    const total = list.reduce((sum, row) => sum + row.weight, 0);
    return list.reduce((sum, row) => sum + row.weight * row.continueFrequency, 0) / total;
  };
  const order = ["AA", "KK", "AKs", "QJs", "76s", "72o"];
  const base = rows([
    ["AA", 6, 1], ["KK", 6, 1], ["AKs", 4, 1], ["QJs", 4, 0.6], ["76s", 4, 0.3], ["72o", 12, 0],
  ]);

  it("trefí cílový souhrn přesně", () => {
    for (const target of [0, 0.1, 0.35, 0.5, 0.8, 1]) {
      expect(share(shiftContinueShare(base, order, target)), String(target)).toBeCloseTo(target, 9);
    }
  });

  it("kdo folduje víc, přestane pokračovat s nejslabšími a silné nechá", () => {
    // Ze souhrnu 0,544 na 0,45: ubere se 3,4 kombinace - celé 76s a většina QJs.
    const tighter = shiftContinueShare(base, order, 0.45);
    const byHand = new Map(tighter.map((row) => [row.hand, row.continueFrequency]));
    expect(byHand.get("76s")).toBe(0);
    expect(byHand.get("AA")).toBe(1);
    expect(byHand.get("KK")).toBe(1);
    expect(byHand.get("AKs")).toBe(1);
    expect(byHand.get("QJs")).toBeGreaterThan(0);
    expect(byHand.get("QJs")).toBeLessThan(0.6);
  });

  it("kdo callne víc, začne pokračovat s nejsilnějšími z foldovaných", () => {
    const looser = shiftContinueShare(base, order, 0.62);
    const byHand = new Map(looser.map((row) => [row.hand, row.continueFrequency]));
    expect(byHand.get("QJs")).toBe(1);
    expect(byHand.get("76s")).toBeGreaterThan(0.3);
    expect(byHand.get("72o")).toBe(0);
  });

  it("je zobecněním výřezu nejsilnějších: z plné range zbude nejsilnější podíl", () => {
    const full = rows([["AA", 6, 1], ["KK", 6, 1], ["AKs", 4, 1], ["72o", 12, 1]]);
    const sliced = shiftContinueShare(full, ["AA", "KK", "AKs", "72o"], 16 / 28);
    expect(sliced.map((row) => row.continueFrequency)).toEqual([1, 1, 1, 0]);
  });

  it("beze změny cíle nic nemění a vstup nepřepíše", () => {
    const before = JSON.stringify(base);
    expect(shiftContinueShare(base, order, share(base))).toEqual(base);
    expect(JSON.stringify(base)).toBe(before);
  });
});
