import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRangeStoreFromRangePack } from "../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks";
import type { AnteMode, Position, StackBucket } from "../src/core/types";

/**
 * Compare the owner's purchased opening charts against the ranges we teach.
 *
 * The charts are the benchmark, not the content: they stay outside the
 * repository and nothing here copies them in. What crosses over is a width and a
 * list of disagreements, which is what makes them useful for checking our own
 * solver-derived ranges.
 *
 *   powershell -File scripts/exportRangeChartGrids.ps1 -Folder <charts> -Out <json>
 *   npm run mtt:charts-vs-packs -- --json=<json>
 */

const TOTAL_COMBOS = 1326;

/**
 * Which seat each grid on a page belongs to.
 *
 * Taken from the file name and the left-to-right order of the grids, and only
 * where that is unambiguous. A page called "co-bu" holding two grids is the
 * cutoff then the button; a page called "mp-co" holding three is a span whose
 * middle seat the name does not state, and guessing at it would manufacture a
 * disagreement against whichever seat we happened to pick. Those are skipped.
 */
const PAGE_SEATS: Readonly<Record<string, readonly Position[]>> = {
  "co-bu": ["CO", "BTN"],
  "bu-sb": ["BTN", "SB"],
  "mp-hj": ["LJ", "HJ"],
  "utg-utg2": ["UTG", "UTG+1"],
};

/** Stack depth the page covers, from its name. */
function bucketForPage(page: string): StackBucket | null {
  if (/\b10-20bb\b/i.test(page)) return 20 as StackBucket;
  if (/\b25bb\b/i.test(page)) return 25 as StackBucket;
  if (/\b100bb\b/i.test(page)) return 100 as StackBucket;
  return null;
}

function seatsForPage(page: string, gridCount: number): readonly Position[] | null {
  for (const [key, seats] of Object.entries(PAGE_SEATS)) {
    if (!page.toLowerCase().includes(key)) continue;
    // Only when the grids and the named seats line up one to one.
    return seats.length === gridCount ? seats : null;
  }
  return null;
}

export function combosInClass(handClass: string): number {
  if (handClass.length === 2) return handClass[0] === handClass[1] ? 6 : 16;
  if (handClass.endsWith("s")) return 4;
  if (handClass.endsWith("o")) return 12;
  return 0;
}

interface Cluster { hex: string; count: number; hands: string[] }

/**
 * The hands a grid plays, being every class that is not the fold colour.
 *
 * Fold is taken as the lightest cluster. On every page examined it is a near
 * white, and it is always the palest thing present - the actions are saturated.
 */
export function playedHands(clusters: readonly Cluster[]): string[] {
  if (clusters.length === 0) return [];
  const luminance = (hex: string) => {
    const v = hex.replace("#", "");
    return 0.2126 * Number.parseInt(v.slice(0, 2), 16)
      + 0.7152 * Number.parseInt(v.slice(2, 4), 16)
      + 0.0722 * Number.parseInt(v.slice(4, 6), 16);
  };
  const fold = [...clusters].sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
  return clusters.filter((cluster) => cluster !== fold).flatMap((cluster) => cluster.hands);
}

function packWidth(ante: AnteMode, position: Position, bucket: StackBucket): { pct: number; opens: string[] } | null {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack).lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return null;
  const opens = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .map(([handClass]) => handClass);
  return { pct: opens.reduce((sum, h) => sum + combosInClass(h), 0) / TOTAL_COMBOS * 100, opens };
}

const jsonFlag = process.argv.find((item) => item.startsWith("--json="));
const jsonDir = jsonFlag === undefined ? "" : jsonFlag.slice("--json=".length);
if (jsonDir === "" || !existsSync(jsonDir)) {
  throw new Error("--json=<dir> must point at the folder written by exportRangeChartGrids.ps1");
}

console.log("Purchased opening charts against the ranges we teach");
console.log("");
console.log("page".padEnd(34) + "seat".padEnd(7) + "depth".padStart(6) + "chart".padStart(8) + "ante-off".padStart(10) + "ante-on".padStart(9) + "  disagreement");

let compared = 0;
const skipped: string[] = [];
for (const file of readdirSync(jsonDir).filter((f) => f.endsWith(".json")).sort()) {
  // PowerShell writes UTF-8 with a byte-order mark and serialises an ArrayList
  // as { value, Count } rather than a bare array, so both are absorbed here
  // instead of being left as a trap for the next reader.
  const raw = readFileSync(join(jsonDir, file), "utf8").replace(/^﻿/, "");
  const parsed = JSON.parse(raw) as {
    page: string;
    grids: Array<{ clusters: Cluster[] | { value: Cluster[] } }>;
  };
  const page = {
    page: parsed.page,
    grids: parsed.grids.map((grid) => ({
      clusters: Array.isArray(grid.clusters) ? grid.clusters : grid.clusters.value,
    })),
  };
  const bucket = bucketForPage(page.page);
  const seats = seatsForPage(page.page, page.grids.length);
  if (bucket === null || seats === null) {
    skipped.push(`${page.page} (${page.grids.length} grid(s))`);
    continue;
  }

  seats.forEach((seat, index) => {
    const clusters = page.grids[index]?.clusters ?? [];
    const hands = playedHands(clusters);
    if (hands.length === 0) return;

    // How many actions this grid draws. It flags a page whose legend needs
    // reading before its width is taken as an opening range - it does not say
    // what those actions are.
    //
    // Both stronger claims turned out wrong. Excluding these grids on the count
    // threw out the 100BB pages, and then calling them limp/raise pages was wrong
    // too: the 100BB legend is entirely about play facing a three-bet - 4bet
    // value, call vs 3bet, fold vs 3bet - so every coloured cell IS in the
    // opening range and white is the fold. Its width is exact, not an upper
    // bound. The small blind's 10-20BB grid genuinely does draw limp branches.
    // Nothing but the legend distinguishes them, so the flag says only that.
    const manyActions = clusters.length > 6;

    const chartPct = hands.reduce((sum, h) => sum + combosInClass(h), 0) / TOTAL_COMBOS * 100;
    const off = packWidth("OFF", seat, bucket);
    const on = packWidth("ON", seat, bucket);
    compared += 1;

    const nearest = off === null ? null : Math.abs(off.pct - chartPct) <= Math.abs((on?.pct ?? 1e9) - chartPct) ? off : on;
    const missing = nearest === null ? [] : hands.filter((h) => !nearest.opens.includes(h));
    const extra = nearest === null ? [] : nearest.opens.filter((h) => !hands.includes(h));
    const note = (nearest === null
      ? "no pack range at this depth"
      : `${missing.length} in chart only, ${extra.length} in pack only`)
      + (manyActions ? `  [${clusters.length} actions drawn; read this page's legend before treating the width as an opening range]` : "");

    console.log(
      page.page.replace(/\.png$/i, "").padEnd(34) +
      seat.padEnd(7) +
      `${bucket}BB`.padStart(6) +
      `${chartPct.toFixed(1)}%`.padStart(8) +
      `${off === null ? "-" : `${off.pct.toFixed(1)}%`}`.padStart(10) +
      `${on === null ? "-" : `${on.pct.toFixed(1)}%`}`.padStart(9) +
      "  " + note,
    );
  });
}

console.log("");
console.log(`grids compared: ${compared}`);
if (skipped.length > 0) {
  console.log("");
  console.log("Skipped, because the file name does not say which seat each grid is:");
  for (const item of skipped) console.log(`  ${item}`);
}
