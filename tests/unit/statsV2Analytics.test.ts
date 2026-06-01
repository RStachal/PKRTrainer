import { describe, expect, it } from "vitest";

import type { ResultRecord } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import {
  availableStatsV2Dimensions,
  breakdownStatsV2,
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
});
