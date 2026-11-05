import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Turn the owner's calling-rejam sheets into a dataset we can ship.
 *
 *   powershell -File scripts/exportRangeChartGrids.ps1 -Folder "<RYE>/calling rejams" -Out <json>
 *   npx vite-node scripts/generateCallRejamRanges.mts -- --json=<json>
 *
 * The counterpart to scripts/generateRejamRanges.mts. Same colour scheme - each
 * hand carries the deepest stack at which the action holds - but here the action
 * is calling a shove rather than making one, and there is no salmon band because
 * calling is the only choice on offer.
 *
 * The pale cells are folds. The legend does not say so, and on the pushing sheets
 * that same cream is still unresolved, but the owner confirmed it directly for
 * these pages, so it is taken as fold here and nowhere else.
 *
 * File names name a hero and a span of seats that shove at them - "utg vs. hj-co"
 * is UTG against HJ and CO - and one page carries two heroes joined by a plus.
 */

const DEPTH_BY_COLOUR: Record<string, number> = {
  "#90A890": 30,
  "#304830": 25,
  "#90A8C0": 20,
  "#304860": 15,
};

const SEAT_ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const;
const CHART_SEAT_NAMES: Record<string, string> = {
  utg: "UTG", "utg1": "UTG+1", "utg+1": "UTG+1", "utg2": "UTG+2", "utg+2": "UTG+2",
  mp: "LJ", lj: "LJ", hj: "HJ", co: "CO", bu: "BTN", btn: "BTN", sb: "SB", bb: "BB",
};

/**
 * Which shover each hero's shipped call range is calibrated to.
 *
 * The big blind, for every hero. It is the seat that re-jams widest - 15 to 33
 * percent where an early seat re-jams 2 to 10 - so it is the shove a caller meets
 * most, and it is the one seat present on every hero's sheets. It also matches
 * what we now teach the big blind to do, which keeps the two halves of the same
 * spot describing the same game.
 */
const CALIBRATION_SHOVER = "BB";

interface Cluster { hex: string; hands: string[] }

const jsonFlag = process.argv.find((item) => item.startsWith("--json="));
const jsonDir = jsonFlag === undefined ? "" : jsonFlag.slice("--json=".length);
if (jsonDir === "") throw new Error("--json=<dir> must point at the folder written by exportRangeChartGrids.ps1");
const outFlag = process.argv.find((item) => item.startsWith("--out="));
const outPath = outFlag === undefined ? "src/data/ranges/callRejamRanges.generated.ts" : outFlag.slice("--out=".length);

/** Expand "hj-co" to the seats it spans, or a bare "bb" to itself. */
function expandSeats(token: string): string[] | null {
  const span = /^([a-z]+\+?[0-9]?)\s*-\s*([a-z]+\+?[0-9]?)$/.exec(token.trim());
  if (span !== null) {
    const from = CHART_SEAT_NAMES[span[1]];
    const to = CHART_SEAT_NAMES[span[2]];
    if (from === undefined || to === undefined) return null;
    const start = SEAT_ORDER.indexOf(from as typeof SEAT_ORDER[number]);
    const end = SEAT_ORDER.indexOf(to as typeof SEAT_ORDER[number]);
    if (start < 0 || end < 0 || end < start) return null;
    return [...SEAT_ORDER.slice(start, end + 1)];
  }
  const single = CHART_SEAT_NAMES[token.trim()];
  return single === undefined ? null : [single];
}

/** "bu vs. sb-bb + sb vs. bb" -> BU/SB, BU/BB, SB/BB, in grid order. */
function parsePageName(page: string): Array<{ hero: string; shover: string }> | null {
  const stem = page.toLowerCase().replace(/\.png$/i, "");
  const pairs: Array<{ hero: string; shover: string }> = [];
  for (const part of stem.split("+").map((item) => item.trim())) {
    // "utg+1" would be split by the plus above; no page mixes the two forms, and
    // a part that does not parse fails loudly rather than being dropped.
    const [heroToken, shoverToken] = part.split(/\s+vs\.?\s+/);
    if (heroToken === undefined || shoverToken === undefined) return null;
    const hero = CHART_SEAT_NAMES[heroToken.trim()];
    const shovers = expandSeats(shoverToken);
    if (hero === undefined || shovers === null) return null;
    for (const shover of shovers) pairs.push({ hero, shover });
  }
  return pairs.length === 0 ? null : pairs;
}

