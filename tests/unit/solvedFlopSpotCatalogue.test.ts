import { beforeAll, describe, expect, it } from "vitest";

import {
  POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS,
  generatePostflopSpot,
} from "../../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../../src/data/ranges/postflopStrategyRegistry";
import { loadSolvedFlopPacks } from "../../src/data/ranges/flopSolvedStrategyPacks";
import {
  pickSolvedFlopSpot,
  solvedFlopSpotConfig,
  solvedFlopSpots,
} from "../../src/data/ranges/solvedFlopSpotCatalogue";
import { mulberry32 } from "../../src/core/rng";
import { postflopHandClassFromCards } from "../../src/ui/postflopRangeMatrixView";

/**
 * Že vyřešené flopy jde doopravdy rozdat - tedy ta půlka, kterou test resolveru
 * nevidí.
 *
 * Resolver, který správně odmítne každou desku, kterou neřešil, a trenažér,
 * který rozdává náhodné desky, spolu dají produkt, kde je vyřešený obsah
 * nedosažitelný. Zvenku to vypadá úplně stejně jako rozbitý resolver: hráč
 * dostane heuristiku tak jako tak. **Změřeno 21. 8. 2026: 0,0 % z 1500
 * rozdaných flopů dostalo odpověď, přestože se dodávalo 47 vyřešených rodin.**
 *
 * Tenhle test kontroluje tu druhou půlku: vezmi, co katalog nabízí, rozdej to
 * skutečným generátorem a ověř, že to resolver pozná.
 */
describe("katalog vyřešených flopů", () => {
  beforeAll(async () => {
    await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP");
  });

  it("nabízí flopy, které někdo vyřešil", () => {
    const spots = solvedFlopSpots();
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(spot.board, spot.sourceDirectory).toHaveLength(3);
      expect(spot.potBB, spot.sourceDirectory).toBeGreaterThan(0);
      expect(spot.effectiveStackBB, spot.sourceDirectory).toBeGreaterThan(0);
      expect(spot.heroHandClasses.length, spot.sourceDirectory).toBeGreaterThan(0);
    }
  });

  it("každý nabídnutý flop dostane odpověď podloženou solverem", () => {
    // Tohle je celý smysl katalogu. Kdyby nabídl spot, který resolver odmítne,
    // stal by se z něj heuristický dril pod jménem katalogu - a to je horší než
    // rozdat náhodnou desku, protože se to tváří jako vyřešený obsah.
    const resolver = createDefaultPostflopStrategyResolver();
    const spots = solvedFlopSpots();
    let checked = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = mulberry32(seed);
      rng();
      const spot = pickSolvedFlopSpot(rng(), spots);
      expect(spot).toBeDefined();
      const config = solvedFlopSpotConfig(
        spot!, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng(),
      );
      expect(config, `${spot!.sourceDirectory}: sedačky se nedaly přeložit`).toBeDefined();
      const generated = generatePostflopSpot({ seed, strategyResolver: resolver, ...config! });
      const source = generated.strategySource;
      expect(source?.kind, spot!.sourceDirectory).toBe("STRATEGY_PACK");
      if (source?.kind === "STRATEGY_PACK") {
        expect(source.provenance, spot!.sourceDirectory).toBe("SOLVER_BACKED");
      }
      checked += 1;
    }
    expect(checked).toBe(60);
  });

  it("hrdinovy karty bere ze solvu, ne z balíčku", () => {
    // Ruka mimo vyřešenou range není jen nezodpověditelná - hrdina ji tu držet
    // nemůže. U turnu to stálo tři čtvrtiny spotů: vybrala se vyřešená deska a
    // pak se položila otázka, na kterou solver nikdy neodpovídal.
    const spots = solvedFlopSpots();
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = mulberry32(seed);
      rng();
      const spot = pickSolvedFlopSpot(rng(), spots)!;
      const config = solvedFlopSpotConfig(
        spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng(),
      )!;
      expect(config.heroCards, spot.sourceDirectory).toBeDefined();
      const handClass = postflopHandClassFromCards(config.heroCards!);
      expect(spot.heroHandClasses, `${spot.sourceDirectory}: ${handClass}`).toContain(handClass);
      // A karta nesmí ležet na stole.
      const board = new Set(config.board.map((card) => `${card.rank}${card.suit}`));
      for (const card of config.heroCards!) {
        expect(board.has(`${card.rank}${card.suit}`), spot.sourceDirectory).toBe(false);
      }
    }
  });

  it("posadí hráče do židle, jejíž strategii mu ukazuje", () => {
    // Vyhledání kontextu podle vzoru je aktivně špatně: každý jednou zvýšený
    // vzor je psaný ze strany toho, kdo zvýšil, takže by hráč seděl na cutoffu
    // a dostával odpovědi big blindu.
    const spots = solvedFlopSpots();
    for (const spot of spots.slice(0, 40)) {
      const config = solvedFlopSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS)!;
      expect(config.positionContext.inPosition, spot.sourceDirectory)
        .toBe(spot.heroInPosition);
      const aggressor = config.positionContext.aggressorPosition;
      expect(
        aggressor === config.positionContext.heroPosition,
        `${spot.sourceDirectory}: iniciativa nesedí`,
      ).toBe(spot.heroIsAggressor);
    }
  });

  it("prázdný katalog nerozdá nic, místo aby si spot vymyslel", () => {
    expect(pickSolvedFlopSpot(0.5, [])).toBeUndefined();
  });
});
