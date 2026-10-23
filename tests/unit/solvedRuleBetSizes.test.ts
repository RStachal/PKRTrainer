import { describe, expect, it } from "vitest";

import type {
  PostflopRecommendationSource,
  PostflopSolvedBetSizing,
} from "../../src/core/postflopGenerator";
import { ruleBetSizes, solvedBetSizing } from "../../src/data/ranges/solvedBetSizing";
import { translateTurnActions } from "../../src/data/ranges/turnActionTranslation";

/**
 * Velikost hrdinovy sázky z akcí samotného vyřešeného uzlu.
 *
 * Do 15. 10. 2026 se velikost četla jen z tabulky rodin podle id pravidla, a
 * vyřešená pravidla (flop, turn, river z rozkladu) mají id `RODINA__deska`,
 * které tabulka nepozná. Na vyřešeném spotu proto tlačítko i „Bank po akci"
 * jely na modelu 0,33 / 0,75, přestože pack nesl skutečnou velikost.
 *
 * Fixtury jsou první pravidla tří dodávaných packů, akce i pot a stack beze
 * změny - aby test mluvil o datech, která hráč dostává.
 */

const sizesOf = (labels: string[], potChips: number, stackChips: number) => (
  ruleBetSizes(translateTurnActions(labels, potChips).actions, potChips, stackChips)
);

describe("velikosti sázek z vyřešeného uzlu", () => {
  it("turn: třetina potu je malá sázka, sázka za celý stack je all-in", () => {
    // mtt9-25bb-lj-co-srp: pot 1100, stack 1975.
    expect(sizesOf(["CHECK", "BET 363.000000", "BET 1975.000000"], 1100, 1975)).toEqual({
      BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 },
      BET_BIG: { ratio: 1, allIn: true, merged: 1 },
    });
  });

  it("flop: půl potu je velká sázka a vedle shovu ji tlačítko popisuje", () => {
    // mtt9-100bb-btn-bb-srp-facing-highspr (flop): pot 50, stack 650. Model by
    // velkou sázku ukázal jako tři čtvrtiny potu.
    expect(sizesOf(["CHECK", "BET 25.000000", "BET 650.000000"], 50, 650)).toEqual({
      BET_BIG: { ratio: 0.5, allIn: false, merged: 2 },
    });
  });

  it("river: tři velikosti na dvou tlačítkách, největší skutečná sázka vyhrává", () => {
    // mtt9-100bb-btn-bb-srp-facing-highspr (river): pot 100, stack 625.
    expect(sizesOf(["CHECK", "BET 33.000000", "BET 75.000000", "BET 625.000000"], 100, 625)).toEqual({
      BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 },
      BET_BIG: { ratio: 0.75, allIn: false, merged: 2 },
    });
  });

  it("uzel bez sázek nedá žádnou velikost; bez potu uzlu se neodhaduje", () => {
    expect(sizesOf(["CALL", "RAISE 868.000000", "FOLD"], 550, 2068)).toEqual({});
    expect(ruleBetSizes(translateTurnActions(["BET 33.000000"], 100).actions, undefined, 625))
      .toBeUndefined();
  });
});

describe("solvedBetSizing a vyřešené pravidlo", () => {
  const source = (
    heroBetSizes?: Partial<Record<"BET_SMALL" | "BET_BIG", PostflopSolvedBetSizing>>,
  ): PostflopRecommendationSource => ({
    kind: "STRATEGY_PACK",
    provenance: "SOLVER_BACKED",
    packId: "test",
    packVersion: "test",
    packVerifiedAt: "2026-10-15",
    // Id vyřešeného pravidla: tabulka rodin ho nepozná.
    ruleId: "MTT9_25BB_LJ_CO_SRP__742r",
    confidence: "MEDIUM",
    matchedTextures: [],
    sprMin: 1.8,
    sprMax: 1.8,
    positionPattern: "SRP_LJ_VS_CO" as never,
    sourceUrls: [],
    assumptions: [],
    selectionScore: 0,
    tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
    ...(heroBetSizes === undefined ? {} : { heroBetSizes }),
  });

  it("bere velikost z pravidla", () => {
    const sizes = { BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 } };
    expect(solvedBetSizing(source(sizes), "BET_SMALL")).toEqual(sizes.BET_SMALL);
  });

  it("tlačítko, které uzel nenabízí, nemá velikost - model, ne tabulka cizí rodiny", () => {
    expect(solvedBetSizing(source({ BET_SMALL: { ratio: 0.33, allIn: false, merged: 1 } }), "BET_BIG"))
      .toBeUndefined();
  });

  it("dvojče: bez velikostí v pravidle se vyřešené id v tabulce nenajde", () => {
    // Přesně tohle se dělo do 15. 10. 2026 u všech vyřešených spotů.
    expect(solvedBetSizing(source(), "BET_SMALL")).toBeUndefined();
  });
});
