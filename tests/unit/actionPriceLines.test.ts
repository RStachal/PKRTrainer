// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { priceLabel, revealActionPriceLines } from "../../src/ui/actionPriceLines";
import type { DecisionPrice } from "../../src/core/decisionPrice";

/**
 * Řádek s cenou pod tlačítkem.
 *
 * Dvě věci, které se tu dají tiše rozbít a obojí by hráč odnesl: text, který
 * zní jako výnos místo prahu, a číslo přilepené k akci, ke které nepatří.
 */
function button(action: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.dataset.action = action;
  return node;
}

describe("řádek s cenou", () => {
  it("dorovnání mluví o ekvitě, zvýšení o složení", () => {
    expect(priceLabel({ action: "CALL", kind: "EQUITY_NEEDED", required: 0.2727 } as DecisionPrice))
      .toBe("≥ 27 % ekvity");
    expect(priceLabel({ action: "3BET", kind: "FOLDS_NEEDED", required: 0.619 } as DecisionPrice))
      .toBe("≥ 62 % složení");
  });

  it("pod deseti procenty se drží desetina, výš už ne", () => {
    // Předstírat u 62 % desetiny je přesnost, kterou ten odhad nemá; u 4,2 %
    // by naopak zaokrouhlení na celá čísla smazalo rozdíl mezi 4 a 5.
    expect(priceLabel({ action: "CALL", kind: "EQUITY_NEEDED", required: 0.042 } as DecisionPrice))
      .toBe("≥ 4,2 % ekvity");
  });

  it("na bublině se ukáže ten vyšší práh, ne oba", () => {
    const label = priceLabel({
      action: "CALL", kind: "EQUITY_NEEDED", required: 0.273, requiredWithIcm: 0.336,
    } as DecisionPrice);
    expect(label).toBe("≥ 34 % ekvity");
  });

  it("složení nemá práh, takže zůstane prázdné", () => {
    const fold = button("FOLD");
    const shown = revealActionPriceLines([fold], [{ action: "FOLD", kind: "BASELINE" } as DecisionPrice]);
    expect(shown).toBe(0);
    expect(fold.querySelector(".action-price")?.textContent).toBe("");
  });

  it("cena sedne na svou akci, ne na sousední tlačítko", () => {
    const call = button("CALL");
    const raise = button("3BET");
    revealActionPriceLines([call, raise], [
      { action: "CALL", kind: "EQUITY_NEEDED", required: 0.2727 } as DecisionPrice,
      { action: "3BET", kind: "FOLDS_NEEDED", required: 0.619 } as DecisionPrice,
    ]);
    expect(call.dataset.actionPrice).toBe("≥ 27 % ekvity");
    expect(raise.dataset.actionPrice).toBe("≥ 62 % složení");
  });

  it("text neobsahuje nic vnitřního ani slovo EV", () => {
    // EV je jiné tvrzení a nesmí se s prahem splést ani slovem.
    for (const label of [
      priceLabel({ action: "CALL", kind: "EQUITY_NEEDED", required: 0.3 } as DecisionPrice),
      priceLabel({ action: "JAM", kind: "FOLDS_NEEDED", required: 0.5 } as DecisionPrice),
    ]) {
      expect(label).not.toContain("EV");
      for (const forbidden of ["CALL", "JAM", "3BET", "pack", "zdroj"]) {
        expect(label).not.toContain(forbidden);
      }
    }
  });
});
