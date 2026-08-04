import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import type { Spot } from "../../src/core/types";
import {
  LEGACY_UNKNOWN_PROFILE_ID,
  RESULT_RECORD_V2_SCHEMA,
  buildProfileAwarePreflopResultRecord,
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

  it("stary ResultRecord oznaci jako legacy bez domysleni produkcniho profilu", () => {
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
      rangePackId: "LEGACY_UNKNOWN_STRATEGY",
      profileStatus: "LEGACY_UNKNOWN",
      scoringMode: "UNKNOWN",
    });
    expect(upgraded.profileId).toBe(LEGACY_UNKNOWN_PROFILE_ID);
    expect(isResultRecordV2(upgraded)).toBe(true);
  });

  it("migruje sadu starych zaznamu bez falesne strategie a zachova vysledky", () => {
    const migrated = migrateResultRecordsToV2([anteOffRecord, anteOnRecord]);

    expect(migrated).toHaveLength(2);
    expect(migrated.map((record) => record.qid)).toEqual([
      anteOffRecord.qid,
      anteOnRecord.qid,
    ]);
    expect(migrated.map((record) => record.correct)).toEqual([true, true]);
    expect(migrated.map((record) => record.profileId)).toEqual([
      LEGACY_UNKNOWN_PROFILE_ID,
      LEGACY_UNKNOWN_PROFILE_ID,
    ]);
    expect(migrated.every((record) => record.rangePackId === "LEGACY_UNKNOWN_STRATEGY"))
      .toBe(true);
  });

  it("zachova volitelny decision time a stare zaznamy bez casu zustanou validni", () => {
    const timedRecord: ResultRecord = {
      ...anteOffRecord,
      responseMs: 1450,
    };

    const timed = upgradeResultRecordToV2(timedRecord);
    const legacy = upgradeResultRecordToV2(anteOnRecord);

    expect(timed.responseMs).toBe(1450);
    expect(legacy.responseMs).toBeUndefined();
    expect(isResultRecordV2(timed)).toBe(true);
    expect(isResultRecordV2(legacy)).toBe(true);
    expect(isResultRecordV2({ ...timed, responseMs: -1 })).toBe(false);
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

  it("novy preflop zaznam nese profil, strategii, scoring a scenario identitu", () => {
    const profile = profileWith(DEFAULT_TRAINING_PROFILE, { ante: "OFF" });
    const spot: Spot = {
      id: "RFI|BTN|25|AKs|OFF",
      context: "RFI",
      heroPos: "BTN",
      effStack: 25,
      ante: "OFF",
      pushFold: false,
      hand: "AKs",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
      tableState: {
        heroPos: "BTN",
        pushFold: false,
        effectiveStackBB: 100,
        limpsBefore: 0,
        callsBefore: 0,
        facing: "NONE",
        isBvB: false,
      },
      answers: [
        { key: "FOLD", label: "Fold" },
        { key: "OPEN_2X", label: "Open 2x" },
      ],
      correctKeys: ["OPEN_2X"],
      strictCorrect: ["OPEN_2X"],
      explanation: "Test.",
      startingPot: 1.5,
    };
    const stored = buildProfileAwarePreflopResultRecord({
      spot,
      chosen: "OPEN_2X",
      correct: true,
      profile,
      rangePack: {
        id: "mtt-full-ring-9-regular-preflop-chip-ev-ante-off-v1",
        version: "1",
        verifiedAt: "2026-06-01",
      },
      scoringMode: "STRICT",
      ts: 123,
      responseMs: 456,
    });
    const upgraded = upgradeResultRecordToV2(stored);

    expect(stored.identity?.scenarioId).toContain(
      "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|OFF|NONE",
    );
    expect(upgraded).toMatchObject({
      profileStatus: "KNOWN",
      profileId: "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|OFF|NONE",
      rangePackId: "mtt-full-ring-9-regular-preflop-chip-ev-ante-off-v1",
      scoringMode: "STRICT",
      responseMs: 456,
    });
    expect(isResultRecordV2(upgraded)).toBe(true);
  });

  it("update strategie zachova identitu scenare a oddeli audit packu", () => {
    const profile = profileWith(DEFAULT_TRAINING_PROFILE, { ante: "OFF" });
    const spot: Spot = {
      id: "RFI|BTN|25|AKs|OFF",
      context: "RFI",
      heroPos: "BTN",
      effStack: 25,
      ante: "OFF",
      pushFold: false,
      hand: "AKs",
      heroCards: [
        { rank: "A", suit: "s" },
        { rank: "K", suit: "s" },
      ],
      tableState: {
        heroPos: "BTN",
        pushFold: false,
        effectiveStackBB: 100,
        limpsBefore: 0,
        callsBefore: 0,
        facing: "NONE",
        isBvB: false,
      },
      answers: [{ key: "OPEN_2X", label: "Open 2x" }],
      correctKeys: ["OPEN_2X"],
      strictCorrect: ["OPEN_2X"],
      explanation: "Test.",
    };
    const first = buildProfileAwarePreflopResultRecord({
      spot,
      chosen: "OPEN_2X",
      correct: true,
      profile,
      rangePack: { id: "pack-v1", version: "1", verifiedAt: "2026-01-01" },
      scoringMode: "LENIENT",
      ts: 1,
    });
    const updated = buildProfileAwarePreflopResultRecord({
      spot,
      chosen: "OPEN_2X",
      correct: true,
      profile,
      rangePack: { id: "pack-v2", version: "2", verifiedAt: "2026-06-19" },
      scoringMode: "LENIENT",
      ts: 2,
    });

    expect(first.identity?.scenarioId).toBe(updated.identity?.scenarioId);
    expect(first.identity?.rangePackId).toBe("pack-v1");
    expect(updated.identity?.rangePackId).toBe("pack-v2");
  });

  it("umi priradit cash candidate RangePack bez MTT fallbacku", () => {
    const upgraded = upgradeResultRecordToV2(anteOffRecord, {
      profile: profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "CASH",
        tableFormat: "SIX_MAX",
        blindSpeed: "REGULAR",
        street: "PREFLOP",
        evModel: "CHIP_EV",
        rakeMode: "RAKE",
      }),
    });

    expect(upgraded.gameVariant).toBe("CASH");
    expect(upgraded.ante).toBe("OFF");
    expect(upgraded.rakeMode).toBe("RAKE");
    expect(upgraded.rangePackId).toBe(
      "cash-six-max-regular-preflop-chip-ev-rake-candidate-v0",
    );
  });

  it("nepouzije MTT fallback pro nepodporovany SNG ICM profil", () => {
    expect(() => upgradeResultRecordToV2(anteOffRecord, {
      profile: profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "SNG",
        tableFormat: "SIX_MAX",
        blindSpeed: "TURBO",
        street: "FLOP",
        evModel: "ICM",
      }),
    })).toThrow("No RangePack for training profile SNG|SIX_MAX|TURBO|FLOP|ICM|OFF|NONE");
  });
});
