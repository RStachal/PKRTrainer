import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  KEY_EVENTS,
  KEY_HH,
  KEY_MIGRATED,
  KEY_STATE,
  LEGACY_KEYS,
  SCHEMA_VERSION,
} from "../../src/persistence/keys";
import { runMigration } from "../../src/persistence/migration";
import type { ResultRecord } from "../../src/persistence/statsStore";
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

const arbCompatibleRecord: fc.Arbitrary<ResultRecord> = fc.record({
  qid: fc.string({ minLength: 1, maxLength: 40 }),
  chosen: fc.constantFrom<ActionKey>(...ACTION_KEYS),
  correct: fc.boolean(),
  context: fc.constantFrom<ActionContext>(...ACTION_CONTEXTS),
  position: fc.constantFrom<Position>(...POSITION_ORDER),
  bucket: fc.constantFrom<StackBucket>(...STACK_BUCKETS),
  ts: fc.integer({ min: 0, max: 4_294_967_295 }),
});

const arbCompatibleRecords = fc.array(arbCompatibleRecord, { maxLength: 40 });
const arbOptionalText = fc.option(fc.string({ maxLength: 100 }), { nil: null });

function expectedStreak(records: readonly ResultRecord[]): number {
  let streak = 0;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (!records[i].correct) break;
    streak += 1;
  }
  return streak;
}

describe("migration - legacy to versioned storage", () => {
  // Feature: mtt-preflop-trainer, Property 33: Migrace prenasi kompatibilni data, nechava legacy nedotcene a je idempotentni
  // Validates: Requirements 14.2, 14.4
  it("Property 33: kompatibilni legacy eventy se migruji a druhe spusteni je noop", () => {
    fc.assert(
      fc.property(
        arbCompatibleRecords,
        arbOptionalText,
        arbOptionalText,
        (records, hhText, legacyState) => {
          const storage = new MemoryStorage();
          const legacyEventsRaw = JSON.stringify(records);
          storage.setItem(LEGACY_KEYS.events, legacyEventsRaw);
          if (hhText !== null) storage.setItem(LEGACY_KEYS.hh, hhText);
          if (legacyState !== null) storage.setItem(LEGACY_KEYS.state, legacyState);

          const beforeLegacy = {
            events: storage.getItem(LEGACY_KEYS.events),
            hh: storage.getItem(LEGACY_KEYS.hh),
            state: storage.getItem(LEGACY_KEYS.state),
          };

          const first = runMigration(storage);
          expect(first.status).toBe("migrated");
          expect(first.migratedEventCount).toBe(records.length);
          expect(first.skippedEventCount).toBe(0);

          expect(JSON.parse(storage.getItem(KEY_EVENTS) ?? "null")).toEqual(records);
          expect(storage.getItem(KEY_MIGRATED)).toBe(SCHEMA_VERSION);

          const state = JSON.parse(storage.getItem(KEY_STATE) ?? "null") as {
            version: string;
            answered: number;
            correct: number;
            streak: number;
          };
          expect(state).toEqual({
            version: SCHEMA_VERSION,
            answered: records.length,
            correct: records.filter((r) => r.correct).length,
            streak: expectedStreak(records),
          });

          if (hhText !== null && hhText.trim().length > 0) {
            expect(storage.getItem(KEY_HH)).toBe(hhText);
          } else {
            expect(storage.getItem(KEY_HH)).toBeNull();
          }

          expect(storage.getItem(LEGACY_KEYS.events)).toBe(beforeLegacy.events);
          expect(storage.getItem(LEGACY_KEYS.hh)).toBe(beforeLegacy.hh);
          expect(storage.getItem(LEGACY_KEYS.state)).toBe(beforeLegacy.state);

          const versionedSnapshot = {
            events: storage.getItem(KEY_EVENTS),
            state: storage.getItem(KEY_STATE),
            hh: storage.getItem(KEY_HH),
            migrated: storage.getItem(KEY_MIGRATED),
          };

          const second = runMigration(storage);
          expect(second.status).toBe("noop");
          expect({
            events: storage.getItem(KEY_EVENTS),
            state: storage.getItem(KEY_STATE),
            hh: storage.getItem(KEY_HH),
            migrated: storage.getItem(KEY_MIGRATED),
          }).toEqual(versionedSnapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});
