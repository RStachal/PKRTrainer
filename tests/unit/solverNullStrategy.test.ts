import { describe, expect, it } from "vitest";

import {
  combosOfClass,
  hasUncomputedNode,
  riverActionEv,
  strategyMap,
  type SolverNode,
} from "../../src/core/riverActionEv";
import { turnActionEv } from "../../src/core/turnActionEv";
import { readTurnSubgame } from "../../src/data/ranges/turnSubgameReader";
import { subgameDecisions } from "../../scripts/lib/subgameDecisions.mts";

/**
 * Uzel, který solver nespočítal: `"strategy": { "actions": [...], "strategy": null }`.
 *
 * Znamená, že solver **nevyřešil vrstvu**: plán mu zadal linku s prázdnou nebo
 * skoro prázdnou range jednoho z hráčů, solver nic nepočítal a ostatní uzly
 * nechal na výchozích 1/n (změřeno 15. 10. 2026, viz `SolverStrategy`). Typy to
 * do té doby zamlčovaly a kontroly se ptaly jen na `=== undefined`; jen v rodině
 * `MTT9_25BB_LJ_BB_SRP` to bylo 419 riverových vrstev a stavěč riverových packů
 * na nich padal s „Cannot convert undefined or null to object". Ranní cyklus
 * riverové packy přestavuje jen při změně vstupů, takže na to nikdo nenarazil.
 *
 * Proto se z takové vrstvy nebere nic - ani uzly, které čísla mají.
 *
 * Každý případ má **dvojče se spočítaným uzlem**. Bez něj by prázdný výsledek
 * nic nedokazoval: vrátí ho i fixtura s překlepem v klíči nebo s range, která
 * se rozvine na nic - a test by prošel i bez opravy.
 */

/** Uzel, který solver spočítal. */
function computed(
  player: number,
  actions: string[],
  strategy: Record<string, number[]>,
  childrens?: Record<string, SolverNode>,
): SolverNode {
  return {
    node_type: "action_node",
    player,
    actions,
    strategy: { actions, strategy },
    ...(childrens === undefined ? {} : { childrens }),
  };
}

/** Uzel, který solver nespočítal - tvar přesně ze skutečné vrstvy. */
function unreached(
  player: number,
  actions: string[],
  childrens?: Record<string, SolverNode>,
): SolverNode {
  return {
    node_type: "action_node",
    player,
    actions,
    strategy: { actions, strategy: null },
    ...(childrens === undefined ? {} : { childrens }),
  };
}

/**
 * Strategie pro všechny kombinace třídy. Klíče se nesmí psát ručně: ručně
 * napsaný klíč tiše nesedí na konvenci `combosOfClass` a kombinace dostane
 * frekvenci nula, což vypadá jako spočítaná nula.
 */
function everyCombo(
  handClass: string,
  board: readonly string[],
  frequencies: number[],
): Record<string, number[]> {
  return Object.fromEntries(
    combosOfClass(handClass, new Set(board)).map((combo) => [combo, frequencies]),
  );
}

/**
 * River: hrdina (OOP, hráč 1) drží KK, soupeř (IP, hráč 0) 76s. Deska bez barvy
 * i postupky, takže showdown je jistý a EV je jen aritmetika potu.
 */
const RIVER = ["Kd", "8s", "5c", "3d", "2h"];

/**
 * Hrdina vsadí 50, soupeř navýší na 150, hrdina dorovná nebo složí.
 * `villain` je soupeřův uzel - spočítaný, nebo ne.
 */
function riverTree(villain: (childrens: Record<string, SolverNode>) => SolverNode): SolverNode {
  const facingRaise = computed(1, ["CALL", "FOLD"], everyCombo("KK", RIVER, [1, 0]));
  return computed(1, ["CHECK", "BET 50"], everyCombo("KK", RIVER, [0, 1]), {
    "BET 50": villain({ "RAISE 150": facingRaise }),
  });
}

const riverVillainRaises = (childrens: Record<string, SolverNode>): SolverNode => computed(
  0, ["CALL", "FOLD", "RAISE 150"], everyCombo("76s", RIVER, [0, 0, 1]), childrens,
);
const riverVillainUnreached = (childrens: Record<string, SolverNode>): SolverNode => unreached(
  0, ["CALL", "FOLD", "RAISE 150"], childrens,
);

