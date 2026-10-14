import { beforeAll, describe, expect, it } from "vitest";

import { loadSolvedFlopPacks } from "../../src/data/ranges/flopSolvedStrategyPacks";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import {
  cataloguePatternFor,
  pickRiverSpotForSeed,
  pickTurnSpotForSeed,
  selectedActionNode,
  solvedFlopConfigForSeed,
  type DealSituation,
} from "../../src/data/ranges/solvedSpotDealing";

/**
 * Rozdávání z katalogu, když si hráč situaci vybral.
 *
 * Do 14. 10. 2026 se katalog při vybrané situaci obcházel a matice se barvila
 * podle akce v **0 %** spotů. Od té doby se filtruje podle vzoru pozic a
 * hloubky (`npm run mtt:picked-situation` měří dopad: flop 31,7 %, turn
 * 19,3 %, river 24,3 %). Tyhle testy drží tři věci, na kterých to stojí.
 */

beforeAll(async () => {
  await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
  await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
});

const SITUATION: DealSituation = { positionPattern: "SRP_BTN_VS_BB", stackBB: 25 };

describe("rozdávání z katalogu podle vybrané situace", () => {
  it("rozdá jen spot toho vzoru a té hloubky, kterou si hráč vybral", () => {
    // Filtr jen podle vzoru by hráči, který si vybral 25 bb, mohl dát spot ze
    // 100 bb - tedy odpověď na otázku, kterou nepoložil. Komentář v pohledu to
    // má za horší selhání než heuristiku.
    for (let seed = 0; seed < 40; seed += 1) {
      const turn = pickTurnSpotForSeed(seed, "TURN_FACING_BET", SITUATION);
      if (turn === undefined) continue;
      expect(turn.spot.positionPattern).toBe("SRP_BTN_VS_BB");
      expect(turn.spot.effectiveStackBB).toBe(25);
    }
  });

  it("přednačtení a rozdání vyberou tentýž spot", () => {
    // Tohle je ten invariant, na kterém visí EV prvního rozdaného spotu.
    // Kdyby přednačtení losovalo z nefiltrovaného katalogu a rozdání
    // z filtrovaného, tentýž seed by vybral jinou rodinu, načetla by se cizí
    // tabulka EV a hráč by EV neviděl - a zvenku by to vypadalo jako rozbitý
    // řetěz. Obě cesty proto volají `pickRiverSpotForSeed` se stejnou
    // situací; test drží, že je to deterministické.
    let compared = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const first = pickRiverSpotForSeed(seed, "RIVER_FACING_BET", SITUATION);
      const second = pickRiverSpotForSeed(seed, "RIVER_FACING_BET", SITUATION);
      if (first === undefined || second === undefined) continue;
      compared += 1;
      expect(second.spot.packId).toBe(first.spot.packId);
      expect(second.spot.sourceDirectory).toBe(first.spot.sourceDirectory);
    }
    // Bez téhle meze by test prošel i nad prázdným katalogem - tedy přesně
    // v tom stavu, který ho napoprvé vyrobil (packy nenačtené, nula všude).
    expect(compared).toBeGreaterThan(0);
  });

  it("vynechat situaci v přednačtení by opravdu načetlo jinou rodinu", () => {
    // Falsifikace testu výš. Ten porovnává funkci samu se sebou a prošel by,
    // i kdyby pohled volal přednačtení bez situace. Tady se ukazuje, že ta
    // chyba není teoretická: pro tentýž seed a uzel padne bez situace **jiná
    // rodina** než s ní - takže zapomenout ji v `primeRiverEvForSeed` by
    // načetlo cizí tabulku EV. Je to přesně ta varianta, kterou jsem při
    // prvním zápisu té opravy v pohledu udělal.
    const differs = [...Array(120).keys()].some((seed) => {
      const filtered = pickRiverSpotForSeed(seed, "RIVER_FACING_BET", SITUATION);
      const unfiltered = pickRiverSpotForSeed(seed, "RIVER_FACING_BET");
      return filtered !== undefined && unfiltered !== undefined
        && filtered.spot.packId !== unfiltered.spot.packId;
    });
    expect(differs).toBe(true);
  });

  it("riverovou hloubku najde - nečte ji z cesty, která u riveru jiný tvar má", () => {
    // Napoprvé se hloubka četla ze `sourceDirectory` regulárním výrazem
    // ukotveným na začátek. U riveru je to ale celá cesta
    // (`artifacts/decomposition/MTT9_…`), takže se river nenašel nikdy a měření
    // hlásilo 0 %. Teď se bere `effectiveStackBB`, které je jmenovitá hloubka.
    const found = [...Array(60).keys()].some((seed) =>
      pickRiverSpotForSeed(seed, "RIVER_FACING_BET", SITUATION) !== undefined);
    expect(found).toBe(true);
  });

  it("situace, pro kterou katalog nic nemá, vrátí nic - a volající spadne na losovanou desku", () => {
    // Hloubka, na které nic vyřešeného není: filtr nesmí „zaokrouhlit" na
    // nejbližší, protože to by byla zase jiná otázka než ta položená.
    const missing: DealSituation = { positionPattern: "SRP_BTN_VS_BB", stackBB: 999 };
    expect(solvedFlopConfigForSeed(1, "SINGLE_RAISED_POT_CBET", missing)).toBeUndefined();
    expect(pickTurnSpotForSeed(1, "TURN_FACING_BET", missing)).toBeUndefined();
    expect(pickRiverSpotForSeed(1, "RIVER_FACING_BET", missing)).toBeUndefined();
  });

  it("bez vybrané situace rozdává z celého katalogu jako dřív", () => {
    const anywhere = [...Array(20).keys()].some((seed) =>
      pickTurnSpotForSeed(seed, "TURN_FACING_BET") !== undefined);
    expect(anywhere).toBe(true);
  });

  it("hrubý vzor obrany blindu se pro katalog převede na jemný", () => {
    // Filtry dávají u obrany BB hrubé `EP_VS_BB` pro kteréhokoli otvírače od
    // UTG po CO; katalog vede `SRP_CO_VS_BB`. Bez převodu všech deset výběrů
    // „X proti BB" vyřešený obsah míjelo - přestože ho pro každý z nich máme.
    const ctx = (pattern: string, aggressor: string, caller: string) => ({
      positionPattern: pattern as never, aggressorPosition: aggressor, callerPosition: caller,
    });
    expect(cataloguePatternFor(ctx("EP_VS_BB", "CO", "BB"))).toBe("SRP_CO_VS_BB");
    expect(cataloguePatternFor(ctx("EP_VS_BB", "UTG+1", "BB"))).toBe("SRP_UTG_1_VS_BB");
    expect(cataloguePatternFor(ctx("BTN_VS_BB", "BTN", "BB"))).toBe("SRP_BTN_VS_BB");
    expect(cataloguePatternFor(ctx("SB_VS_BB", "SB", "BB"))).toBe("SRP_SB_VS_BB");
    // Jemné vzory se nechávají být - i 3bet pot, kde agresor není otvírač.
    expect(cataloguePatternFor(ctx("SRP_LJ_VS_HJ", "LJ", "HJ"))).toBe("SRP_LJ_VS_HJ");
    expect(cataloguePatternFor(ctx("3BP_HJ_VS_LJ", "LJ", "HJ"))).toBe("3BP_HJ_VS_LJ");
  });

  it("uzel rozhodnutí se volí stejně, jak ho volí nabídka situací", () => {
    expect(selectedActionNode("FLOP", "initiative", "SINGLE_RAISED")).toBe("SINGLE_RAISED_POT_CBET");
    expect(selectedActionNode("FLOP", "initiative", "THREE_BET_POT")).toBe("THREE_BET_POT_CBET");
    expect(selectedActionNode("TURN", "facing-bet", "SINGLE_RAISED")).toBe("TURN_FACING_BET");
    expect(selectedActionNode("TURN", "oop-lead", "SINGLE_RAISED")).toBe("TURN_OOP_LEAD");
    expect(selectedActionNode("RIVER", "initiative", "SINGLE_RAISED")).toBe("RIVER_PRESSURE");
  });
});
