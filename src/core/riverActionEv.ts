import { showdownRank } from "./showdownRank";

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
  /**
   * Strategie po kombinacích - nebo `null`, když solver uzel nespočítal.
   *
   * `null` znamená, že solver **nevyřešil vrstvu**, ne že se do uzlu nedojde.
   * Změřeno 15. 10. 2026 na vzorku 26 520 vrstev: `null` je jen ve 438
   * vrstvách, kterým plán zadal linku s prázdnou nebo skoro prázdnou range
   * jednoho z hráčů; solver pak nic nepočítá a ostatní uzly vrátí (až na šest
   * vrstev) přesně na výchozích 1/n. Ve vyřešených vrstvách nebyl `null` ani
   * rovnoměrný uzel žádný (0 z 218 344 uzlů). Na disku takových zadání bylo
   * 1 415 riverových, všechna na 25 bb proti velkému blindu, a 52 turnových,
   * všechna v desce `MTT9_25BB_HJ_SB_SRP__A72r`; plánovače je od téhož dne
   * nezadávají.
   *
   * Do 15. 10. 2026 to typ zamlčoval a kontroly se ptaly jen na `=== undefined`,
   * takže stavěč riverových packů na těch vrstvách padal. Typ je teď poctivý a
   * kompilátor ukáže každé čtení, které na to není připravené.
   */
  strategy: Record<string, number[]> | null;
}

/**
 * Strategie uzlu po kombinacích, nebo `undefined`, když chybí nebo ji solver
 * nespočítal (`null`). Jediné místo, kde se ty dvě nepřítomnosti sjednocují -
 * pro všechny čtenáře je to totéž: uzel bez strategie.
 */
export function strategyMap(node: SolverNode | undefined): Record<string, number[]> | undefined {
  return node?.strategy?.strategy ?? undefined;
}

/** Strom výstupu solveru, jak ho vidí `hasUncomputedNode`; sedí na oba popisy uzlu. */
interface StrategyTree {
  strategy?: { strategy?: unknown };
  childrens?: Readonly<Record<string, StrategyTree>>;
}

/**
 * Leží v podstromu uzel, který solver nespočítal (`strategy: null`)?
 *
 * Takový podstrom není rovnováha, ani když nad ním stojí uzel s čísly: v
 * nevyřešené vrstvě jsou to výchozí 1/n (viz `SolverStrategy`). Kdo z něj
 * počítá, počítá z ničeho.
 */
