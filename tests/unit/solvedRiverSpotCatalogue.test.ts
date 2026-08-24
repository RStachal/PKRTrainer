import { beforeAll, describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import type { Card } from "../../src/core/types";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
import {
  pickSolvedRiverSpot,
  solvedRiverHeroCards,
  solvedRiverSpotConfig,
  solvedRiverSpots,
  solvedRiversForTurnBoard,
} from "../../src/data/ranges/solvedRiverSpotCatalogue";
import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../../src/core/postflopGenerator";
import { mulberry32 } from "../../src/core/rng";
import { loadRiverEvPack, readyRiverEvPack } from "../../src/data/ranges/riverEvRuntime";
import { runtimeSolvedRiverPacks } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import { decodeComboMask } from "../../src/core/evCodec";
import { postflopHandClassFromCards } from "../../src/ui/postflopRangeMatrixView";
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

  it("rozdá river i jako samostatný spot, ne jen jako konec linky", () => {
    // Katalog se dosud používal jen uvnitř linky. Kdo si vybral river jako
    // dril, dostával náhodnou pětikartovou desku - a šance, že padne jedna z
    // 908 vyřešených, je mizivá. Sedmnáct rodin se dodávalo, stahovalo a hráč
    // je nemohl potkat.
    const resolver = createDefaultPostflopStrategyResolver();
    const spots = solvedRiverSpots();
    expect(spots.length).toBeGreaterThan(0);
    let checked = 0;
    for (let seed = 1; seed <= 25; seed += 1) {
      const rng = mulberry32(seed);
      rng();
      const spot = pickSolvedRiverSpot(rng(), spots)!;
      const config = solvedRiverSpotConfig(
        spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng(),
      );
      expect(config, `${spot.sourceDirectory}: sedačky se nedaly přeložit`).toBeDefined();
      expect(config!.board).toHaveLength(5);
      const generated = generatePostflopSpot({ seed, strategyResolver: resolver, ...config! });
      const source = generated.strategySource;
      expect(source?.kind, spot.sourceDirectory).toBe("STRATEGY_PACK");
      if (source?.kind === "STRATEGY_PACK") {
        expect(source.provenance, spot.sourceDirectory).toBe("SOLVER_BACKED");
      }
      checked += 1;
    }
    expect(checked).toBe(25);
  });

  it("posadí hráče do židle, jejíž strategii mu ukazuje", () => {
    for (const spot of solvedRiverSpots().slice(0, 30)) {
      const config = solvedRiverSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS)!;
      expect(config.positionContext.inPosition, spot.sourceDirectory).toBe(spot.heroInPosition);
      expect(
        config.positionContext.aggressorPosition === config.positionContext.heroPosition,
        `${spot.sourceDirectory}: iniciativa nesedí`,
      ).toBe(spot.heroIsAggressor);
    }
  });

  it("rozdá kombinaci, která do uzlu doopravdy došla", async () => {
    // Losovat kombinaci podle třídy je tatáž vada, jakou popisuje turnový
    // katalog o úroveň výš, jen o patro níž: uvnitř třídy se linky liší podle
    // blokerů, takže `AQo` s pikovým esem může dorovnat a `AQo` bez něj složit.
    // Rozdat tu druhou znamená ptát se na ruku, se kterou by hrdina na river
    // nedošel - a odpověď se pak vydá podle kbelíku třídy, s cedulkou od
    // solveru za holding, který solve nemodeloval. Změřeno: 43 z 300 spotů.
    for (const pack of runtimeSolvedRiverPacks) await loadRiverEvPack(pack);
    const spots = solvedRiverSpots();
    let checked = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const rng = mulberry32(seed);
      rng();
      const spot = pickSolvedRiverSpot(rng(), spots)!;
      const table = readyRiverEvPack(spot.packId);
      const row = table?.rules[spot.ruleIndex];
      if (table === undefined || row === null || row === undefined) continue;
      const cards = solvedRiverHeroCards(spot, rng());
      expect(cards, spot.sourceDirectory).toBeDefined();
      const combos = new Set(
        decodeComboMask(row.m, table.combos.length).map((index) => table.combos[index]),
      );
      const [a, b] = cards!.map((card) => `${card.rank}${card.suit}`);
      expect(
        combos.has(`${a}${b}`) || combos.has(`${b}${a}`),
        `${spot.sourceDirectory}: ${a}${b} do uzlu nedošla`,
      ).toBe(true);
      // A zároveň musí patřit do třídy, které pravidlo přiřadilo akci - jinak
      // resolver nemá co vydat a spot spadne na heuristiku.
      expect(spot.heroHandClasses).toContain(postflopHandClassFromCards(cards!));
      checked += 1;
    }
    expect(checked, "žádný spot neměl načtenou tabulku EV").toBeGreaterThan(0);
  });
});
