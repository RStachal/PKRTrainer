import { describe, expect, it } from "vitest";

import { createStatsStore, type ResultRecord } from "../../src/persistence/statsStore";
import {
  buildStatsExportJson,
  importStatsJson,
  STATS_EXPORT_PROFILE,
} from "../../src/persistence/statsTransfer";

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

const record: ResultRecord = {
  qid: "RFI|BTN|25|AKs|OFF",
  chosen: "OPEN_2X",
  correct: true,
  context: "RFI",
  position: "BTN",
  bucket: 25,
  ts: 1,
};

describe("statsTransfer - export/import JSON", () => {
  it("exportuje payload s event logem a import jej nahradi ve Stats_Store", () => {
    const source = createStatsStore(new MemoryStorage());
    expect(source.record(record).ok).toBe(true);

    const exported = buildStatsExportJson(source, new Date("2026-06-01T12:00:00.000Z"));
    const parsed = JSON.parse(exported) as { profile: string; events: ResultRecord[] };
    expect(parsed.profile).toBe(STATS_EXPORT_PROFILE);
    expect(parsed.events).toEqual([record]);

    const target = createStatsStore(new MemoryStorage());
    const result = importStatsJson(exported, target);

    expect(result).toEqual({ ok: true, imported: 1 });
    expect(target.events()).toEqual([record]);
    expect(target.summary()).toEqual({ total: 1, correct: 1, rate: 100 });
  });

  it("odmitne neplatny JSON a nepremeni existujici data", () => {
    const store = createStatsStore(new MemoryStorage());
    expect(store.record(record).ok).toBe(true);

    const result = importStatsJson("{", store);

    expect(result.ok).toBe(false);
    expect(store.events()).toEqual([record]);
  });
});
