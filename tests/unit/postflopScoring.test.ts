import { describe, expect, it } from "vitest";

import { gradePostflopAction } from "../../src/core/postflopScoring";

/**
 * Akce, kterou vyřešený obsah nemodeluje.
 *
 * Solver na uzlu nemusí mít větev, kterou trenažér nabízí - typicky zvýšení na
 * riveru, kde měl strom jen dorovnání a složení. Označit takovou volbu za chybu
 * znamená tvrdit, že je horší, a to nikdo nespočítal. Změřeno 23. 8. 2026: na
 * 300 rozdaných riverových spotech se to týkalo 104 z nich.
 */
describe("volba mimo vyřešený strom", () => {
  const spot = {
    recommendedAction: "CALL" as const,
    actionEvs: {
      source: "SOLVED_TREE" as const,
      unit: "BB" as const,
      equivalentThresholdBb: 0.1,
      acceptableThresholdBb: 0.3,
      values: [
        { action: "CALL" as const, evBb: 3.4 },
        { action: "FOLD" as const, evBb: 0 },
      ],
    },
  };

  it("neoznačí ji za chybu hráče, ale ani za správnou odpověď", () => {
    const grade = gradePostflopAction(spot, "RAISE");
    expect(grade.unsolved, "musí být rozpoznatelná zvlášť").toBe(true);
    expect(grade.correct).toBe(false);
    // Bez EV se nedá říct nic o tom, jak dobrá ta volba je.
    expect(grade.actionEv).toBeUndefined();
  });

  it("akci, kterou obsah zná, známkuje dál podle EV", () => {
    const grade = gradePostflopAction(spot, "FOLD");
    expect(grade.unsolved).toBeUndefined();
    expect(grade.actionEv?.outcome).toBe("MISTAKE");
  });

  it("bez EV se nic za nespočítané neoznačuje", () => {
    // Spot bez sady EV se známkuje proti doporučení jako dřív; tvrdit tam
    // "nespočítáno" by bylo vymyšlené.
    const grade = gradePostflopAction({ recommendedAction: "CALL" }, "RAISE");
    expect(grade.unsolved).toBeUndefined();
    expect(grade.correct).toBe(false);
  });
});
