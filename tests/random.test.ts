import { describe, expect, it } from "vitest";
import { hashStr, mulberry32 } from "../src/domain/random";

describe("legacy random parity", () => {
  it("matches legacy hashStr values", () => {
    expect(hashStr("")).toBe(2166136261);
    expect(hashStr("JungleStyle1")).toBe(602402568);
    expect(hashStr("ALL")).toBe(1432457764);
    expect(hashStr("OPEN_HJ_CO_BTN")).toBe(147316628);
    expect(hashStr("FLOP_CBET_HU_DRY_PFR")).toBe(635472916);
  });

  it("matches legacy mulberry32 sequence", () => {
    const random = mulberry32(1);

    expect(Array.from({ length: 5 }, () => random())).toEqual([
      0.6270739405881613,
      0.002735721180215478,
      0.5274470399599522,
      0.9810509674716741,
      0.9683778982143849,
    ]);
  });

  it("matches legacy category-seeded sequence", () => {
    const seed = (1 >>> 0) ^ hashStr("OPEN_HJ_CO_BTN");
    const random = mulberry32(seed);

    expect(Array.from({ length: 5 }, () => random())).toEqual([
      0.09632187569513917,
      0.5902663450688124,
      0.5631244024261832,
      0.40344887343235314,
      0.5812640187796205,
    ]);
  });
});