describe("strategyMap", () => {
  it("bere nespočítaný uzel stejně jako uzel bez strategie", () => {
    expect(strategyMap(unreached(0, ["CALL", "FOLD"]))).toBeUndefined();
    expect(strategyMap({ node_type: "action_node" })).toBeUndefined();
    expect(strategyMap(undefined)).toBeUndefined();
    const map = everyCombo("KK", RIVER, [1, 0]);
    expect(strategyMap(computed(1, ["CALL", "FOLD"], map))).toBe(map);
  });
});

describe("výčet rozhodnutí podhry a nespočítaný uzel", () => {
  it("spočítaný strom má tři rozhodnutí (dvojče)", () => {
    const lines = subgameDecisions(riverTree(riverVillainRaises), 100, 1000)
      .map((decision) => decision.line.join("|"));
    expect(lines).toEqual(["", "BET 50", "BET 50|RAISE 150"]);
  });

  it("vrstvu s nespočítaným uzlem odmítne celou, i se spočítaným kořenem", () => {
    // Tady stavěč padal: `Object.values(block.strategy)` na `null`. A kořen se
    // nevypíše ani se svými čísly - v nevyřešené vrstvě jsou to výchozí 1/n,
    // které by do packu prošly jako strategie solveru.
    expect(subgameDecisions(riverTree(riverVillainUnreached), 100, 1000)).toEqual([]);
  });
});

describe("hasUncomputedNode", () => {
  it("najde nespočítaný uzel kdekoli v podstromu", () => {
    expect(hasUncomputedNode(riverTree(riverVillainRaises))).toBe(false);
    expect(hasUncomputedNode(riverTree(riverVillainUnreached))).toBe(true);
    expect(hasUncomputedNode(unreached(1, ["CALL", "FOLD"]))).toBe(true);
    // Uzel bez strategie je konec hry, ne nespočítaný uzel.
    const terminal: SolverNode = { node_type: "action_node" };
    expect(hasUncomputedNode(terminal)).toBe(false);
  });
});

describe("EV na riveru a nespočítaný uzel", () => {
  const input = (node: SolverNode, line: string[]) => ({
    node, board: RIVER, potChips: 100, oop: { KK: 1 }, ip: { "76s": 1 }, line,
  });

  it("dvojče: přes spočítaný uzel se čelící rozhodnutí ocení", () => {
    const rows = riverActionEv(input(riverTree(riverVillainRaises), ["BET 50", "RAISE 150"]));
    const calls = rows.filter((row) => row.action === "CALL");
    expect(calls.length).toBeGreaterThan(0);
    // Pot 100 a dvakrát 150: hrdina vyhraje 400, z toho 150 vložil sám.
    for (const row of calls) expect(row.evChips).toBeCloseTo(250, 6);
  });

  it("linka přes nespočítaný uzel se ocenit nedá - prázdno, ne pád", () => {
    expect(riverActionEv(input(riverTree(riverVillainUnreached), ["BET 50", "RAISE 150"])))
      .toEqual([]);
  });

  it("rozhodnutí se spočítaným kořenem a nespočítaným uzlem pod ním se neocení", () => {
    // Vzor ze tří turnových vrstev MTT9_25BB_LJ_CO_SRP__742r: kořen má čísla,
    // soupeřovy uzly pod ním jsou `null`. Dřív by se za `null` dosadil showdown
    // a vyšla by věrohodná EV z nevyřešené vrstvy.
    const rootAt = (villain: (childrens: Record<string, SolverNode>) => SolverNode) => riverActionEv(
      input(riverTree(villain), []),
    );
    expect(rootAt(riverVillainRaises).length).toBeGreaterThan(0);
    expect(rootAt(riverVillainUnreached)).toEqual([]);
  });

  it("nespočítané rozhodnutí samo se neocení", () => {
    const decision = unreached(1, ["CALL", "FOLD"]);
    const twin = computed(1, ["CALL", "FOLD"], everyCombo("KK", RIVER, [1, 0]));
    const root = (facing: SolverNode) => computed(0, ["BET 50"], everyCombo("76s", RIVER, [1]), {
      "BET 50": facing,
    });
    const at = (facing: SolverNode) => riverActionEv({
      node: root(facing), board: RIVER, potChips: 100, oop: { KK: 1 }, ip: { "76s": 1 },
      line: ["BET 50"],
    });
    expect(at(twin).length).toBeGreaterThan(0);
    expect(at(decision)).toEqual([]);
  });
});

