import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import {
  availableStatsV2Dimensions,
  breakdownStatsV2,
  buildStatsV2KpiModel,
  summarizeStatsV2,
} from "../../src/persistence/statsV2Analytics";

const records: ResultRecord[] = [
  {
    qid: "RFI|BTN|25|AKs|OFF",
    chosen: "OPEN_2X",
    correct: true,
    context: "RFI",
    position: "BTN",
    bucket: 25,
    ts: 1,
  },
  {
    qid: "VS_OPEN|BB|15|A5s|ON",
    chosen: "FOLD",
    correct: false,
    context: "VS_OPEN",
    position: "BB",
    bucket: 15,
    ts: 2,
  },
];

describe("statsV2Analytics", () => {
  it("spocita summary nad profilovymi v2 zaznamy", () => {
    const migrated = migrateResultRecordsToV2(records);

    expect(summarizeStatsV2(migrated)).toEqual({
      total: 2,
      correct: 1,
      rate: 50,
    });
  });

  it("umi breakdown podle profilu, range packu i pokerovych dimenzi", () => {
    const migrated = migrateResultRecordsToV2(records);

    expect(breakdownStatsV2(migrated, "ante")).toEqual([
      { key: "OFF", total: 1, correct: 1, rate: 100 },
      { key: "ON", total: 1, correct: 0, rate: 0 },
    ]);
    expect(breakdownStatsV2(migrated, "rangePackId").map((group) => group.key)).toEqual([
      "mtt-full-ring-9-regular-preflop-chip-ev-ante-off-v1",
      "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1",
    ]);
    expect(breakdownStatsV2(migrated, "position")).toEqual([
      { key: "BTN", total: 1, correct: 1, rate: 100 },
      { key: "BB", total: 1, correct: 0, rate: 0 },
    ]);
  });

  it("vystavuje vsechny dimenze potrebne pro budouci dashboard", () => {
    expect(availableStatsV2Dimensions()).toEqual([
      "gameVariant",
      "tableFormat",
      "blindSpeed",
      "street",
      "evModel",
      "ante",
      "rakeMode",
      "rangePackId",
      "position",
      "bucket",
      "context",
    ]);
  });

  it("spocita relevantni KPI: recent window, best streak a leak candidates", () => {
    const kpiRecords = migrateResultRecordsToV2([
      {
        qid: "RFI|BTN|25|AKs|OFF|1",
        chosen: "OPEN_2X",
        correct: true,
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 1,
      },
      {
        qid: "RFI|BTN|25|AQs|OFF|2",
        chosen: "OPEN_2X",
        correct: true,
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 2,
      },
      {
        qid: "VS_OPEN|BB|15|A5s|ON|3",
        chosen: "FOLD",
        correct: false,
        context: "VS_OPEN",
        position: "BB",
        bucket: 15,
        ts: 3,
      },
      {
        qid: "VS_OPEN|BB|15|KQo|ON|4",
        chosen: "CALL",
        correct: true,
        context: "VS_OPEN",
        position: "BB",
        bucket: 15,
        ts: 4,
      },
      {
        qid: "VS_OPEN|BB|15|QJo|ON|5",
        chosen: "FOLD",
        correct: false,
        context: "VS_OPEN",
        position: "BB",
        bucket: 15,
        ts: 5,
      },
      {
        qid: "VS_OPEN|BB|15|T9s|ON|6",
        chosen: "CALL",
        correct: false,
        context: "VS_OPEN",
        position: "BB",
        bucket: 15,
        ts: 6,
      },
      {
        qid: "BVB|SB|25|A2s|ON|7",
        chosen: "OPEN_2X",
        correct: true,
        context: "BVB",
        position: "SB",
        bucket: 25,
        ts: 7,
      },
    ]);

    const model = buildStatsV2KpiModel(kpiRecords, {
      recentWindowSize: 3,
      minLeakSample: 3,
      leakRateThreshold: 60,
      leakDimensions: ["context", "position", "bucket"],
    });

    expect(model).toMatchObject({
      total: 7,
      correct: 4,
      lifetimeRate: 57.1,
      currentStreak: 1,
      bestStreak: 2,
      recentWindowSize: 3,
      recentTotal: 3,
      recentCorrect: 1,
      recentRate: 33.3,
      minLeakSample: 3,
      leakRateThreshold: 60,
    });
    expect(model.leakCandidates.map((candidate) => (
      `${candidate.dim}:${candidate.key}:${candidate.total}:${candidate.rate}`
    ))).toEqual([
      "bucket:15:4:25",
      "context:VS_OPEN:4:25",
      "position:BB:4:25",
    ]);
  });

  it("spocita decision-time KPI jen z validnich namerenych zaznamu", () => {
    const timed = migrateResultRecordsToV2([
      { ...records[0], responseMs: 1000, ts: 1 },
      { ...records[1], responseMs: 2000, ts: 2 },
      { ...records[0], qid: "RFI|CO|25|AQs|OFF|3", responseMs: undefined, ts: 3 },
    ]);

    const model = buildStatsV2KpiModel(timed, { recentWindowSize: 2 });
    const emptyModel = buildStatsV2KpiModel(migrateResultRecordsToV2(records));

    expect(model.avgResponseMs).toBe(1500);
    expect(model.recentAvgResponseMs).toBe(2000);
    expect(emptyModel.avgResponseMs).toBeNull();
    expect(emptyModel.recentAvgResponseMs).toBeNull();
  });
});
