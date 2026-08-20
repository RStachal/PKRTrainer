import { describe, expect, it } from "vitest";

import { encodeEvTable } from "../../src/core/evCodec";
import {
  readRiverEv,
  riverEvMatchesPack,
  type RiverEvPack,
} from "../../src/data/ranges/riverEvPack";

/**
 * Čtení EV tabulky.
 *
 * Tabulka nese jen hodnoty; co která znamená, plyne z pořadí kombinací a z počtu
 * akcí, který drží pravidlo packu. Když se ty dva rozejdou, hodnoty se čtou
 * posunuté - hráč by u sázky viděl EV složení a nic by to neřeklo, protože tvar
 * dat zůstane platný. Proto se tu kontroluje délka a při neshodě se radši
 * nevrátí nic.
 */
function packOf(rules: RiverEvPack["rules"], combos: string[]): RiverEvPack {
  return {
    schemaVersion: "PKRTRAINER_RIVER_EV_V2",
    familyId: "TEST",
    packId: "pack-TEST",
    contentHash: "hash-1",
    unit: "BB",
    source: "SOLVED_TREE",
    combos,
    rules,
  };
}

describe("čtení EV tabulky", () => {
  const combos = ["AhKh", "AsKs", "7d6d"];
  // Tři kombinace, dvě akce: hodnoty jdou po kombinacích.
  const values = [1.5, -2, 0, 3.2, null, 4.1];
  const pack = packOf([{ c: [0, 1, 2], v: encodeEvTable(values) }], combos);

  it("vrátí EV akcí pro zadanou kombinaci", () => {
    const lookup = readRiverEv(pack, () => 2);
    expect(lookup.forCombo(0, "AhKh")).toEqual([1.5, -2]);
    expect(lookup.forCombo(0, "AsKs")).toEqual([0, 3.2]);
  });

  it("chybějící akci vrátí jako null, ne nulu", () => {
    // Nula je platné EV. Kdyby se nedostupná akce četla jako nula, hráč by u ní
    // viděl číslo, které nic neznamená.
    expect(readRiverEv(pack, () => 2).forCombo(0, "7d6d")).toEqual([null, 4.1]);
  });

  it("neznámou kombinaci nepřizná", () => {
    expect(readRiverEv(pack, () => 2).forCombo(0, "2c2d")).toBeUndefined();
  });

  it("při špatném počtu akcí radši nevrátí nic", () => {
    // Tohle je ta tichá chyba, kvůli které tam ta kontrola je: se třemi akcemi
    // by se šest hodnot rozdělilo na dvě kombinace a posunulo o jednu akci.
    expect(readRiverEv(pack, () => 3).forCombo(0, "AhKh")).toBeUndefined();
  });

  it("pravidlo bez EV se přizná", () => {
    const withHole = packOf([null], combos);
    expect(readRiverEv(withHole, () => 2).forCombo(0, "AhKh")).toBeUndefined();
  });

  it("otisk musí sedět, jinak tabulka neplatí", () => {
    // Přegenerovaný pack s nepřegenerovaným EV by ukazoval čísla k jiné
    // strategii a tvar dat by přitom zůstal v pořádku.
    expect(riverEvMatchesPack(pack, { id: "pack-TEST", contentHash: "hash-1" })).toBe(true);
    expect(riverEvMatchesPack(pack, { id: "pack-TEST", contentHash: "hash-2" })).toBe(false);
    expect(riverEvMatchesPack(pack, { id: "pack-JINY", contentHash: "hash-1" })).toBe(false);
  });

  it("čte opakovaně ze stejné tabulky bez opětovného dekódování", () => {
    // Dekódování je jediná drahá část; matrix se ptá na sto šedesát devět buněk.
    const lookup = readRiverEv(pack, () => 2);
    expect(lookup.forCombo(0, "AhKh")).toEqual([1.5, -2]);
    expect(lookup.forCombo(0, "AsKs")).toEqual([0, 3.2]);
    expect(lookup.forCombo(0, "AhKh")).toEqual([1.5, -2]);
  });
});
