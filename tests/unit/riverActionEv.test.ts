import { describe, expect, it } from "vitest";

import {
  combosOfClass,
  riverActionEv,
  type SolverNode,
} from "../../src/core/riverActionEv";

/**
 * Dopočet EV riverových akcí.
 *
 * Ověřuje se na spotech, kde je odpověď známá dopředu z aritmetiky, ne na shodě
 * výpočtu se sebou samým. Kdyby se testovalo srovnáním s vlastním mezivýsledkem,
 * prošla by i systematická chyba - a EV je číslo, které hráč uvidí u každé akce,
 * takže se na něm nesmí nic domýšlet.
 *
 * Deska `Kd 8s 5c 3d 2h`: žádná barva, žádná postupka. Trojice králů je jasně
 * lepší než 7-6 bez páru, takže výsledek showdownu je v každém případě jistý a
 * počítá se jen aritmetika potu.
 */
const BOARD = ["Kd", "8s", "5c", "3d", "2h"];
const POT = 100;

/** Uzel s pevnou strategií: každá kombinace hraje zadané frekvence. */
function node(
  player: number,
  actions: string[],
  frequencies: number[],
  combos: string[],
  childrens: Record<string, SolverNode> = {},
): SolverNode {
  const strategy: Record<string, number[]> = {};
  for (const combo of combos) strategy[combo] = frequencies;
  return { node_type: "action_node", player, actions, strategy: { actions, strategy }, childrens };
}

const heroCombos = combosOfClass("KK", new Set(BOARD));
const villainCombos = combosOfClass("76s", new Set(BOARD));

/** Kořen: hrdina (OOP, player 1) volí mezi checkem a sázkou 50. */
function tree(villainCallFrequency: number): SolverNode {
  return node(1, ["CHECK", "BET 50"], [0, 1], heroCombos, {
    // Po checku soupeř checkne zpátky a jde se na showdown.
    CHECK: node(0, ["CHECK"], [1], villainCombos, {}),
    "BET 50": node(
      0,
      ["CALL", "FOLD"],
      [villainCallFrequency, 1 - villainCallFrequency],
      villainCombos,
      { CALL: {} },
    ),
  });
}

const evOf = (results: ReturnType<typeof riverActionEv>, action: string) => {
  const rows = results.filter((row) => row.action === action);
  expect(rows.length, `akce ${action} chybí`).toBeGreaterThan(0);
  // Všechny kombinace KK jsou na téhle desce stejně silné, takže se musí shodovat.
  for (const row of rows) expect(row.evChips).toBeCloseTo(rows[0].evChips, 6);
  return rows[0].evChips;
};

