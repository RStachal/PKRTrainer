import { describe, expect, it } from "vitest";

import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import type { Card } from "../../src/core/types";
import { createStatsStore, type ResultRecord } from "../../src/persistence/statsStore";
import type { PostflopStatsV2BridgeRecord } from "../../src/persistence/postflopResultRecord";
import {
  buildPostflopLineResultRecord,
  type PostflopLineResultRecord,
} from "../../src/persistence/postflopLineResultRecord";
import {
  buildStatsExportJson,
  importStatsJson,
  listStatsProfiles,
  removeStatsProfileRecords,
  selectStatsProfileRecords,
  STATS_EXPORT_PROFILE,
} from "../../src/persistence/statsTransfer";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import { PREFLOP_RESULT_IDENTITY_SCHEMA } from "../../src/persistence/statsStore";

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

function profiledRecord(ante: "ON" | "OFF", ts: number): ResultRecord {
  const qid = `RFI|BTN|25|AKs|${ante}`;
  const profileId = `MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|${ante}|NONE`;
  return {
    ...record,
    qid,
    ts,
    identity: {
      schema: PREFLOP_RESULT_IDENTITY_SCHEMA,
      scenarioId: `preflop_scenario_v1|${profileId}|${qid}`,
      profileId,
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante,
      rakeMode: "NONE",
      rangePackId: `mtt-full-ring-9-regular-preflop-chip-ev-ante-${ante.toLowerCase()}-v1`,
      rangePackVersion: "1",
      sourceVerifiedAt: "2026-06-01",
      scoringMode: "LENIENT",
    },
  };
}

const postflopRecord: PostflopStatsV2BridgeRecord = {
  schema: "postflop_stats_v2_bridge_v1",
  schemaVersion: 4,
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

const postflopEvRecord: PostflopStatsV2BridgeRecord = {
  ...postflopRecord,
  schemaVersion: 5,
  actionEvOutcome: "EQUIVALENT",
  chosenEvBb: 0.195,
  bestEvBb: 0.2,
  evLossBb: 0.005,
  equivalentBestActions: ["CHECK", "BET_SMALL"],
};

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

const postflopLineRecord: PostflopLineResultRecord = buildPostflopLineResultRecord(
  generatePostflopLine({ seed: 42, heroCards, board }),
  {
    profile: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      evModel: "CHIP_EV",
    },
    startedAt: 100,
    completedAt: 200,
  },
);

