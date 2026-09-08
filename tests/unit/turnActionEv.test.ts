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

  it("částečně pokrytá vrstva vrátí EV i to, kolik dosahu na ní stojí", () => {
    // Noc neřeší všechny turnové linky, ale ty nejdosahovanější - 8 z 37 živých
    // nese 99,4 % dosahu. Přísné „chybí linka, nedodává se nic" by proto
    // neodpovědělo skoro nikde. Číslo o pokrytí se tedy vrací a práh si volí
    // ten, kdo EV dodává.
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
    // Hrdina checkne v 75 % a sází ve 25 %, takže na vrstvu stojí tři čtvrtiny.
    expect(result.coveredReach).toBeCloseTo(0.75, 6);
    const checks = result.rows.filter((row) => row.action === "CHECK");
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
