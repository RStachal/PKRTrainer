import { R2V } from "./poker";
import type { Rank, Suit } from "./types";

/**
 * Síla nejlepší pětikaretní ruky ze sedmi karet, jako porovnatelné číslo.
 *
 * Tohle je základ výpočtu EV na riveru: bez něj nejde říct, kdo showdown
 * vyhrál, a tedy ani kolik která akce vynáší. Solver EV nevypisuje - v jeho
 * příkazové sadě žádný takový příkaz není - takže se dopočítává ze strategie a
 * rangí, a showdown je jediné místo výpočtu, kde se dá udělat tichá chyba s
 * dopadem na každé číslo.
 *
 * ## Proč vlastní vyhodnocovač
 *
 * `flopHandCategory` třídí flopové ruce do kategorií pro trénink, ne pro
 * porovnání dvou ruk na dokončené desce. `preflopEquity` je vzorkovaná tabulka.
 * Ani jedno neumí odpovědět „kdo vyhrál", což je otázka, na které stojí celý EV.
 *
 * ## Jak se to porovnává
 *
 * Vrací se jediné číslo, kde vyšší vyhrává a shoda znamená dělený pot. Skládá se
 * z kategorie (0 = vysoká karta, 8 = postupková hromádka) a pěti hodnot karet
 * seřazených tak, jak o pořadí rozhodují - tedy nejdřív to, co dělá kategorii,
 * pak kickery. Jedno číslo místo n-tice proto, že se porovnává v horké smyčce
 * přes statisíce dvojic.
 *
 * Kolo s pětkou nahoře (A-2-3-4-5) je jediná postupka, kde eso platí jako
 * jednička. Kdyby se to neošetřilo, byla by nejvyšší místo nejnižší - a tichá
 * chyba přesně v tom místě, kde se nejmíň hledá.
 */

export type CardCode = string;

const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

/** `"Ah"` na hodnotu 14 a barvu. Vrací `undefined` pro nesmysl, ne odhad. */
export function parseCard(card: CardCode): { value: number; suit: Suit } | undefined {
  if (card.length !== 2) return undefined;
  const value = R2V[card[0] as Rank];
  const suit = card[1] as Suit;
  if (value === undefined || !"shdc".includes(suit)) return undefined;
  return { value, suit };
}

/** Nejvyšší postupka v sadě hodnot, nebo `undefined`. */
function straightHigh(values: readonly number[]): number | undefined {
  const present = new Set(values);
  // Eso jako jednička jen kvůli kolu; nikde jinde nízké eso neplatí.
  if (present.has(14)) present.add(1);
  const sorted = [...present].sort((left, right) => right - left);
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1] - 1) {
      run += 1;
      if (run >= 5) return sorted[index] + 4;
    } else {
      run = 1;
    }
  }
  return undefined;
}

/** Kategorie a pět rozhodujících hodnot slisovaných do jednoho čísla. */
function pack(category: number, values: readonly number[]): number {
  let score = category;
  for (let index = 0; index < 5; index += 1) {
    score = score * 16 + (values[index] ?? 0);
  }
  return score;
}

/**
 * Síla nejlepší pětikaretní ruky ze zadaných karet (obvykle sedmi).
 *
 * Vrací `undefined`, když je vstup nečitelný nebo karet míň než pět. Tichá nula
 * by znamenala „nejhorší možná ruka", což je odpověď, a ne přiznání, že se
 * odpovědět nedá.
 */
export function showdownRank(cards: readonly CardCode[]): number | undefined {
  if (cards.length < 5) return undefined;
  const parsed = cards.map(parseCard);
  if (parsed.some((card) => card === undefined)) return undefined;
  const known = parsed as { value: number; suit: Suit }[];

  const bySuit = new Map<Suit, number[]>();
  const counts = new Map<number, number>();
  for (const { value, suit } of known) {
    bySuit.set(suit, [...(bySuit.get(suit) ?? []), value]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const flushSuit = [...bySuit].find(([, values]) => values.length >= 5);
  if (flushSuit !== undefined) {
    const flushValues = flushSuit[1];
    const straightFlush = straightHigh(flushValues);
    if (straightFlush !== undefined) {
      return pack(CATEGORY.STRAIGHT_FLUSH, [straightFlush, 0, 0, 0, 0]);
    }
    const top = [...flushValues].sort((left, right) => right - left).slice(0, 5);
    return pack(CATEGORY.FLUSH, top);
  }

  // Podle počtu stejných hodnot, při shodě podle výše: trojice devítek bije
  // trojici sedmiček, a pár es je víc než pár králů se stejným kickerem.
  const groups = [...counts].sort((left, right) => (
    right[1] - left[1] || right[0] - left[0]
  ));

  const straight = straightHigh(known.map((card) => card.value));
  const [topValue, topCount] = groups[0];
  const secondCount = groups[1]?.[1] ?? 0;

  if (topCount === 4) {
    const kicker = groups.slice(1).map(([value]) => value)[0] ?? 0;
    return pack(CATEGORY.QUADS, [topValue, kicker, 0, 0, 0]);
  }
  if (topCount === 3 && secondCount >= 2) {
    return pack(CATEGORY.FULL_HOUSE, [topValue, groups[1][0], 0, 0, 0]);
  }
  if (straight !== undefined) return pack(CATEGORY.STRAIGHT, [straight, 0, 0, 0, 0]);
  if (topCount === 3) {
    const kickers = groups.slice(1).map(([value]) => value).slice(0, 2);
    return pack(CATEGORY.TRIPS, [topValue, ...kickers, 0, 0]);
  }
  if (topCount === 2 && secondCount === 2) {
    const pairs = groups.filter(([, count]) => count === 2).map(([value]) => value);
    const kicker = Math.max(
      ...groups.filter(([value, count]) => count === 1 || !pairs.slice(0, 2).includes(value))
        .map(([value]) => value),
      0,
    );
    return pack(CATEGORY.TWO_PAIR, [pairs[0], pairs[1], kicker, 0, 0]);
  }
  if (topCount === 2) {
    const kickers = groups.slice(1).map(([value]) => value).slice(0, 3);
    return pack(CATEGORY.PAIR, [topValue, ...kickers, 0]);
  }
  const high = groups.map(([value]) => value).slice(0, 5);
  return pack(CATEGORY.HIGH_CARD, high);
}

/**
 * Kdo vyhrál: 1 hrdina, -1 soupeř, 0 dělený pot.
 *
 * `undefined` znamená, že se rozhodnout nedá - nečitelná karta nebo neúplná
 * deska. Volající to musí ošetřit; brát to jako remízu by chybu schovalo do
 * čísla, které vypadá věrohodně.
 */
export function compareShowdown(
  heroCards: readonly CardCode[],
  villainCards: readonly CardCode[],
  board: readonly CardCode[],
): 1 | 0 | -1 | undefined {
  const hero = showdownRank([...heroCards, ...board]);
  const villain = showdownRank([...villainCards, ...board]);
  if (hero === undefined || villain === undefined) return undefined;
  if (hero > villain) return 1;
  if (hero < villain) return -1;
  return 0;
}
