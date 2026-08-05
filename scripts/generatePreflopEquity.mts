import { writeFileSync } from "node:fs";

/**
 * Build the all-in preflop equity table the trainer needs to price an action.
 *
 *   npx vite-node scripts/generatePreflopEquity.mts -- [--samples=20000]
 *
 * The app can already say what a call *needs* - `decisionMaths` does that from pot
 * odds - but not what any action is *worth*, because nothing in the codebase knows
 * how a hand runs against a range. Every one of the 507 shipped records carries no
 * actionEvs, so the EV bubbles the UI is wired for have never had anything to show.
 *
 * This computes equity for each of the 169 x 169 class pairings by dealing boards,
 * and writes it as a table. Monte Carlo rather than exhaustive: enumerating all
 * 1,712,304 boards for every pairing is about twenty-four billion evaluations,
 * which is hours, while twenty thousand samples per pairing lands inside half a
 * point and takes minutes. The generator prints its error against hands whose
 * equity is textbook, so the sampling is checked rather than trusted.
 *
 * One approximation is deliberate and stated: pairings are computed class against
 * class, so card removal between the two ranges is ignored. AA against AA is the
 * clearest case - four aces cannot be dealt twice. Every solver's preflop chart
 * carries the same simplification.
 */

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

/** A card is 0..51, rank = card >> 2, suit = card & 3. */
const rankOf = (card: number) => card >> 2;
const suitOf = (card: number) => card & 3;

/** Every hand class in the canonical order the rest of the app uses. */
function allClasses(): string[] {
  const out: string[] = [];
  for (let hi = 12; hi >= 0; hi -= 1) {
    for (let lo = 12; lo >= 0; lo -= 1) {
      if (hi === lo) out.push(RANKS[hi] + RANKS[lo]);
      else if (hi > lo) out.push(RANKS[hi] + RANKS[lo] + "s");
      else out.push(RANKS[lo] + RANKS[hi] + "o");
    }
  }
  return [...new Set(out)];
}

/** Concrete cards for a class, avoiding any card already used. */
function dealClass(hand: string, used: Set<number>): [number, number] | null {
  const hi = RANKS.indexOf(hand[0]);
  const lo = RANKS.indexOf(hand[1]);
  const suited = hand.endsWith("s");
  const pair = hand.length === 2;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    let a: number;
    let b: number;
    if (pair) {
      const s1 = Math.floor(Math.random() * 4);
      let s2 = Math.floor(Math.random() * 4);
      if (s1 === s2) s2 = (s2 + 1) % 4;
      a = hi * 4 + s1;
      b = lo * 4 + s2;
    } else if (suited) {
      const s = Math.floor(Math.random() * 4);
      a = hi * 4 + s;
      b = lo * 4 + s;
    } else {
      const s1 = Math.floor(Math.random() * 4);
      let s2 = Math.floor(Math.random() * 4);
      if (s1 === s2) s2 = (s2 + 1) % 4;
      a = hi * 4 + s1;
      b = lo * 4 + s2;
    }
    if (!used.has(a) && !used.has(b)) return [a, b];
  }
  return null;
}

/**
 * Rank a seven-card hand as a single comparable number.
 *
 * Category in the high bits, then tiebreakers by rank, so a plain numeric compare
 * decides any showdown. Written for the generator rather than for elegance: it
 * runs a hundred million times and never ships.
 */
function evaluate7(cards: readonly number[]): number {
  const rankCount = new Array<number>(13).fill(0);
  const suitCount = new Array<number>(4).fill(0);
  const rankBySuit = [0, 0, 0, 0];
  let rankMask = 0;

  for (const card of cards) {
    const r = rankOf(card);
    const s = suitOf(card);
    rankCount[r] += 1;
    suitCount[s] += 1;
    rankBySuit[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  /**
   * Top rank of a five-card run in `mask`, or -1.
   *
   * Ranks are 0..12 for deuce..ace. The ace also plays below the five, so the
   * wheel is checked explicitly rather than folded into the scan - the first
   * version tried to do both in one loop, mixed two masks doing it, and quietly
   * handed AKs six points more equity than it has against aces.
   */
  const straightTop = (mask: number): number => {
    for (let top = 12; top >= 4; top -= 1) {
      const run = (1 << top) | (1 << (top - 1)) | (1 << (top - 2)) | (1 << (top - 3)) | (1 << (top - 4));
      if ((mask & run) === run) return top;
    }
    // A-5-4-3-2, where the ace is low: ranks 12, 3, 2, 1, 0.
    const wheel = (1 << 12) | (1 << 3) | (1 << 2) | (1 << 1) | 1;
    if ((mask & wheel) === wheel) return 3;
    return -1;
  };

  const flushSuit = suitCount.findIndex((n) => n >= 5);
  if (flushSuit >= 0) {
    const mask = rankBySuit[flushSuit];
    const sfTop = straightTop(mask);
    if (sfTop >= 0) return 8 * 1e10 + sfTop;
    // Best five of the flush.
    let value = 0;
    let taken = 0;
    for (let r = 12; r >= 0 && taken < 5; r -= 1) {
      if ((mask >> r) & 1) { value = value * 13 + r; taken += 1; }
    }
    return 5 * 1e10 + value;
  }

  const straight = straightTop(rankMask);
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 12; r >= 0; r -= 1) {
    if (rankCount[r] === 4) quads.push(r);
    else if (rankCount[r] === 3) trips.push(r);
    else if (rankCount[r] === 2) pairs.push(r);
    else if (rankCount[r] === 1) singles.push(r);
  }

  const kickers = (pool: number[], count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i += 1) value = value * 13 + (pool[i] ?? 0);
    return value;
  };

  if (quads.length > 0) {
    const rest = [...trips, ...pairs, ...singles].sort((a, b) => b - a);
    return 7 * 1e10 + quads[0] * 13 + (rest[0] ?? 0);
  }
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const pairRank = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? -1) : pairs[0];
    return 6 * 1e10 + trips[0] * 13 + pairRank;
  }
  if (straight >= 0) return 4 * 1e10 + straight;
  if (trips.length > 0) return 3 * 1e10 + trips[0] * 169 + kickers(singles, 2);
  if (pairs.length >= 2) {
    const rest = [...pairs.slice(2), ...singles].sort((a, b) => b - a);
    return 2 * 1e10 + pairs[0] * 169 + pairs[1] * 13 + (rest[0] ?? 0);
  }
  if (pairs.length === 1) return 1 * 1e10 + pairs[0] * 28561 + kickers(singles, 3);
  return kickers(singles, 5);
}

