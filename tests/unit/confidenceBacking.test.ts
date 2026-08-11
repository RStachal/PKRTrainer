import { describe, expect, it } from "vitest";

import {
  classifyConfidenceClaim,
  renderConfidenceReport,
} from "../../src/data/ranges/confidenceBacking";
import type { TurnReviewVerdictRecord } from "../../src/data/ranges/turnReviewVerdict";

/**
 * `MEDIUM` znamená v produktu na dvou místech dvě různé věci.
 *
 * U turnu, že obsah přečetl hráč; u flopu, že pack má dohledatelný solverový
 * export. Ani jeden standard není nesmysl - nesmysl je mít oba pod jedním jménem
 * a nikde to neříct, protože `MEDIUM` je zároveň brána do produkce a rozhoduje
 * se podle slova, ne podle toho, co za ním stojí.
 */
const accepted: TurnReviewVerdictRecord = {
  familyId: "F",
  contentHash: "abc",
  outcome: "ACCEPTED",
  reviewedAt: "2026-08-11",
  reviewer: "tester",
};

describe("čím je podložená důvěra", () => {
  it("uzná jen čtení hráčem na aktuální obsah", () => {
    const claim = classifyConfidenceClaim({
      packId: "p", street: "TURN", confidence: "MEDIUM",
      familyId: "F", contentHash: "abc", sourceEvidenceCount: 0,
    }, [accepted]);
    expect(claim.backing).toBe("PLAYER_REVIEW");
    expect(claim.overclaims).toBe(false);
  });

  it("označí verdikt vydaný na jiný obsah za propadlý", () => {
    const claim = classifyConfidenceClaim({
      packId: "p", street: "TURN", confidence: "MEDIUM",
      familyId: "F", contentHash: "zmeneno", sourceEvidenceCount: 0,
    }, [accepted]);
    expect(claim.backing).toBe("STALE_REVIEW");
    expect(claim.overclaims).toBe(true);
  });

  it("dohledatelnost solvu na MEDIUM nestačí", () => {
    // Přesně tenhle případ jsou flopové piloty: mají doklady o původu a nikdo
    // strategii nečetl, přesto tvrdí MEDIUM a MEDIUM je brána do produkce.
    const claim = classifyConfidenceClaim({
      packId: "flop", street: "FLOP", confidence: "MEDIUM", sourceEvidenceCount: 6,
    }, []);
    expect(claim.backing).toBe("SOLVE_PROVENANCE");
    expect(claim.overclaims).toBe(true);
    expect(claim.detail).toContain("nikdo strategii nečetl");
  });

  it("LOW netvrdí nic, takže si nemá čím zasloužit výtku", () => {
    const claim = classifyConfidenceClaim({
      packId: "turn", street: "TURN", confidence: "LOW", sourceEvidenceCount: 300,
    }, []);
    expect(claim.overclaims).toBe(false);
  });

  it("výpis řekne, kolik packů tvrdí víc, než na co má doklad", () => {
    const report = renderConfidenceReport([
      classifyConfidenceClaim({
        packId: "a", street: "FLOP", confidence: "MEDIUM", sourceEvidenceCount: 1,
      }, []),
      classifyConfidenceClaim({
        packId: "b", street: "TURN", confidence: "LOW", sourceEvidenceCount: 1,
      }, []),
    ]);
    expect(report).toContain("1 packů tvrdí víc než LOW");
  });
});
