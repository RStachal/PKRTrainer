import { describe, expect, it } from "vitest";

import { confidenceForFamily, type TurnReviewVerdictRecord } from "../../src/data/ranges/turnReviewVerdict";

/**
 * Jedna cesta review pro tři ulice.
 *
 * Číst šlo jen turn, takže flopový a riverový obsah neměl jak opustit `LOW` - a
 * `LOW` neprojde nikde. Osmnáct flopových, osmnáct turnových a jedna riverová
 * rodina tím byly trvale mimo produkci bez ohledu na to, kolik toho člověk
 * přečte.
 *
 * Verdikt proto nese ulici. Bez ní by přečtený turn zvedl důvěru flopu, tedy
 * obsahu, který nikdo neviděl - a to je přesně ta záměna, které má review
 * bránit.
 */
const HASH = "abc-123";

function verdict(overrides: Partial<TurnReviewVerdictRecord> = {}): TurnReviewVerdictRecord {
  return {
    street: "TURN",
    familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
    contentHash: HASH,
    outcome: "ACCEPTED",
    reviewedAt: "2026-08-17",
    reviewer: "Radim",
    ...overrides,
  } as TurnReviewVerdictRecord;
}

describe("review napříč ulicemi", () => {
  it("přijetí zvedne důvěru na té ulici, které se týká", () => {
    const verdicts = [verdict({ street: "RIVER" })];
    expect(confidenceForFamily(verdict().familyId, HASH, verdicts, "RIVER").confidence)
      .toBe("MEDIUM");
  });

  it("přečtený turn nezvedne flop ani river", () => {
    // Tohle je celý důvod, proč verdikt nese ulici: tři různé obsahy s vlastními
    // otisky pod jedním jménem rodiny.
    const verdicts = [verdict({ street: "TURN" })];
    expect(confidenceForFamily(verdict().familyId, HASH, verdicts, "FLOP").confidence).toBe("LOW");
    expect(confidenceForFamily(verdict().familyId, HASH, verdicts, "RIVER").confidence).toBe("LOW");
    expect(confidenceForFamily(verdict().familyId, HASH, verdicts, "TURN").confidence).toBe("MEDIUM");
  });

  it("verdikt bez ulice se čte jako turnový", () => {
    // Zpětná slučitelnost: v době, kdy formát vznikl, byla turnová jediná.
    const legacy = [{ ...verdict(), street: undefined } as TurnReviewVerdictRecord];
    expect(confidenceForFamily(verdict().familyId, HASH, legacy, "TURN").confidence).toBe("MEDIUM");
    expect(confidenceForFamily(verdict().familyId, HASH, legacy, "FLOP").confidence).toBe("LOW");
  });

  it("změna obsahu verdikt shodí i na jiné ulici", () => {
    const verdicts = [verdict({ street: "FLOP" })];
    const stale = confidenceForFamily(verdict().familyId, "jiny-otisk", verdicts, "FLOP");
    expect(stale.confidence).toBe("LOW");
    expect(stale.reason).toContain("změnil");
  });
});
