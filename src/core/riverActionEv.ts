import { compareShowdown } from "./showdownRank";

/**
 * EV jednotlivých akcí na riverovém uzlu, dopočítaná ze solverovy strategie.
 *
 * ## Proč se to počítá a nečte
 *
 * TexasSolver v0.2.0 EV nevypisuje. Ověřeno v jeho binárce: z celé příkazové
 * sady existuje `dump_result` a `dump_strategy`, žádný ekvivalent pro EV.
 * Přesolvení by tedy nepomohlo. Dumpy ale nesou strategii v každém uzlu, obě
 * range a celý strom, a to je všechno, co k výpočtu potřeba je.
 *
 * ## Co to znamená a co ne
 *
 * Tohle **nejsou solverovy counterfactual values**. Je to expektace nad
 * soupeřovou range za předpokladu, že obě strany hrají strategii, kterou solver
 * zapsal. U zkonvergovaného solvu jsou si ta dvě čísla blízká, ale nejsou to
 * tatáž věc a nesmí se pod jedním jménem dodávat - proto má výsledek vlastní
 * `ActionEvSource`, ne `SOLVER`.
 *
 * ## Konvence
 *
 * EV je čistá změna hrdinových žetonů od začátku tohoto uzlu, v žetonech.
 * Kladné číslo znamená zisk. Vsazené žetony se počítají jako `committed` na
 * této ulici; `potChips` je to, co v potu leželo, než se na riveru cokoli stalo.
 *
 * Solver značí hráče číslem: `1` je OOP, `0` je IP. Stejné mapování používá
 * `heroSideOfNode` v generátorech, takže se to nikde neurčuje dvakrát jinak.
 */

export interface SolverStrategy {
  actions: string[];
  strategy: Record<string, number[]>;
}

export interface SolverNode {
  node_type?: string;
  player?: number;
  actions?: string[];
  childrens?: Record<string, SolverNode>;
  strategy?: SolverStrategy;
}

export interface RiverEvInput {
  /** Kořen riverového podstromu. */
  node: SolverNode;
  /** Pět karet dokončené desky. */
  board: readonly string[];
  /** Pot na začátku uzlu, v žetonech. */
  potChips: number;
  /** Range OOP a IP hráče: třída ruky na váhu 0-1. */
  oop: Readonly<Record<string, number>>;
  ip: Readonly<Record<string, number>>;
}

export interface ComboActionEv {
  combo: string;
  action: string;
  evChips: number;
}

const SUITS = ["s", "h", "d", "c"] as const;

/** Rozvine třídu ruky na konkrétní kombinace, bez karet ležících na desce. */
export function combosOfClass(handClass: string, dead: ReadonlySet<string>): string[] {
  const combos: string[] = [];
  const [first, second] = [handClass[0], handClass[1]];
  if (handClass.length === 2) {
    for (let left = 0; left < SUITS.length; left += 1) {
      for (let right = left + 1; right < SUITS.length; right += 1) {
        const cards = [`${first}${SUITS[left]}`, `${second}${SUITS[right]}`];
        if (cards.some((card) => dead.has(card))) continue;
        combos.push(cards.join(""));
      }
    }
    return combos;
  }
  const suited = handClass[2] === "s";
  for (const leftSuit of SUITS) {
    for (const rightSuit of SUITS) {
      if (suited !== (leftSuit === rightSuit)) continue;
      if (!suited && SUITS.indexOf(leftSuit) > SUITS.indexOf(rightSuit)) continue;
      const cards = [`${first}${leftSuit}`, `${second}${rightSuit}`];
      if (cards.some((card) => dead.has(card))) continue;
      combos.push(cards.join(""));
    }
  }
  return combos;
}

/** Dvě karty kombinace `"AhKd"`. */
function cardsOf(combo: string): [string, string] {
  return [combo.slice(0, 2), combo.slice(2, 4)];
}

/**
 * Kolik je hráč po akci celkem vsazený na téhle ulici.
 *
 * `BET 17` znamená "na 17", ne "o 17" - stejná past, jaká už jednou stála za
 * chybou v `subgameDecisions`. `CALL` dorovnává soupeře.
 */
function committedAfter(
  action: string,
  player: number,
  committed: readonly [number, number],
): [number, number] {
  const next: [number, number] = [committed[0], committed[1]];
  const amount = /(\d+(?:\.\d+)?)/.exec(action);
  if (/^(BET|RAISE)/i.test(action) && amount !== null) {
    next[player] = Number(amount[1]);
  } else if (/^CALL$/i.test(action.trim())) {
    next[player] = committed[player === 1 ? 0 : 1];
  }
  return next;
}

interface Weighted { combo: string; weight: number; cards: [string, string] }

function expandRange(
  range: Readonly<Record<string, number>>,
  dead: ReadonlySet<string>,
): Weighted[] {
  const out: Weighted[] = [];
  for (const [handClass, weight] of Object.entries(range)) {
    if (weight <= 0) continue;
    for (const combo of combosOfClass(handClass, dead)) {
      out.push({ combo, weight, cards: cardsOf(combo) });
    }
  }
  return out;
}

