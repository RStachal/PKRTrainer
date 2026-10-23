import { describe, expect, it, vi } from "vitest";

import { createRangeStore, createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { type RangePack, validateRangePack } from "../../src/data/ranges/rangePack";

/**
 * Osa otvírače v `RangeKey` (bod 234, rozhodnuto 14. 9. 2026), krok (a).
 *
 * Range proti otevření z UTG a z BTN se liší. Klíč bez sedačky musí vracet
 * dnešní záznam beze změny; s ní se zkusí přesnější a když není, vrátí se
 * obecný - nezpřesněná odpověď je pořád odpověď.
 */

const generic = { AA: ["3BET"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];
const vsBtn = { AA: ["3BET"], KQs: ["3BET"] } as RangePack["records"][number]["lenient"];

const pack = {
  id: "opener-axis-test",
  version: "2026-09-14",
  createdAt: "2026-09-14",
  verifiedAt: "2026-09-14",
  confidence: "LOW",
  dimensions: {
    gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
    evModel: "CHIP_EV", ante: "OFF", rakeMode: "NONE",
  },
  assumptions: ["test"],
  searchQueries: ["test 1", "test 2", "test 3"],
  sourceEvidence: [
    { title: "test 1", url: "https://example.invalid/1", provider: "test", verifiedAt: "2026-09-14", licenseNote: "test" },
    { title: "test 2", url: "https://example.invalid/2", provider: "test", verifiedAt: "2026-09-14", licenseNote: "test" },
  ],
  records: [
    { position: "BB", bucket: 20, context: "VS_OPEN", lenient: generic, strict: generic },
    { position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", lenient: vsBtn, strict: vsBtn },
  ],
} as unknown as RangePack;

describe("RangeKey.vsSeat nad packem", () => {
  const store = createRangeStoreFromRangePack(pack);

  it("dva záznamy téže buňky s různým zpřesněním nejsou duplicita", () => {
    expect(validateRangePack(pack)).toEqual([]);
    expect(store.isLoaded()).toBe(true);
  });

  it("bez sedačky vrací obecný záznam jako dřív", () => {
    expect(store.lookup({ ante: "OFF", position: "BB", bucket: 20, context: "VS_OPEN" })?.actions.KQs)
      .toEqual(["CALL"]);
  });

  it("se sedačkou vrací přesnější záznam", () => {
    expect(store.lookup({ ante: "OFF", position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN" })?.actions.KQs)
      .toEqual(["3BET"]);
  });

  it("se sedačkou bez vlastního záznamu padá na obecný", () => {
    expect(store.lookup({ ante: "OFF", position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "CO" })?.actions.KQs)
      .toEqual(["CALL"]);
  });
});

describe("RangeKey.vsSeat nad indexem", () => {
  it("zpřesnění projde do getRecord, bez sedačky se neposílá", () => {
    const getRecord = vi.fn(() => undefined);
    const store = createRangeStore({ getRecord, isLoaded: () => true });
    store.lookup({ ante: "OFF", position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "UTG" });
    expect(getRecord).toHaveBeenLastCalledWith("OFF", "BB", 20, "VS_OPEN", { vsSeat: "UTG" });
    store.lookup({ ante: "OFF", position: "BB", bucket: 20, context: "VS_OPEN" });
    expect(getRecord).toHaveBeenLastCalledWith("OFF", "BB", 20, "VS_OPEN", undefined);
  });
});
