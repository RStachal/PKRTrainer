import { describe, expect, it } from "vitest";

import { planLanes } from "../../scripts/lib/laneBudget.mts";

/**
 * Pruhy a haldy cyklu packů.
 *
 * Podlahy a strop jsou tytéž jako v `runAfterNight.mts`. Čísla v prvním testu
 * jsou skutečný řádek z ranního cyklu 21. 10. 2026: „2 pruhy (river 13057 MB,
 * flop 4865 MB, turn 3841 MB), volno 19.5 GB" - u běhu, který generoval jen
 * flop. Těžká rodina pak se 4,9 GB haldy běžela 112 minut místo pěti.
 */
const FLOORS = { river: 12288, flop: 4096, turn: 3072 };
const base = { reserveGb: 2, floorsMb: FLOORS, ceilingMb: 16384 };

describe("planLanes", () => {
  it("všechny tři ulice: dva pruhy a zbytek rovným dílem - tak jako dosud", () => {
    const plan = planLanes({ ...base, freeGb: 19.5, wanted: ["flop", "turn", "river"] });
    expect(plan.lanes).toBe(2);
    expect(plan.heapMb.get("river")).toBe(13056);
    expect(plan.heapMb.get("flop")).toBe(4864);
  });

  it("jen flop: jeden pruh a halda až ke stropu, ne podlaha plus drobek", () => {
    const plan = planLanes({ ...base, freeGb: 19.5, wanted: ["flop"] });
    expect(plan.lanes).toBe(1);
    expect(plan.heapMb.get("flop")).toBe(16384);
  });

  it("flop a turn bez riveru se vejdou oba a dostanou víc než podlahu", () => {
    const plan = planLanes({ ...base, freeGb: 19.5, wanted: ["flop", "turn"] });
    expect(plan.lanes).toBe(2);
    // 17,5 GB po rezervě, minus podlahy 4 096 + 3 072, zbytek napůl.
    expect(plan.heapMb.get("flop")).toBe(Math.floor(4096 + (17.5 * 1024 - 7168) / 2));
  });

  it("málo paměti: jeden pruh se pustí i pod podlahou, cyklus musí proběhnout", () => {
    const plan = planLanes({ ...base, freeGb: 4, wanted: ["flop", "turn", "river"] });
    expect(plan.lanes).toBe(1);
    expect(plan.heapMb.get("river")).toBe(12288);
  });

  it("ruční přepis počtu pruhů platí jen do počtu ulic, které se generují", () => {
    expect(planLanes({ ...base, freeGb: 19.5, wanted: ["flop"], lanesOverride: 3 }).lanes).toBe(1);
    expect(planLanes({ ...base, freeGb: 19.5, wanted: ["flop", "turn", "river"], lanesOverride: 3 }).lanes).toBe(3);
  });
});
