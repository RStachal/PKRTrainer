import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
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
      "LEGACY_UNKNOWN_STRATEGY",
    ]);
    expect(breakdownStatsV2(migrated, "position")).toEqual([
      { key: "BTN", total: 1, correct: 1, rate: 100 },
      { key: "BB", total: 1, correct: 0, rate: 0 },
    ]);
  });

  it("drzi 6-max a 9-max vysledky oddelene pres tableFormat breakdown", () => {
    const fullRing = migrateResultRecordsToV2([records[0]]);
    const sixMax = migrateResultRecordsToV2([{ ...records[1], ts: 3 }], {
      profile: profileWith(DEFAULT_TRAINING_PROFILE, { tableFormat: "SIX_MAX" }),
    });

    expect(breakdownStatsV2([...fullRing, ...sixMax], "tableFormat")).toEqual([
      { key: "FULL_RING_9", total: 1, correct: 1, rate: 100 },
      { key: "SIX_MAX", total: 1, correct: 0, rate: 0 },
    ]);
    expect(fullRing[0].profileId).not.toBe(sixMax[0].profileId);
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
  it("hleda slabiny jen v profilu, ve kterem se hrac trenuje", () => {
    // Lifetime figures may pool profiles - "how am I doing" is a fair question
    // across all of them. A leak may not: it comes with a button that starts a
    // drill in one profile, so it has to have been measured in that one.
    const identity = (profileId: string) => ({
      schema: "preflop_result_identity_v1" as const,
      scenarioId: "RFI|BTN|25",
      profileId,
      gameVariant: "MTT" as const,
      tableFormat: "FULL_RING_9" as const,
      blindSpeed: "REGULAR" as const,
      street: "PREFLOP" as const,
      evModel: "CHIP_EV" as const,
      ante: (profileId.includes("|ON|") ? "ON" : "OFF") as "ON" | "OFF",
      rakeMode: "NONE" as const,
      rangePackId: "pack",
      rangePackVersion: "1.0.0",
      sourceVerifiedAt: "2026-01-01",
      scoringMode: "LENIENT" as const,
    });
    const on = "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE";
    const off = "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|OFF|NONE";
    const mixed = migrateResultRecordsToV2([
      ...Array.from({ length: 6 }, (_, index) => ({
        ...records[0],
        correct: false,
        ts: index + 1,
        identity: identity(off),
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        ...records[0],
        correct: true,
        ts: index + 7,
        identity: identity(on),
      })),
    ]);

    const pooled = buildStatsV2KpiModel(mixed, { minLeakSample: 5 });
    const scoped = buildStatsV2KpiModel(mixed, { minLeakSample: 5, leakProfileId: on });
    const weak = buildStatsV2KpiModel(mixed, { minLeakSample: 5, leakProfileId: off });

    // Pooled, BTN reads 50% and looks like a leak in both profiles at once.
    expect(pooled.leakCandidates.some((candidate) => candidate.key === "BTN")).toBe(true);
    expect(scoped.leakCandidates).toHaveLength(0);
    expect(weak.leakCandidates.map((candidate) => `${candidate.dim}:${candidate.key}:${candidate.rate}`))
      .toContain("position:BTN:0");
    // Scoping the leaks must not quietly scope the lifetime numbers with them.
    expect(scoped.total).toBe(12);
    expect(scoped.lifetimeRate).toBe(50);
  });
});
