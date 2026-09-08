import { combosOfClass, type ComboActionEv, type SolverNode } from "./riverActionEv";

/**
 * EV akcí na turnu, dopočtená přes vyřešenou riverovou vrstvu.
 *
 * ## Proč to nejde vzít ze solveru
 *
 * Solver EV nevypisuje: ve dvanácti dumpech je nula výskytů klíče začínajícího
 * `"ev` a riverové uzly turnové podhry jsou `chance_node` s `deal_number: 0`,
 * tedy useknuté pahýly (bod 131). Hodnota turnového rozhodnutí se proto musí
 * složit z riverových podher, které noc dořešila pod touž turnovou podherou.
 *
 * ## Konvence, na které to celé stojí
 *
 * `riverValue` vrací **expektaci na jednotku soupeřovy range** v žetonech,
 * měřenou od rozdání páté karty a počítanou tak, že pot ležící na stole je
 * výhrou - stejně jako `riverActionEv`. Rekurze si přitom nese váhy zúžené po
 * větvi, jejichž součet je pravděpodobnost dosažení. Když se ta dvě čísla
 * smíchají bez rozmyslu, EV vyjde vynásobená pravděpodobností dosažení a
 * **bude vypadat úplně rozumně** - je pořád v žetonech, pořád záporná u
 * složení, pořád vyšší pro lepší ruce. Proto se násobí explicitně součtem vah
 * a na konci se dělí zpátky dosahem.
 */
export interface TurnEvInput {
  /** Kořen turnové podhry. */
  node: SolverNode;
  /** Čtyři karty desky po turnu; slouží k vyřazení mrtvých karet. */
  board: readonly string[];
  /** Pot na začátku podhry, v žetonech. */
  potChips: number;
  /** Range OOP a IP hráče na začátku podhry: třída ruky na váhu 0-1. */
  oop: Readonly<Record<string, number>>;
  ip: Readonly<Record<string, number>>;
  /** Akce od kořene k rozhodnutí, které se má spočítat. Prázdná znamená kořen. */
  line?: readonly string[];
  /**
   * Hodnota riverové vrstvy pro jednu hrdinovu kombinaci, na jednotku range.
   *
   * `undefined` znamená, že pro tuhle turnovou linku vrstva neexistuje - a to
   * **není nula**. Rozhodnutí, pod kterým chybí byť jedna linka, se nedodává
   * vůbec, protože EV spočtená z části stromu se od správné nedá rozeznat.
   */
  riverValue: (turnLine: readonly string[], heroCombo: string) => number | undefined;
}

interface Weighted { combo: string; weight: number }

function expandRange(
  range: Readonly<Record<string, number>>,
  dead: ReadonlySet<string>,
): Weighted[] {
  const out: Weighted[] = [];
  for (const [handClass, weight] of Object.entries(range)) {
    if (weight <= 0) continue;
    for (const combo of combosOfClass(handClass, dead)) out.push({ combo, weight });
  }
  return out;
}

/** Kolik má ten, kdo je na tahu, v potu po téhle akci. */
function committedAfter(
  action: string,
  acting: number,
  committed: readonly [number, number],
): [number, number] {
  const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
  const next: [number, number] = [committed[0], committed[1]];
  if (sized !== null) next[acting] = Number(sized[2]);
  else if (/^CALL$/i.test(action.trim())) next[acting] = Math.max(committed[0], committed[1]);
  return next;
}

const isFold = (action: string): boolean => /^FOLD$/i.test(action.trim());

const sumOf = (rows: readonly Weighted[]): number => (
  rows.reduce((sum, row) => sum + row.weight, 0)
);

/**
 * EV každé akce hrdiny v jednom turnovém rozhodnutí, po kombinacích.
 *
 * Prázdné pole znamená „nedá se spočítat" - buď uzel není rozhodnutí, nebo pod
 * ním chybí riverová vrstva. Nikdy ne nulu vydávanou za výsledek.
 */
