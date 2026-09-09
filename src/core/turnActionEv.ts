import { combosOfClass, type ComboActionEv, type SolverNode } from "./riverActionEv";
import { turnShowdownEquity } from "./turnShowdownEquity";

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
   * Stack obou hráčů na začátku podhry, v žetonech.
   *
   * Slouží k jedinému: poznat all-in. Po něm se na riveru nerozhoduje, takže
   * vrstva nevzniká a **nechybí** - hodnotu dodá showdown. Bez tohohle čísla se
   * all-in větev hlásí jako nepokrytá, a protože na 20 bb je all-in většina
   * stromu, nedostane se žádná kombinace ani nad 90 % pokrytí (bod 205).
   */
  stackChips?: number;
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

/** Dvě karty kombinace `"AhKd"`. */
const cardsOf = (combo: string): [string, string] => [combo.slice(0, 2), combo.slice(2, 4)];

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

export interface TurnComboActionEv extends ComboActionEv {
  /**
   * Podíl dosahu, na kterém tahle jedna EV stojí, 0 az 1.
   *
   * Patří ke každému řádku zvlášť, ne k celému rozhodnutí: pod jednou akcí může
   * ležet vyřešená vrstva celá a pod její sestrou skoro nic. Souhrnné číslo by
   * ten rozdíl schovalo, a přitom je to jediné, podle čeho jde poznat, kterému
   * řádku se dá věřit.
   */
  coveredShare: number;
}

export interface TurnEvResult {
  /** EV každé akce hrdiny, po kombinacích. Prázdné, když se nedá spočítat. */
  rows: TurnComboActionEv[];
  /**
   * Nejmenší podíl dosahu, na kterém stojí kterákoli z vrácených EV, 0 az 1.
   *
   * Noc neřeší všechny turnové linky, jen ty nejdosahovanější. Změřeno 8. 9.
   * 2026 na `MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR__532mono`: plán vybral **8 linek
   * ze 43 (37 živých) a ty nesou 99,4 % dosahu**. První verze tohohle modulu
   * proto akci s jedinou nepokrytou větví nevracela vůbec - a na skutečných
   * datech nevrátila **nic**, protože pod každou akcí kořene leží nějaká vzácná
   * linka, kterou noc neřešila.
   *
   * EV se tedy počítá přes pokrytou část a **normalizuje pokrytou vahou**, ne
   * celou. Je to podmíněná střední hodnota a jako taková je vychýlená přesně
   * o to, co chybí - proto se vrací i tohle číslo, a to jako **minimum přes
   * všechny řádky**, ne průměr. Průměr by schoval jednu děravou akci mezi devíti
   * úplnými. Práh si volí ten, kdo EV dodává, a musí ho umět obhájit.
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

  // Váha, která u téhle jedné akce dorazila na river bez vyřešené vrstvy.
  // Resetuje se u každé akce zvlášť: díra v jedné větvi neznehodnocuje sestru.
  let missingWeight = 0;
  // Váha soupeřových kombinací, které solver v uzlu vůbec nevede. Je to něco
  // jiného než chybějící vrstva: tahle váha do hry nepatří, takže se odečítá
  // z obou stran zlomku a **pokrytí nesnižuje**.
  let absentWeight = 0;

  const stackChips = input.stackChips ?? 0;
  /** Nikdo nemá za čím sedět, takže se na riveru nerozhoduje. */
  const isAllIn = (held: readonly [number, number]): boolean => (
    stackChips > 0 && held[0] >= stackChips - 1e-6 && held[1] >= stackChips - 1e-6
  );
  const showdown = turnShowdownEquity(board);

