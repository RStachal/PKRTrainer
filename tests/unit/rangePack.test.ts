import { describe, expect, it } from "vitest";

import {
  type RangePack,
  rangePackToRangeFile,
  validateRangePack,
} from "../../src/data/ranges/rangePack";

const validPack: RangePack = {
  id: "mtt-full-ring-regular-preflop-chip-ev-v2",
  version: "2026-06-01",
  createdAt: "2026-06-01",
  verifiedAt: "2026-06-01",
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
  assumptions: [
    "chipEV",
    "full ring",
    "big blind ante",
  ],
  searchQueries: [
    "MTT preflop charts 9 max chip EV",
    "GTO Wizard tournament preflop 9 max",
    "PokerCoaching tournament preflop charts",
  ],
  sourceEvidence: [
    {
      title: "GTO Wizard multiway preflop solving",
      url: "https://blog.gtowizard.com/introducing-multiway-preflop-solving/",
      provider: "GTO Wizard",
      verifiedAt: "2026-06-01",
      licenseNote: "Used as methodology/evidence, not copied as raw chart data.",
    },
    {
      title: "PokerCoaching preflop charts",
      url: "https://pages.pokercoaching.com/100bb-charts/",
      provider: "PokerCoaching",
      verifiedAt: "2026-06-01",
      licenseNote: "Used as comparison/evidence, not copied as raw chart data.",
    },
  ],
  records: [
    {
      position: "BTN",
      bucket: 25,
      context: "RFI",
      lenient: {
        AA: ["OPEN_2X"],
      },
      strict: {
        AA: ["OPEN_2X"],
      },
    },
  ],
};

describe("rangePack", () => {
  it("validuje RangePack v2 se zdrojovou evidenci", () => {
    expect(validateRangePack(validPack)).toEqual([]);
  });

  it("vyzaduje minimalni sourcing disciplinu", () => {
    const errors = validateRangePack({
      ...validPack,
      searchQueries: ["single search"],
      sourceEvidence: [
        {
          ...validPack.sourceEvidence[0],
          url: "not-a-url",
          licenseNote: "",
        },
      ],
    });

    expect(errors).toEqual(expect.arrayContaining([
      "RangePack must record at least 3 independent chart searches.",
      "RangePack must cite at least 2 source evidence entries.",
      "sourceEvidence[0].licenseNote is required.",
      "sourceEvidence[0].url must be an http(s) URL.",
    ]));
  });

  it("prevadi RangePack zaznamy na stavajici RangeFile tvar", () => {
    expect(rangePackToRangeFile(validPack)).toEqual({
      version: "2026-06-01",
      ante: "ON",
      entries: [
        {
          position: "BTN",
          bucket: 25,
          context: "RFI",
          lenient: { AA: ["OPEN_2X"] },
          strict: { AA: ["OPEN_2X"] },
        },
      ],
    });
  });
});
