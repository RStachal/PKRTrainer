import { describe, expect, it } from "vitest";

import { KEY_POSTFLOP_EVENTS } from "../../src/persistence/keys";
import type { PostflopStatsV2BridgeRecord } from "../../src/persistence/postflopResultRecord";
import { createPostflopStatsStore } from "../../src/persistence/postflopStatsStore";

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

const postflopRecord: PostflopStatsV2BridgeRecord = {
  schema: "postflop_stats_v2_bridge_v1",
  schemaVersion: 3,
  qid: "POSTFLOP|FLOP|1|As-Kd-Qh",
  correct: true,
  ts: 2,
  profileId: "MTT|FULL_RING_9|REGULAR|FLOP|CHIP_EV|ON|NONE",
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "ON",
  rakeMode: "NONE",
  actionNode: "SINGLE_RAISED_POT_CBET",
  potType: "SINGLE_RAISED",
  boardTextureKey: "dry|ace-high|disconnected",
  heroPosition: "BTN",
  villainPosition: "BB",
  positionPattern: "BTN_VS_BB",
  chosen: "BET_SMALL",
  recommended: "BET_SMALL",
  strategyPackId: "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
  strategyRuleId: "flop-srp-ace-high-disconnected-small-cbet",
  confidence: "LOW",
};

describe("postflopStatsStore", () => {
  it("ulozi postflop event log a nacte jej po reloadu store", () => {
    const storage = new MemoryStorage();
    const writer = createPostflopStatsStore(storage);

    expect(writer.record(postflopRecord).ok).toBe(true);
    expect(JSON.parse(storage.getItem(KEY_POSTFLOP_EVENTS) ?? "[]")).toEqual([
      postflopRecord,
    ]);

    const reader = createPostflopStatsStore(storage);
    expect(reader.events()).toEqual([postflopRecord]);
  });

  it("pri reloadu normalizuje legacy postflop record bez schemaVersion", () => {
    const storage = new MemoryStorage();
    const legacyPostflop = { ...postflopRecord } as Partial<PostflopStatsV2BridgeRecord>;
    delete legacyPostflop.schemaVersion;
    delete legacyPostflop.ante;
    storage.setItem(KEY_POSTFLOP_EVENTS, JSON.stringify([legacyPostflop]));

    const reader = createPostflopStatsStore(storage);

    expect(reader.events()).toEqual([postflopRecord]);
  });

  it("odmitne neplatny postflop zaznam pri replaceAll", () => {
    const storage = new MemoryStorage();
    const store = createPostflopStatsStore(storage);

    const result = store.replaceAll([
      { ...postflopRecord, chosen: "CALL" },
    ] as unknown as PostflopStatsV2BridgeRecord[]);

    expect(result.ok).toBe(false);
    expect(storage.getItem(KEY_POSTFLOP_EVENTS)).toBeNull();
    expect(store.events()).toEqual([]);
  });

  it("pri selhani zapisu vrati ok=false a ponecha puvodni log", () => {
    const storage = new ThrowingSetStorage();
    const store = createPostflopStatsStore(storage);

    const result = store.record(postflopRecord);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("storage unavailable");
    expect(storage.getItem(KEY_POSTFLOP_EVENTS)).toBeNull();
    expect(store.events()).toEqual([]);
  });
});
