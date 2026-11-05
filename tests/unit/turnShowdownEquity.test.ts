import { describe, expect, it } from "vitest";

import { turnShowdownEquity } from "../../src/core/turnShowdownEquity";

/**
 * Dojezd po all-inu na turnu. Nejhorší selhání tady není pád, ale **věrohodné
 * číslo**: podíl mezi nulou a jedničkou vypadá jako equity, i když se počítá
 * z jiné desky nebo bez vyřazených karet.
 *
 * Testy proto stojí na vlastnostech, které musí platit bez ohledu na to, jak se
 * to počítá - doplnění do jedničky, uspořádání proti silnější a slabší ruce -
 * a ne na číslech opsaných z téhož výpočtu.
 */

/** Deska po turnu; `Kc` na ní dělá z každé ruky s králem pár. */
const BOARD = ["2c", "7d", "9h", "Kc"];

describe("turnShowdownEquity", () => {
  it("equity dvou konkrétních rukou se doplňuje do jedničky", () => {
    // Remízy se dělí půl na půl, takže součet musí padnout přesně na 1. Je to
    // první síto, ne důkaz: symetrický nesmysl by jím prošel taky.
    const equity = turnShowdownEquity(BOARD);
    const hero = equity("AsKd", [{ combo: "QsQh", weight: 1 }]);
    const villain = equity("QsQh", [{ combo: "AsKd", weight: 1 }]);

    expect(hero).toBeDefined();
    expect(villain).toBeDefined();
    expect((hero ?? 0) + (villain ?? 0)).toBeCloseTo(1, 9);
  });

  it("trojice králů proti dámám vyhrává skoro vždy", () => {
    // `Kc` leží na desce, takže `KsKh` je trojice a `QsQh` jen pár pod ní.
    // Kdyby se síla brala z jiné desky nebo se karty desky ignorovaly, vyšla by
    // tahle dvojice někde kolem poloviny.
    const equity = turnShowdownEquity(BOARD);
    const trips = equity("KsKh", [{ combo: "QsQh", weight: 1 }]);

    expect(trips).toBeDefined();
    expect(trips ?? 0).toBeGreaterThan(0.9);
  });

  it("equity vyjde na papírem spočtenou hodnotu 43/44", () => {
    // Jediná zkouška, která nekontroluje výpočet sebou samým: odpověď se dá
    // odvodit z pravidel pokeru.
    //
    // Deska `2c 7d 9h Kc`, hrdina `KsKh` (trojice králů), soupeř `9c9d`
    // (trojice devítek). Postupka ani barva nejsou možné - deska drží 2, 7, 9, K
    // a jen dva kluby. Zbývá 44 karet, které mohou přijít.
    //
    // - `9s` dá soupeři čtyři devítky: **jediná prohra**,
    // - `Kd` dá hrdinovi čtyři krále,
    // - dvojka nebo sedmička spáruje desku a oba mají full house, ale KKK+X
    //   poráží 999+X,
    // - cokoli jiného nechá trojici králů nad trojicí devítek.
    //
    // Hrdina tedy vyhrává 43 ze 44 dojezdů. Remíza nepřipadá v úvahu.
    const equity = turnShowdownEquity(BOARD)("KsKh", [{ combo: "9c9d", weight: 1 }]);

    expect(equity).toBeDefined();
    expect(equity ?? 0).toBeCloseTo(43 / 44, 9);
  });

  it("prázdná soupeřova range nedá nulu, ale žádnou odpověď", () => {
    // Blokátory vyřazuje volající. Když po filtraci nezbude nikdo, musí přijít
    // `undefined` - nula by znamenala „hrdina vždy prohraje".
    expect(turnShowdownEquity(BOARD)("AsKd", [])).toBeUndefined();
  });

  it("proti složené range leží equity mezi krajními hodnotami", () => {
    // `AsKd` je pár králů: proti trojici prohrává, proti třem vyhrává. Proti
    // oběma dohromady musí ležet mezi. Kdyby se váhy sčítaly místo průměrování,
    // skončí výsledek mimo interval - a pořád bude vypadat jako equity.
    const equity = turnShowdownEquity(BOARD);
    const versusTrips = equity("AsKd", [{ combo: "KsKh", weight: 1 }]) ?? 0;
    const versusSmallPair = equity("AsKd", [{ combo: "3s3h", weight: 1 }]) ?? 0;
    const versusBoth = equity("AsKd", [
      { combo: "KsKh", weight: 1 },
      { combo: "3s3h", weight: 1 },
    ]) ?? 0;

    expect(versusTrips).toBeLessThan(0.1);
    expect(versusSmallPair).toBeGreaterThan(0.9);
    expect(versusBoth).toBeGreaterThan(versusTrips);
    expect(versusBoth).toBeLessThan(versusSmallPair);
  });

  it("nedokončená deska nedá číslo", () => {
    // Tři karty nejsou turn. Kdyby to prošlo, počítal by se dojezd ze špatné
    // ulice a výsledek by pořád vypadal jako equity.
    expect(turnShowdownEquity(["2c", "7d", "9h"])("AsKd", [
      { combo: "QsQh", weight: 1 },
    ])).toBeUndefined();
  });
});