describe("EV riverových akcí", () => {
  /**
   * Dorovnání, po kterém strom končí.
   *
   * Solver za terminální akci nezapisuje potomka vůbec - dorovnáním hra končí a
   * jde se ukazovat karty. Kořen na to místo dosazoval nulu, takže **EV
   * dorovnání vycházelo stejné pro nuts i pro vzduch** ve všech 149 uzlech
   * dodávaného obsahu, a sada přitom byla zelená: fixtura výš dává dorovnání
   * prázdného potomka `{}`, což je jiná větev kódu.
   */
  const facingBet = (): SolverNode => node(1, ["BET 50"], [1], combosOfClass("AA", new Set(BOARD)), {
    // Hrdina je IP a čelí sázce; jeho dorovnání i složení jsou konec hry.
    "BET 50": node(0, ["CALL", "FOLD"], [1, 0], [
      ...combosOfClass("KK", new Set(BOARD)),
      ...combosOfClass("76s", new Set(BOARD)),
    ]),
  });

  it("dorovnání, po kterém se ukazují karty, závisí na tom, co hrdina drží", () => {
    const strong = riverActionEv({
      node: facingBet(), board: BOARD, potChips: POT, line: ["BET 50"],
      oop: { AA: 1 }, ip: { KK: 1 },
    });
    // Pot 100 plus dvakrát 50: vítěz bere 200, z toho 50 vsadil sám.
    expect(evOf(strong, "CALL")).toBeCloseTo(150, 6);

    const weak = riverActionEv({
      node: facingBet(), board: BOARD, potChips: POT, line: ["BET 50"],
      oop: { AA: 1 }, ip: { "76s": 1 },
    });
    // Vysoká karta proti páru es: dorovnání je vyhozených padesát.
    expect(evOf(weak, "CALL")).toBeCloseTo(-50, 6);
  });

  it("složení stojí to, co hrdina na ulici vsadil, a nic víc", () => {
    const results = riverActionEv({
      node: facingBet(), board: BOARD, potChips: POT, line: ["BET 50"],
      oop: { AA: 1 }, ip: { KK: 1 },
    });
    expect(evOf(results, "FOLD")).toBeCloseTo(0, 6);
  });


  it("sázka s nejlepší rukou proti jistému dorovnání vynese pot i sázku", () => {
    // Pot 100, sázka 50, soupeř vždy dorovná, hrdina vyhraje: bere 100 + 50.
    const results = riverActionEv({
      node: tree(1), board: BOARD, potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
    });
    expect(evOf(results, "BET 50")).toBeCloseTo(150, 6);
  });

  it("sázka proti jistému složení vynese jen pot", () => {
    // Soupeř složí vždy: hrdina bere sto, vsazených padesát se mu vrací.
    const results = riverActionEv({
      node: tree(0), board: BOARD, potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
    });
    expect(evOf(results, "BET 50")).toBeCloseTo(100, 6);
  });

  it("check s nejlepší rukou proti checku vynese pot", () => {
    const results = riverActionEv({
      node: tree(1), board: BOARD, potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
    });
    expect(evOf(results, "CHECK")).toBeCloseTo(100, 6);
  });

  it("sázka s nejhorší rukou proti jistému dorovnání stojí sázku", () => {
    // Role obrácené: hrdina drží 7-6 a prohraje, takže přijde o vsazených 50.
    const swapped = node(1, ["CHECK", "BET 50"], [0, 1], villainCombos, {
      CHECK: node(0, ["CHECK"], [1], heroCombos, {}),
      "BET 50": node(0, ["CALL", "FOLD"], [1, 0], heroCombos, { CALL: {} }),
    });
    const results = riverActionEv({
      node: swapped, board: BOARD, potChips: POT,
      oop: { "76s": 1 }, ip: { KK: 1 },
    });
    expect(evOf(results, "BET 50")).toBeCloseTo(-50, 6);
  });

  it("poloviční dorovnání dá průměr obou konců", () => {
    // Padesát procent call, padesát fold: (150 + 100) / 2.
    const results = riverActionEv({
      node: tree(0.5), board: BOARD, potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
    });
    expect(evOf(results, "BET 50")).toBeCloseTo(125, 6);
  });

  it("dělený pot vrátí polovinu, ne nulu", () => {
    // Obě strany hrají A-K-Q-8-5 z desky a esa s dámou, takže showdown je remíza.
    // Z potu 200 bere hrdina sto a vsadil padesát: čistá změna +50, tedy půlka
    // původního potu. Nula by byla špatně - EV se měří jako změna hrdinových
    // žetonů od začátku uzlu a půlka toho, co v potu leželo, se mu vrací.
    //
    // Původní verze tohohle testu stavěla remízu z KK na obou stranách. Deska
    // bere jednoho krále, zbývají tři, a dvě kombinace KK se pak vždycky
    // překrývají - takže scénář nešel sestavit a výpočet správně vrátil prázdno.
    const aq = combosOfClass("AQs", new Set(BOARD));
    const split = node(1, ["BET 50"], [1], aq, {
      "BET 50": node(0, ["CALL"], [1], aq, { CALL: {} }),
    });
    const results = riverActionEv({
      node: split, board: BOARD, potChips: POT, oop: { AQs: 1 }, ip: { AQs: 1 },
    });
    expect(results.length).toBeGreaterThan(0);
    expect(evOf(results, "BET 50")).toBeCloseTo(50, 6);
  });

  it("odečet karet mění EV, ne jen počty", () => {
    // Bez tohohle případu odečet karet nikdo nekontroluje: v ostatních testech
    // se range nepřekrývají, takže vypnutí odečtu nezmění ani jedno číslo.
    // Ověřeno falsifikací - první verze téhle sady prošla i s odečtem vypnutým.
    //
    // Hrdina drží K-Q v barvě, tedy pár králů. Soupeř má buď KK (trojice, bije
    // hrdinu), nebo 7-6 v barvě (vysoká karta, prohrává). Deska bere jednoho
    // krále, zbývají tři, a hrdinův král dva ze tří možných KK zablokuje: soupeř
    // tedy může držet trojici jen jedním způsobem ze čtyř zbylých 7-6.
    //
    // Pot 100, sázka 50, soupeř vždy dorovná. Výhra dá 150, prohra -50:
    //   s odečtem   (1 × -50 + 4 × 150) / 5 = 110
    //   bez odečtu  (3 × -50 + 4 × 150) / 7 ≈ 64,3
    const hero = combosOfClass("KQs", new Set(BOARD));
    const villain = [
      ...combosOfClass("KK", new Set(BOARD)),
      ...combosOfClass("76s", new Set(BOARD)),
    ];
    const blocked = node(1, ["BET 50"], [1], hero, {
      "BET 50": node(0, ["CALL"], [1], villain, { CALL: {} }),
    });
    const results = riverActionEv({
      node: blocked, board: BOARD, potChips: POT,
      oop: { KQs: 1 }, ip: { KK: 1, "76s": 1 },
    });
    expect(evOf(results, "BET 50")).toBeCloseTo(110, 6);
  });

  it("odečítá karty: soupeř nemůže držet totéž co hrdina", () => {
    // Deska bere jednoho krále, hrdinovi zbývají tři, takže KK má tři kombinace
    // a proti sobě může mít jen ty, co nesdílí kartu.
    expect(combosOfClass("KK", new Set(BOARD)).length).toBe(3);
    expect(combosOfClass("76s", new Set(BOARD)).length).toBe(4);
  });

it("po lince zúží obě range, ne jen sejde o patro", () => {
    // Hráč, který na riveru čelí sázce, je o patro níž a jeho range i soupeřova
    // jsou tam zúžené tím, co se cestou stalo. Počítat takové rozhodnutí z
    // kořenových rangí by měřilo situaci, která u stolu nenastala.
    //
    // Soupeř sází jen s trojicí králů, s 7-6 checkuje. Hrdina drží A-Q a čelí
    // sázce 50 do potu 100. Po sázce je proti němu **jen** KK, takže dorovnání
    // prohrává vždy: -50. Kdyby se braly kořenové range, počítalo by se i se
    // 7-6, které hrdina bije, a číslo by vyšlo o dost lepší.
    const heroCards = combosOfClass("AQs", new Set(BOARD));
    const kings = combosOfClass("KK", new Set(BOARD));
    const sevens = combosOfClass("76s", new Set(BOARD));

    // Kořen: soupeř (IP, player 0) volí mezi checkem a sázkou podle své ruky.
    const betting: Record<string, number[]> = {};
    for (const combo of kings) betting[combo] = [0, 1];
    for (const combo of sevens) betting[combo] = [1, 0];
    const root: SolverNode = {
      node_type: "action_node",
      player: 0,
      actions: ["CHECK", "BET 50"],
      strategy: { actions: ["CHECK", "BET 50"], strategy: betting },
      childrens: {
        CHECK: { node_type: "action_node", player: 1, actions: ["CHECK"], strategy: { actions: ["CHECK"], strategy: Object.fromEntries(heroCards.map((c) => [c, [1]])) }, childrens: {} },
        "BET 50": {
          node_type: "action_node",
          player: 1,
          actions: ["CALL", "FOLD"],
          strategy: { actions: ["CALL", "FOLD"], strategy: Object.fromEntries(heroCards.map((c) => [c, [1, 0]])) },
          childrens: { CALL: {} },
        },
      },
    };

    const results = riverActionEv({
      node: root, board: BOARD, potChips: POT,
      oop: { AQs: 1 }, ip: { KK: 1, "76s": 1 },
      line: ["BET 50"],
    });
    expect(evOf(results, "CALL")).toBeCloseTo(-50, 6);
    // Složení nestojí nic navíc: hrdina do potu na téhle ulici nic nedal.
    expect(evOf(results, "FOLD")).toBeCloseTo(0, 6);
  });

  it("linka, která ve stromě není, se přizná", () => {
    const results = riverActionEv({
      node: tree(1), board: BOARD, potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
      line: ["BET 999"],
    });
    expect(results).toEqual([]);
  });

    it("uzel, který není rozhodnutí, nevrátí vymyšlenou nulu", () => {
    const results = riverActionEv({
      node: { node_type: "showdown" }, board: BOARD, potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
    });
    expect(results).toEqual([]);
  });

  it("nedokončená deska se odmítne", () => {
    // Bez páté karty není showdown rozhodnutelný a EV by bylo domyšlené.
    const results = riverActionEv({
      node: tree(1), board: BOARD.slice(0, 4), potChips: POT,
      oop: { KK: 1 }, ip: { "76s": 1 },
    });
    expect(results).toEqual([]);
  });
});