  const value = (
    node: SolverNode,
    heroCombo: string,
    live: readonly Weighted[],
    held: readonly [number, number],
    line: readonly string[],
    // Součin hrdinových frekvencí po cestě sem. Soupeřovy frekvence už sedí ve
    // vahách v `live`, hrdinovy ne - ty se násobí až u návratu z rekurze.
    heroShare: number,
  ): number => {
    const weight = sumOf(live);
    if (weight === 0) return 0;

    // Pahýl riveru: dál strom nevede a hodnotu dodá vyřešená vrstva.
    if (node.node_type !== "action_node" || node.strategy === undefined) {
      const perUnit = riverValue(line, heroCombo);
      // Nepokrytá váha se musí vážit stejně jako čitatel, tedy i hrdinovou
      // frekvencí. Bez toho ubere větev hraná v pěti procentech sto procent
      // pokrytí, jmenovatel `reach - missingWeight` klesne pod pravdu a EV se
      // nafoukne. Změřeno 8. 9. 2026 na dvou podherách s **plně vyřešeným**
      // plánem: pokrytí hlásilo 7,4 % a 12,2 % a EV šla do 565 žetonů na potu
      // 50 a 1 836 na potu 315 - přesně o ten podíl vedle.
      if (perUnit !== undefined) return weight * (perUnit - held[heroPlayer]);
      // Po all-inu vrstva nechybí - nikdy nevznikla, protože na riveru už není
      // co rozhodnout. Hodnotu dodá dojezd, a ten je spočitatelný přesně.
      if (isAllIn(held)) {
        const equity = showdown(heroCombo, live);
        if (equity !== undefined) {
          const finalPot = potChips + held[0] + held[1];
          return weight * (finalPot * equity - held[heroPlayer]);
        }
      }
      missingWeight += heroShare * weight;
      return 0;
    }

    const strategy = node.strategy;
    const acting = node.player ?? 0;

    if (acting === heroPlayer) {
      const own = strategy.strategy[heroCombo];
      // Kombinace, kterou solver v tomhle uzlu **nevede**, nemá nulovou EV -
      // nemá žádnou. Všechny frekvence by vyšly nula, součet taky, a podstrom by
      // se tiše sečetl na nulu **s plným pokrytím**, tedy jako spočítaný
      // výsledek. Je to táž vada, jaká byla o patro níž u soupeře (bod 204),
      // jen na hrdinově straně; na dnešních datech se neprojeví, protože
      // rozvinutá range je podmnožinou solverovy (278 z 332 na
      // `222r/CHECK_CHECK__3c`), ale to je vlastnost dat, ne záruka.
      let played = 0;
      for (const [index] of strategy.actions.entries()) played += own?.[index] ?? 0;
      if (played <= 0) { missingWeight += heroShare * weight; return 0; }

      let sum = 0;
      for (const [index, action] of strategy.actions.entries()) {
        const frequency = own?.[index] ?? 0;
        if (frequency <= 0) continue;
        const next = committedAfter(action, acting, held);
        sum += frequency * (isFold(action)
          ? -held[heroPlayer] * weight
          : value(node.childrens?.[action] ?? {}, heroCombo, live, next, [...line, action],
            heroShare * frequency));
      }
      return sum;
    }

    // Kombinace, kterou solver na tomhle uzlu nevede, v range není - má nulový
    // dosah, ne neznámou hodnotu. Musí proto zmizet i ze jmenovatele. Dokud
    // zůstávala, dostala u každé akce frekvenci nula, vypadla z čitatele a EV
    // vyšla tiše nižší, zatímco pokrytí hlásilo 100 %. Změřeno 8. 9. 2026 na
    // `222r/CHECK_CHECK__3c`: rozvinutá range dala 182 kombinací, strategie
    // uzlu jich vede 152, tedy 16 % váhy stranou.
    const present: Weighted[] = [];
    for (const villain of live) {
      if (strategy.strategy[villain.combo] === undefined) absentWeight += heroShare * villain.weight;
      else present.push(villain);
    }

    let sum = 0;
    for (const [index, action] of strategy.actions.entries()) {
      const branch: Weighted[] = [];
      for (const villain of present) {
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
      sum += value(node.childrens?.[action] ?? {}, heroCombo, branch, next, [...line, action],
        heroShare);
    }
    return sum;
  };

  const rows: TurnComboActionEv[] = [];
  let worstCovered = 1;
  const villainCards = villains.map((villain) => ({ ...villain, cards: cardsOf(villain.combo) }));
  for (const hero of heroes) {
    // Soupeř nemůže držet kartu, kterou drží hrdina. Táž filtrace jako v
    // `riverActionEv` - a hlavně tentýž jmenovatel, protože vrstva vrací
    // expektaci na jednotku **odfiltrované** range. Bez toho by hrdina bral pot
    // i proti rukám, které sám blokuje, a obě strany zlomku by měřily jinou
    // range.
    const heroCards = cardsOf(hero.combo);
    const against = villainCards.filter((villain) => (
      villain.cards[0] !== heroCards[0] && villain.cards[0] !== heroCards[1]
      && villain.cards[1] !== heroCards[0] && villain.cards[1] !== heroCards[1]
    ));
    const heroReach = sumOf(against);
    if (heroReach <= 0) continue;

    for (const action of decisionStrategy.actions) {
      missingWeight = 0;
      absentWeight = 0;
      const next = committedAfter(action, heroPlayer, committed);
      const weighted = isFold(action)
        ? -committed[heroPlayer] * heroReach
        : value(decision.childrens?.[action] ?? {}, hero.combo, against, next, [...prefix, action], 1);
      // Váha, kterou solver vůbec nevede, není součástí hry - odečítá se z obou
      // stran. Nepokrytá váha se vyřadí taky, ale ta pokrytí snižuje: výsledek
      // je střední hodnota podmíněná tím, že větev vyřešená je.
      const inGame = heroReach - absentWeight;
      const covered = inGame - missingWeight;
      if (covered <= 0 || inGame <= 0) continue;
      const coveredShare = covered / inGame;
      rows.push({ combo: hero.combo, action, evChips: weighted / covered, coveredShare });
      worstCovered = Math.min(worstCovered, coveredShare);
    }
  }
  if (rows.length === 0) return empty;
  return { rows, coveredReach: worstCovered };
}
