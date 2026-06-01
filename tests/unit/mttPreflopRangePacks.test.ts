import { describe, expect, it } from "vitest";

import {
  currentMttPreflopRangePack,
  mttPreflopAnteOffRangePack,
  mttPreflopAnteOnRangePack,
  mttPreflopRangePacks,
} from "../../src/data/ranges/mttPreflopRangePacks";
import { rangePackToRangeFile, validateRangePack } from "../../src/data/ranges/rangePack";
import { anteOffRanges } from "../../src/data/ranges/ante-off";
import { anteOnRanges } from "../../src/data/ranges/ante-on";

describe("mttPreflopRangePacks", () => {
  it("obali stavajici ante-on a ante-off data do RangePack v2 bez zmeny records", () => {
    expect(rangePackToRangeFile(mttPreflopAnteOnRangePack)).toEqual(anteOnRanges);
    expect(rangePackToRangeFile(mttPreflopAnteOffRangePack)).toEqual(anteOffRanges);
  });

  it("ma validni metadata a sourcing pro obe aktualni MTT range sady", () => {
    expect(mttPreflopRangePacks).toHaveLength(2);

    for (const pack of mttPreflopRangePacks) {
      expect(validateRangePack(pack)).toEqual([]);
      expect(pack.dimensions).toMatchObject({
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeed: "REGULAR",
        street: "PREFLOP",
        evModel: "CHIP_EV",
        rakeMode: "NONE",
      });
      expect(pack.searchQueries).toHaveLength(4);
      expect(pack.searchQueries.join(" ")).toContain("turbo");
      expect(pack.sourceEvidence.length).toBeGreaterThanOrEqual(5);
      expect(pack.sourceEvidence.map((source) => source.provider)).toEqual([
        "GTO Wizard",
        "Poker Academy",
        "GTO Sims",
        "GTOBase",
        "PokerCoaching",
      ]);
      expect(pack.assumptions.join(" ")).toContain("converted without changing recommendations");
      expect(pack.assumptions.join(" ")).toContain("Turbo currently changes blind schedule");
    }
  });

  it("vybere aktualni RangePack podle ante modu", () => {
    expect(currentMttPreflopRangePack("ON")).toBe(mttPreflopAnteOnRangePack);
    expect(currentMttPreflopRangePack("OFF")).toBe(mttPreflopAnteOffRangePack);
  });
});
