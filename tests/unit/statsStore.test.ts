import { describe, it, expect } from "vitest";

import { createStatsStore, type ResultRecord } from "../../src/persistence/statsStore";
import { KEY_EVENTS } from "../../src/persistence/keys";

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

const record: ResultRecord = {
  qid: "RFI|BTN|25|AKs|OFF",
  chosen: "OPEN_2X",
  correct: true,
  context: "RFI",
  position: "BTN",
  bucket: 25,
  ts: 1,
};

describe("statsStore - chybove toky", () => {
  it("pri selhani ulozeni vrati ok=false a ponecha drive ulozena data", () => {
    const storage = new ThrowingSetStorage();
    const store = createStatsStore(storage);

    const result = store.record(record);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("storage unavailable");
    expect(storage.getItem(KEY_EVENTS)).toBeNull();
    expect(store.summary()).toEqual({ total: 0, correct: 0, rate: null });
  });

  it("prazdne skupiny ve statistikach maji count 0 a rate null", () => {
    const store = createStatsStore(new MemoryStorage());

    expect(store.summary()).toEqual({ total: 0, correct: 0, rate: null });
    for (const dim of ["context", "position", "bucket"] as const) {
      const breakdown = store.breakdownBy(dim);
      expect(breakdown.length).toBeGreaterThan(0);
      expect(breakdown.every((group) => group.total === 0)).toBe(true);
      expect(breakdown.every((group) => group.correct === 0)).toBe(true);
      expect(breakdown.every((group) => group.rate === null)).toBe(true);
    }
  });
});
