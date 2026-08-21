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

  it("verdikt z jiné ulice nepoužije, ani když sedí rodina", () => {
    // Tohle stálo 25 falešných poplachů. Verdikty jsou po ulicích, ale hledání
    // je páralo jen podle rodiny, takže turnový pack dostal flopový verdikt,
    // otisky se nemohly shodovat a výpis hlásil "verdikt byl vydán na jiný
    // obsah" u obsahu, který byl v pořádku. Strážce, který takhle křičí, je
    // horší než žádný: opravdové zastarání se v tom šumu ztratí.
    const flopVerdict: TurnReviewVerdictRecord = {
      ...accepted, street: "FLOP", contentHash: "flop-hash",
    };
    const turnVerdict: TurnReviewVerdictRecord = {
      ...accepted, street: "TURN", contentHash: "turn-hash",
    };
    const claim = classifyConfidenceClaim({
      packId: "p", street: "TURN", confidence: "MEDIUM",
      familyId: "F", contentHash: "turn-hash", sourceEvidenceCount: 0,
    }, [flopVerdict, turnVerdict]);
    expect(claim.backing).toBe("PLAYER_REVIEW");
    expect(claim.overclaims).toBe(false);
  });

  it("verdikt bez ulice se počítá jako turnový, jak ho zapisovala starší kola", () => {
    const claim = classifyConfidenceClaim({
      packId: "p", street: "TURN", confidence: "MEDIUM",
      familyId: "F", contentHash: "abc", sourceEvidenceCount: 0,
    }, [accepted]);
    expect(claim.backing).toBe("PLAYER_REVIEW");
  });

  it("měření odliší od čtení, i když obojí končí přijetím", () => {
    // Dodávat se s měřením smí a je to vědomé rozhodnutí. Říkat mu "přečteno"
    // se nesmí: provenience je v tomhle projektu strukturní pole, ne dojem z
    // formulace, a tenhle výpis existuje právě proto, aby bylo poznat, co za
    // důvěrou stojí.
    const mechanical: TurnReviewVerdictRecord = {
      ...accepted, basis: "MECHANICAL", reviewer: "PKRTRAINER_MECHANICAL_REVIEW_V1",
    };
    const claim = classifyConfidenceClaim({
      packId: "p", street: "TURN", confidence: "MEDIUM",
      familyId: "F", contentHash: "abc", sourceEvidenceCount: 0,
    }, [mechanical]);
    expect(claim.backing).toBe("MECHANICAL_REVIEW");
    expect(claim.overclaims, "měřením podložený MEDIUM je přijatý standard").toBe(false);
    expect(claim.detail).toContain("nikdo to nečetl");
    expect(claim.detail).not.toContain("přečteno");
  });

  it("výpis oddělí, kolik stojí na měření a kolik na čtení", () => {
    const mechanical: TurnReviewVerdictRecord = { ...accepted, basis: "MECHANICAL" };
    const report = renderConfidenceReport([
      classifyConfidenceClaim({
        packId: "a", street: "TURN", confidence: "MEDIUM",
        familyId: "F", contentHash: "abc", sourceEvidenceCount: 0,
      }, [mechanical]),
      classifyConfidenceClaim({
        packId: "b", street: "TURN", confidence: "MEDIUM",
        familyId: "F", contentHash: "abc", sourceEvidenceCount: 0,
      }, [accepted]),
    ]);
    expect(report).toContain("podloženo měřením 1, čtením 1");
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