type Row = { hero: string; shover: string; thresholds: Map<string, number> };
const rows: Row[] = [];
const problems: string[] = [];

for (const file of readdirSync(jsonDir).filter((f) => f.endsWith(".json")).sort()) {
  const raw = readFileSync(join(jsonDir, file), "utf8").replace(/^﻿/, "");
  const parsed = JSON.parse(raw) as { page: string; grids: Array<{ clusters: Cluster[] | { value: Cluster[] } }> };
  const pairs = parsePageName(parsed.page);
  if (pairs === null) { problems.push(`${parsed.page}: cannot read hero and shovers from the name`); continue; }
  if (pairs.length !== parsed.grids.length) {
    problems.push(`${parsed.page}: ${pairs.length} pair(s) named, ${parsed.grids.length} grid(s) found`);
    continue;
  }

  pairs.forEach((pair, index) => {
    const source = parsed.grids[index].clusters;
    const clusters = Array.isArray(source) ? source : source.value;
    const thresholds = new Map<string, number>();
    let cells = 0;
    for (const cluster of clusters) {
      cells += cluster.hands.length;
      const depth = DEPTH_BY_COLOUR[cluster.hex];
      if (depth !== undefined) for (const hand of cluster.hands) thresholds.set(hand, depth);
    }
    if (cells !== 169) { problems.push(`${parsed.page} grid ${index + 1}: ${cells} cells, expected 169`); return; }
    rows.push({ hero: pair.hero, shover: pair.shover, thresholds });
  });
}

const COMBOS = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);
const DEPTHS = [15, 20, 25, 30];
const width = (hands: string[]) => hands.reduce((sum, hand) => sum + COMBOS(hand), 0) / 1326 * 100;
const callAt = (row: Row, depth: number) => [...row.thresholds.entries()]
  .filter(([, threshold]) => threshold >= depth).map(([hand]) => hand).sort();

const lines: string[] = [];
lines.push("// GENERATED by scripts/generateCallRejamRanges.mts - do not edit by hand.");
lines.push("//");
lines.push("// Calling a re-jam, measured from the owner's charts. Each hand carries the");
lines.push("// deepest stack at which it calls, so the range at a depth is every hand whose");
lines.push("// threshold reaches it. The pale cells are folds, which the owner confirmed for");
lines.push("// these sheets specifically.");
lines.push("");
lines.push("export interface CallRejamRange {");
lines.push("  readonly hero: string;");
lines.push("  readonly shover: string;");
lines.push("  /** Hand class -> deepest stack in BB at which it calls the shove. */");
lines.push("  readonly thresholds: Readonly<Record<string, number>>;");
lines.push("}");
lines.push("");
lines.push("export const CALL_REJAM_RANGES: readonly CallRejamRange[] = [");
for (const row of rows.sort((a, b) => a.hero.localeCompare(b.hero) || a.shover.localeCompare(b.shover))) {
  const entries = [...row.thresholds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  lines.push(`  {`);
  lines.push(`    hero: ${JSON.stringify(row.hero)}, shover: ${JSON.stringify(row.shover)},`);
  lines.push(`    thresholds: { ${entries.map(([h, d]) => `${JSON.stringify(h)}: ${d}`).join(", ")} },`);
  lines.push(`  },`);
}
lines.push("];");
lines.push("");
lines.push("/** The shover every hero's shipped VS_ALLIN range is calibrated to. */");
lines.push(`export const CALL_REJAM_CALIBRATION_SHOVER = ${JSON.stringify(CALIBRATION_SHOVER)};`);
lines.push("");
writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(`rows: ${rows.length}   written: ${outPath}`);
console.log("");
console.log("hero  shover   15BB    20BB    25BB    30BB");
for (const row of rows) {
  const mark = row.shover === CALIBRATION_SHOVER ? " <- calibration" : "";
  console.log(
    row.hero.padEnd(6) + row.shover.padEnd(8) +
    DEPTHS.map((d) => `${width(callAt(row, d)).toFixed(1)}%`.padStart(7)).join(" ") + mark,
  );
}
if (problems.length > 0) {
  console.log("");
  console.log("Not used:");
  for (const problem of problems) console.log(`  ${problem}`);
}
for (const hero of new Set(rows.map((row) => row.hero))) {
  if (!rows.some((row) => row.hero === hero && row.shover === CALIBRATION_SHOVER)) {
    throw new Error(`no sheet gives ${hero} against ${CALIBRATION_SHOVER}, which the calibration needs`);
  }
}
