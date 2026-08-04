import { writeFileSync } from "node:fs";

/**
 * Turn the owner's push/fold chart into a dataset we can ship.
 *
 *   npx vite-node scripts/generatePushFoldChart.mts
 *
 * Source: "Push/Fold Chart, 10% antes" in C:\Work\PKR vedomosti. It gives a jam
 * range per seat for every stack from 1 to 15BB, written in the usual shorthand
 * ("22+ Kx+ Q2s+ Q6o+ J5s+ ..."), and states the width of each as a percentage.
 *
 * That percentage is the reason this is trustworthy rather than merely typed in:
 * it is an independent check on the parse. If reading "Q6o+" wrongly changed the
 * range, the computed width would stop matching the printed one. The generator
 * fails on any cell that disagrees by more than a tenth of a point, so a
 * transcription slip cannot reach the app quietly.
 *
 * The chart assumes 10 percent antes, so it is an ante-on source and is compared
 * and applied as one.
 */

const RANKS = "AKQJT98765432";
const ALL: string[] = [];
for (let i = 0; i < 13; i += 1) {
  for (let j = 0; j < 13; j += 1) {
    if (i === j) ALL.push(RANKS[i] + RANKS[j]);
    else if (i < j) ALL.push(RANKS[i] + RANKS[j] + "s");
    else ALL.push(RANKS[j] + RANKS[i] + "o");
  }
}
const COMBOS = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);
const width = (hands: readonly string[]) => hands.reduce((sum, h) => sum + COMBOS(h), 0) / 1326 * 100;

/**
 * Expand one token of the shorthand.
 *
 * Handles the four shapes the chart uses: a pair or pair-and-better ("22+"),
 * a suited or offsuit holding and better kicker ("Q6o+", "J5s+"), a single
 * holding ("87s", "JTo"), and the "any kicker" form ("Kx+", "Ax+") which means
 * every holding of that rank, both suited and offsuit.
 */
function expand(token: string): string[] {
  const plus = token.endsWith("+");
  const body = plus ? token.slice(0, -1) : token;

  // "Kx+" / "Tx+": every holding whose HIGHER card is that rank or better, with
  // any kicker. Reading it as "holdings containing that rank" is what the first
  // version did, and the printed widths rejected it immediately - the small
  // blind's 5BB cell came out at 39.1 percent against a printed 84.9.
  if (/^[AKQJT2-9]x$/i.test(body)) {
    const limit = RANKS.indexOf(body[0].toUpperCase());
    const out: string[] = [];
    for (let hi = 0; hi <= (plus ? limit : limit); hi += 1) {
      if (!plus && hi !== limit) continue;
      for (let lo = hi + 1; lo < RANKS.length; lo += 1) {
        out.push(RANKS[hi] + RANKS[lo] + "s", RANKS[hi] + RANKS[lo] + "o");
      }
    }
    return out;
  }

  // Pairs.
  if (body.length === 2 && body[0] === body[1]) {
    const index = RANKS.indexOf(body[0]);
    if (index < 0) throw new Error(`bad pair token ${token}`);
    // "+" on a pair means that pair and every higher one.
    return plus
      ? RANKS.slice(0, index + 1).split("").map((r) => r + r)
      : [body];
  }

  // Suited / offsuit holdings.
  const match = /^([AKQJT2-9])([AKQJT2-9])([so])$/i.exec(body);
  if (match === null) throw new Error(`unrecognised token ${token}`);
  const [, a, b, suit] = match;
  const hi = RANKS.indexOf(a.toUpperCase()) < RANKS.indexOf(b.toUpperCase()) ? a : b;
  const lo = hi === a ? b : a;
  if (!plus) return [hi.toUpperCase() + lo.toUpperCase() + suit.toLowerCase()];

  // "+" on a non-pair walks the kicker up to just under the top card.
  const topIndex = RANKS.indexOf(hi.toUpperCase());
  const out: string[] = [];
  for (let k = RANKS.indexOf(lo.toUpperCase()); k > topIndex; k -= 1) {
    out.push(hi.toUpperCase() + RANKS[k] + suit.toLowerCase());
  }
  return out;
}

function parseCell(spec: string): string[] {
  const hands = new Set<string>();
  for (const token of spec.trim().split(/\s+/).filter((t) => t.length > 0)) {
    for (const hand of expand(token)) hands.add(hand);
  }
  const unknown = [...hands].filter((h) => !ALL.includes(h));
  if (unknown.length > 0) throw new Error(`produced hands outside the 169: ${unknown.join(", ")}`);
  return [...hands].sort();
}

