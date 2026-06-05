import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
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

  it("vrati citelny unavailable plan bez preflop vzorku", () => {
    const plan = buildPreflopCurriculumPlan([], { targetSpots: 10 });

    expect(plan.available).toBe(false);
    expect(plan.reason).toBe("No preflop answers yet.");
    expect(plan.focus).toBeNull();
    expect(plan.sessionGoal.targetSpots).toBe(10);
  });
});
