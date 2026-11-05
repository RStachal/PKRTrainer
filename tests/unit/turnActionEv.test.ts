import { describe, expect, it } from "vitest";

import { turnActionEv } from "../../src/core/turnActionEv";
import { combosOfClass, type SolverNode } from "../../src/core/riverActionEv";

/**
 * EV na turnu se skládá z riverových vrstev, a to je výpočet, jehož nejhorší
 * selhání není pád, ale **věrohodné špatné číslo**: pořád v žetonech, pořád
 * záporné u složení, pořád vyšší pro lepší ruku. Testy proto nepočítají totéž
 * podruhé - stavějí situace, kde je správná odpověď spočitatelná na papíře.
 *
 * Riverová vrstva se sem podstrkuje jako funkce, takže jde ověřit i to, co se
 * na skutečných datech ověřit nedá: co se stane, když vrstva chybí.
 *
 * **Hráč 1 je OOP**, stejně jako v `riverActionEv`. Uzly se strategií `AKo`
 * tedy patří hráči 1, uzly s `QQ` hráči 0.
 */

const BOARD = ["2c", "7d", "9h", "Kc"];

/** Range jedné třídy, aby šel počet kombinací spočítat ručně. */
const ACE_KING = { AKo: 1 };
const QUEENS = { QQ: 1 };

/**
 * Strategie pro všechny kombinace třídy.
 *
 * Klíče se nesmí psát ručně: kombinace vznikají podle konvence `combosOfClass`
 * a deska některé z nich zabíjí - `Kc` leží na desce, takže `AKo` má tři
 * kombinace, ne dvanáct. Ručně napsaný klíč tiše nesedí a pravidlo dostane
 * frekvenci nula, což vypadá jako spočítaná nula. Přesně na tom tenhle test
 * poprvé spadl.
 */
function everyCombo(handClass: string, frequencies: number[]): Record<string, number[]> {
  const dead = new Set(BOARD);
  return Object.fromEntries(combosOfClass(handClass, dead).map((combo) => [combo, frequencies]));
}

function node(options: {
  player: number;
  actions: string[];
  strategy: Record<string, number[]>;
  childrens?: Record<string, SolverNode>;
}): SolverNode {
  return {
    node_type: "action_node",
    player: options.player,
    actions: options.actions,
    strategy: { actions: options.actions, strategy: options.strategy },
    ...(options.childrens === undefined ? {} : { childrens: options.childrens }),
  };
}

/** Pahýl, jaký solver nechává místo riveru. */
const riverStub: SolverNode = { node_type: "chance_node" };

/** Hrdina OOP checkne, soupeř checkne, jde se na river. */
function checkThrough(): SolverNode {
  return node({
    player: 1,
    actions: ["CHECK"],
    strategy: everyCombo("AKo", [1]),
    childrens: {
      CHECK: node({
        player: 0,
        actions: ["CHECK"],
        strategy: everyCombo("QQ", [1]),
        childrens: { CHECK: riverStub },
      }),
    },
  });
}

