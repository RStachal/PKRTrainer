import { describe, expect, it } from "vitest";

import { encodeComboMask, encodeEvDeltas } from "../../src/core/evCodec";
import {
  readTurnEv,
  turnEvMatchesPack,
  type TurnEvPack,
} from "../../src/data/ranges/turnEvPack";

/**
 * Čtení turnové EV tabulky.
 *
 * Tabulka nese jen hodnoty; co která znamená, plyne z pořadí kombinací a z počtu
 * akcí, který drží pravidlo packu. Když se ty dva rozejdou, hodnoty se čtou
 * posunuté - hráč by u sázky viděl EV složení a **nic by to neřeklo**, protože
 * tvar dat zůstane platný.
 *
 * Turn má typicky čtyři akce proti riverovým dvěma, takže posun o jednu je tu
 * pravděpodobnější a jeho následek horší: check dostane hodnotu sázky.
 */
function packOf(rules: TurnEvPack["rules"], combos: string[]): TurnEvPack {
  return {
    schemaVersion: "PKRTRAINER_TURN_EV_V1",
    familyId: "TEST",
    packId: "pack-TEST",
    contentHash: "hash-1",
    unit: "BB",
    source: "SOLVED_TREE",
    combos,
    rules,
  };
}

describe("čtení turnové EV tabulky", () => {
  const combos = ["AhKh", "AsKs", "7d6d"];
  // Tři kombinace, čtyři akce - tak jak vypadá turnový uzel s checkem a třemi
  // velikostmi sázky.
  const values = [
    1.5, -2, 0, 3.2,
    null, 4.1, 2.2, -1,
    0.5, 0.5, 0.5, 0.5,
  ];
  const pack = packOf(
    [{ m: encodeComboMask([0, 1, 2], combos.length), v: encodeEvDeltas(values, 4) }],
    combos,
  );

  it("vrátí EV akcí pro zadanou kombinaci", () => {
    const lookup = readTurnEv(pack, () => 4);
    expect(lookup.forCombo(0, "AhKh")).toEqual([1.5, -2, 0, 3.2]);
    expect(lookup.forCombo(0, "AsKs")).toEqual([null, 4.1, 2.2, -1]);
  });

  it("chybějící akci vrátí jako null, ne nulu", () => {
    // Nula je platná EV a u složení dokonce ta nejčastější, takže by se nedaly
    // rozeznat a hráč by u nedostupné akce viděl číslo.
    const lookup = readTurnEv(pack, () => 4);
    expect(lookup.forCombo(0, "AsKs")?.[0]).toBeNull();
  });

  it("neznámou kombinaci nepřizná", () => {
    expect(readTurnEv(pack, () => 4).forCombo(0, "2c2d")).toBeUndefined();
  });

  it("při špatném počtu akcí radši nevrátí nic", () => {
    // Tohle je ta past, kvůli které se délka kontroluje: se třemi akcemi místo
    // čtyř by se hodnoty rozdělily jinak a každá kombinace by dostala cizí.
    expect(readTurnEv(pack, () => 3).forCombo(0, "AhKh")).toBeUndefined();
  });

  it("řídkou bitmapu přiřadí ke správným kombinacím", () => {
    // Pravidlo drží jen část kombinací, a bitmapa vrací indexy vzestupně.
    // Kdyby se pořadí rozešlo, dostala by EV cizí ruka - v blindech a věrohodně.
    const sparse = packOf(
      [{
        m: encodeComboMask([0, 2], combos.length),
        v: encodeEvDeltas([1, 2, 3, 4, 9, 8, 7, 6], 4),
      }],
      combos,
    );
    const lookup = readTurnEv(sparse, () => 4);
    expect(lookup.forCombo(0, "AhKh")).toEqual([1, 2, 3, 4]);
    expect(lookup.forCombo(0, "7d6d")).toEqual([9, 8, 7, 6]);
    expect(lookup.forCombo(0, "AsKs")).toBeUndefined();
  });

  it("pravidlo bez EV se přizná", () => {
    expect(readTurnEv(packOf([null], combos), () => 4).forCombo(0, "AhKh")).toBeUndefined();
  });

  it("otisk musí sedět, jinak tabulka neplatí", () => {
    // Noc packy přegeneruje a otisk se změní. Tabulka k jiné podobě packu by
    // ukazovala čísla k jiné strategii a tvar dat by zůstal v pořádku.
    expect(turnEvMatchesPack(pack, { id: "pack-TEST", contentHash: "hash-1" })).toBe(true);
    expect(turnEvMatchesPack(pack, { id: "pack-TEST", contentHash: "hash-2" })).toBe(false);
    expect(turnEvMatchesPack(pack, { id: "pack-JINY", contentHash: "hash-1" })).toBe(false);
  });
});
