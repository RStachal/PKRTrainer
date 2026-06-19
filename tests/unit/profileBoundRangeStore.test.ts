import { describe, expect, it } from "vitest";

import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import type { RangePack } from "../../src/data/ranges/rangePack";

const pack: RangePack = {
  id: "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-test",
  version: "2026-06-18",
  createdAt: "2026-06-18",
  verifiedAt: "2026-06-18",
  confidence: "MEDIUM",
  dimensions: {
    gameVariant: "MTT",
    tableFormat: "FULL_RING_9",
    blindSpeed: "REGULAR",
    street: "PREFLOP",
    evModel: "CHIP_EV",
    ante: "ON",
    rakeMode: "NONE",
  },
  assumptions: ["test fixture"],
  searchQueries: ["query one", "query two", "query three"],
  sourceEvidence: [
    {
      title: "Fixture source one",
      url: "https://example.com/one",
      provider: "Fixture",
      verifiedAt: "2026-06-18",
      licenseNote: "Synthetic test data.",
    },
    {
      title: "Fixture source two",
      url: "https://example.com/two",
      provider: "Fixture",
      verifiedAt: "2026-06-18",
      licenseNote: "Synthetic test data.",
    },
  ],
  records: [
    {
      position: "BTN",
      bucket: 25,
      context: "RFI",
      lenient: { AA: ["OPEN_2X"] },
      strict: { AA: ["OPEN_2X"] },
    },
  ],
};

describe("profile-bound RangeStore", () => {
  it("vraci jen zaznamy z konkretniho packu a odmita jiny ante profil", () => {
    const store = createRangeStoreFromRangePack(pack);

    expect(store.isLoaded()).toBe(true);
    expect(store.lookup({
      position: "BTN",
      bucket: 25,
      context: "RFI",
      ante: "ON",
    })?.strict.AA).toEqual(["OPEN_2X"]);
    expect(store.lookup({
      position: "BTN",
      bucket: 25,
      context: "RFI",
      ante: "OFF",
    })).toBeUndefined();
    expect(store.lookup({
      position: "CO",
      bucket: 25,
      context: "RFI",
      ante: "ON",
    })).toBeUndefined();
  });
});
