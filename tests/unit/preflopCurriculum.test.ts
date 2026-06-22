import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import {
  DEFAULT_TRAINING_PROFILE,
  profileWith,
} from "../../src/core/trainingProfile";
import {
  buildPreflopCurriculumPlan,
  buildPreflopSpacedRepetitionQueue,
} from "../../src/persistence/preflopCurriculum";

function record(
  qid: string,
  correct: boolean,
  overrides: Partial<ResultRecord> = {},
): ResultRecord {
  return {
    qid,
    chosen: correct ? "CALL" : "FOLD",
    correct,
    context: "VS_OPEN",
    position: "BB",
    bucket: 15,
    ts: 1,
    ...overrides,
  };
}

describe("preflopCurriculum", () => {
  it("vybere targeted training podle nejslabsiho sample-qualified KPI", () => {
    const records = migrateResultRecordsToV2([
      record("VS_OPEN|BB|15|A5s|ON|1", false, { ts: 1 }),
      record("VS_OPEN|BB|15|KQo|ON|2", true, { chosen: "CALL", ts: 2 }),
      record("VS_OPEN|BB|15|QJo|ON|3", false, { ts: 3 }),
      record("VS_OPEN|BB|15|T9s|ON|4", false, { ts: 4 }),
      record("RFI|BTN|25|AKs|OFF|5", true, {
        chosen: "OPEN_2X",
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 5,
      }),
    ]);

    const plan = buildPreflopCurriculumPlan(records, {
      minLeakSample: 3,
      leakRateThreshold: 70,
      targetSpots: 20,
      targetAccuracy: 80,
      streakTarget: 5,
    });

    expect(plan.available).toBe(true);
    expect(plan.focus).toMatchObject({
      label: "Stack: 15 BB",
      total: 4,
      correct: 1,
      rate: 25,
      filters: {
        positions: [],
        buckets: [15],
        contexts: [],
        ante: "ON",
        scoringMode: "LENIENT",
      },
    });
    expect(plan.recommendations).toHaveLength(3);
    expect(plan.recommendations[0]).toMatchObject({
      label: "Stack: 15 BB",
      recentTotal: 4,
      recentMistakes: 3,
    });
    expect(plan.recommendations[0].priority).toBeGreaterThan(0);
    expect(plan.recommendations[0].reason).toContain("chyb v posledním vzorku");
    expect(plan.sessionGoal).toEqual({
      targetSpots: 20,
      targetAccuracy: 80,
      streakTarget: 5,
      leakCleanupTarget: 80,
    });
  });

  it("pripravi deterministickou spaced repetition frontu pro caste chyby", () => {
    const records = migrateResultRecordsToV2([
      record("VS_OPEN|BB|15|A5s|ON", false, { ts: 1 }),
      record("VS_OPEN|BB|15|A5s|ON", false, { ts: 2 }),
      record("VS_OPEN|BB|15|KQo|ON", false, { ts: 3 }),
      record("VS_OPEN|BB|15|KQo|ON", true, { chosen: "CALL", ts: 4 }),
      record("RFI|BTN|25|AKs|OFF", true, {
        chosen: "OPEN_2X",
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 5,
      }),
    ]);

    const a = buildPreflopSpacedRepetitionQueue(records, { seed: 123, limit: 2 });
    const b = buildPreflopSpacedRepetitionQueue(records, { seed: 123, limit: 2 });

    expect(a).toEqual(b);
    expect(a.map((item) => item.qid)).toEqual([
      "VS_OPEN|BB|15|A5s|ON",
      "VS_OPEN|BB|15|KQo|ON",
    ]);
    expect(a[0]).toMatchObject({ attempts: 2, misses: 2 });
  });

  it("spaced repetition nemicha stejny qid mezi ruznymi profily", () => {
    const shared = record("VS_OPEN|BB|15|A5s|ON", false, { ts: 1 });
    const regular = migrateResultRecordsToV2([shared], {
      profile: DEFAULT_TRAINING_PROFILE,
    });
    const sixMax = migrateResultRecordsToV2([{ ...shared, ts: 2 }], {
      profile: profileWith(DEFAULT_TRAINING_PROFILE, { tableFormat: "SIX_MAX" }),
    });

    const queue = buildPreflopSpacedRepetitionQueue([...regular, ...sixMax]);

    expect(queue).toHaveLength(2);
    expect(new Set(queue.map((item) => item.scenarioId)).size).toBe(2);
    expect(queue.map((item) => item.qid)).toEqual([
      shared.qid,
      shared.qid,
    ]);
    expect(queue.every((item) => item.attempts === 1 && item.misses === 1)).toBe(true);
  });

  it("prioritizuje top 3 focus oblasti podle recent mistakes, ne jen lifetime accuracy", () => {
    const records = migrateResultRecordsToV2([
      record("VS_OPEN|BB|15|A5s|ON|old-1", false, { ts: 1 }),
      record("VS_OPEN|BB|15|KQo|ON|old-2", false, { ts: 2 }),
      record("VS_OPEN|BB|15|QJo|ON|old-3", false, { ts: 3 }),
      record("VS_OPEN|BB|15|T9s|ON|old-4", false, { ts: 4 }),
      record("VS_OPEN|BB|15|98s|ON|old-5", true, { chosen: "CALL", ts: 5 }),
      record("RFI|BTN|25|AKs|OFF|new-1", false, {
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 6,
      }),
      record("RFI|BTN|25|AQs|OFF|new-2", false, {
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 7,
      }),
      record("RFI|BTN|25|AJs|OFF|new-3", true, {
        chosen: "OPEN_2X",
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 8,
      }),
      record("RFI|BTN|25|KQs|OFF|new-4", false, {
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 9,
      }),
      record("RFI|BTN|25|KJs|OFF|new-5", true, {
        chosen: "OPEN_2X",
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 10,
      }),
    ]);

    const plan = buildPreflopCurriculumPlan(records, {
      minLeakSample: 5,
      leakRateThreshold: 70,
      recentWindowSize: 5,
    });

    expect(plan.available).toBe(true);
    expect(plan.recommendations).toHaveLength(3);
    expect(plan.recommendations[0]).toMatchObject({
      rate: 40,
      recentTotal: 5,
      recentMistakes: 3,
    });
    expect(plan.recommendations.map((recommendation) => recommendation.rate)).toEqual([40, 40, 40]);
    expect(plan.recommendations.map((recommendation) => recommendation.recentMistakes))
      .toEqual([3, 3, 3]);
  });

  it("vrati citelny unavailable plan bez preflop vzorku", () => {
    const plan = buildPreflopCurriculumPlan([], { targetSpots: 10 });

    expect(plan.available).toBe(false);
    expect(plan.reason).toBe("Zatím nejsou žádné preflop odpovědi.");
    expect(plan.focus).toBeNull();
    expect(plan.recommendations).toEqual([]);
    expect(plan.sessionGoal.targetSpots).toBe(10);
  });

  it("pri malem samplu vrati volume goal misto generickeho leak doporuceni", () => {
    const records = migrateResultRecordsToV2([
      record("VS_OPEN|BB|15|A5s|ON|low-1", false, { ts: 1 }),
      record("VS_OPEN|BB|15|KQo|ON|low-2", true, { chosen: "CALL", ts: 2 }),
      record("RFI|BTN|25|AKs|OFF|low-3", false, {
        context: "RFI",
        position: "BTN",
        bucket: 25,
        ts: 3,
      }),
    ]);

    const plan = buildPreflopCurriculumPlan(records, { minLeakSample: 5 });

    expect(plan.available).toBe(false);
    expect(plan.focus).toBeNull();
    expect(plan.recommendations).toEqual([]);
    expect(plan.reason).toBe("Doplňte ještě 2 preflop spotů pro doporučení slabin.");
  });
});
