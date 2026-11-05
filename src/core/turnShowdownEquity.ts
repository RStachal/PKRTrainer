import { showdownRank } from "./showdownRank";

/**
 * Podíl potu, který hrdina po all-inu na turnu vyhraje.
 *
 * ## Proč to tady musí být
 *
 * Turnová EV se skládá z vyřešených riverových vrstev (bod 203). Po all-inu ale
 * žádná vrstva nevzniká a **není to díra v datech**: když nikdo nemá za čím
 * sedět, na riveru se nerozhoduje, jen se dojíždí. Noc takovou linku právem
 * neřeší. Dokud to jádro nevědělo, hlásilo all-in větev jako nepokrytou -
 * a protože na 20 bb je all-in většina stromu, nedostala se **žádná** kombinace
 * nad 90 % pokrytí a zkouška rovnováhy projít nemohla (bod 205).
 *
 * ## Konvence
 *
 * Vrací podíl 0 az 1, ne žetony. Pot dosadí volající, protože jen on ví, kolik
 * do něj cestou přiteklo. Remíza se počítá jako půl.
 *
 * Soupeřovy kombinace, které drží tutéž kartu jako hrdina, sem **nesmí přijít** -
 * vyřazuje je volající, stejně jako to dělá `riverActionEv`, a normalizuje pak
 * touž odfiltrovanou vahou. Karta riveru se vyřazuje tady, protože ji volající
 * v ruce nedrží a mění se s každým dojezdem.
 *
 * `undefined` znamená, že se spočítat nedá - žádná čitelná karta nebo prázdná
 * soupeřova range. Nula by byla odpověď, a to je horší než přiznání.
 */

const RANKS = "23456789TJQKA";
const SUITS = ["s", "h", "d", "c"] as const;

export interface ShowdownVillain {
  combo: string;
  weight: number;
}

export type TurnShowdownEquity = (
  heroCombo: string,
  villains: readonly ShowdownVillain[],
) => number | undefined;

/** Dvě karty kombinace `"AhKd"`. */
const cardsOf = (combo: string): [string, string] => [combo.slice(0, 2), combo.slice(2, 4)];

export function turnShowdownEquity(board: readonly string[]): TurnShowdownEquity {
  if (board.length !== 4) return () => undefined;
  const dead = new Set(board);
  const deck: string[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      const card = `${rank}${suit}`;
      if (!dead.has(card)) deck.push(card);
    }
  }

  // Síla kombinace na dokončené desce se nemění, takže se počítá jednou na
  // kartu riveru. Bez toho by se tentýž `showdownRank` volal pro každou
  // soupeřovu kombinaci znovu u každé hrdinovy - tisíckrát nadarmo.
  const ranks = new Map<string, Map<string, number>>();
  const rankFor = (river: string, combo: string): number | undefined => {
    let table = ranks.get(river);
    if (table === undefined) {
      table = new Map<string, number>();
      ranks.set(river, table);
    }
    const held = table.get(combo);
    if (held !== undefined) return held;
    const [first, second] = cardsOf(combo);
    const value = showdownRank([first, second, ...board, river]);
    if (value === undefined) return undefined;
    table.set(combo, value);
    return value;
  };

  return (heroCombo, villains) => {
    const heroCards = cardsOf(heroCombo);
    if (dead.has(heroCards[0]) || dead.has(heroCards[1])) return undefined;
    // Karty soupeřů se rozeberou jednou, ne v cyklu přes 46 dojezdů.
    const rows = villains
      .filter((villain) => villain.weight > 0)
      .map((villain) => ({
        combo: villain.combo,
        weight: villain.weight,
        cards: cardsOf(villain.combo),
      }));
    if (rows.length === 0) return undefined;

    let equity = 0;
    let dealt = 0;
    for (const river of deck) {
      if (river === heroCards[0] || river === heroCards[1]) continue;
      const heroRank = rankFor(river, heroCombo);
      if (heroRank === undefined) continue;
      let win = 0;
      let tie = 0;
      let total = 0;
      for (const row of rows) {
        if (row.cards[0] === river || row.cards[1] === river) continue;
        const villainRank = rankFor(river, row.combo);
        if (villainRank === undefined) continue;
        total += row.weight;
        if (heroRank > villainRank) win += row.weight;
        else if (heroRank === villainRank) tie += row.weight;
      }
      if (total <= 0) continue;
      // Každý dojezd váží stejně; vyřazené karty mění složení soupeřovy range,
      // proto se normalizuje uvnitř karty a průměruje se až přes karty.
      equity += (win + tie / 2) / total;
      dealt += 1;
    }
    return dealt === 0 ? undefined : equity / dealt;
  };
}
