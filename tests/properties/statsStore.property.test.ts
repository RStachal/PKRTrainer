import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  createStatsStore,
  round1,
  type ResultRecord,
} from "../../src/persistence/statsStore";
import {
  KEY_EVENTS,
  LEGACY_KEYS,
  SCHEMA_VERSION,
  VERSIONED_KEYS,
} from "../../src/persistence/keys";
import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type Position,
  type StackBucket,
} from "../../src/core/types";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const ACTION_CONTEXTS: ActionContext[] = [
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

const ACTION_KEYS: ActionKey[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
  "JAM",
  "CALL_JAM",
];

const arbRecord: fc.Arbitrary<ResultRecord> = fc.record({
  qid: fc.string({ minLength: 1, maxLength: 40 }),
  chosen: fc.constantFrom<ActionKey>(...ACTION_KEYS),
  correct: fc.boolean(),
  context: fc.constantFrom<ActionContext>(...ACTION_CONTEXTS),
  position: fc.constantFrom<Position>(...POSITION_ORDER),
  bucket: fc.constantFrom<StackBucket>(...STACK_BUCKETS),
  ts: fc.integer({ min: 0, max: 4_294_967_295 }),
});

const arbRecords: fc.Arbitrary<ResultRecord[]> = fc.array(arbRecord, {
  maxLength: 60,
});

function parseEvents(storage: Storage): ResultRecord[] {
  const raw = storage.getItem(KEY_EVENTS);
  return raw === null ? [] : (JSON.parse(raw) as ResultRecord[]);
}

function expectedRate(total: number, correct: number): number | null {
  return total === 0 ? null : round1((correct / total) * 100);
}

function expectedStreak(records: readonly ResultRecord[]): number {
  let streak = 0;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (!records[i].correct) break;
    streak += 1;
  }
  return streak;
}

describe("statsStore - persistence properties", () => {
  // Feature: mtt-preflop-trainer, Property 24: Zaznam vysledku obsahuje povinna pole
  // Validates: Requirements 9.1
  it("Property 24: ulozeny zaznam obsahuje vsechna povinna pole", () => {
    fc.assert(
      fc.property(arbRecord, (record) => {
        const storage = new MemoryStorage();
        const store = createStatsStore(storage);

        expect(store.record(record).ok).toBe(true);
        expect(parseEvents(storage)).toEqual([record]);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 25: Perzistence je round-trip
  // Validates: Requirements 9.2
  it("Property 25: ulozeni a nacteni vraci ekvivalentni stav statistik", () => {
    fc.assert(
      fc.property(arbRecords, (records) => {
        const storage = new MemoryStorage();
        const writer = createStatsStore(storage);
        for (const record of records) {
          expect(writer.record(record).ok).toBe(true);
        }

        const reader = createStatsStore(storage);
        const correct = records.filter((r) => r.correct).length;

        expect(parseEvents(storage)).toEqual(records);
        expect(reader.summary()).toEqual({
          total: records.length,
          correct,
          rate: expectedRate(records.length, correct),
        });
        expect(reader.currentStreak()).toBe(expectedStreak(records));
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 26: Konzistentni agregace statistik
  // Validates: Requirements 9.3, 9.4
  it("Property 26: summary a breakdown agreguji konzistentne", () => {
    fc.assert(
      fc.property(arbRecords, (records) => {
        const storage = new MemoryStorage();
        const store = createStatsStore(storage);
        for (const record of records) {
          expect(store.record(record).ok).toBe(true);
        }

        const correct = records.filter((r) => r.correct).length;
        expect(store.summary()).toEqual({
          total: records.length,
          correct,
          rate: expectedRate(records.length, correct),
        });

        for (const dim of ["context", "position", "bucket"] as const) {
          const breakdown = store.breakdownBy(dim);
          const total = breakdown.reduce((sum, group) => sum + group.total, 0);
          const correctByGroups = breakdown.reduce(
            (sum, group) => sum + group.correct,
            0,
          );

          expect(total).toBe(records.length);
          expect(correctByGroups).toBe(correct);
          for (const group of breakdown) {
            expect(group.rate).toBe(expectedRate(group.total, group.correct));
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 27: Stav serie (streak) sleduje sekvenci odpovedi
  // Validates: Requirements 9.5
  it("Property 27: currentStreak odpovida koncove serii spravnych odpovedi", () => {
    fc.assert(
      fc.property(arbRecords, (records) => {
        const storage = new MemoryStorage();
        const store = createStatsStore(storage);
        for (const record of records) {
          expect(store.record(record).ok).toBe(true);
        }

        expect(store.currentStreak()).toBe(expectedStreak(records));
      }),
      { numRuns: 100 },
    );
  });
});

describe("persistence keys", () => {
  // Feature: mtt-preflop-trainer, Property 32: Nove klice jsou verzovane a nekoliduji s legacy
  // Validates: Requirements 14.1
  it("Property 32: versioned keys obsahuji verzi a nekoliduji s legacy", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const newKeys = Object.values(VERSIONED_KEYS);
        const legacyKeys = Object.values(LEGACY_KEYS);

        expect(new Set(newKeys).size).toBe(newKeys.length);
        for (const key of newKeys) {
          expect(key).toContain(SCHEMA_VERSION);
          expect(legacyKeys).not.toContain(key);
        }
      }),
      { numRuns: 100 },
    );
  });
});
