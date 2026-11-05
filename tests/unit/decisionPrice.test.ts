import { describe, expect, it } from "vitest";

import { decisionPrices } from "../../src/core/decisionPrice";

/**
 * Práh, ne hodnota.
 *
 * Tenhle test drží tři vlastnosti, na kterých stojí celý smysl modulu:
 * složení je základna bez požadavku, dorovnání se počítá z ceny, a zvýšení
 * z toho, kolik riskuje. Čtvrtá je stejně důležitá: **akce, kterou spot
 * neurčuje, se vynechá** - kdyby se vrátila s nulou, četlo by se to jako
 * „nepotřebuje nic".
 */
describe("cena rozhodnutí", () => {
  // BB čelí otevření 2,5x na 50 BB: pot 0,5 + 1 + 2,5, dorovnat 1,5.
  const facingOpen = { potBB: 4, toCallBB: 1.5 };

  it("dorovnání se počítá z pot odds", () => {
    const [price] = decisionPrices({ ...facingOpen, actions: ["CALL"], riskByAction: {} });
    expect(price.kind).toBe("EQUITY_NEEDED");
    expect(price.required).toBeCloseTo(0.2727, 4);
  });

  it("na bublině je tentýž call dražší", () => {
    const [price] = decisionPrices({
      ...facingOpen, actions: ["CALL"], riskByAction: {}, bubbleFactor: 1.35,
    });
    // Žeton získaný váží míň než ztracený, takže práh roste.
    expect(price.requiredWithIcm).toBeGreaterThan(price.required!);
    expect(price.requiredWithIcm).toBeCloseTo(0.336, 2);
  });

  it("zvýšení se počítá z toho, kolik riskuje", () => {
    const [price] = decisionPrices({
      ...facingOpen, actions: ["3BET"], riskByAction: { "3BET": 6.5 },
    });
    expect(price.kind).toBe("FOLDS_NEEDED");
    expect(price.required).toBeCloseTo(0.619, 3);
  });

  it("složení je základna bez požadavku", () => {
    const [price] = decisionPrices({ ...facingOpen, actions: ["FOLD"], riskByAction: {} });
    expect(price).toEqual({ action: "FOLD", kind: "BASELINE" });
  });

  it("akce, kterou spot neurčuje, se vynechá, ne vynuluje", () => {
    const prices = decisionPrices({
      potBB: 1.5, toCallBB: 0, actions: ["CALL", "3BET", "FOLD"], riskByAction: {},
    });
    expect(prices.map((price) => price.action)).toEqual(["FOLD"]);
  });

  it("frekvence ze zdroje se veze s akcí, ale prahu se nedotýká", () => {
    const [price] = decisionPrices({
      ...facingOpen, actions: ["CALL"], riskByAction: {}, sourceShareByAction: { CALL: 50 },
    });
    expect(price.sourceShare).toBe(50);
    expect(price.required).toBeCloseTo(0.2727, 4);
  });
});
