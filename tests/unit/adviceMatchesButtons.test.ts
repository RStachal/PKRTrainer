import { describe, expect, it } from "vitest";

import { buildPool } from "../../src/core/drillEngine";
import { rangeStore } from "../../src/data/rangeStore";

/**
 * Rada po odpovědi musí jmenovat akci stejně jako tlačítko.
 *
 * Zdůvodnění mělo vlastní mapu popisků a lišila se od té, ze které se dělají
 * tlačítka. Změřeno 27. 8. 2026 na celém poolu: **8 366 z 78 585 spotů
 * (10,65 %)** radilo jiným slovem, než jaké stálo na tlačítku - „Doporučení:
 * Jam" proti tlačítku „All-in", „Open 2.5x" proti „Raise 2.5x".
 *
 * Není to špatná rada, je to dvojí slovník na jedné obrazovce. Mapy jsou teď
 * sdílené (`actionKeyLabels`) a tenhle test hlídá, že se zase nerozejdou -
 * včetně případu, kdy někdo přidá novou akci a popisek jen v jedné z nich.
 */
describe("rada jmenuje akci stejně jako tlačítko", () => {
  const filters = {
    positions: [], buckets: [], contexts: [], ante: "OFF", scoringMode: "LENIENT",
  } as never;

  it("na každém spotu poolu", () => {
    const contexts = ["RFI", "VS_OPEN", "VS_3BET", "VS_4BET", "VS_LIMP", "SQUEEZE", "PUSH_FOLD", "VS_ALLIN"] as const;
    const mismatches: string[] = [];
    let checked = 0;
    for (const context of contexts) {
      for (const spot of buildPool(20260827, context, filters, rangeStore)) {
        // Doporučení končí tečkou, po které následuje mezera a velké písmeno -
        // jinak by se ukousla desetinná tečka ve „2.5x".
        const match = /Doporučení: (.+?)\.\s+[A-ZČŠŽ]/.exec(spot.explanation);
        if (match === null) continue;
        checked += 1;
        const labelOf = new Map(spot.answers.map((answer) => [answer.key, answer.label]));
        const graded = spot.strictCorrect.map((key) => labelOf.get(key) ?? `?${key}`);
        if (!graded.includes(match[1].trim())) {
          if (mismatches.length < 5) {
            mismatches.push(`${spot.id}: rada "${match[1].trim()}" vs tlačítko ${graded.join(" / ")}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(mismatches).toEqual([]);
  });
});
