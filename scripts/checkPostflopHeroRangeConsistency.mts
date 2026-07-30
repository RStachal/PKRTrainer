import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRangeStoreFromRangePack } from "../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks";
import type { Position, StackBucket } from "../src/core/types";

/**
 * Does each postflop solve use the same hero range the product itself teaches?
 *
 * A postflop family is a spot reached through a preflop decision, so the hero's
 * range going into the flop is the preflop pack's range for that seat and depth.
 * Nothing checked that, and one seat's inputs drifted a long way without anyone
 * noticing: measured 2026-07-30, UTG matched the pack to a tenth of a percent and
 * the cutoff to two points, while every button family was solved against 12 to 19
 * percent of hands where the pack opens 39.7. Six shipped families teach a button
 * that folds most of what a button opens.
 *
 * The gap was visible only as "the button's range looks narrow" until the two
 * numbers were put side by side, which is what this does.
 *
 *   npm run mtt:postflop-range-consistency
 *   npm run mtt:postflop-range-consistency -- --max-gap=5
 */

const PARAM_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";
const PARAM_FILE = /^\d+_(?<family>[A-Z0-9_]+?)_[AKQJT98765432]{3}(?:r|tt|mono)\.txt$/;
/**
 * Single-raised-pot families where the hero is the preflop opener, so the pack's
 * RFI range for that seat is the range the solve should have used. Three-bet pots
 * are excluded: the hero's range there is a 3-bet or a call-of-3-bet range, which
 * is a different question and needs its own comparison.
 */
const OPENER_FAMILY = /^MTT9_(?<bb>\d+)BB_(?<seat>UTG|MP|LJ|HJ|CO|BTN|SB)_BB_SRP/;
const TOTAL_COMBOS = 1326;

export function combosInClass(handClass: string): number {
  // "AK" with no suit marker is both AKs and AKo, and the button's solve input
  // uses that form. Testing only the length treated it as a pair and counted six
  // combinations instead of sixteen, understating the range it was measuring.
  if (handClass.length === 2) return handClass[0] === handClass[1] ? 6 : 16;
  if (handClass.endsWith("s")) return 4;
  if (handClass.endsWith("o")) return 12;
  return 0;
}

/** Hero range width in combos, honouring TexasSolver's `hand:weight` form. */
export function solveRangeCombos(rangeLine: string): number {
  let total = 0;
  for (const entry of rangeLine.split(",")) {
    const [hand, rawWeight] = entry.trim().split(":");
    if (!hand) continue;
    const weight = rawWeight === undefined ? 1 : Number(rawWeight);
    total += combosInClass(hand) * (Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 1);
  }
  return total;
}

export interface RangeGap {
  familyId: string;
  seat: string;
  bucket: number;
  solvePct: number;
  /** Null when the preflop pack has no range for this seat and depth. */
  packPct: number | null;
  gapPoints: number | null;
}

function heroRangeLine(familyId: string, paramRoot: string): string | null {
  if (!existsSync(paramRoot)) return null;
  const key = familyId.includes("_OOP") ? "set_range_oop" : "set_range_ip";
  for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const dir = join(paramRoot, set.name);
    const hit = readdirSync(dir).find((file) => PARAM_FILE.exec(file)?.groups?.family === familyId);
    if (hit === undefined) continue;
    const line = readFileSync(join(dir, hit), "utf8")
      .split(/\r?\n/)
      .find((item) => item.startsWith(`${key} `));
    return line === undefined ? null : line.slice(key.length + 1);
  }
  return null;
}

export function compareHeroRanges(paramRoot = PARAM_ROOT): RangeGap[] {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.ante === "OFF" &&
    item.dimensions.blindSpeed === "REGULAR"
  ));
  if (pack === undefined) return [];
  const store = createRangeStoreFromRangePack(pack);

  const families = new Set<string>();
  if (existsSync(paramRoot)) {
    for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      for (const file of readdirSync(join(paramRoot, set.name))) {
        const match = PARAM_FILE.exec(file);
        if (match?.groups !== undefined) families.add(match.groups.family);
      }
    }
  }

  const rows: RangeGap[] = [];
  for (const familyId of [...families].sort()) {
    const match = OPENER_FAMILY.exec(familyId);
    if (match?.groups === undefined) continue;
    const line = heroRangeLine(familyId, paramRoot);
    if (line === null) continue;

    const bucket = Number(match.groups.bb);
    const entry = store.lookup({
      ante: "OFF",
      position: match.groups.seat as Position,
      bucket: bucket as StackBucket,
      context: "RFI",
    });
    const solveOnlyPct = solveRangeCombos(line) / TOTAL_COMBOS * 100;
    // A depth the pack does not cover cannot be compared - but it must still be
    // listed. MTT9_80BB_BTN_BB_SRP_HIGHSPR carries the same narrow range as the
    // families below and the pack has no 80BB bucket, so dropping it would have
    // hidden the sixth affected family behind a silent skip.
    if (entry === undefined) {
      rows.push({
        familyId,
        seat: match.groups.seat,
        bucket,
        solvePct: Math.round(solveOnlyPct * 10) / 10,
        packPct: null,
        gapPoints: null,
      });
      continue;
    }

    const packCombos = Object.entries(entry.actions)
      .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
      .reduce((sum, [handClass]) => sum + combosInClass(handClass), 0);

    const packPct = packCombos / TOTAL_COMBOS * 100;
    rows.push({
      familyId,
      seat: match.groups.seat,
      bucket,
      solvePct: Math.round(solveOnlyPct * 10) / 10,
      packPct: Math.round(packPct * 10) / 10,
      gapPoints: Math.round(Math.abs(solveOnlyPct - packPct) * 10) / 10,
    });
  }
  return rows;
}

function parseMaxGap(argv: readonly string[]): number {
  const flag = argv.find((item) => item.startsWith("--max-gap="));
  if (flag === undefined) return 8;
  const value = Number(flag.slice("--max-gap=".length));
  if (!Number.isFinite(value) || value < 0) throw new Error("--max-gap must be a non-negative number.");
  return value;
}

const maxGap = parseMaxGap(process.argv.slice(2));
const rows = compareHeroRanges();
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
