import { describe, expect, it } from "vitest";

import type { ActionContext, AnteMode, Position, StackBucket } from "../../src/core/types";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";

/**
 * Five properties the range table holds, audited across every record.
 *
 * All five came back clean, and that is why they are here. A clean audit is only
 * worth the run it took unless it is turned into something that stays true - the
 * kicker-order and positional-containment scans each found real defects, so the
 * same technique returning nothing on these five is a statement about the table
 * rather than an absence of one.
 *
 * The properties, and why each is beyond dispute:
 *
 * 1. PAIRS. Playing 55 and folding 66 is not a strategy.
 * 2. SUITED OVER OFFSUIT. KJs beats KJo at everything; a range holding the
 *    offsuit and not the suited is inverted.
 * 3. ANTE CONTAINMENT. Ante adds dead money and never removes it, so ante-on
 *    contains ante-off. The project states this as design - the depth curve is
 *    ante-off and the widening sits above it.
 * 4. STRICT WITHIN LENIENT. What the table teaches must be among what it
 *    tolerates, or the grader can mark an answer wrong that the same record
 *    recommends.
 * 5. NO DEGENERATE RECORDS. A record playing all 169 classes is a placeholder.
 */

const RANKS = "23456789TJQKA";
const SEATS = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB"] as Position[];
const CONTEXTS = [
  "RFI", "VS_OPEN", "VS_3BET", "VS_4BET", "VS_LIMP",
  "SQUEEZE", "BVB", "PUSH_FOLD", "VS_ALLIN",
] as ActionContext[];
const DEPTHS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150] as StackBucket[];

function store(ante: AnteMode) {
  const pack = allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  if (pack === undefined) throw new Error(`no pack for ante ${ante}`);
  return createRangeStoreFromRangePack(pack);
}

interface Record {
  played: Set<string>;
  strict: Readonly<Record<string, readonly string[]>>;
  lenient: Readonly<Record<string, readonly string[]>>;
}

function read(ante: AnteMode, position: Position, bucket: StackBucket, context: ActionContext) {
  const entry = store(ante).lookup({ ante, position, bucket, context });
  if (entry === undefined) return null;
  return {
    played: new Set(
      Object.entries(entry.actions)
        .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
        .map(([handClass]) => handClass),
    ),
    strict: entry.strict,
    lenient: entry.actions,
  };
}

function everyRecord(visit: (record: NonNullable<ReturnType<typeof read>>, label: string) => void): number {
  let seen = 0;
  for (const ante of ["OFF", "ON"] as AnteMode[]) {
    for (const seat of SEATS) {
      for (const bucket of DEPTHS) {
        for (const context of CONTEXTS) {
          const record = read(ante, seat, bucket, context);
          if (record === null) continue;
          seen += 1;
          visit(record, `${ante} ${seat} ${bucket}BB ${context}`);
        }
      }
    }
  }
  return seen;
}

describe("range table invariants", () => {
  it("audits enough records for a clean result to mean something", () => {
    expect(everyRecord(() => undefined)).toBeGreaterThan(500);
  });

  it("plays every pair above one it already plays", () => {
    const bad: string[] = [];
    everyRecord((record, label) => {
      for (let low = 0; low < RANKS.length; low += 1) {
        if (!record.played.has(RANKS[low] + RANKS[low])) continue;
        for (let high = low + 1; high < RANKS.length; high += 1) {
          const higher = RANKS[high] + RANKS[high];
          if (!record.played.has(higher)) bad.push(`${label}: ${RANKS[low] + RANKS[low]} without ${higher}`);
        }
      }
    });
    expect([...new Set(bad)]).toEqual([]);
  });

  it("never plays an offsuit hand while folding its suited twin", () => {
    const bad: string[] = [];
    everyRecord((record, label) => {
      for (const hand of record.played) {
        if (!hand.endsWith("o")) continue;
        const suited = `${hand.slice(0, 2)}s`;
        if (!record.played.has(suited)) bad.push(`${label}: ${hand} without ${suited}`);
      }
    });
    expect([...new Set(bad)]).toEqual([]);
  });

  it("keeps every ante-off hand in the ante-on range", () => {
    const bad: string[] = [];
    for (const seat of SEATS) {
      for (const bucket of DEPTHS) {
        for (const context of CONTEXTS) {
          const off = read("OFF", seat, bucket, context);
          const on = read("ON", seat, bucket, context);
          if (off === null || on === null) continue;
          for (const hand of off.played) {
            if (!on.played.has(hand)) bad.push(`${seat} ${bucket}BB ${context}: ${hand}`);
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("recommends nothing it does not also tolerate", () => {
    const bad: string[] = [];
    everyRecord((record, label) => {
      for (const [hand, keys] of Object.entries(record.strict)) {
        const tolerated = new Set(record.lenient[hand] ?? []);
        for (const key of keys) {
          if (!tolerated.has(key)) bad.push(`${label}: strict ${hand}=${key} absent from lenient`);
        }
      }
    });
    expect([...new Set(bad)]).toEqual([]);
  });

  it("has no record that plays every hand", () => {
    const bad: string[] = [];
    everyRecord((record, label) => {
      if (record.played.size === 169) bad.push(label);
    });
    expect(bad).toEqual([]);
  });
});
