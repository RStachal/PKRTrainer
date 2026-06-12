import { describe, expect, it } from "vitest";

import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import type { Card } from "../../src/core/types";
import { KEY_POSTFLOP_LINE_EVENTS } from "../../src/persistence/keys";
import { buildPostflopLineResultRecord } from "../../src/persistence/postflopLineResultRecord";
import { createPostflopLineStatsStore } from "../../src/persistence/postflopLineStatsStore";

class MemoryStorage implements Storage {
  protected readonly data = new Map<string, string>();

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

class ThrowingSetStorage extends MemoryStorage {
  override setItem(_key: string, _value: string): void {
    throw new Error("storage unavailable");
  }
}

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "d" },
];

const board: [Card, Card, Card, Card, Card] = [
  { rank: "A", suit: "h" },
  { rank: "7", suit: "d" },
  { rank: "2", suit: "c" },
  { rank: "4", suit: "s" },
  { rank: "Q", suit: "h" },
];

const lineRecord = buildPostflopLineResultRecord(
  generatePostflopLine({ seed: 42, heroCards, board }),
  { startedAt: 100, completedAt: 200 },
);

describe("postflopLineStatsStore", () => {
  it("ulozi multi-street line log oddelene od single-street postflop eventu", () => {
    const storage = new MemoryStorage();
    const writer = createPostflopLineStatsStore(storage);

    expect(writer.record(lineRecord).ok).toBe(true);
    expect(JSON.parse(storage.getItem(KEY_POSTFLOP_LINE_EVENTS) ?? "[]")).toEqual([
      lineRecord,
    ]);

    const reader = createPostflopLineStatsStore(storage);
    expect(reader.events()).toEqual([lineRecord]);
  });

  it("odmitne neplatny line zaznam pri replaceAll", () => {
    const storage = new MemoryStorage();
    const store = createPostflopLineStatsStore(storage);

    const result = store.replaceAll([
      { ...lineRecord, totalStreets: 99 },
    ]);

    expect(result.ok).toBe(false);
    expect(storage.getItem(KEY_POSTFLOP_LINE_EVENTS)).toBeNull();
    expect(store.events()).toEqual([]);
  });

  it("pri selhani zapisu vrati ok=false a ponecha puvodni log", () => {
    const storage = new ThrowingSetStorage();
    const store = createPostflopLineStatsStore(storage);

    const result = store.record(lineRecord);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("storage unavailable");
    expect(storage.getItem(KEY_POSTFLOP_LINE_EVENTS)).toBeNull();
    expect(store.events()).toEqual([]);
  });
});
