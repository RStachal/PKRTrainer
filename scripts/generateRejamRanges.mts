import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Turn the owner's re-jam sheets into a dataset we can ship.
 *
 *   powershell -File scripts/exportRangeChartGrids.ps1 \
 *     -Folder "<RYE>/rejaming" -Out <json> -Geometry scripts/rangeChartGeometryOverrides.json
 *   npx vite-node scripts/generateRejamRanges.mts -- --json=<json>
 *
 * The sheets colour each hand by the deepest stack at which it re-jams over an
 * open - 30, 25, 20 or 15 big blinds - plus a separate salmon band that three-bets
 * and calls a four-bet instead of jamming. So the re-jam range at depth D is every
 * hand whose threshold is at least D, which is why the widths fall as stacks
 * deepen. Read the legend on "Rejam BU vs MP HJ CO.png" alongside this.
 *
 * Every sheet is a hero against a group of openers and each grid inside it is one
 * opener, so the data has an axis our VS_OPEN does not: BB re-jams 33.0 percent
 * over a button or small-blind open at 15BB and 9.8 percent over an early one.
 * Collapsing that to one range per seat is what left big-blind defence forty
 * points out, so the full grid is emitted here and the collapse happens once,
 * visibly, in CALIBRATION below.
 */

const DEPTH_BY_COLOUR: Record<string, number> = {
  "#90A890": 30,
  "#304830": 25,
  "#90A8C0": 20,
  "#304860": 15,
};
const THREE_BET_CALL = "#D87878";

/** The seat names in the file names are the pack's, ours differ in two places. */
const SEAT_ALIASES: Record<string, string> = { MP: "LJ", BU: "BTN" };
const canonical = (seat: string) => SEAT_ALIASES[seat] ?? seat;

/**
 * Which opener column each hero's shipped range is calibrated to.
 *
 * Named per hero rather than derived, because "the middle sheet, then its middle
 * grid" reads like a rule but is really six separate judgements - the heroes have
 * different numbers of sheets and different numbers of openers on them. Written
 * out, each one can be disagreed with individually. They share a story: a
 * middle-position opener throughout, which is the open a hero meets most.
 */
const CALIBRATION: Record<string, { sheet: string; opener: string }> = {
  BB: { sheet: "Rejam BB vs MP HJ CO", opener: "HJ" },
  BTN: { sheet: "Rejam BU vs MP HJ CO", opener: "HJ" },
  CO: { sheet: "Rejam CO vs MP HJ", opener: "HJ" },
  HJ: { sheet: "Rjeam HJ vs MP", opener: "LJ" },
  LJ: { sheet: "Rejam MP vs UTG UTG+1 UTG+2", opener: "UTG+1" },
  SB: { sheet: "Rejam SB vs MP HJ CO", opener: "HJ" },
};

interface Cluster { hex: string; hands: string[] }

const jsonFlag = process.argv.find((item) => item.startsWith("--json="));
const jsonDir = jsonFlag === undefined ? "" : jsonFlag.slice("--json=".length);
if (jsonDir === "") throw new Error("--json=<dir> must point at the folder written by exportRangeChartGrids.ps1");

const outFlag = process.argv.find((item) => item.startsWith("--out="));
const outPath = outFlag === undefined ? "src/data/ranges/rejamRanges.generated.ts" : outFlag.slice("--out=".length);

/** "Rejam BB vs MP HJ CO" -> hero BB, openers MP HJ CO. One sheet is misspelt. */
function parsePageName(page: string): { hero: string; openers: string[] } | null {
  const name = page.replace(/\.png$/i, "").replace(/^R[je]{2}am\s+/i, "");
  const [heroPart, openerPart] = name.split(/\s+vs\.?\s+/i);
  if (heroPart === undefined || openerPart === undefined) return null;
  const openers = openerPart.trim().split(/\s+/).filter((item) => item.length > 0);
  if (openers.length === 0) return null;
  return { hero: canonical(heroPart.trim()), openers: openers.map(canonical) };
}

type Row = { hero: string; opener: string; thresholds: Map<string, number>; threeBetCall: string[] };

const rows: Row[] = [];
const problems: string[] = [];

