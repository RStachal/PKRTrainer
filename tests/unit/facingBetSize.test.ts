import { describe, expect, it } from "vitest";

import { facingBetBB } from "../../src/data/ranges/facingBetSize";

/**
 * Velikost čelené sázky ze skutečné solverové linie.
 *
 * Tři věci, které by se tu daly tiše rozbít, a každá by hráči ukázala cenu
 * jiného spotu: sázka přičtená k potu podruhé, raise dorovnaný celý místo
 * rozdílu, a převod na blindy z konstanty místo z poměru.
 */
describe("cena dorovnání z vyřešené linie", () => {
  const base = { hero: { facingBet: true }, potChips: 175, potBB: 26.9 };

  it("po checku se dorovnává celá sázka", () => {
    // 75 žetonů při 6,5 žetonu na blind je 11,5 BB.
    expect(facingBetBB({ ...base, priorLine: ["BET 25.000000", "CALL", "CHECK", "BET 75.000000"] }))
      .toBeCloseTo(11.54, 1);
  });

  it("proti raisi se dorovnává rozdíl, ne celý raise", () => {
    // Hrdina vsadil 75, soupeř zvýšil na 225: doplácí 150, ne 225.
    const raised = facingBetBB({
      ...base, potChips: 375, potBB: 57.7,
      priorLine: ["CHECK", "BET 75.000000", "RAISE 225.000000"],
    });
    expect(raised).toBeCloseTo(150 / (375 / 57.7), 1);
  });

  it("bez čelené sázky nevrací nic", () => {
    expect(facingBetBB({ ...base, hero: { facingBet: false }, priorLine: ["CHECK", "CHECK"] }))
      .toBeUndefined();
  });

  it("linie, která nekončí sázkou, nevrací nic", () => {
    expect(facingBetBB({ ...base, priorLine: ["BET 25.000000", "CALL"] })).toBeUndefined();
  });

  it("chybějící pot nevrací odhad", () => {
    expect(facingBetBB({ hero: { facingBet: true }, priorLine: ["CHECK", "BET 75.000000"] }))
      .toBeUndefined();
  });
});
