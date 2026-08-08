import { describe, expect, it } from "vitest";

import {
  seatsBehind,
  sixMaxPositionMap,
  sourcePositionForSixMax,
  unmappedFullRingPositions,
} from "../../src/core/tableFormatConversion";
import {
  mttSixMaxDerivedRangePacks,
  mttPreflopAnteOffRangePack,
} from "../../src/data/ranges/mttPreflopRangePacks";

// Six-max shipped with four packs and zero records: supported, and with nothing to
// teach. These hold the rule that fills it and the honesty markers on the result.

describe("mapping seats between formats", () => {
  it("maps on opponents left to act, not on the seat's name", () => {
    // A six-max cutoff is a nine-handed cutoff only because both have three
    // behind them. Under the gun is where the naming breaks: six-handed it has
    // five behind, which is the nine-handed lojack, not the nine-handed UTG.
    expect(sourcePositionForSixMax("UTG")).toBe("LJ");
    expect(sourcePositionForSixMax("HJ")).toBe("HJ");
    expect(sourcePositionForSixMax("CO")).toBe("CO");
    expect(sourcePositionForSixMax("BTN")).toBe("BTN");
    expect(sourcePositionForSixMax("BB")).toBe("BB");
  });

  it("preserves the count it maps on", () => {
    for (const { sixMax, fullRing } of sixMaxPositionMap()) {
      expect(seatsBehind(sixMax, "SIX_MAX")).toBe(seatsBehind(fullRing, "FULL_RING_9"));
    }
  });

  it("names the seats that have nowhere to go rather than squeezing them in", () => {
    // Nine-handed UTG, UTG+1 and UTG+2 have six or more players behind them and no
    // six-handed seat does. Folding them into the nearest seat would invent a range.
    expect([...unmappedFullRingPositions()]).toEqual(["UTG", "UTG+1", "UTG+2"]);
  });

  it("covers every six-max seat exactly once", () => {
    const seats = sixMaxPositionMap().map((pair) => pair.sixMax);
    expect(seats).toEqual(["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
    expect(new Set(seats).size).toBe(seats.length);
  });
});

describe("the derived six-max packs", () => {
  it("have records now, where the candidates had none", () => {
    for (const pack of mttSixMaxDerivedRangePacks) {
      expect(pack.records.length).toBeGreaterThan(400);
      expect(pack.dimensions.tableFormat).toBe("SIX_MAX");
    }
  });

  it("say they are derived, and stay low confidence", () => {
    // The whole risk of a conversion is that it reads as a measurement later.
    for (const pack of mttSixMaxDerivedRangePacks) {
      expect(pack.confidence).toBe("LOW");
      expect(pack.id).toContain("derived");
      expect(pack.assumptions.some((line) => line.startsWith("DERIVED, not measured"))).toBe(true);
      // Dřív se tu drželo tvrzení, že odvozené range poběží těsně. Neběží:
      // po porovnání s veřejně uváděnými šestistolovými frekvencemi sedí do
      // pásma a s ante leží při jeho horní hraně. Pack teď musí říct, že to
      // porovnání proběhlo - tvrzení bez opory je horší než žádné.
      expect(pack.assumptions.some((line) => line.includes("porovnány s veřejně uváděnými"))).toBe(true);
    }
  });

  it("carry no seat the mapping does not produce", () => {
    const allowed = new Set(sixMaxPositionMap().map((pair) => pair.sixMax));
    for (const pack of mttSixMaxDerivedRangePacks) {
      for (const record of pack.records) expect(allowed.has(record.position)).toBe(true);
    }
  });

  it("reproduce the source seat's range exactly, since that is all a re-label is", () => {
    const derived = mttSixMaxDerivedRangePacks
      .find((p) => p.dimensions.ante === "OFF" && p.dimensions.blindSpeed === "REGULAR")!;
    const sixMaxUtg = derived.records
      .find((r) => r.position === "UTG" && r.bucket === 50 && r.context === "RFI");
    const fullRingLj = mttPreflopAnteOffRangePack.records
      .find((r) => r.position === "LJ" && r.bucket === 50 && r.context === "RFI");
    expect(sixMaxUtg).toBeDefined();
    expect(fullRingLj).toBeDefined();
    expect(sixMaxUtg!.strict).toEqual(fullRingLj!.strict);
  });
});