for (const file of readdirSync(jsonDir).filter((f) => f.endsWith(".json")).sort()) {
  const raw = readFileSync(join(jsonDir, file), "utf8").replace(/^﻿/, "");
  const parsed = JSON.parse(raw) as { page: string; grids: Array<{ clusters: Cluster[] | { value: Cluster[] } }> };
  const named = parsePageName(parsed.page);
  if (named === null) { problems.push(`${parsed.page}: cannot read hero and openers from the name`); continue; }

  // A grid count that does not match the openers named means the detector read
  // the page short. Guessing which opener the missing column was is how a range
  // ends up filed under the wrong seat, so the page is dropped and reported.
  if (parsed.grids.length !== named.openers.length) {
    problems.push(`${parsed.page}: ${named.openers.length} opener(s) named, ${parsed.grids.length} grid(s) found`);
    continue;
  }

  named.openers.forEach((opener, index) => {
    const source = parsed.grids[index].clusters;
    const clusters = Array.isArray(source) ? source : source.value;
    const thresholds = new Map<string, number>();
    let threeBetCall: string[] = [];
    let cells = 0;
    for (const cluster of clusters) {
      cells += cluster.hands.length;
      const depth = DEPTH_BY_COLOUR[cluster.hex];
      if (depth !== undefined) for (const hand of cluster.hands) thresholds.set(hand, depth);
      if (cluster.hex === THREE_BET_CALL) threeBetCall = [...cluster.hands];
    }
    if (cells !== 169) { problems.push(`${parsed.page} grid ${index + 1}: ${cells} cells, expected 169`); return; }
    rows.push({ hero: named.hero, opener, thresholds, threeBetCall });
  });
}

const COMBOS = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);
const DEPTHS = [15, 20, 25, 30];
const width = (hands: string[]) => hands.reduce((sum, hand) => sum + COMBOS(hand), 0) / 1326 * 100;
const jamAt = (row: Row, depth: number) => [...row.thresholds.entries()]
  .filter(([, threshold]) => threshold >= depth).map(([hand]) => hand).sort();

const lines: string[] = [];
lines.push("// GENERATED by scripts/generateRejamRanges.mts - do not edit by hand.");
lines.push("//");
lines.push("// Re-jam over an open, measured from the owner's charts. Each hand carries the");
lines.push("// deepest stack at which it jams, so the range at a given depth is every hand");
lines.push("// whose threshold reaches it. The salmon band three-bets and calls a four-bet");
lines.push("// rather than jamming, and is kept apart for that reason.");
lines.push("");
lines.push("export interface RejamRange {");
lines.push("  readonly hero: string;");
lines.push("  readonly opener: string;");
lines.push("  /** Hand class -> deepest stack in BB at which it re-jams. */");
lines.push("  readonly thresholds: Readonly<Record<string, number>>;");
lines.push("  /** Three-bets and calls a four-bet at every depth on the sheet. */");
lines.push("  readonly threeBetCall: readonly string[];");
lines.push("}");
lines.push("");
lines.push("export const REJAM_RANGES: readonly RejamRange[] = [");
for (const row of rows.sort((a, b) => a.hero.localeCompare(b.hero) || a.opener.localeCompare(b.opener))) {
  const entries = [...row.thresholds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  lines.push(`  {`);
  lines.push(`    hero: ${JSON.stringify(row.hero)}, opener: ${JSON.stringify(row.opener)},`);
  lines.push(`    thresholds: { ${entries.map(([h, d]) => `${JSON.stringify(h)}: ${d}`).join(", ")} },`);
  lines.push(`    threeBetCall: ${JSON.stringify(row.threeBetCall.sort())},`);
  lines.push(`  },`);
}
lines.push("];");
lines.push("");
lines.push("/** The opener column each hero's shipped VS_OPEN range is calibrated to. */");
lines.push("export const REJAM_CALIBRATION_OPENER: Readonly<Record<string, string>> = {");
for (const [hero, pick] of Object.entries(CALIBRATION)) lines.push(`  ${hero}: ${JSON.stringify(pick.opener)},`);
lines.push("};");
lines.push("");
writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(`rows: ${rows.length}   written: ${outPath}`);
console.log("");
console.log("hero  opener   15BB    20BB    25BB    30BB   3bet/call");
for (const row of rows) {
  const mark = CALIBRATION[row.hero]?.opener === row.opener ? " <- calibration" : "";
  console.log(
    row.hero.padEnd(6) + row.opener.padEnd(8) +
    DEPTHS.map((d) => `${width(jamAt(row, d)).toFixed(1)}%`.padStart(7)).join(" ") +
    `${width(row.threeBetCall).toFixed(1)}%`.padStart(11) + mark,
  );
}
if (problems.length > 0) {
  console.log("");
  console.log("Not used:");
  for (const problem of problems) console.log(`  ${problem}`);
}
for (const [hero, pick] of Object.entries(CALIBRATION)) {
  if (!rows.some((row) => row.hero === hero && row.opener === pick.opener)) {
    throw new Error(`calibration for ${hero} names opener ${pick.opener}, which no sheet provided`);
  }
}