export function hasUncomputedNode(node: StrategyTree): boolean {
  if (node.strategy?.strategy === null) return true;
  return Object.values(node.childrens ?? {}).some(hasUncomputedNode);
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
  /**
   * Akce od kořene k rozhodnutí, které se má spočítat.
   *
   * Pravidla nevznikají jen pro kořen: hráč, který na riveru čelí sázce, je o
   * patro níž a jeho range i soupeřova jsou tam už zúžené tím, co se cestou
   * stalo. Počítat takové rozhodnutí z kořenových rangí by znamenalo měřit
   * situaci, která u stolu nenastala.
   *
   * Prázdná linka znamená kořen.
   */
  line?: readonly string[];
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
  if (node.node_type !== "action_node" || strategyMap(node) === undefined) return [];
  if (board.length !== 5) return [];

  const dead = new Set(board);

  // Sejdi po lince k rozhodnutí, které se má spočítat, a cestou zužuj obě range
  // podle strategie, kterou v každém uzlu hraje ten, kdo je na tahu. Bez toho by
  // se čelící rozhodnutí počítalo z rangí, jaké byly na začátku ulice.
  let current: SolverNode = node;
  let oopWeights = expandRange(input.oop, dead);
  let ipWeights = expandRange(input.ip, dead);
  let startCommitted: [number, number] = [0, 0];
  for (const step of input.line ?? []) {
    const stepMap = strategyMap(current);
    if (current.node_type !== "action_node" || current.strategy === undefined || stepMap === undefined) return [];
    const index = current.strategy.actions.indexOf(step);
    const child = current.childrens?.[step];
    if (index < 0 || child === undefined) return [];
    const acting = current.player ?? 0;
    const narrow = (list: Weighted[]) => list
      .map((item) => ({
        ...item,
        weight: item.weight * (stepMap[item.combo]?.[index] ?? 0),
      }))
      .filter((item) => item.weight > 0);
    if (acting === 1) oopWeights = narrow(oopWeights);
    else ipWeights = narrow(ipWeights);
    startCommitted = committedAfter(step, acting, startCommitted);
    current = child;
  }
  if (current.node_type !== "action_node" || current.strategy === undefined || strategyMap(current) === undefined) return [];

  // Uzel, který neřekne, čí je to rozhodnutí, se nedá zodpovědět.
  //
  // Dosud si tu dva řádky odporovaly: z chybějícího pole vyšlo `heroIsOop`
  // jako `false` (hrdina v pozici), ale `heroPlayer` jako `1` (mimo pozici) -
  // range by se tedy vzala jedné straně a vklady i EV složení počítaly druhé.
  // Číslo by přišlo v žetonech a vypadalo by správně.
  //
  // Změřeno 9. 9. 2026: takový uzel v datech není (0 z 5 600 riverových a
  // 0 z 8 936 turnových se strategií), takže se tím dnes nic nedodává ani
  // neztrácí. Je to díra v ošetření, ne ztráta obsahu.
  if (current.player === undefined) return [];
  // Rozhodnutí, pod kterým solver něco nespočítal, se neocení. `null` není
  // konec hry - ten je uzel **bez** strategie, za dorovnáním - ale nevyřešená
  // vrstva; dosadit za něj showdown by dalo věrohodné vymyšlené číslo.
  if (hasUncomputedNode(current)) return [];
  const heroIsOop = current.player === 1;
  const heroRange = heroIsOop ? oopWeights : ipWeights;
  const villainRange = heroIsOop ? ipWeights : oopWeights;
  if (heroRange.length === 0 || villainRange.length === 0) return [];

  const heroPlayer = current.player;

  /**
   * Hodnota podívané pro jednu hrdinovu kombinaci proti vážené soupeřově range.
   *
   * Stojí zvlášť, ne uvnitř rekurze, protože ji potřebuje i kořen: `CALL` na
   * riveru žádného potomka nemá - dorovnáním hra končí a jde se ukazovat karty.
   * Dokud tahle funkce byla schovaná uvnitř, kořen za takovou akci dosazoval
   * nulu, takže **EV dorovnání vyšlo stejné pro nuts i pro vzduch**. Změřeno:
   * ploché ve všech 149 uzlech, které dorovnání nabízejí.
   */
  /**
   * Síla kombinace na téhle desce, spočtená jednou.
   *
   * Deska je na riveru hotová, takže síla ruky je vlastnost **jedné**
   * kombinace, ne dvojice. Dosud se volalo `compareShowdown` pro každý pár
   * hrdina × soupeř, a to uvnitř pokaždé postavilo obě sedmikaretní ruce znovu:
   * při třech stech kombinacích na straně to je čtvrt milionu výpočtů místo
   * šesti set. Změřeno 9. 9. 2026 na vzorku šedesáti vrstev z nejdražších
   * stobiglindových rodin: 6 197 ms na vrstvu před, viz bod 220.
   *
   * `undefined` znamená nečitelnou ruku a zachovává se: taková dvojice se
   * přeskočí, jako ji přeskakoval `compareShowdown`.
   */
  const ranks = new Map<string, number | undefined>();
  const rankOf = (cards: readonly [string, string]): number | undefined => {
    const key = `${cards[0]}${cards[1]}`;
    const held = ranks.get(key);
    if (held !== undefined || ranks.has(key)) return held;
    const value = showdownRank([cards[0], cards[1], ...board]);
    ranks.set(key, value);
    return value;
  };

  const showdownValue = (
    heroCards: [string, string],
    villains: readonly Weighted[],
    committed: readonly [number, number],
  ): number => {
    const heroRank = rankOf(heroCards);
    // Dřív se v tomhle případě přeskočila každá dvojice zvlášť a součet vyšel
    // nula; tady se to jen řekne jednou.
    if (heroRank === undefined) return 0;
    const pot = potChips + committed[0] + committed[1];
    const win = pot - committed[heroPlayer];
    const lose = -committed[heroPlayer];
    const split = pot / 2 - committed[heroPlayer];
    let sum = 0;
    for (const villain of villains) {
      const villainRank = rankOf(villain.cards);
      if (villainRank === undefined) continue;
      sum += villain.weight * (heroRank > villainRank
        ? win
        : heroRank < villainRank ? lose : split);
    }
    return sum;
  };

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
    const showdown = () => showdownValue(heroCards, villains, committed);

    // Uzel bez strategie je konec hry: solver za terminální akcí nic nepíše.
    if (current.node_type !== "action_node" || current.strategy === undefined) {
      return showdown();
    }
    // `null` sem dojít nemůže - rozhodnutí s nespočítaným uzlem v podstromu se
    // vůbec nepočítá (`hasUncomputedNode` výš). Kdyby přece, je to porušený
    // předpoklad: radši pád než showdown dosazený za nevyřešenou vrstvu.
    const map = current.strategy.strategy;
    if (map === null) throw new Error("riverActionEv: nespočítaný uzel v podstromu rozhodnutí");

    const actions = current.strategy.actions;
    const acting = current.player ?? 0;

    if (acting === heroPlayer) {
      // Hrdina na tahu pod kořenem: hraje svou strategii dál.
      const own = map[`${heroCards[0]}${heroCards[1]}`];
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
        const frequency = map[villain.combo]?.[index] ?? 0;
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
  const rootActions = current.strategy.actions;
  for (const hero of heroRange) {
    // Soupeřovy kombinace, které sdílejí kartu s hrdinou, se odečtou: nemůže je
    // držet. Bez toho by EV počítalo s protivníkem, který drží tutéž kartu.
    const live = villainRange.filter((villain) => (
      !villain.cards.includes(hero.cards[0]) && !villain.cards.includes(hero.cards[1])
    ));
    const liveWeight = live.reduce((sum, item) => sum + item.weight, 0);
    if (liveWeight <= 0) continue;

    for (const action of rootActions) {
      const committed = committedAfter(action, heroPlayer, startCommitted);
      const child = current.childrens?.[action];
      // Složení stojí to, co hrdina na téhle ulici vsadil; obvykle nic, ale kdo
      // sázel a čelí zvýšení, o tu sázku přijde.
      const raw = /^FOLD$/i.test(action.trim())
        ? -startCommitted[heroPlayer] * liveWeight
        : child === undefined
          // Akce, po které se hra nevětví, je konec hry: dorovnání a check,
          // kterým se sázení uzavírá. Dřív tu byla nula - tedy EV nezávislé na
          // tom, co hrdina drží.
          ? showdownValue(hero.cards, live, committed)
          : value(child, hero.cards, live, committed);
      results.push({ combo: hero.combo, action, evChips: raw / liveWeight });
    }
  }
  return results;
}