/**
 * EV každé akce kořene pro každou hrdinovu kombinaci.
 *
 * Vrací prázdné pole, když uzel není akční nebo nemá strategii - dopočítat EV z
 * něčeho, co není rozhodnutí, nejde, a vymyslet nulu by byla odpověď.
 */
export function riverActionEv(input: RiverEvInput): ComboActionEv[] {
  const { node, board, potChips } = input;
  if (node.node_type !== "action_node" || node.strategy === undefined) return [];
  if (board.length !== 5) return [];

  const dead = new Set(board);
  const heroIsOop = node.player === 1;
  const heroRange = expandRange(heroIsOop ? input.oop : input.ip, dead);
  const villainRange = expandRange(heroIsOop ? input.ip : input.oop, dead);
  if (heroRange.length === 0 || villainRange.length === 0) return [];

  const heroPlayer = node.player ?? 1;

  /**
   * Hodnota podstromu pro jednu hrdinovu kombinaci proti vážené soupeřově range.
   *
   * Váhy se dělí na soupeřových uzlech podle jeho strategie, takže součet vah
   * zůstává a výsledek je expektace přes původní range - ne přes tu, která se
   * do větve dostala.
   */
  const value = (
    current: SolverNode,
    heroCards: [string, string],
    villains: readonly Weighted[],
    committed: readonly [number, number],
  ): number => {
    const total = () => villains.reduce((sum, item) => sum + item.weight, 0);

    const showdown = (): number => {
      let sum = 0;
      for (const villain of villains) {
        const result = compareShowdown(heroCards, villain.cards, board);
        if (result === undefined) continue;
        const pot = potChips + committed[0] + committed[1];
        const net = result === 1
          ? pot - committed[heroPlayer]
          : result === -1
            ? -committed[heroPlayer]
            : pot / 2 - committed[heroPlayer];
        sum += villain.weight * net;
      }
      return sum;
    };

    if (current.node_type !== "action_node" || current.strategy === undefined) {
      return showdown();
    }

    const actions = current.strategy.actions;
    const acting = current.player ?? 0;

    if (acting === heroPlayer) {
      // Hrdina na tahu pod kořenem: hraje svou strategii dál.
      const own = current.strategy.strategy[`${heroCards[0]}${heroCards[1]}`];
      let sum = 0;
      for (const [index, action] of actions.entries()) {
        const frequency = own?.[index] ?? 0;
        if (frequency <= 0) continue;
        const child = current.childrens?.[action];
        const next = committedAfter(action, acting, committed);
        sum += frequency * (/^FOLD$/i.test(action.trim())
          ? -committed[heroPlayer] * total()
          : child === undefined ? showdown() : value(child, heroCards, villains, next));
      }
      return sum;
    }

    // Soupeř na tahu: jeho range se rozdělí podle jeho vlastní strategie.
    let sum = 0;
    for (const [index, action] of actions.entries()) {
      const branch: Weighted[] = [];
      for (const villain of villains) {
        const frequency = current.strategy.strategy[villain.combo]?.[index] ?? 0;
        if (frequency > 0) branch.push({ ...villain, weight: villain.weight * frequency });
      }
      if (branch.length === 0) continue;
      const next = committedAfter(action, acting, committed);
      if (/^FOLD$/i.test(action.trim())) {
        // Soupeř složil: hrdina bere, co v potu leželo, plus co tam soupeř nechal.
        const pot = potChips + committed[0] + committed[1];
        sum += branch.reduce((acc, item) => acc + item.weight, 0) * (pot - committed[heroPlayer]);
        continue;
      }
      const child = current.childrens?.[action];
      sum += child === undefined
        ? value(current.childrens?.[action] ?? {}, heroCards, branch, next)
        : value(child, heroCards, branch, next);
    }
    return sum;
  };

  const rootWeight = villainRange.reduce((sum, item) => sum + item.weight, 0);
  if (rootWeight <= 0) return [];

  const results: ComboActionEv[] = [];
  const rootActions = node.strategy.actions;
  for (const hero of heroRange) {
    // Soupeřovy kombinace, které sdílejí kartu s hrdinou, se odečtou: nemůže je
    // držet. Bez toho by EV počítalo s protivníkem, který drží tutéž kartu.
    const live = villainRange.filter((villain) => (
      !villain.cards.includes(hero.cards[0]) && !villain.cards.includes(hero.cards[1])
    ));
    const liveWeight = live.reduce((sum, item) => sum + item.weight, 0);
    if (liveWeight <= 0) continue;

    for (const action of rootActions) {
      const committed = committedAfter(action, heroPlayer, [0, 0]);
      const child = node.childrens?.[action];
      const raw = /^FOLD$/i.test(action.trim())
        ? 0
        : child === undefined
          ? 0
          : value(child, hero.cards, live, committed);
      results.push({ combo: hero.combo, action, evChips: raw / liveWeight });
    }
  }
  return results;
}
