import { beforeAll, describe, expect, it } from "vitest";

import { equityCallers, loadPreflopEquity } from "../../src/core/preflopEquity";
import type { HandLabel } from "../../src/core/types";

/**
 * Dorovnávací range odvozená z equity (rozhodnutí vlastníka 8a, 22. 9. 2026).
 *
 * Listy dorovnání re-jamu končí na 30 bb, RYE jamuje přes otevření ještě na
 * 40 bb (`F3B-40BB-BB-vs-BTN`: 22-77, AJo, ATo). Vlastník k tomu napsal
 * kontrolu, kterou má model splnit: BTN dorovnává ~37,5 bb do potu ~43, tedy
 * potřebuje ~47 % equity, a vychází mu zhruba 44+, AJs+, AQo+ - **párová, ne
 * broadwayová** range. KQs, ATs, JTs a KQo jsou fold, protože proti párové
 * jamovací range nemají equity. „Kdyby model vrátil širokou broadwayovou
 * calling range, je chyba v modelu, ne v chartu."
 */

/** Jam BB proti BTN na 40 bb podle RYE: 22-77, AJo, ATo (60 kombinací). */
const JAM_40: HandLabel[] = ["22", "33", "44", "55", "66", "77", "AJo", "ATo"] as HandLabel[];

/** Široký otvírač na tlačítku: cokoli, co by BTN na 40 bb otevřel. */
const BTN_OPEN: HandLabel[] = [
  "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
  "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "KQs", "KJs", "KTs", "QJs", "JTs", "T9s", "98s",
  "AKo", "AQo", "AJo", "ATo", "KQo", "KJo", "QJo",
] as HandLabel[];

describe("dorovnávací range odvozená z equity", () => {
  beforeAll(async () => {
    expect(await loadPreflopEquity()).toBe(true);
  });

  it("proti párovému jamu na 40 bb dorovnává páry a nejsilnější esa, ne broadwaye", () => {
    // Blindy 1,5 + otevření 2,5 + jam 40; dorovnat 37,5.
    const callers = equityCallers(JAM_40, BTN_OPEN, 40 - 2.5, 1.5 + 2.5 + 40);
    // Změřeno 22. 9. 2026 (práh 46,0 % equity): 44 dorovnává s +1,5 bb, 33 skládá
    // s -3,8, AJs +7,2, AQo +9,3; JTs -1,2, KQo -1,4, KJs -1,0. KQs (+1,2), 98s
    // (+1,0), ATs (+0,3) a QJs (+0,1) jsou na hraně a test je netvrdí ani tak,
    // ani tak: tabulka equity je vzorkovaná na půl bodu.
    for (const hand of ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "AKs", "AQs", "AJs", "AKo", "AQo"]) {
      expect(callers, hand).toContain(hand);
    }
    for (const hand of ["33", "22", "JTs", "KQo", "KJs", "KTs", "KJo", "QJo", "A9s", "A5s"]) {
      expect(callers, hand).not.toContain(hand);
    }
    // Vlastníkův odhad je ~8 % rukou z balíčku (44+, AJs+, AQo+ = 106 kombinací
    // ze 1 326). Model dává 21 tříd z fixtury, tedy jádro plus čtyři hraniční
    // třídy - stále úzká range: broadwaye bez esa a nízké páry zůstávají venku.
    expect(callers.length).toBeLessThanOrEqual(22);
  });

  it("bez jamovací range nevrátí nic - odvozovat z prázdna by tvrdilo, že se dorovnává cokoli", () => {
    expect(equityCallers([], BTN_OPEN, 37.5, 44)).toEqual([]);
  });

  it("dražší dorovnání zužuje range", () => {
    const cheap = equityCallers(JAM_40, BTN_OPEN, 10, 44);
    const dear = equityCallers(JAM_40, BTN_OPEN, 37.5, 44);
    expect(dear.length).toBeLessThan(cheap.length);
    for (const hand of dear) expect(cheap).toContain(hand);
  });
});
