import { beforeEach, describe, expect, it } from "vitest";

import { clearSolvedFlopPacksForTests } from "../../src/data/ranges/flopSolvedRuntimeRegistry";
import { loadSolvedFlopPacks } from "../../src/data/ranges/flopSolvedStrategyPacks";
import { createFlopSolvedStrategyResolverChain } from "../../src/data/ranges/flopSolvedStrategyResolver";
import type { PostflopStrategyInput } from "../../src/core/postflopGenerator";

/**
 * Vyřešený flop odpovídá na desku, kterou někdo spočítal.
 *
 * Flopová strategie ležela v týchž checkpointech, ze kterých se dosud bral jen
 * turn: kořen souboru je flopový akční uzel se strategií po kombinacích. Dosud
 * se z něj četl strom a strategie se zahodila.
 *
 * Odmítání je zase důležitější polovina. Za tímhle resolverem stojí texturní
 * agregát, který odpovídá skoro vždycky - takže vydat odpověď na desku, kterou
 * nikdo neřešil, by nebylo „lepší než nic", ale horší než to, co tam bylo.
 */
const PROFILE = "FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF";

const board = (cards: readonly string[]) => cards.map((card) => ({
  rank: card[0] as never,
  suit: card[1] as never,
}));

describe("vyřešený flop odpovídá", () => {
  beforeEach(() => {
    clearSolvedFlopPacksForTests();
  });

  it("na desku, na které vznikl, vydá solverem podloženou akci", async () => {
    const packs = await loadSolvedFlopPacks(PROFILE);
    expect(packs.length).toBeGreaterThan(0);
    const rule = packs[0].rules[0];
    const hero = rule.spot!.hero!;

    const answer = createFlopSolvedStrategyResolverChain()({
      street: "FLOP",
      textures: [],
      board: board(rule.flopSpot.flop),
      potType: rule.potType,
      potBB: rule.spot!.potBB,
      effectiveStackBB: rule.stackBB,
      positionPattern: rule.positionPattern,
      heroOutOfPosition: hero.side === "OOP",
      actionNode: hero.facingBet
        ? "FLOP_FACING_BET"
        : hero.isAggressor
          ? (rule.potType === "THREE_BET_POT" ? "THREE_BET_POT_CBET" : "SINGLE_RAISED_POT_CBET")
          : "FLOP_OOP_LEAD",
      heroHand: rule.buckets[0].handClasses[0],
    } as unknown as PostflopStrategyInput);

    expect(answer).not.toBeNull();
    const source = answer?.source;
    expect(source !== undefined && "provenance" in source ? source.provenance : null)
      .toBe("SOLVER_BACKED");
    // Text je pro hráče: česky, bez rodin a adresářů.
    expect(answer?.explanation).toContain("Vyřešený flop");
    expect(answer?.explanation).not.toContain("MTT9_");
  });

  it("na desku, kterou nikdo neřešil, neodpoví", async () => {
    const packs = await loadSolvedFlopPacks(PROFILE);
    const rule = packs[0].rules[0];
    const hero = rule.spot!.hero!;

    const answer = createFlopSolvedStrategyResolverChain()({
      street: "FLOP",
      textures: [],
      // Tři karty, které v žádném z těch solvů nebyly pohromadě.
      board: board(["2c", "7d", "9h"]),
      potType: rule.potType,
      potBB: rule.spot!.potBB,
      effectiveStackBB: rule.stackBB,
      positionPattern: rule.positionPattern,
      heroOutOfPosition: hero.side === "OOP",
      actionNode: hero.facingBet ? "FLOP_FACING_BET" : "SINGLE_RAISED_POT_CBET",
      heroHand: rule.buckets[0].handClasses[0],
    } as unknown as PostflopStrategyInput);
    expect(answer).toBeNull();
  });

  it("bez načtených packů nevydá nic", () => {
    expect(createFlopSolvedStrategyResolverChain()({
      street: "FLOP",
      textures: [],
      board: board(["6s", "5d", "4c"]),
      potType: "SINGLE_RAISED",
      potBB: 10,
      effectiveStackBB: 25,
      positionPattern: "SRP_CO_VS_BB",
      actionNode: "SINGLE_RAISED_POT_CBET",
    } as unknown as PostflopStrategyInput)).toBeNull();
  });
});
