import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import type { ResultRecord } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import {
  buildMttUtilitySpacedRepetitionQueue,
  buildMttUtilityStatsReport,
  inferMttSourceQuality,
  type MttUtilityStatsRecord,
} from "../../src/persistence/mttUtilityStats";

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

function utilityRecord(
  base: ResultRecord,
  meta: Partial<MttUtilityStatsRecord> = {},
): MttUtilityStatsRecord {
  return {
    ...migrateResultRecordsToV2([base], { profile: DEFAULT_TRAINING_PROFILE })[0],
    ...meta,
  };
}

describe("mttUtilityStats", () => {
  it("drzi MTT utility KPI oddelene podle profilu, scenare, pack verze a source quality", () => {
    const records: MttUtilityStatsRecord[] = [
      utilityRecord(record("VS_OPEN|BB|15|A5s|ON|1", false, { ts: 1 }), {
        tournamentPhase: "BUBBLE",
        payoutModel: "STANDARD_PAYOUT",
        bountyModel: "NONE",
        coveringStatus: "COVERED_BY_MAIN_VILLAIN",
        tableSize: 9,
        actionNode: "PREFLOP_VS_OPEN",
        sizing: "OPEN_2X",
        evLossBb: 0.42,
      }),
      utilityRecord(record("VS_OPEN|BB|15|KQo|ON|2", true, { ts: 2 }), {
        tournamentPhase: "EARLY",
        payoutModel: "CHIP_EV",
        bountyModel: "NONE",
        tableSize: 9,
        actionNode: "PREFLOP_VS_OPEN",
        sizing: "OPEN_2X",
      }),
    ];

    const report = buildMttUtilityStatsReport(records, {
      dimensions: ["profileId", "scenarioId", "rangePackVersion", "tournamentPhase", "sourceQuality"],
      repetitionLimit: 5,
      seed: 7,
    });

    expect(report.valid).toBe(true);
    expect(report.total).toBe(2);
    expect(report.sourceQualityCounts).toEqual({
      PRODUCTION: 2,
      PREVIEW: 0,
      FALLBACK: 0,
      LEGACY_UNKNOWN: 0,
    });
    expect(report.groups.filter((group) => group.dim === "profileId")).toEqual([
      {
        dim: "profileId",
        key: "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE",
        total: 2,
        correct: 1,
        rate: 50,
        evLossBbTotal: 0.42,
        avgEvLossBb: 0.42,
      },
    ]);
    expect(report.groups.find((group) => group.dim === "tournamentPhase" && group.key === "BUBBLE"))
      .toMatchObject({ total: 1, correct: 0, evLossBbTotal: 0.42 });
    expect(report.repetitionQueue[0]).toMatchObject({
      qid: "VS_OPEN|BB|15|A5s|ON|1",
      misses: 1,
      evLossBbTotal: 0.42,
      sourceQuality: "PRODUCTION",
    });
    expect(report.repetitionQueue[0].reason).toContain("BB EV loss");
  });

  it("prioritizuje EV loss a kriticke bubble/final-table chyby pred cistou binarni accuracy", () => {
    const lowImpact = utilityRecord(record("RFI|BTN|25|AKs|ON|low", false, {
      chosen: "OPEN_2X",
      context: "RFI",
      position: "BTN",
      bucket: 25,
      ts: 10,
    }), {
      tournamentPhase: "EARLY",
      evLossBb: 0.02,
    });
    const highImpact = utilityRecord(record("VS_OPEN|BB|15|A5s|ON|high", false, { ts: 1 }), {
      tournamentPhase: "BUBBLE",
      payoutModel: "STANDARD_PAYOUT",
      evLossBb: 1.8,
    });

    const queue = buildMttUtilitySpacedRepetitionQueue([lowImpact, highImpact], {
      seed: 1,
      limit: 2,
    });

    expect(queue.map((item) => item.qid)).toEqual([
      "VS_OPEN|BB|15|A5s|ON|high",
      "RFI|BTN|25|AKs|ON|low",
    ]);
    expect(queue[0].priority).toBeGreaterThan(queue[1].priority);
    expect(queue[0].criticality).toBeGreaterThan(1);
  });

  it("upozorni na before-after drift, kdy stejny scenarioId nese vice pack verzi", () => {
    const first = utilityRecord(record("VS_OPEN|BB|15|A5s|ON", false, { ts: 1 }));
    const second: MttUtilityStatsRecord = {
      ...first,
      ts: 2,
      correct: true,
      rangePackVersion: `${first.rangePackVersion}-reviewed-v2`,
    };

    const report = buildMttUtilityStatsReport([first, second], {
      dimensions: ["scenarioId", "rangePackVersion"],
    });

    expect(report.packDriftWarnings).toEqual([
      {
        scenarioId: first.scenarioId,
        profileIds: [first.profileId],
        rangePackVersions: [first.rangePackVersion, second.rangePackVersion].sort(),
        message:
          "Same scenarioId was observed with multiple profile ids or pack versions; compare before/after KPIs explicitly.",
      },
    ]);
  });

  it("klasifikuje legacy bez identity jako legacy_unknown misto produkcni kvality", () => {
    const legacy = migrateResultRecordsToV2([
      record("VS_OPEN|BB|15|A5s|ON|legacy", false),
    ])[0];

    expect(inferMttSourceQuality(legacy)).toBe("LEGACY_UNKNOWN");
  });

  it("validuje budoucí utility metadata fail-closed", () => {
    const invalid = utilityRecord(record("VS_OPEN|BB|15|A5s|ON|bad", false), {
      evLossBb: -1,
      tableSize: 99,
    });

    const report = buildMttUtilityStatsReport([invalid]);

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual([
      "VS_OPEN|BB|15|A5s|ON|bad: tableSize must be an integer between 2 and 10.",
      "VS_OPEN|BB|15|A5s|ON|bad: evLossBb must be a non-negative finite number.",
    ]);
  });
});