describe("turnActionEv", () => {
  it("check-check vrátí hodnotu riverové vrstvy beze změny", () => {
    // Nikdo nic nepřidal, takže se od hodnoty nemá co odečítat: EV = 120.
    const { rows } = turnActionEv({
      node: checkThrough(),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => 120,
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.evChips).toBeCloseTo(120, 6);
  });

  it("od hodnoty se odečte, co hrdina na turnu vložil", () => {
    // Hrdina sází 40 a soupeř vždy dorovná. Vrstva vrací 150, takže hrdina
    // končí na 150 - 40 = 110. Bez odečtu by vyšlo 150 a sázka by vypadala
    // lépe, než je.
    const { rows } = turnActionEv({
      node: node({
        player: 1,
        actions: ["BET 40.000000"],
        strategy: everyCombo("AKo", [1]),
        childrens: {
          "BET 40.000000": node({
            player: 0,
            actions: ["CALL"],
            strategy: everyCombo("QQ", [1]),
            childrens: { CALL: riverStub },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => 150,
    });

    for (const row of rows) expect(row.evChips).toBeCloseTo(110, 6);
  });

  it("složení soupeře dá hrdinovi pot i s tím, co tam soupeř nechal", () => {
    // Hrdina sází 40, soupeř má v potu 0 a v polovině případů skládá. Složení:
    // 100 + 40 + 0 - 40 = 100. Dorovnání: 150 - 40 = 110. Čekáme 105.
    const { rows } = turnActionEv({
      node: node({
        player: 1,
        actions: ["BET 40.000000"],
        strategy: everyCombo("AKo", [1]),
        childrens: {
          "BET 40.000000": node({
            player: 0,
            actions: ["FOLD", "CALL"],
            strategy: everyCombo("QQ", [0.5, 0.5]),
            childrens: { CALL: riverStub },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => 150,
    });

    for (const row of rows) expect(row.evChips).toBeCloseTo(105, 6);
  });

  it("EV složení je přesně mínus to, co hrdina do potu vložil", () => {
    // Nezávislá kontrola: tuhle hodnotu určují pravidla pokeru, ne tenhle modul.
    // Hrdina vsadil 40, soupeř zvýšil na 120 a hrdina skládá - přišel tedy
    // přesně o svých 40. Kdyby se do toho připletl pot nebo soupeřův vklad,
    // vyšlo by číslo, které pořád vypadá jako EV.
    const { rows } = turnActionEv({
      node: node({
        player: 1,
        actions: ["BET 40.000000"],
        strategy: everyCombo("AKo", [1]),
        childrens: {
          "BET 40.000000": node({
            player: 0,
            actions: ["RAISE 120.000000"],
            strategy: everyCombo("QQ", [1]),
            childrens: {
              "RAISE 120.000000": node({
                player: 1,
                actions: ["FOLD", "CALL"],
                strategy: everyCombo("AKo", [1, 0]),
                childrens: { CALL: riverStub },
              }),
            },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      line: ["BET 40.000000", "RAISE 120.000000"],
      riverValue: () => 150,
    });

    const folds = rows.filter((row) => row.action === "FOLD");
    expect(folds.length).toBeGreaterThan(0);
    for (const row of folds) expect(row.evChips).toBeCloseTo(-40, 6);
  });

  it("chybějící riverová vrstva nedá nulu, ale žádnou odpověď", () => {
    // Nejdůležitější případ celého modulu. Nula je platná EV, takže by se
    // chybějící vrstva tvářila jako spočítaný výsledek.
    const { rows } = turnActionEv({
      node: checkThrough(),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => undefined,
    });

    expect(rows).toEqual([]);
  });

  it("akce bez jediné vyřešené větve se nevrátí, sestra ano", () => {
    // Noc neřeší všechny turnové linky, jen ty nejdosahovanější - 8 ze 43 nese
    // 99,4 % dosahu. Díra pod jednou akcí proto nesmí zahodit sestru; kdyby
    // ano, na skutečných datech nevyjde nic (a přesně to se stalo).
    const result = turnActionEv({
      node: node({
        player: 1,
        actions: ["CHECK", "BET 40.000000"],
        strategy: everyCombo("AKo", [0.75, 0.25]),
        childrens: {
          CHECK: node({
            player: 0,
            actions: ["CHECK"],
            strategy: everyCombo("QQ", [1]),
            childrens: { CHECK: riverStub },
          }),
          "BET 40.000000": node({
            player: 0,
            actions: ["CALL"],
            strategy: everyCombo("QQ", [1]),
            childrens: { CALL: riverStub },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      // Vrstva existuje jen pro linku bez sázky.
      riverValue: (line) => (line.includes("BET 40.000000") ? undefined : 120),
    });

    expect(result.rows.length).toBeGreaterThan(0);
    // CHECK stojí na vrstvě celý, BET nemá pokrytou ani část - a protože se
    // hlásí minimum přes řádky, musí být pokrytí nula u obou. Sázka se proto
    // nevrátí vůbec: nemá z čeho počítat.
    const checks = result.rows.filter((row) => row.action === "CHECK");
    const bets = result.rows.filter((row) => row.action !== "CHECK");
    expect(checks.length).toBeGreaterThan(0);
    expect(bets).toEqual([]);
    expect(result.coveredReach).toBeCloseTo(1, 6);
    for (const row of checks) expect(row.evChips).toBeCloseTo(120, 6);
  });

  it("hráč 1 je OOP, takže dostane OOP range - ne soupeřovu", () => {
    // Konvenci určuje `riverActionEv` (`heroIsOop = player === 1`) a obrácená
    // se nepozná na číslech: EV zůstane v žetonech i v rozumném rozsahu, jen
    // patří jiné ruce. Test proto nekontroluje hodnotu, ale **čí kombinace** se
    // vrátily. Modul to měl nejdřív obráceně a ostatní testy prošly.
    const { rows } = turnActionEv({
      node: checkThrough(),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => 120,
    });

    const dead = new Set(BOARD);
    const combos = new Set(rows.map((row) => row.combo));
    expect([...combos].sort()).toEqual([...combosOfClass("AKo", dead)].sort());
    for (const combo of combosOfClass("QQ", dead)) expect(combos.has(combo)).toBe(false);
  });

  it("nepokrytá větev ubere jen tolik pokrytí, kolik se hraje", () => {
    // Hrdina checkne, soupeř sází 40. Hrdina pak v 90 % dorovná (vrstva je) a
    // v 10 % zvýší (vrstva není). Chybí tedy **desetina** hry, ne celá.
    //
    // Čitatel se hrdinovou frekvencí násobí, jmenovatel se jí dřív nenásobil,
    // takže větev hraná v deseti procentech ubrala sto procent pokrytí. Řádek
    // pak buď vypadl úplně, nebo se EV vydělila příliš malým číslem a nafoukla.
    // Na skutečných datech to hlásilo 7,4 % pokrytí tam, kde měl plán vyřešené
    // všechny živé linky, a EV 565 žetonů na potu 50.
    //
    // Ruční výpočet: EV dorovnání je 150 - 40 = 110, váží se 0,9 a dělí se
    // pokrytou vahou 0,9 - takže přesně 110, a pokrytí 0,9.
    const { rows, coveredReach } = turnActionEv({
      node: node({
        player: 1,
        actions: ["CHECK"],
        strategy: everyCombo("AKo", [1]),
        childrens: {
          CHECK: node({
            player: 0,
            actions: ["BET 40.000000"],
            strategy: everyCombo("QQ", [1]),
            childrens: {
              "BET 40.000000": node({
                player: 1,
                actions: ["CALL", "RAISE 120.000000"],
                strategy: everyCombo("AKo", [0.9, 0.1]),
                childrens: {
                  CALL: riverStub,
                  "RAISE 120.000000": node({
                    player: 0,
                    actions: ["CALL"],
                    strategy: everyCombo("QQ", [1]),
                    childrens: { CALL: riverStub },
                  }),
                },
              }),
            },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: (line) => (line.includes("RAISE 120.000000") ? undefined : 150),
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(coveredReach).toBeCloseTo(0.9, 6);
    for (const row of rows) {
      expect(row.coveredShare).toBeCloseTo(0.9, 6);
      expect(row.evChips).toBeCloseTo(110, 6);
    }
  });

  it("uzel bez údaje o tom, kdo je na tahu, se nezodpoví", () => {
    // Pole `player` říká, čí je to rozhodnutí, a tím i čí range se vezme a čí
    // vklady se odečtou. Bez něj by se to muselo domyslet - a domyšlená strana
    // dá EV v žetonech, věrohodnou a patřící druhému hráči.
    const withoutPlayer = { ...checkThrough() } as SolverNode & { player?: number };
    delete withoutPlayer.player;

    const { rows } = turnActionEv({
      node: withoutPlayer,
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => 120,
    });

    expect(rows).toEqual([]);
  });

  it("kombinace, kterou solver nevede, nepatří ani do jmenovatele", () => {
    // Range se sem předává po třídách, ale solver vede konkrétní kombinace a
    // některé z té třídy vůbec nemá - na `222r/CHECK_CHECK__3c` je to 30 ze
    // 182, tedy 16 % váhy. Takové kombinaci vyjde u každé akce frekvence nula:
    // z čitatele vypadne, a dokud zůstávala ve jmenovateli, EV vycházela tiše
    // nižší, zatímco pokrytí hlásilo 100 %.
    //
    // Tady soupeř drží `QQ` i `33`, ale strategie zná jen `QQ`. Vrstva vrací
    // 120, takže správná odpověď je 120 - ne 60.
    const { rows, coveredReach } = turnActionEv({
      node: node({
        player: 1,
        actions: ["CHECK"],
        strategy: everyCombo("AKo", [1]),
        childrens: {
          CHECK: node({
            player: 0,
            actions: ["CHECK"],
            strategy: everyCombo("QQ", [1]),
            childrens: { CHECK: riverStub },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: { QQ: 1, 33: 1 },
      riverValue: () => 120,
    });

    expect(rows.length).toBeGreaterThan(0);
    // Nevedená kombinace není díra v datech, takže pokrytí zůstává plné.
    expect(coveredReach).toBeCloseTo(1, 9);
    for (const row of rows) expect(row.evChips).toBeCloseTo(120, 6);
  });

  it("hrdinova kombinace mimo strategii uzlu nedá nulu, ale žádnou odpověď", () => {
    // Protějšek testu o soupeřově kombinaci, jen o patro jinde. Hrdina checkne,
    // soupeř sází a hrdina se ocitne v uzlu, kde ho solver **nevede** - třeba
    // proto, že se tam jeho ruka nedostane. Všechny frekvence jsou pak nula,
    // podstrom se sečte na nulu a bez ošetření by se to vrátilo jako spočítaná
    // EV s plným pokrytím. Nula je přitom platná EV, takže by to nešlo poznat.
    const { rows } = turnActionEv({
      node: node({
        player: 1,
        actions: ["CHECK"],
        strategy: everyCombo("AKo", [1]),
        childrens: {
          CHECK: node({
            player: 0,
            actions: ["BET 40.000000"],
            strategy: everyCombo("QQ", [1]),
            childrens: {
              // Uzel hrdiny, ale strategii má pro cizí třídu: `AKo` tam není.
              "BET 40.000000": node({
                player: 1,
                actions: ["CALL"],
                strategy: everyCombo("QQ", [1]),
                childrens: { CALL: riverStub },
              }),
            },
          }),
        },
      }),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => 150,
    });

    expect(rows).toEqual([]);
  });

  /** Hrdina jde na turnu all-in a soupeř dorovná; vrstva pro takovou linku není. */
  function shoveCalled(): SolverNode {
    return node({
      player: 1,
      actions: ["BET 100.000000"],
      strategy: everyCombo("AKo", [1]),
      childrens: {
        "BET 100.000000": node({
          player: 0,
          actions: ["CALL"],
          strategy: everyCombo("QQ", [1]),
          childrens: { CALL: riverStub },
        }),
      },
    });
  }

  it("po all-inu se hodnota vezme z dojezdu, ne z chybějící vrstvy", () => {
    // Solver po all-inu žádnou riverovou vrstvu nedělá, a **nedělá ji právem**:
    // není co rozhodnout. Dokud to jádro nevědělo, hlásilo takovou větev jako
    // nepokrytou - a na 20 bb je all-in většina stromu, takže se ani jedna
    // kombinace nedostala nad 90 % pokrytí (bod 205).
    const heroes = { AKo: 1, 33: 1 };
    const { rows, coveredReach } = turnActionEv({
      node: shoveCalled(),
      board: BOARD,
      potChips: 100,
      stackChips: 100,
      oop: heroes,
      ip: QUEENS,
      riverValue: () => undefined,
    });

    expect(rows.length).toBeGreaterThan(0);
    // Nic nechybí: hodnotu dodal dojezd, ne vrstva.
    expect(coveredReach).toBeCloseTo(1, 9);
    for (const row of rows) expect(row.coveredShare).toBeCloseTo(1, 9);

    // Pot 100 plus dva stacky po 100; hrdina vloží 100. Víc než 200 vyhrát
    // nejde a víc než 100 prohrát taky ne - špatné měřítko by z toho vypadlo.
    for (const row of rows) {
      expect(row.evChips).toBeGreaterThanOrEqual(-100);
      expect(row.evChips).toBeLessThanOrEqual(200);
    }

    // A hlavně: EV musí záviset na tom, co hrdina drží. `Kc` leží na desce,
    // takže `AKo` je pár králů a `33` malý pár - plochý výsledek by znamenal,
    // že se dojezd počítá bez hrdinovy ruky.
    const dead = new Set(BOARD);
    const kings = new Set(combosOfClass("AKo", dead));
    const evOf = (which: ReadonlySet<string>): number => {
      const picked = rows.filter((row) => which.has(row.combo));
      return picked.reduce((sum, row) => sum + row.evChips, 0) / picked.length;
    };
    const small = new Set(combosOfClass("33", dead));
    expect(evOf(kings)).toBeGreaterThan(evOf(small) + 20);
  });

  it("bez zadaného stacku se all-in nepozná a EV se nedodá", () => {
    // `stackChips` je jediné, podle čeho jde all-in poznat. Kdyby se dojezd
    // dosazoval i bez něj, spočítal by se showdown i tam, kde se ještě sází -
    // tedy hodnota hry, která pokračuje, jako by skončila.
    const { rows } = turnActionEv({
      node: shoveCalled(),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: QUEENS,
      riverValue: () => undefined,
    });

    expect(rows).toEqual([]);
  });

  it("dosah se vydělí zpátky, takže EV nezávisí na váze soupeřovy range", () => {
    // Past, kvůli které modul násobí a zase dělí: kdyby se dosah nevydělil,
    // poloviční váha soupeřovy range by EV zmenšila na polovinu a číslo by
    // pořád vypadalo rozumně.
    const build = (weight: number) => turnActionEv({
      node: checkThrough(),
      board: BOARD,
      potChips: 100,
      oop: ACE_KING,
      ip: { QQ: weight },
      riverValue: () => 120,
    });

    const full = build(1).rows;
    const half = build(0.5).rows;
    expect(half.length).toBe(full.length);
    for (const [index, row] of half.entries()) {
      expect(row.evChips).toBeCloseTo(full[index].evChips, 6);
    }
  });
});