describe("statsTransfer - export/import JSON", () => {
  it("exportuje payload s event logem a import jej nahradi ve Stats_Store", () => {
    const source = createStatsStore(new MemoryStorage());
    expect(source.record(record).ok).toBe(true);

    const exported = buildStatsExportJson(source, new Date("2026-06-01T12:00:00.000Z"));
    const parsed = JSON.parse(exported) as {
      profile: string;
      events: ResultRecord[];
      postflopRecords: PostflopStatsV2BridgeRecord[];
      postflopLineRecords: PostflopLineResultRecord[];
    };
    expect(parsed.profile).toBe(STATS_EXPORT_PROFILE);
    expect(parsed.events).toEqual([record]);
    expect(parsed.postflopRecords).toEqual([]);
    expect(parsed.postflopLineRecords).toEqual([]);

    const target = createStatsStore(new MemoryStorage());
    const result = importStatsJson(exported, target);

    expect(result).toEqual({ ok: true, imported: 1, postflopRecords: [], postflopLineRecords: [] });
    expect(target.events()).toEqual([record]);
    expect(target.summary()).toEqual({ total: 1, correct: 1, rate: 100 });
  });

  it("exportuje a importuje kombinovany preflop/postflop/postflop-line payload", () => {
    const source = createStatsStore(new MemoryStorage());
    expect(source.record(record).ok).toBe(true);

    const exported = buildStatsExportJson(
      source,
      new Date("2026-06-01T12:00:00.000Z"),
      { postflopRecords: [postflopRecord], postflopLineRecords: [postflopLineRecord] },
    );
    const target = createStatsStore(new MemoryStorage());
    const result = importStatsJson(exported, target);

    expect(result).toEqual({
      ok: true,
      imported: 1,
      postflopRecords: [postflopRecord],
      postflopLineRecords: [postflopLineRecord],
    });
    expect(target.events()).toEqual([record]);
  });

  it("zachova kompletni postflop action EV payload v exportu a importu", () => {
    const source = createStatsStore(new MemoryStorage());
    const exported = buildStatsExportJson(
      source,
      new Date("2026-06-01T12:00:00.000Z"),
      { postflopRecords: [postflopEvRecord] },
    );
    const parsed = JSON.parse(exported) as {
      postflopRecords: PostflopStatsV2BridgeRecord[];
    };

    expect(parsed.postflopRecords).toEqual([postflopEvRecord]);
    const imported = importStatsJson(exported, createStatsStore(new MemoryStorage()));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.postflopRecords).toEqual([postflopEvRecord]);
  });

  it("umi vybrat, exportovat a odebrat statistiky jen pro jeden profil", () => {
    const source = createStatsStore(new MemoryStorage());
    const offRecord = profiledRecord("OFF", 1);
    const onRecord = profiledRecord("ON", 2);
    expect(source.record(offRecord).ok).toBe(true);
    expect(source.record(onRecord).ok).toBe(true);
    const offProfileId = migrateResultRecordsToV2([offRecord])[0].profileId;
    const onProfileId = migrateResultRecordsToV2([onRecord])[0].profileId;

    expect(listStatsProfiles(source.events(), [postflopRecord], [postflopLineRecord])).toEqual([
      { profileId: offProfileId, total: 1, preflopTotal: 1, postflopTotal: 0, postflopLineTotal: 0 },
      { profileId: postflopRecord.profileId, total: 2, preflopTotal: 0, postflopTotal: 1, postflopLineTotal: 1 },
      { profileId: onProfileId, total: 1, preflopTotal: 1, postflopTotal: 0, postflopLineTotal: 0 },
    ].sort((a, b) => a.profileId.localeCompare(b.profileId)));

    const selected = selectStatsProfileRecords(source.events(), [postflopRecord], [postflopLineRecord], offProfileId);
    expect(selected).toEqual({ events: [offRecord], postflopRecords: [], postflopLineRecords: [] });

    const exported = JSON.parse(buildStatsExportJson(
      source,
      new Date("2026-06-01T12:00:00.000Z"),
      {
        postflopRecords: [postflopRecord],
        postflopLineRecords: [postflopLineRecord],
        profileId: postflopRecord.profileId,
      },
    )) as {
      events: ResultRecord[];
      postflopRecords: PostflopStatsV2BridgeRecord[];
      postflopLineRecords: PostflopLineResultRecord[];
    };
    expect(exported.events).toEqual([]);
    expect(exported.postflopRecords).toEqual([postflopRecord]);
    expect(exported.postflopLineRecords).toEqual([postflopLineRecord]);

    const removed = removeStatsProfileRecords(source.events(), [postflopRecord], [postflopLineRecord], offProfileId);
    expect(removed.events).toEqual([onRecord]);
    expect(removed.postflopRecords).toEqual([postflopRecord]);
    expect(removed.postflopLineRecords).toEqual([postflopLineRecord]);
  });

  it("zachova kompatibilitu s legacy polem udalosti bez postflopu", () => {
    const target = createStatsStore(new MemoryStorage());

    const result = importStatsJson(JSON.stringify([record]), target);

    expect(result).toEqual({ ok: true, imported: 1, postflopRecords: [], postflopLineRecords: [] });
    expect(target.events()).toEqual([record]);
  });

  it("normalizuje legacy postflop import bez record schemaVersion", () => {
    const target = createStatsStore(new MemoryStorage());
    const legacyPostflop = { ...postflopRecord } as Partial<PostflopStatsV2BridgeRecord>;
    delete legacyPostflop.schemaVersion;
    delete legacyPostflop.ante;

    const result = importStatsJson(JSON.stringify({
      profile: STATS_EXPORT_PROFILE,
      schemaVersion: "1",
      exportedAt: "2026-06-01T12:00:00.000Z",
      events: [record],
      postflopRecords: [legacyPostflop],
    }), target);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.postflopRecords[0]).toEqual({
      ...postflopRecord,
      schemaVersion: 5,
    });
    expect(result.postflopLineRecords).toEqual([]);
  });

  it("odmitne neplatny JSON a nepremeni existujici data", () => {
    const store = createStatsStore(new MemoryStorage());
    expect(store.record(record).ok).toBe(true);

    const result = importStatsJson("{", store);

    expect(result.ok).toBe(false);
    expect(store.events()).toEqual([record]);
  });
});