/** Rows transcribed from the chart. Seat names are ours; "MP" on the sheet is LJ. */
const CHART: ReadonlyArray<{ bb: number; seat: string; pct: number; spec: string }> = [
  { bb: 5, seat: "SB", pct: 84.9, spec: "22+ Tx+ 92s+ 93o+ 82s+ 84o+ 73s+ 75o+ 63s+ 65o 53s+ 43s" },
  { bb: 5, seat: "BTN", pct: 50.5, spec: "22+ Kx+ Q2s+ Q6o+ J5s+ J8o+ T6s+ T8o+ 97s+ 87s" },
  { bb: 5, seat: "CO", pct: 45.4, spec: "22+ Ax+ K2s+ K4o+ Q3s+ Q8o+ J6s+ J8o+ T7s+ T9o 97s+ 87s 76s" },
  { bb: 5, seat: "HJ", pct: 36.7, spec: "22+ Ax+ K2s+ K7o+ Q6s+ Q9o+ J8s+ JTo T8s+ 98s 87s" },
  { bb: 5, seat: "LJ", pct: 33.0, spec: "22+ Ax+ K3s+ K9o+ Q7s+ QTo+ J8s+ JTo T8s+ 98s" },
  { bb: 5, seat: "UTG+2", pct: 31.5, spec: "22+ Ax+ K5s+ K9o+ Q8s+ QTo+ J9s+ JTo T9s 98s" },
  { bb: 5, seat: "UTG+1", pct: 28.5, spec: "22+ A2s+ A4o+ K5s+ KTo+ Q8s+ QTo+ J9s+ JTo T9s" },
  { bb: 5, seat: "UTG", pct: 25.5, spec: "22+ A2s+ A7o+ A5o K6s+ KTo+ Q8s+ QTo+ J9s+ T9s" },

  { bb: 10, seat: "SB", pct: 71.9, spec: "22+ Qx+ J2s+ J4o+ T2s+ T6o+ 93s+ 96o+ 84s+ 86o+ 74s+ 76o 63s+ 53s+ 43s" },
  { bb: 10, seat: "BTN", pct: 42.7, spec: "22+ Ax+ K2s+ K6o+ Q5s+ Q9o+ J7s+ J9o+ T6s+ T9o 96s+ 86s+ 75s+ 65s 54s" },
  { bb: 10, seat: "CO", pct: 33.0, spec: "22+ Ax+ K5s+ KTo+ Q8s+ QTo+ J8s+ JTo T7s+ 97s+ 86s+ 76s 65s" },
  { bb: 10, seat: "HJ", pct: 29.7, spec: "22+ A2s+ A4o+ K7s+ KTo+ Q8s+ QTo+ J8s+ JTo T8s+ 97s+ 87s 76s" },
  { bb: 10, seat: "LJ", pct: 24.3, spec: "22+ A2s+ A8o+ K7s+ KTo+ Q9s+ QJo J8s+ JTo T8s+ 98s 87s" },
  { bb: 10, seat: "UTG+2", pct: 19.8, spec: "22+ A7s+ A5s-A3s A9o+ K9s+ KJo+ Q9s+ QJo J9s+ T8s+ 98s" },
  { bb: 10, seat: "UTG+1", pct: 18.3, spec: "22+ A7s+ A5s-A4s ATo+ K9s+ KJo+ Q9s+ QJo J9s+ T9s 98s" },
  { bb: 10, seat: "UTG", pct: 14.6, spec: "22+ A9s+ ATo+ K9s+ KQo Q9s+ JTs T9s" },
];

/** "A5s-A3s" is a run down the kicker, which the shorthand also uses. */
function expandRuns(spec: string): string {
  return spec.replace(
    /([AKQJT2-9])([AKQJT2-9])([so])-\1([AKQJT2-9])\3/g,
    (_all, top: string, from: string, suit: string, to: string) => {
      const out: string[] = [];
      for (let k = RANKS.indexOf(from); k <= RANKS.indexOf(to); k += 1) out.push(top + RANKS[k] + suit);
      return out.join(" ");
    },
  );
}

const rows = CHART.map((cell) => {
  const hands = parseCell(expandRuns(cell.spec));
  const measured = width(hands);
  if (Math.abs(measured - cell.pct) > 0.1) {
    throw new Error(
      `${cell.bb}BB ${cell.seat}: parsed ${measured.toFixed(1)}% but the chart prints ${cell.pct}% - the shorthand was read wrongly`,
    );
  }
  return { ...cell, hands, measured };
});

const lines: string[] = [];
lines.push("// GENERATED by scripts/generatePushFoldChart.mts - do not edit by hand.");
lines.push("//");
lines.push("// Jam ranges from the owner's push/fold chart, which assumes 10 percent antes");
lines.push("// and is therefore an ante-on source. Every range here was checked against the");
lines.push("// width the chart prints beside it, so a misread of the shorthand cannot pass.");
lines.push("");
lines.push("export interface PushFoldChartRange {");
lines.push("  readonly bb: number;");
lines.push("  readonly seat: string;");
lines.push("  /** The width the chart prints, kept so the check can be repeated. */");
lines.push("  readonly pct: number;");
lines.push("  readonly hands: readonly string[];");
lines.push("}");
lines.push("");
lines.push("export const PUSH_FOLD_CHART: readonly PushFoldChartRange[] = [");
for (const row of rows) {
  lines.push(`  { bb: ${row.bb}, seat: ${JSON.stringify(row.seat)}, pct: ${row.pct}, hands: ${JSON.stringify(row.hands)} },`);
}
lines.push("];");
lines.push("");
writeFileSync("src/data/ranges/pushFoldChart.generated.ts", lines.join("\n"), "utf8");

console.log("written: src/data/ranges/pushFoldChart.generated.ts");
console.log("");
console.log("bb  seat     printed   parsed   classes");
for (const row of rows) {
  console.log(
    `${row.bb}`.padStart(2) + "  " + row.seat.padEnd(8) +
    `${row.pct}%`.padStart(8) + `${row.measured.toFixed(1)}%`.padStart(9) + `${row.hands.length}`.padStart(10),
  );
}
