import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import type { AnteMode, Position, StackBucket } from "../../src/core/types";

/**
 * Compare the owner's purchased opening charts against the ranges we teach.
 *
 * The charts are the benchmark, not the content: they stay outside the
 * repository and nothing here copies them in. What crosses over is a width and a
 * list of disagreements, which is what makes them useful for checking our own
 * solver-derived ranges.
 *
 * Pure data and helpers. The CLI lives in scripts/compareChartsToPacks.mts.
 * Keeping them apart is the same fix the hero-range guard needed earlier today
 * and the same trap this file fell into an hour later: a module that reads argv
 * and throws at import time cannot be imported.
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
export const PAGE_SEATS: Readonly<Record<string, readonly Position[]>> = {
  "co-bu": ["CO", "BTN"],
  "bu-sb": ["BTN", "SB"],
  "mp-hj": ["LJ", "HJ"],
  "utg-utg2": ["UTG", "UTG+1"],
};

/** Stack depth the page covers, from its name. */
export function bucketForPage(page: string): StackBucket | null {
  if (/\b10-20bb\b/i.test(page)) return 20 as StackBucket;
  if (/\b25bb\b/i.test(page)) return 25 as StackBucket;
  if (/\b100bb\b/i.test(page)) return 100 as StackBucket;
  return null;
}

export function seatsForPage(page: string, gridCount: number): readonly Position[] | null {
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

export interface Cluster { hex: string; count: number; hands: string[] }

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

export function packWidth(ante: AnteMode, position: Position, bucket: StackBucket): { pct: number; opens: string[] } | null {
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

