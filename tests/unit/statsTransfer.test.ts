import { describe, expect, it } from "vitest";

import { createStatsStore, type ResultRecord } from "../../src/persistence/statsStore";
import type { PostflopStatsV2BridgeRecord } from "../../src/persistence/postflopResultRecord";
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

const postflopRecord: PostflopStatsV2BridgeRecord = {
  schema: "postflop_stats_v2_bridge_v1",
  schemaVersion: 2,
  qid: "POSTFLOP|FLOP|1|As-Kd-Qh",
  correct: true,
  ts: 2,
  profileId: "MTT|FULL_RING_9|REGULAR|FLOP|CHIP_EV|ON|NONE",
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
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

describe("statsTransfer - export/import JSON", () => {
  it("exportuje payload s event logem a import jej nahradi ve Stats_Store", () => {
    const source = createStatsStore(new MemoryStorage());
    expect(source.record(record).ok).toBe(true);

    const exported = buildStatsExportJson(source, new Date("2026-06-01T12:00:00.000Z"));
    const parsed = JSON.parse(exported) as {
      profile: string;
      events: ResultRecord[];
      postflopRecords: PostflopStatsV2BridgeRecord[];
    };
    expect(parsed.profile).toBe(STATS_EXPORT_PROFILE);
    expect(parsed.events).toEqual([record]);
    expect(parsed.postflopRecords).toEqual([]);

    const target = createStatsStore(new MemoryStorage());
    const result = importStatsJson(exported, target);

    expect(result).toEqual({ ok: true, imported: 1, postflopRecords: [] });
    expect(target.events()).toEqual([record]);
    expect(target.summary()).toEqual({ total: 1, correct: 1, rate: 100 });
  });

  it("exportuje a importuje kombinovany preflop/postflop payload", () => {
    const source = createStatsStore(new MemoryStorage());
    expect(source.record(record).ok).toBe(true);

    const exported = buildStatsExportJson(
      source,
      new Date("2026-06-01T12:00:00.000Z"),
      { postflopRecords: [postflopRecord] },
    );
    const target = createStatsStore(new MemoryStorage());
    const result = importStatsJson(exported, target);

    expect(result).toEqual({
      ok: true,
      imported: 1,
      postflopRecords: [postflopRecord],
    });
    expect(target.events()).toEqual([record]);
  });

  it("zachova kompatibilitu s legacy polem udalosti bez postflopu", () => {
    const target = createStatsStore(new MemoryStorage());

    const result = importStatsJson(JSON.stringify([record]), target);

    expect(result).toEqual({ ok: true, imported: 1, postflopRecords: [] });
    expect(target.events()).toEqual([record]);
  });

  it("normalizuje legacy postflop import bez record schemaVersion", () => {
    const target = createStatsStore(new MemoryStorage());
    const legacyPostflop = { ...postflopRecord } as Partial<PostflopStatsV2BridgeRecord>;
    delete legacyPostflop.schemaVersion;

    const result = importStatsJson(JSON.stringify({
      profile: STATS_EXPORT_PROFILE,
      schemaVersion: "1",
      exportedAt: "2026-06-01T12:00:00.000Z",
      events: [record],
      postflopRecords: [legacyPostflop],
    }), target);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.postflopRecords[0]).toEqual(postflopRecord);
  });

  it("odmitne neplatny JSON a nepremeni existujici data", () => {
    const store = createStatsStore(new MemoryStorage());
    expect(store.record(record).ok).toBe(true);

    const result = importStatsJson("{", store);

    expect(result.ok).toBe(false);
    expect(store.events()).toEqual([record]);
  });
});
