import { beforeAll, describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import type { Card } from "../../src/core/types";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
import {
  pickSolvedRiverSpot,
  solvedRiverHeroCards,
  solvedRiverSpots,
  solvedRiversForTurnBoard,
} from "../../src/data/ranges/solvedRiverSpotCatalogue";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";

/**
 * Vyřešený river se dodával a hráč ho nemohl potkat.
 *
 * Turn tenhle problém vyřešil katalogem: pack odpovídá na jednu desku a všechno
 * ostatní odmítá, takže trenažér s náhodnými deskami ho nepotká skoro nikdy.
 * Na riveru je to o řád horší - i když linka mířila na vyřešený flop a turn,
 * pátá karta se dolosovávala z balíčku, tedy trefa jedna ku čtyřiceti čtyřem.
 *
 * Zvenku vypadá správný resolver s nedosažitelným obsahem úplně stejně jako
 * obsah, který neexistuje: hráč dostane heuristiku v obou případech.
 */
describe("katalog vyřešených riverů", () => {
  beforeAll(async () => {
    await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
  });

  it("nabídne to, co je vyřešené, s pěti kartami a známým hrdinou", () => {
    const spots = solvedRiverSpots();
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(spot.board).toHaveLength(5);
      expect(spot.heroHandClasses.length).toBeGreaterThan(0);
      expect(spot.heroSeat).not.toBe(spot.villainSeat);
    }
  });

  it("najde vyřešený river k turnové desce, a k cizí nenajde nic", () => {
    const spot = solvedRiverSpots()[0];
    const turnBoard = spot.board.slice(0, 4);
    const found = solvedRiversForTurnBoard(turnBoard);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((item) => item.board.slice(0, 4).every((card, index) => (
      `${card.rank}${card.suit}` === `${turnBoard[index].rank}${turnBoard[index].suit}`
    )))).toBe(true);

    // Deska, kterou nikdo neřešil, nesmí nic vrátit - jinak by katalog nabídl
    // spot, který resolver stejně odmítne, a hráč by dostal heuristiku na desce
    // vybrané proto, že je prý vyřešená.
    const other: Card[] = [
      { rank: "2", suit: "c" }, { rank: "7", suit: "d" },
      { rank: "9", suit: "h" }, { rank: "J", suit: "s" },
    ];
    expect(solvedRiversForTurnBoard(other)).toHaveLength(0);
  });

  it("každý nabídnutý river dostane solverem podloženou odpověď", () => {
    // Tohle je ta vlastnost, kvůli které katalog existuje. Kdyby se rozešel s
    // resolverem, dodával by spoty, na které se odpoví heuristikou - a poznat by
    // to zvenku nešlo.
    const spots = solvedRiverSpots();
    let answered = 0;
    for (const [index, spot] of spots.entries()) {
      const generated = generatePostflopSpot({
        seed: index,
        street: "RIVER",
        board: [...spot.board],
        potType: spot.potType,
        potBB: spot.potBB,
        effectiveStackBB: spot.effectiveStackBB,
        actionNode: spot.actionNode,
        positionContext: {
          heroPosition: spot.heroSeat as never,
          villainPosition: spot.villainSeat as never,
          aggressorPosition: (spot.heroIsAggressor ? spot.heroSeat : spot.villainSeat) as never,
          callerPosition: (spot.heroIsAggressor ? spot.villainSeat : spot.heroSeat) as never,
          inPosition: spot.heroInPosition,
          callerType: "BIG_BLIND",
          positionPattern: spot.positionPattern,
        },
        heroCards: solvedRiverHeroCards(spot, 0.5),
        strategyResolver: createDefaultPostflopStrategyResolver(),
        allowFallback: true,
      } as never);
      const source = generated.strategySource;
      if (source.kind === "STRATEGY_PACK" && source.provenance === "SOLVER_BACKED") answered += 1;
    }
    expect({ nabídnuto: spots.length, odpovězeno: answered })
      .toEqual({ nabídnuto: spots.length, odpovězeno: spots.length });
  });

  it("stejné číslo vybere stejný spot", () => {
    expect(pickSolvedRiverSpot(0.31)?.sourceDirectory)
      .toBe(pickSolvedRiverSpot(0.31)?.sourceDirectory);
  });
});
