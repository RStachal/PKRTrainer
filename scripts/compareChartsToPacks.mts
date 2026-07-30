import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  PAGE_SEATS,
  bucketForPage,
  combosInClass,
  packWidth,
  playedHands,
  seatsForPage,
  type Cluster,
} from "./lib/rangeChartComparison.mts";

/**
 * Compare the owner's purchased opening charts against the ranges we teach.
 *
 *   powershell -File scripts/exportRangeChartGrids.ps1 -Folder <charts> -Out <json>
 *   npm run mtt:charts-vs-packs -- --json=<json>
 */

const TOTAL_COMBOS = 1326;

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