/** Equity of `hero` against `villain`, both hand classes, by sampling boards. */
function equity(hero: string, villain: string, samples: number): number {
  let won = 0;
  let tied = 0;
  let counted = 0;

  for (let i = 0; i < samples; i += 1) {
    const used = new Set<number>();
    const h = dealClass(hero, used);
    if (h === null) continue;
    used.add(h[0]); used.add(h[1]);
    const v = dealClass(villain, used);
    if (v === null) continue;
    used.add(v[0]); used.add(v[1]);

    const board: number[] = [];
    while (board.length < 5) {
      const card = Math.floor(Math.random() * 52);
      if (used.has(card)) continue;
      used.add(card);
      board.push(card);
    }

    const heroValue = evaluate7([h[0], h[1], ...board]);
    const villainValue = evaluate7([v[0], v[1], ...board]);
    if (heroValue > villainValue) won += 1;
    else if (heroValue === villainValue) tied += 1;
    counted += 1;
  }
  if (counted === 0) return 0.5;
  return (won + tied / 2) / counted;
}

const samplesFlag = process.argv.find((a) => a.startsWith("--samples="));
const SAMPLES = samplesFlag === undefined ? 20000 : Number(samplesFlag.split("=")[1]);

// Textbook matchups, used to check the sampler before trusting 28,561 of its
// answers. If these drift the table is wrong in a way no test downstream would see.
const CHECKS: ReadonlyArray<[string, string, number]> = [
  ["AA", "KK", 0.813],
  ["AA", "AKs", 0.876],
  ["AKs", "QQ", 0.463],
  ["AKo", "QQ", 0.430],
  ["JJ", "AKs", 0.540],
  ["76s", "AA", 0.229],
  ["AKo", "AQo", 0.735],
];

console.log(`checking the sampler at ${SAMPLES} samples`);
let worst = 0;
for (const [hero, villain, expected] of CHECKS) {
  const got = equity(hero, villain, SAMPLES);
  const diff = Math.abs(got - expected);
  worst = Math.max(worst, diff);
  console.log(`  ${hero} vs ${villain}: ${(got * 100).toFixed(1)}%  expected ${(expected * 100).toFixed(1)}%  off by ${(diff * 100).toFixed(1)}`);
}
if (worst > 0.015) {
  throw new Error(`sampler is off by ${(worst * 100).toFixed(1)} points on a known matchup; not writing a table from it`);
}

const classes = allClasses();
console.log(`\n${classes.length} classes, ${classes.length * classes.length} pairings`);
const table: Record<string, string> = {};
const started = Date.now();
for (const [index, hero] of classes.entries()) {
  const row: number[] = [];
  for (const villain of classes) {
    row.push(Math.round(equity(hero, villain, SAMPLES) * 1000));
  }
  table[hero] = row.join(",");
  if ((index + 1) % 20 === 0) {
    const rate = (Date.now() - started) / (index + 1);
    console.log(`  ${index + 1}/${classes.length}  ~${((classes.length - index - 1) * rate / 60000).toFixed(1)} min left`);
  }
}

const lines = [
  "// GENERATED by scripts/generatePreflopEquity.mts - do not edit by hand.",
  "//",
  "// All-in preflop equity, hand class against hand class, in tenths of a percent.",
  "// Sampled rather than enumerated, and the generator refuses to write unless it",
  "// reproduces textbook matchups within 1.5 points.",
  "//",
  "// Computed class against class, so card removal between the two ranges is",
  "// ignored - AA against AA being the clearest case. Preflop charts carry the same",
  "// simplification.",
  "",
  `export const EQUITY_CLASSES: readonly string[] = ${JSON.stringify(classes)};`,
  "",
  "/** Hero class -> comma-separated equity against each class, in per-mille. */",
  "export const PREFLOP_EQUITY: Readonly<Record<string, string>> = {",
  ...classes.map((hand) => `  ${JSON.stringify(hand)}: ${JSON.stringify(table[hand])},`),
  "};",
  "",
];
writeFileSync("src/data/ranges/preflopEquity.generated.ts", lines.join("\n"), "utf8");
console.log(`\nwritten: src/data/ranges/preflopEquity.generated.ts (${classes.length} rows)`);