describe("čtení turnové podhry a nespočítaný uzel", () => {
  it("vrátí nic, ne pád - dvojče vrátí strategii", () => {
    const board = ["2c", "7d", "9h", "Kc"];
    expect(readTurnSubgame(computed(1, ["CHECK", "BET 40"], everyCombo("AKo", board, [1, 0]))))
      .toBeDefined();
    expect(readTurnSubgame(unreached(1, ["CHECK", "BET 40"]))).toBeUndefined();
  });
});

describe("EV na turnu a nespočítaný uzel", () => {
  /** Hrdina (OOP, hráč 1) drží AKo, soupeř (IP, hráč 0) QQ. `Kc` zabíjí část AKo. */
  const TURN = ["2c", "7d", "9h", "Kc"];
  const riverStub: SolverNode = { node_type: "chance_node" };

  /**
   * Hrdina vsadí 40. Soupeř v polovině dorovná (dál river, vrstva vrací 150) a
   * v polovině navýší na 120; tam hrdina složí. `facingRaise` je hrdinův uzel
   * po navýšení - spočítaný, nebo ne.
   */
  const tree = (facingRaise: SolverNode): SolverNode => computed(
    1, ["BET 40.000000"], everyCombo("AKo", TURN, [1]), {
      "BET 40.000000": computed(
        0, ["CALL", "RAISE 120.000000"], everyCombo("QQ", TURN, [0.5, 0.5]), {
          CALL: riverStub,
          "RAISE 120.000000": facingRaise,
        },
      ),
    },
  );
  const heroFolds = computed(1, ["FOLD", "CALL"], everyCombo("AKo", TURN, [1, 0]), {
    CALL: riverStub,
  });
  const input = (node: SolverNode, line: string[] = []) => ({
    node, board: TURN, potChips: 100, oop: { AKo: 1 }, ip: { QQ: 1 }, line,
    riverValue: () => 150,
  });

  it("dvojče: se spočítaným uzlem plné pokrytí a EV z obou větví", () => {
    const { rows, coveredReach } = turnActionEv(input(tree(heroFolds)));
    expect(rows.length).toBeGreaterThan(0);
    // Dorovnání: 150 - 40 = 110. Navýšení a složení: -40. Půl na půl: 35.
    for (const row of rows) expect(row.evChips).toBeCloseTo(35, 6);
    expect(coveredReach).toBeCloseTo(1, 6);
  });

  it("dosah, který do nespočítaného uzlu dojde, je nepokrytý - ne nulová EV", () => {
    // Na skutečných datech by sem dosah dojít neměl; kdyby ano, musí se to
    // ukázat jako menší pokrytí. Kdyby se větev sečetla jako nula s plným
    // pokrytím, vyšlo by 55 a vypadalo by to jako spočítaný výsledek.
    const { rows, coveredReach } = turnActionEv(input(tree(unreached(1, ["FOLD", "CALL"], {
      CALL: riverStub,
    }))));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.evChips).toBeCloseTo(110, 6);
      expect(row.coveredShare).toBeCloseTo(0.5, 6);
    }
    expect(coveredReach).toBeCloseTo(0.5, 6);
  });

  it("linka přes nespočítaný uzel se ocenit nedá - prázdno, ne pád", () => {
    const line = ["BET 40.000000", "RAISE 120.000000"];
    const throughUnreachedVillain = computed(1, ["BET 40.000000"], everyCombo("AKo", TURN, [1]), {
      "BET 40.000000": unreached(0, ["CALL", "RAISE 120.000000"], {
        CALL: riverStub,
        "RAISE 120.000000": heroFolds,
      }),
    });
    expect(turnActionEv(input(tree(heroFolds), line)).rows.length).toBeGreaterThan(0);
    expect(turnActionEv(input(throughUnreachedVillain, line)).rows).toEqual([]);
  });

  it("nespočítané rozhodnutí samo se neocení", () => {
    const line = ["BET 40.000000", "RAISE 120.000000"];
    const unreachedDecision = unreached(1, ["FOLD", "CALL"], { CALL: riverStub });
    expect(turnActionEv(input(tree(heroFolds), line)).rows.length).toBeGreaterThan(0);
    expect(turnActionEv(input(tree(unreachedDecision), line)).rows).toEqual([]);
  });
});
