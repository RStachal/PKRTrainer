import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import {
  RESULT_RECORD_V2_SCHEMA,
  isResultRecordV2,
  migrateResultRecordsToV2,
  parseAnteFromQuestionId,
  upgradeResultRecordToV2,
} from "../../src/persistence/statsRecordV2";

const anteOffRecord: ResultRecord = {
  qid: "RFI|BTN|25|AKs|OFF",
  chosen: "OPEN_2X",
  correct: true,
  context: "RFI",
  position: "BTN",
  bucket: 25,
  ts: 1,
};

const anteOnRecord: ResultRecord = {
  ...anteOffRecord,
  qid: "VS_OPEN|BB|15|A5s|ON",
  chosen: "CALL",
  context: "VS_OPEN",
  position: "BB",
  bucket: 15,
};

describe("statsRecordV2", () => {
  it("parsuje ante z dnesniho Question_ID", () => {
    expect(parseAnteFromQuestionId("RFI|BTN|25|AKs|OFF")).toBe("OFF");
    expect(parseAnteFromQuestionId("RFI|BTN|25|AKs|ON")).toBe("ON");
    expect(parseAnteFromQuestionId("legacy-id")).toBeNull();
  });

  it("upgraduje ResultRecord v1 na profilovy ResultRecord v2", () => {
    const upgraded = upgradeResultRecordToV2(anteOffRecord);

    expect(upgraded).toMatchObject({
      schema: RESULT_RECORD_V2_SCHEMA,
      qid: anteOffRecord.qid,
      chosen: "OPEN_2X",
      correct: true,
      context: "RFI",
      position: "BTN",
      bucket: 25,
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "NONE",
      rangePackId: "mtt-full-ring-9-regular-preflop-chip-ev-ante-off-v1",
    });
    expect(upgraded.profileId).toBe("MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|OFF|NONE");
    expect(isResultRecordV2(upgraded)).toBe(true);
  });

  it("migruje sadu dnesnich zaznamu a zachova historicke vysledky", () => {
    const migrated = migrateResultRecordsToV2([anteOffRecord, anteOnRecord]);

    expect(migrated).toHaveLength(2);
    expect(migrated.map((record) => record.qid)).toEqual([
      anteOffRecord.qid,
      anteOnRecord.qid,
    ]);
    expect(migrated.map((record) => record.correct)).toEqual([true, true]);
    expect(migrated[0].rangePackId).toContain("ante-off");
    expect(migrated[1].rangePackId).toContain("ante-on");
  });

  it("umi priradit SNG chipEV candidate RangePack podle profilu", () => {
    const upgraded = upgradeResultRecordToV2(anteOffRecord, {
      profile: profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "SNG",
        tableFormat: "SIX_MAX",
        blindSpeed: "TURBO",
        evModel: "CHIP_EV",
      }),
    });

    expect(upgraded.gameVariant).toBe("SNG");
    expect(upgraded.tableFormat).toBe("SIX_MAX");
    expect(upgraded.blindSpeed).toBe("TURBO");
    expect(upgraded.rangePackId).toBe(
      "sng-six-max-turbo-preflop-chip-ev-ante-off-candidate-v0",
    );
  });
});
