import { describe, expect, it, vi } from "vitest";

import { createRangeStore, createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { type RangePack, stackSetupOf, validateRangePack } from "../../src/data/ranges/rangePack";

/**
 * Osa scénáře v `RangeKey` (rozhodnutí vlastníka 22. 9. 2026, 3a a 4a).
 *
 * ICM range téže buňky se liší podle rozložení stacků u stolu (bod 256: šest
 * buněk se srazilo jen o scénář). Pack nese katalog scénářů a záznam se na něj
 * odkazuje; klíč bez scénáře musí vracet dnešní záznam beze změny, se
 * scénářem se zkusí přesnější a bez něj se padá na sedačku a obecný záznam.
 */

const generic = { AA: ["3BET"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];
const vsBtn = { AA: ["3BET"], KQs: ["3BET"] } as RangePack["records"][number]["lenient"];
const shortBb = { AA: ["3BET"], KQs: ["FOLD"] } as RangePack["records"][number]["lenient"];
const bigBb = { AA: ["CALL"], KQs: ["CALL"] } as RangePack["records"][number]["lenient"];

const SHORT = "ICM_75-45-60-30-18-7";
const BIG = "ICM_20-45-60-35-18-75";

function pack(overrides: Partial<RangePack>): RangePack {
  return {
    id: "scenario-axis-test",
    version: "2026-09-22",
    createdAt: "2026-09-22",
    verifiedAt: "2026-09-22",
    confidence: "LOW",
    dimensions: {
      gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", street: "PREFLOP",
      evModel: "CHIP_EV", ante: "ON", rakeMode: "NONE",
    },
    assumptions: ["test"],
    searchQueries: ["test 1", "test 2", "test 3"],
    sourceEvidence: [
      { title: "test 1", url: "https://example.invalid/1", provider: "test", verifiedAt: "2026-09-22", licenseNote: "test" },
      { title: "test 2", url: "https://example.invalid/2", provider: "test", verifiedAt: "2026-09-22", licenseNote: "test" },
    ],
    stackSetups: {
      [SHORT]: { label: "UTG 75 / HJ 45 / CO 60 / BTN 30 / SB 18 / BB 7 bb", stacksBB: { UTG: 75, HJ: 45, CO: 60, BTN: 30, SB: 18, BB: 7 } },
      [BIG]: { label: "UTG 20 / HJ 45 / CO 60 / BTN 35 / SB 18 / BB 75 bb", stacksBB: { UTG: 20, HJ: 45, CO: 60, BTN: 35, SB: 18, BB: 75 } },
    },
    records: [
      { position: "SB", bucket: 20, context: "VS_OPEN", lenient: generic, strict: generic },
      { position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", lenient: vsBtn, strict: vsBtn },
      { position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: SHORT, lenient: shortBb, strict: shortBb },
      { position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: BIG, lenient: bigBb, strict: bigBb },
      { position: "SB", bucket: 20, context: "RFI", stackSetupId: SHORT, lenient: shortBb, strict: shortBb },
    ],
    ...overrides,
  } as unknown as RangePack;
}

describe("RangeKey.stackSetupId nad packem", () => {
  const store = createRangeStoreFromRangePack(pack({}));

  it("záznamy téže buňky a sedačky s různým scénářem nejsou duplicita", () => {
    expect(validateRangePack(pack({}))).toEqual([]);
    expect(store.isLoaded()).toBe(true);
    expect(Object.keys(store.stackSetups ?? {}).sort()).toEqual([BIG, SHORT].sort());
  });

  it("bez scénáře vrací záznam jako dřív - obecný i zpřesněný sedačkou", () => {
    expect(store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN" })?.actions.KQs).toEqual(["CALL"]);
    const seat = store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN" });
    expect(seat?.actions.KQs).toEqual(["3BET"]);
    expect(seat?.stackSetupId).toBeUndefined();
  });

  it("se scénářem vrací záznam pro ten scénář a nese jeho id", () => {
    const short = store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: SHORT });
    expect(short?.actions.KQs).toEqual(["FOLD"]);
    expect(short?.stackSetupId).toBe(SHORT);
    const big = store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: BIG });
    expect(big?.actions.AA).toEqual(["CALL"]);
    expect(big?.stackSetupId).toBe(BIG);
  });

  it("scénář bez vlastního záznamu padá na sedačku, pak na obecný - a entry to přizná", () => {
    const seatOnly = store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: "ICM_nikde" });
    expect(seatOnly?.actions.KQs).toEqual(["3BET"]);
    expect(seatOnly?.stackSetupId).toBeUndefined();
    const generalOnly = store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "CO", stackSetupId: SHORT });
    expect(generalOnly?.actions.KQs).toEqual(["CALL"]);
    expect(generalOnly?.stackSetupId).toBeUndefined();
  });

  it("scénář bez sedačky najde záznam se scénářem samotným", () => {
    expect(store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "RFI", stackSetupId: SHORT })?.stackSetupId).toBe(SHORT);
    expect(store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "RFI" })).toBeUndefined();
  });

  it("katalog dá stolu stacky sedaček", () => {
    expect(stackSetupOf(pack({}), SHORT)?.stacksBB.BB).toBe(7);
    expect(stackSetupOf(pack({}), undefined)).toBeUndefined();
    expect(stackSetupOf({ stackSetups: undefined }, SHORT)).toBeUndefined();
  });
});

describe("validace katalogu scénářů", () => {
  it("záznam se scénářem mimo katalog neprojde", () => {
    const errors = validateRangePack(pack({
      records: [{ position: "SB", bucket: 20, context: "RFI", stackSetupId: "ICM_cizi", lenient: shortBb, strict: shortBb }] as RangePack["records"],
    }));
    expect(errors.some((error) => error.includes("unknown stackSetupId ICM_cizi"))).toBe(true);
  });

  it("scénář musí mít popisek a aspoň dvě sedačky se stackem", () => {
    const errors = validateRangePack(pack({
      stackSetups: { ICM_x: { label: " ", stacksBB: { BB: 7 } } },
      records: [],
    }));
    expect(errors.some((error) => error.includes("stackSetups.ICM_x.label"))).toBe(true);
    expect(errors.some((error) => error.includes("at least two seats"))).toBe(true);
  });

  it("pack bez katalogu se validuje jako dřív a store hlásí prázdný katalog", () => {
    const { stackSetups: _omit, ...rest } = pack({});
    const plain = { ...rest, records: rest.records.filter((record) => record.stackSetupId === undefined) } as RangePack;
    expect(validateRangePack(plain)).toEqual([]);
    expect(createRangeStoreFromRangePack(plain).stackSetups).toEqual({});
  });
});

describe("RangeKey.stackSetupId nad indexem", () => {
  it("scénář projde do getRecord vedle sedačky; bez zpřesnění se neposílá nic", () => {
    const getRecord = vi.fn(() => undefined);
    const store = createRangeStore({ getRecord, isLoaded: () => true });
    store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: SHORT });
    expect(getRecord).toHaveBeenLastCalledWith("ON", "SB", 20, "VS_OPEN", { vsSeat: "BTN", stackSetupId: SHORT });
    store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN", stackSetupId: SHORT });
    expect(getRecord).toHaveBeenLastCalledWith("ON", "SB", 20, "VS_OPEN", { stackSetupId: SHORT });
    store.lookup({ ante: "ON", position: "SB", bucket: 20, context: "VS_OPEN" });
    expect(getRecord).toHaveBeenLastCalledWith("ON", "SB", 20, "VS_OPEN", undefined);
  });
});
