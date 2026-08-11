import { describe, expect, it } from "vitest";

import { profileTurnFamilies } from "../../src/data/ranges/turnFamilyAnomaly";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";

/**
 * Pomůcka pro čtenáře, ne náhrada za něj.
 *
 * Review drží veškerý solverový turn obsah na LOW a je to práce, kterou nikdo
 * jiný neudělá. Chyby, které jsme v tomhle obsahu doopravdy našli, měly ale
 * vždycky stejný tvar - posunuté rozdělení akcí přes celou rodinu, ne špatné
 * jednotlivé pravidlo - a právě to jde porovnat strojově.
 */
function pack(
  familyId: string,
  node: string,
  heroOutOfPosition: boolean,
  actions: Record<string, number>,
): TurnStrategyPack {
  return {
    familyIds: [familyId],
    id: familyId.toLowerCase(),
    rules: [{
      node,
      heroOutOfPosition,
      buckets: Object.entries(actions).map(([action, combos]) => ({
        action, combos, handClasses: ["AA"],
      })),
    }],
  } as unknown as TurnStrategyPack;
}

describe("odchylky mezi turn rodinami", () => {
  it("srovnává jen rodiny ve stejném uzlu a na stejné straně stolu", () => {
    // Tohle byla skutečná chyba první verze. U FACING_BET je „agrese" raise
    // proti sázce, u CBET sázka do checknutého potu, a hrdina mimo pozici bez
    // iniciativy checká skoro vždy. Srovnání všeho dohromady roztáhlo meze přes
    // celý obor a detektor neoznačil nic.
    const rows = profileTurnFamilies([
      pack("A", "CBET", false, { CHECK: 90, "BET 10": 10 }),
      pack("B", "CBET", false, { CHECK: 88, "BET 10": 12 }),
      pack("C", "CBET", false, { CHECK: 86, "BET 10": 14 }),
      pack("D", "FACING_BET", false, { FOLD: 20, CALL: 30, "RAISE 30": 50 }),
    ]);
    const cohorts = new Set(rows.map((row) => row.cohort));
    expect(cohorts.size).toBe(2);
    // Rodina, která je v jiné skupině sama, se nesrovnává s nikým.
    expect(rows.find((row) => row.familyId === "D")?.anomalies).toEqual([]);
  });

  it("označí rodinu, která proti sourozencům sází nápadně víc", () => {
    const rows = profileTurnFamilies([
      pack("A", "CBET", false, { CHECK: 90, "BET 10": 10 }),
      pack("B", "CBET", false, { CHECK: 88, "BET 10": 12 }),
      pack("C", "CBET", false, { CHECK: 86, "BET 10": 14 }),
      pack("VYCHYLENA", "CBET", false, { CHECK: 20, "BET 10": 80 }),
    ]);
    const odd = rows.find((row) => row.familyId === "VYCHYLENA");
    expect(odd?.anomalies.some((item) => item.kind === "AGGRESSION_HIGH")).toBe(true);
  });

  it("označí uzel, kde není co rozhodovat", () => {
    const rows = profileTurnFamilies([pack("A", "CBET", false, { CHECK: 100 })]);
    expect(rows[0].anomalies.some((item) => item.kind === "SINGLE_ACTION")).toBe(true);
  });

  it("nehlásí odchylku ve skupině, kde jsou dvě rodiny", () => {
    // Medián ze dvou čísel neříká nic a označit jedno z nich by bylo losování.
    const rows = profileTurnFamilies([
      pack("A", "CBET", true, { CHECK: 90, "BET 10": 10 }),
      pack("B", "CBET", true, { CHECK: 10, "BET 10": 90 }),
    ]);
    expect(rows.every((row) => row.anomalies.every((item) => (
      item.kind !== "AGGRESSION_HIGH" && item.kind !== "AGGRESSION_LOW"
    )))).toBe(true);
  });
});
