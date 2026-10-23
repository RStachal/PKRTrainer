import { describe, expect, it } from "vitest";

import {
  MODULE_BUDGET_BYTES,
  trimToModuleBudget,
} from "../../scripts/lib/solvedPackBuilding.mts";

/**
 * Strop generovaných modulů se měří v bajtech, ne v pravidlech.
 *
 * Všechny tři generátory se dosud řídily počtem pravidel (`RULE_BUDGET`), jenže
 * rozpočet svazku je v kilobajtech a velikost jednoho pravidla se rodinu od
 * rodiny liší podle toho, kolik kombinací nese. Proxy neplatila a bylo to vidět
 * až po sestavení: `MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR` se vešla do tří set
 * pravidel a vyrobila modul o 527 KiB proti limitu 512.
 */
describe("ořez modulu na rozpočet", () => {
  // Deset bajtů na pravidlo, ať se dá počítat z hlavy.
  const sizeOf = (rules: readonly number[]) => rules.length * 10;

  it("co se vejde, nechá být", () => {
    const rules = [1, 2, 3];
    expect(trimToModuleBudget(rules, sizeOf, 100)).toEqual({ kept: [1, 2, 3], dropped: 0 });
  });

  it("ořeže právě tolik, aby se to vešlo", () => {
    const rules = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const fitted = trimToModuleBudget(rules, sizeOf, 55);
    // 55 bajtů uveze pět pravidel, ne šest.
    expect(fitted.kept).toEqual([1, 2, 3, 4, 5]);
    expect(fitted.dropped).toBe(5);
    expect(sizeOf(fitted.kept)).toBeLessThanOrEqual(55);
  });

  it("ořezává od konce, aby nezahodil rozdělení mezi rozhodnutí", () => {
    // Pořadí, ve kterém pravidla přijdou, je výsledkem rozdělení rozpočtu mezi
    // jednotlivá rozhodnutí rovným dílem. Kdyby se ořezávalo podle velikosti
    // nebo se přeskládalo, mohla by rodina skončit s jedním rozhodnutím
    // pokrytým a ostatními prázdnými.
    const rules = ["cbet", "lead", "facing", "cbet2", "lead2", "facing2"];
    const fitted = trimToModuleBudget(rules, (r) => r.length * 10, 39);
    expect(fitted.kept).toEqual(["cbet", "lead", "facing"]);
  });

  it("zvládne rozpočet, do kterého se nevejde nic", () => {
    expect(trimToModuleBudget([1, 2, 3], sizeOf, 5)).toEqual({ kept: [], dropped: 3 });
  });

  it("prázdný vstup projde", () => {
    expect(trimToModuleBudget([], sizeOf, 100)).toEqual({ kept: [], dropped: 0 });
  });

  it("strop má rezervu pod rozpočtem svazku", () => {
    // Rozpočet měří hotový JS chunk, tohle měří JSON před sestavením. Kdyby si
    // ta dvě čísla byla rovna, generátor by mířil přesně na hranu.
    expect(MODULE_BUDGET_BYTES).toBeLessThan(512 * 1024);
    expect(MODULE_BUDGET_BYTES).toBeGreaterThan(400 * 1024);
  });
});