export function turnActionEv(input: TurnEvInput): ComboActionEv[] {
  const { board, potChips, riverValue } = input;
  if (board.length !== 4) return [];

  const dead = new Set(board);
  let current: SolverNode = input.node;
  let oopWeights = expandRange(input.oop, dead);
  let ipWeights = expandRange(input.ip, dead);
  let committed: [number, number] = [0, 0];
  const prefix: string[] = [];

  // Sejdi po lince k rozhodnutí a cestou zužuj obě range podle strategie toho,
  // kdo je na tahu - stejně jako na riveru a ze stejného důvodu: čelící
  // rozhodnutí se nesmí počítat z rangí, jaké byly na začátku ulice.
  for (const step of input.line ?? []) {
    if (current.node_type !== "action_node" || current.strategy === undefined) return [];
    const strategy = current.strategy;
    const index = strategy.actions.indexOf(step);
    if (index < 0) return [];
    const acting = current.player ?? 0;
    const narrow = (list: readonly Weighted[]): Weighted[] => list
      .map((row) => ({ combo: row.combo, weight: row.weight * (strategy.strategy[row.combo]?.[index] ?? 0) }))
      .filter((row) => row.weight > 0);
    // Hráč 1 je OOP, ne 0. Tatáž konvence jako v `riverActionEv`; obrácená se
    // pozná jen tím, že se hrdinovi nabídne soupeřova range - čísla zůstanou
    // věrohodná. Tenhle modul ji měl nejdřív obráceně a testy to nechytily,
    // protože jim `riverValue` vracela konstantu.
    if (acting === 1) oopWeights = narrow(oopWeights);
    else ipWeights = narrow(ipWeights);
    committed = committedAfter(step, acting, committed);
    prefix.push(step);
    const child = current.childrens?.[step];
    if (child === undefined) return [];
    current = child;
  }

  const decisionStrategy = current.strategy;
  if (current.node_type !== "action_node" || decisionStrategy === undefined) return [];
  const decision = current;
  const heroPlayer = decision.player ?? 0;
  const heroIsOop = heroPlayer === 1;
  const heroes = heroIsOop ? oopWeights : ipWeights;
  const villains = heroIsOop ? ipWeights : oopWeights;
  const reach = sumOf(villains);
  if (reach === 0) return [];

  let missing = false;

  const value = (
    node: SolverNode,
    heroCombo: string,
    live: readonly Weighted[],
    held: readonly [number, number],
    line: readonly string[],
  ): number => {
    const weight = sumOf(live);
    if (weight === 0) return 0;

    // Pahýl riveru: dál strom nevede a hodnotu dodá vyřešená vrstva.
    if (node.node_type !== "action_node" || node.strategy === undefined) {
      const perUnit = riverValue(line, heroCombo);
      if (perUnit === undefined) { missing = true; return 0; }
      return weight * (perUnit - held[heroPlayer]);
    }

    const strategy = node.strategy;
    const acting = node.player ?? 0;

    if (acting === heroPlayer) {
      const own = strategy.strategy[heroCombo];
      let sum = 0;
      for (const [index, action] of strategy.actions.entries()) {
        const frequency = own?.[index] ?? 0;
        if (frequency <= 0) continue;
        const next = committedAfter(action, acting, held);
        sum += frequency * (isFold(action)
          ? -held[heroPlayer] * weight
          : value(node.childrens?.[action] ?? {}, heroCombo, live, next, [...line, action]));
      }
      return sum;
    }

    let sum = 0;
    for (const [index, action] of strategy.actions.entries()) {
      const branch: Weighted[] = [];
      for (const villain of live) {
        const frequency = strategy.strategy[villain.combo]?.[index] ?? 0;
        if (frequency > 0) branch.push({ combo: villain.combo, weight: villain.weight * frequency });
      }
      if (branch.length === 0) continue;
      const next = committedAfter(action, acting, held);
      if (isFold(action)) {
        // Soupeř složil: hrdina bere pot i s tím, co tam soupeř nechal.
        sum += sumOf(branch) * (potChips + held[0] + held[1] - held[heroPlayer]);
        continue;
      }
      sum += value(node.childrens?.[action] ?? {}, heroCombo, branch, next, [...line, action]);
    }
    return sum;
  };

  const rows: ComboActionEv[] = [];
  for (const hero of heroes) {
    for (const action of decisionStrategy.actions) {
      const next = committedAfter(action, heroPlayer, committed);
      const weighted = isFold(action)
        ? -committed[heroPlayer] * reach
        : value(decision.childrens?.[action] ?? {}, hero.combo, villains, next, [...prefix, action]);
      rows.push({ combo: hero.combo, action, evChips: weighted / reach });
    }
  }
  return missing ? [] : rows;
}
