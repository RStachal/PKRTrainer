import { describe, expect, it } from "vitest";

import { readableAction } from "../../src/data/ranges/turnReviewDigest";

/**
 * Akce ve výpisu ke čtení, v blindech.
 *
 * Solver píše `BET 17.000000` - šest desetinných míst, která nic neznamenají, a
 * částku v žetonech, kdežto celý produkt mluví v blindech. Čtení rodiny je práce
 * na hodiny a tohle si u každého řádku převádí člověk v hlavě.
 *
 * Blind se dopočítá z pravidla samotného (`potChips / potBB`), ne z konfigurace.
 */
const spot = (potChips: number, potBB: number) => ({ potChips, potBB });

describe("čitelná akce", () => {
  it("převede částku na blindy", () => {
    // 65 žetonů na 10 BB je blind 6,5; sázka 17 žetonů je tedy 2,6 BB.
    expect(readableAction("BET 17.000000", spot(65, 10))).toBe("BET 2.6 BB (26 % potu)");
  });

  it("procenta potu počítá ze žetonů, ne z blindů", () => {
    // Podíl je bezrozměrný, takže vyjde stejně; tenhle případ hlídá, že se
    // nepomíchají jednotky a nevznikne procento ze dvou různých měřítek.
    expect(readableAction("BET 50.000000", spot(100, 20))).toBe("BET 10.0 BB (50 % potu)");
  });

  it("u zvýšení procenta nepočítá", () => {
    // `RAISE 133` znamená "na 133", ne "o 133", a pot je v tu chvíli jiný než ten
    // na uzlu. Podíl by se vztahoval k něčemu jinému, než co čtenář vidí.
    expect(readableAction("RAISE 133.000000", spot(65, 10))).toBe("RAISE 20.5 BB");
  });

  it("bez převodu jednotku přizná, místo aby ji zamlčela", () => {
    // Tvářit se, že jsou to blindy, je horší než přiznat žetony.
    expect(readableAction("BET 17.000000")).toBe("BET 17 žetonů");
    expect(readableAction("BET 17.000000", spot(65, 0))).toBe("BET 17 žetonů");
  });

  it("akce bez částky nechá být", () => {
    for (const action of ["CHECK", "CALL", "FOLD", "ALLIN"]) {
      expect(readableAction(action, spot(65, 10))).toBe(action);
    }
  });

  it("tatáž sázka ve dvou spotech dá stejné blindy", () => {
    // Kvůli tomuhle se převádí po pravidlech: souhrnné rozdělení pak sloučí
    // stejné sázky správně, i když se poměr žetonů na blind mírně liší
    // zaokrouhlením `potBB`.
    expect(readableAction("BET 26.000000", spot(65, 10)))
      .toBe(readableAction("BET 26.000000", spot(65.2, 10.03)));
  });
});
