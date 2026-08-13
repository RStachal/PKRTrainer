import { beforeEach, describe, expect, it } from "vitest";

import { clearSolvedRiverPacksForTests } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import { createRiverSolvedStrategyResolverChain } from "../../src/data/ranges/riverStrategyResolver";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";

/**
 * Vyřešený river se skutečně dostane k odpovědi.
 *
 * Turn strávil týdny ve stavu, kdy existoval na disku, stahoval se a nikdo se ho
 * na nic nezeptal. Pojistka o patro výš hlídá, že runtime pro ulici s manifestem
 * umí vydat resolver; tenhle test jde dál a ptá se na konkrétní desku, na které
 * ten obsah vznikl.
 *
 * Druhá polovina je stejně důležitá: deska, kterou nikdo neřešil, musí dostat
 * `null`. Odpovědět na ni z rodiny odvedle by bylo horší než heuristika, protože
 * heuristika se aspoň jako heuristika označuje - tahle odpověď by nesla cedulku
 * SOLVER_BACKED.
 */
const board = (cards: readonly string[]) => cards.map((card) => ({
  rank: card[0] as never,
  suit: card[1] as never,
}));

const solvedInput: PostflopStrategyInput = {
  street: "RIVER",
  positionPattern: "SRP_BTN_VS_BB",
  potType: "SINGLE_RAISED",
  effectiveStackBB: 20,
  potBB: 16.8,
  board: board(["9s", "9h", "9d", "2c", "2d"]),
  heroHand: "66",
  actionNode: "RIVER_OOP_LEAD",
} as unknown as PostflopStrategyInput;

describe("vyřešený river odpovídá", () => {
  beforeEach(() => {
    clearSolvedRiverPacksForTests();
  });

  it("na desku, na které vznikl, vydá solverem podloženou akci", async () => {
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
    const answer = createRiverSolvedStrategyResolverChain()(solvedInput);

    expect(answer).not.toBeNull();
    const source = answer?.source;
    // Provenience je strukturální, ne odvozená ze slov: buď ji zdroj nese, nebo
    // to není solverem podložená odpověď.
    expect(source !== undefined && "provenance" in source ? source.provenance : null)
      .toBe("SOLVER_BACKED");
    // Vysvětlení je pro hráče: mluví o hloubce a o skupině ruk, ne o rodině,
    // packu ani adresáři.
    expect(answer?.explanation).toContain("Vyřešený river");
    expect(answer?.explanation.toLowerCase()).not.toContain("zdroj");
    expect(answer?.explanation).not.toContain("MTT9_");
    expect(answer?.explanation).not.toContain("artifacts");
  });

  it("na pátou kartu, kterou nikdo neřešil, neodpoví", async () => {
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
    const other = { ...solvedInput, board: board(["9s", "9h", "9d", "2c", "7h"]) };
    expect(createRiverSolvedStrategyResolverChain()(other)).toBeNull();
  });

  it("na jinou hloubku než vyřešenou neodpoví", async () => {
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
    // Po riveru už nic nenásleduje, takže hloubka se drží těsněji než u turnu:
    // rozdíl deseti blindů je rozdíl mezi sázkou za třetinu potu a za celý pot.
    const deep = { ...solvedInput, effectiveStackBB: 60 };
    expect(createRiverSolvedStrategyResolverChain()(deep)).toBeNull();
  });

  it("na jiné rozhodnutí, než uzel drží, neodpoví", async () => {
    // Tohle je vada, kterou tenhle resolver měl od začátku: deska seděla,
    // hloubka seděla, a hráči čelícímu sázce se vydala strategie pro hraní
    // první - s cedulkou, že to spočítal solver. Vyřešený uzel je jedno
    // rozhodnutí, ne odpověď na celou desku.
    //
    // Pack se pro tenhle test zúží na pravidla pro hraní první. Jinak by test
    // netvrdil nic o zábraně, jen o tom, že obsah pro čelící spoty zrovna
    // neexistuje - a ten už existuje.
    const packs = await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
    const leadOnly = packs.map((pack) => ({
      ...pack,
      rules: pack.rules.filter((rule) => rule.spot?.hero?.facingBet === false),
    }));
    expect(leadOnly.some((pack) => pack.rules.length > 0)).toBe(true);

    for (const actionNode of ["RIVER_FACING_BET", "RIVER_PRESSURE"]) {
      const other = { ...solvedInput, actionNode } as PostflopStrategyInput;
      expect(createRiverSolvedStrategyResolverChain(leadOnly)(other), actionNode).toBeNull();
    }
  });

  it("bez uvedeného rozhodnutí neodpoví", async () => {
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
    const bare = { ...solvedInput, actionNode: undefined } as PostflopStrategyInput;
    expect(createRiverSolvedStrategyResolverChain()(bare)).toBeNull();
  });

  it("bez načtených packů nevydá nic", () => {
    expect(createRiverSolvedStrategyResolverChain()(solvedInput)).toBeNull();
  });
});
