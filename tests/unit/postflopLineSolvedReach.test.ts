import { beforeAll, describe, expect, it } from "vitest";

import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../../src/core/postflopGenerator";
import { generatePostflopLine, transitionPostflopLineState } from "../../src/core/postflopLineSimulator";
import { RANKS, SUITS } from "../../src/core/poker";
import { mulberry32 } from "../../src/core/rng";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
import {
  pickSolvedTurnSpot,
  solvedTurnSpotConfig,
  solvedTurnSpots,
} from "../../src/data/ranges/solvedTurnSpotCatalogue";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";

/**
 * Linka rozdávala náhodnou desku a solverový obsah nepotkala nikdy.
 *
 * Změřeno před opravou: 0 z 500 linek mělo na kterékoli ulici solverovou
 * odpověď, přestože se dodává jedenáct vyřešených rodin. Resolver dělal svou
 * práci správně - odmítal desky, které nikdo nevyřešil - a zvenku to vypadalo
 * úplně stejně, jako by ten obsah neexistoval.
 */
describe("dosah vyřešeného obsahu v lince", () => {
  beforeAll(async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  });

  it("odliší vedení bez iniciativy od pokračování v sázení", () => {
    // Tohle byla ta chyba, která držela dosah na 2,6 % i po nasměrování na
    // vyřešené desky: derivace znala jen předchozí akci, ne kdo zvedal, a
    // vyráběla barrel i pro hráče, který na flopu jen dorovnal.
    const withInitiative = transitionPostflopLineState({
      street: "FLOP",
      potType: "SINGLE_RAISED",
      action: { action: "CHECK", potBBAfter: 10, effectiveStackBBAfter: 90 } as never,
      heroHasInitiative: true,
    });
    expect(withInitiative.nextActionNode).toBe("TURN_BARREL");

    const withoutInitiative = transitionPostflopLineState({
      street: "FLOP",
      potType: "SINGLE_RAISED",
      action: { action: "CHECK", potBBAfter: 10, effectiveStackBBAfter: 90 } as never,
      heroHasInitiative: false,
    });
    expect(withoutInitiative.nextActionNode).toBe("TURN_OOP_LEAD");
  });

  it("potká solverový turn, když se linka postaví na vyřešené desce", () => {
    const resolver = createDefaultPostflopStrategyResolver();
    let turns = 0;
    let solved = 0;
    for (let seed = 0; seed < 150; seed += 1) {
      const rng = mulberry32(seed);
      rng();
      const spot = pickSolvedTurnSpot(rng(), solvedTurnSpots());
      if (spot === undefined) continue;
      const config = solvedTurnSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng());
      if (config === undefined || config.board.length !== 4) continue;

      const used = new Set(config.board.map((card) => `${card.rank}${card.suit}`));
      const deck = RANKS.flatMap((rank) => (
        SUITS.filter((suit) => !used.has(`${rank}${suit}`)).map((suit) => ({ rank, suit }))
      ));
      const river = deck[Math.min(Math.floor(rng() * deck.length), deck.length - 1)];

      const line = generatePostflopLine({
        seed,
        board: [config.board[0], config.board[1], config.board[2], config.board[3], river],
        potType: config.potType,
        potBB: config.potBB,
        effectiveStackBB: config.effectiveStackBB,
        positionContext: config.positionContext,
        actionNode: config.potType === "THREE_BET_POT"
          ? "THREE_BET_POT_CBET"
          : "SINGLE_RAISED_POT_CBET",
        strategyResolver: resolver,
        allowFallback: true,
      });

      for (const street of line.streets) {
        if (street.street !== "TURN") continue;
        turns += 1;
        const source = street.spot.strategySource;
        if (source.kind === "STRATEGY_PACK" && source.provenance === "SOLVER_BACKED") solved += 1;
      }
    }
    expect(turns).toBeGreaterThan(50);
    // Ne sto procent a nemá být: hráč si na flopu volí a volbou z vyřešené linky
    // odejde. Nula ale znamenala, že se ten obsah nepotká nikdy.
    expect(solved / turns).toBeGreaterThan(0.1);
  });
});
