import {
  compareHeroRanges,
  type RangeGap,
} from "./lib/postflopHeroRangeConsistency.mts";

/**
 * Reports whether each postflop solve used the hero range the product teaches.
 *
 *   npm run mtt:postflop-range-consistency
 *   npm run mtt:postflop-range-consistency -- --max-gap=5
 */

function parseMaxGap(argv: readonly string[]): number {
  const flag = argv.find((item) => item.startsWith("--max-gap="));
  if (flag === undefined) return 8;
  const value = Number(flag.slice("--max-gap=".length));
  if (!Number.isFinite(value) || value < 0) throw new Error("--max-gap must be a non-negative number.");
  return value;
}

const maxGap = parseMaxGap(process.argv.slice(2));
const rows: RangeGap[] = compareHeroRanges();
const failing = rows.filter((row) => row.gapPoints !== null && row.gapPoints > maxGap);
const uncompared = rows.filter((row) => row.gapPoints === null);

console.log("MTT postflop hero range consistency");
console.log(`compared against the shipped FULL_RING_9 REGULAR ante-off preflop pack`);
console.log(`tolerance: ${maxGap} percentage points`);
console.log("");
console.log("family".padEnd(40) + "solve".padStart(7) + "pack".padStart(8) + "gap".padStart(7));
for (const row of rows) {
  if (row.gapPoints === null) {
    console.log(row.familyId.padEnd(40) + `${row.solvePct}%`.padStart(7) + "      -      -  <-- pack has no range at this depth");
    continue;
  }
  const flag = row.gapPoints > maxGap ? "  <-- exceeds tolerance" : "";
  console.log(
    row.familyId.padEnd(40) +
    `${row.solvePct}%`.padStart(7) +
    `${row.packPct}%`.padStart(8) +
    `${row.gapPoints}`.padStart(7) +
    flag,
  );
}
console.log("");
console.log(`families listed: ${rows.length}`);
console.log(`families beyond tolerance: ${failing.length}`);
console.log(`families the pack cannot cover: ${uncompared.length}`);
if (uncompared.length > 0) {
  console.log("");
  console.log("Not compared, because the preflop pack has no range at that depth. These");
  console.log("are not passes - nothing checked them:");
  for (const row of uncompared) console.log(`  ${row.familyId} (${row.seat} ${row.bucket}BB): solved at ${row.solvePct}%`);
}
if (failing.length > 0) {
  console.log("");
  console.log("These solves put the hero on a range the product does not teach for that");
  console.log("seat and depth. Correcting them means re-solving with the pack's range:");
  for (const row of failing) console.log(`  ${row.familyId} (${row.seat} ${row.bucket}BB): ${row.solvePct}% solved vs ${row.packPct}% taught`);
}
process.exitCode = failing.length === 0 ? 0 : 1;
