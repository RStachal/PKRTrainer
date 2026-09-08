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
   * **není nula**. Chybějící linka se nezaokrouhluje ani nedosazuje; místo toho
   * se sečte, kolik dosahu na ni připadlo, a vrátí se to jako `coveredReach`.
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

export interface TurnEvResult {
  /** EV každé akce hrdiny, po kombinacích. Prázdné, když se nedá spočítat. */
  rows: ComboActionEv[];
  /**
   * Jakou část hrdinovy hry vrácené akce popisují, 0 az 1.
   *
   * Akce, pod kterou chybí byť jedna riverová vrstva, se **nevrací vůbec** -
   * EV z části stromu se od správné nedá rozeznat. Jenže noc neřeší všechny
   * turnové linky, jen ty nejdosahovanější: změřeno 8. 9. 2026 na
   * `MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR__532mono`, kde plán vybral **8 linek
   * z 37 živých a ty nesou 99,4 % dosahu**. Zahodit celé rozhodnutí kvůli
   * jedné vzácné větvi by tedy zahodilo skoro všechno.
   *
   * Číslo říká, kolik z toho, co hrdina podle solveru doopravdy hraje, má
   * spočítanou EV. Práh si volí ten, kdo EV dodává, a musí ho umět obhájit.
   */
  coveredReach: number;
}

/**
 * EV každé akce hrdiny v jednom turnovém rozhodnutí, po kombinacích.
 *
 * Prázdné `rows` znamená „nedá se spočítat" - uzel není rozhodnutí, nebo pod
 * ním nestojí ani kus vrstvy. Nikdy ne nula vydávaná za výsledek.
 */
export function turnActionEv(input: TurnEvInput): TurnEvResult {
  const { board, potChips, riverValue } = input;
  const empty: TurnEvResult = { rows: [], coveredReach: 0 };
  if (board.length !== 4) return empty;

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
    if (current.node_type !== "action_node" || current.strategy === undefined) return empty;
    const strategy = current.strategy;
    const index = strategy.actions.indexOf(step);
    if (index < 0) return empty;
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
    if (child === undefined) return empty;
    current = child;
  }

  const decisionStrategy = current.strategy;
  if (current.node_type !== "action_node" || decisionStrategy === undefined) return empty;
  const decision = current;
  const heroPlayer = decision.player ?? 0;
  const heroIsOop = heroPlayer === 1;
  const heroes = heroIsOop ? oopWeights : ipWeights;
  const villains = heroIsOop ? ipWeights : oopWeights;
  const reach = sumOf(villains);
  if (reach === 0) return empty;

  // Narazila tahle jedna akce na chybějící vrstvu? Resetuje se u každé zvlášť,
  // protože EV se počítá po akcích a díra v jedné větvi neznehodnocuje sestru.
  let hitMissing = false;

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
      if (perUnit === undefined) { hitMissing = true; return 0; }
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
  let covered = 0;
  let total = 0;
  for (const hero of heroes) {
    let kept = 0;
    for (const [index, action] of decisionStrategy.actions.entries()) {
      hitMissing = false;
      const next = committedAfter(action, heroPlayer, committed);
      const weighted = isFold(action)
        ? -committed[heroPlayer] * reach
        : value(decision.childrens?.[action] ?? {}, hero.combo, villains, next, [...prefix, action]);
      if (hitMissing) continue;
      rows.push({ combo: hero.combo, action, evChips: weighted / reach });
      kept += decisionStrategy.strategy[hero.combo]?.[index] ?? 0;
    }
    covered += hero.weight * kept;
    total += hero.weight;
  }
  if (rows.length === 0) return empty;
  return { rows, coveredReach: total === 0 ? 0 : covered / total };
}
