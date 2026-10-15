import { describe, expect, it } from "vitest";

import type { PostflopStrategyResolver } from "../../src/core/postflopGenerator";
import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import { solvedBetSizing } from "../../src/data/ranges/solvedBetSizing";

/**
 * „Bank po akci" v lince musí odpovídat velikosti, kterou ukazuje tlačítko.
 *
 * Do 15. 10. 2026 simulátor posouval pot modelem 0,33 / 0,75 natvrdo, kdežto
 * tlačítko bralo velikost ze stromu přes tabulku velikostí - u 63 z 63 rodin
 * byla `BET_BIG` ve stromě 0,50. Vlastník rozhodl nechat všechny čtyři
 * velikosti ze stromů (0,25, 0,33, 0,5, 0,75), takže se teď obě místa ptají
 * `solvedBetSizing`.
 *
 * ## Proč falešný resolver
 *
 * Tabulka velikostí se klíčuje rodinou z **pilotního** id pravidla
 * (`mtt9_…_srp-…`). Vyřešená turnová a riverová pravidla mají id
 * `RODINA__deska`, které `familyIdFromRuleId` nepozná, a bez načtených pilotů
 * odpovídá flopu heuristika bez rodiny - test nad reálnými linkami tak napoprvé
 * nenašel ani jeden případ (dvakrát, na turnu i na flopu). Proto pravidlo
 * podstrčené přímo, pro rodinu, kterou tabulka zná.
 */

const PILOT_RULE = "mtt9_100bb_btn_bb_srp_facing_highspr-test-bet";

function pilotResolver(
  action: "BET_SMALL" | "BET_BIG",
  ruleId = PILOT_RULE,
): PostflopStrategyResolver {
  return () => ({
    action,
    explanation: "test",
    source: {
      kind: "STRATEGY_PACK",
      provenance: "SOLVER_BACKED",
      packId: "test-pack",
      packVersion: "test",
      packVerifiedAt: "2026-10-15",
      ruleId,
      confidence: "MEDIUM",
      matchedTextures: [],
      sprMin: 0,
      sprMax: 99,
      positionPattern: "BTN_VS_BB",
      sourceUrls: [],
      assumptions: [],
      selectionScore: 1,
      tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
    } as never,
  });
}

const heroCards = [{ rank: "A", suit: "s" }, { rank: "K", suit: "s" }];
const board = [
  { rank: "7", suit: "h" }, { rank: "4", suit: "d" }, { rank: "2", suit: "c" },
  { rank: "9", suit: "s" }, { rank: "Q", suit: "h" },
];
const roundTenths = (value: number): number => Math.round(value * 10) / 10;

describe("velikost hrdinovy sázky v lince", () => {
  it("vsadí velikost ze stromu, kterou ukazuje tlačítko - ne model", () => {
    const source = pilotResolver("BET_SMALL")({} as never)?.source;
    const solved = solvedBetSizing(source, "BET_SMALL");
    // Rodina má malou sázku ve stromě až 0,75 potu - model by dal 0,33.
    expect(solved?.ratio).toBe(0.75);

    const line = generatePostflopLine({
      seed: 7,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 100,
      strategyResolver: pilotResolver("BET_SMALL"),
      allowFallback: true,
    } as never);

    const bets = line.streets.flatMap((street) => street.actionHistory)
      .filter((step) => step.action === "BET_SMALL");
    expect(bets.length).toBeGreaterThan(0);

    for (const step of bets) {
      const heroBet = step.sequence?.find((item) => item.actor === "HERO" && item.action === "BET_SMALL");
      expect(heroBet, step.street).toBeDefined();
      const expected = Math.min(step.effectiveStackBBBefore, roundTenths(step.potBBBefore * 0.75));
      const model = Math.min(step.effectiveStackBBBefore, roundTenths(step.potBBBefore * 0.33));
      expect(heroBet?.amountBB, step.street).toBeCloseTo(expected, 1);
      // Falsifikace: kdyby simulátor pořád jel modelem, tady by to spadlo.
      expect(heroBet?.amountBB, step.street).not.toBeCloseTo(model, 1);
    }
  });

  it("bez známé rodiny zůstává záloha na model", () => {
    const line = generatePostflopLine({
      seed: 7,
      heroCards,
      board,
      potBB: 6,
      effectiveStackBB: 100,
      // Pravidlo, které tabulka velikostí nezná - stejně jako heuristika.
      strategyResolver: pilotResolver("BET_SMALL", "unknown_family-test-bet"),
      allowFallback: true,
    } as never);
    const bets = line.streets.flatMap((street) => street.actionHistory)
      .filter((step) => step.action === "BET_SMALL");
    expect(bets.length).toBeGreaterThan(0);
    for (const step of bets) {
      const heroBet = step.sequence?.find((item) => item.actor === "HERO" && item.action === "BET_SMALL");
      const model = Math.min(step.effectiveStackBBBefore, roundTenths(step.potBBBefore * 0.33));
      expect(heroBet?.amountBB, step.street).toBeCloseTo(model, 1);
    }
  });
});
