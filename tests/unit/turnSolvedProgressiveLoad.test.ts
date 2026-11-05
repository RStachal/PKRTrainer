import { describe, expect, it } from "vitest";

import {
  loadAllSolvedTurnPacks,
  loadSolvedTurnPacks,
  solvedTurnEntriesForProfile,
} from "../../src/data/ranges/turnSolvedStrategyPacks";
import { solvedTurnManifest } from "../../src/data/ranges/turnSolvedManifest.generated";
import { clearSolvedTurnPacksForTests, runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";

/**
 * Start relace nesmí čekat na půl megabajtu.
 *
 * Rodin je jedenáct a `main` čekal na všechny, než pustil hráče ke stolu. S
 * jednou rodinou to bylo třicet kilobajtů, s jedenácti skoro půl megabajtu po
 * kompresi - číslo rostlo tiše s každou přidanou rodinou a nikdo ho neměřil.
 *
 * Čekat na nic ale nejde: katalog vyřešených turnů se staví z nahraných packů a
 * z prázdného katalogu se rozdá náhodný board, tedy „vyřešený turn" s
 * heuristickou odpovědí.
 */
const TURN_KEY = "FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF";

describe("postupné načítání turn packů", () => {
  it("vrátí se po jedné rodině, ne po všech", async () => {
    const entries = solvedTurnEntriesForProfile(TURN_KEY, solvedTurnManifest);
    expect(entries.length).toBeGreaterThan(1);

    const packs = await loadSolvedTurnPacks(TURN_KEY);
    // Jedna stačí na to, aby katalog nebyl prázdný - a o to jde.
    expect(packs).toHaveLength(1);
    expect(runtimeSolvedTurnPacks.length).toBeGreaterThan(0);
  });

  it("nástroje si vyžádají všechno a dostanou všechno", async () => {
    const entries = solvedTurnEntriesForProfile(TURN_KEY, solvedTurnManifest);
    const packs = await loadAllSolvedTurnPacks(TURN_KEY);
    expect(packs).toHaveLength(entries.length);
  });

  it("profil bez turn obsahu nestahuje nic", async () => {
    clearSolvedTurnPacksForTests();
    const packs = await loadSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
    expect(packs).toEqual([]);
  });
});
