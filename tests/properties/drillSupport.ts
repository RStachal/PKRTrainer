/**
 * Sdílené pomůcky pro property-based testy Drill_Engine.
 *
 * Tento modul NENÍ test (neodpovídá glob `*.test.ts`), pouze poskytuje
 * společné arbitrary generátory, tovární funkci na `Filters`, mapování
 * kontext → přípustné koše a univerzální `take` pro (potenciálně nekonečné)
 * iterovatelné sekvence.
 */

import fc from "fast-check";

import { generateSpot } from "../../src/core/drillEngine";
import { mulberry32 } from "../../src/core/rng";
import { rangeStore } from "../../src/data/rangeStore";
import type {
  ActionContext,
  AnteMode,
  Filters,
  Spot,
  StackBucket,
} from "../../src/core/types";

/** Všech 9 akčních kontextů v kanonickém pořadí (dle `types.ts`). */
export const ALL_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

/** Kontexty zahrnující raise akci (mimo čistý push/fold a vs-all-in). */
export const RAISE_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
];

/** Kontexty v režimu push/fold (≤ 12 BB). */
export const PUSH_FOLD_CONTEXTS: ActionContext[] = ["PUSH_FOLD", "VS_ALLIN"];

/** Hloubkové koše ≤ 12 BB (push/fold). */
export const PF_BUCKETS: StackBucket[] = [5, 10];

/** Hloubkové koše > 12 BB (plný akční strom). */
export const DEEP_BUCKETS: StackBucket[] = [
  15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150,
];

/** Horní hranice 32-bit unsigned seedu (2^32 − 1). */
export const SEED_MAX = 0xffffffff;

/** Obě varianty ante. */
export const ANTES: AnteMode[] = ["ON", "OFF"];

/**
 * Vezme nejvýše `n` prvků z (i nekonečné) iterovatelné sekvence.
 * Bezpečné vůči nekonečným generátorům — po `n` prvcích přeruší iteraci.
 */
export function take<T>(it: Iterable<T>, n: number): T[] {
  const out: T[] = [];
  if (n <= 0) return out;
  for (const x of it) {
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Sestaví `Filters` s rozumnými výchozími hodnotami: prázdné (neomezené)
 * dimenze, ante = OFF, scoringMode = LENIENT. Jednotlivé položky lze přepsat.
 */
export function makeFilters(opts: Partial<Filters> = {}): Filters {
  return {
    positions: opts.positions ?? [],
    buckets: opts.buckets ?? [],
    contexts: opts.contexts ?? [],
    ante: opts.ante ?? "OFF",
    scoringMode: opts.scoringMode ?? "LENIENT",
  };
}

/** Přípustné hloubkové koše pro daný kontext (push/fold vs hluboké). */
export function validBucketsFor(context: ActionContext): StackBucket[] {
  return PUSH_FOLD_CONTEXTS.includes(context) ? PF_BUCKETS : DEEP_BUCKETS;
}

/**
 * Vygeneruje jeden spot reálným `rangeStore` singletonem a seedovaným
 * `mulberry32(seed)` (může vrátit `null`).
 */
export function genSpot(
  seed: number,
  context: ActionContext,
  filters: Filters,
): Spot | null {
  return generateSpot(mulberry32(seed), context, filters, rangeStore);
}

// ---------------------------------------------------------------------------
// Sdílené arbitrary generátory
// ---------------------------------------------------------------------------

/** Náhodný 32-bit unsigned seed (0 .. 2^32 − 1). */
export const arbSeed: fc.Arbitrary<number> = fc.integer({ min: 0, max: SEED_MAX });

/** Náhodný akční kontext ze všech 9. */
export const arbContext: fc.Arbitrary<ActionContext> = fc.constantFrom(...ALL_CONTEXTS);

/** Náhodná varianta ante. */
export const arbAnte: fc.Arbitrary<AnteMode> = fc.constantFrom(...ANTES);
