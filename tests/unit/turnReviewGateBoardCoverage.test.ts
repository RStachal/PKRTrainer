import { describe, expect, it } from "vitest";

import { TURN_COVERAGE_TARGET, reviewTurnFamily } from "../../src/data/ranges/turnReviewGate";

/**
 * Rodina může projít bránou a přesto pokrývat půlku board space.
 *
 * Tier COMPLETE se ptal jen na to, jestli se zapsalo všechno, co plán vyjmenoval.
 * Deska, která nikdy nedostala plán, ale v žádném plánu není - takže ji nic
 * nehledalo a `MTT9_40BB_UTG_BB_SRP` prošla jako kompletní se třinácti deskami z
 * dvaceti sedmi. Pack je tím užší, ne špatný: odpovídá jen na to, co vyřešil.
 * Blokovat by znamenalo stáhnout funkční obsah, mlčet by znamenalo tvrdit
 * COMPLETE o rodině, které chybí polovina desek.
 */
const base = {
  familyId: "MTT9_40BB_UTG_BB_SRP",
  plannedItems: 100,
  writtenItems: 100,
  minCoverage: 1,
  coverageTarget: TURN_COVERAGE_TARGET,
  sampledRules: [],
};

describe("brána a nerozložené desky", () => {
  it("nechá rodinu projít, ale řekne, kolik desek chybí", () => {
    const verdict = reviewTurnFamily({ ...base, boards: 13, boardsWithCheckpoint: 27 });

    expect(verdict.readyForReview).toBe(true);
    expect(verdict.boardCoverage).toBeCloseTo(13 / 27, 3);
    expect(verdict.findings.some((finding) => (
      finding.tier === "COMPLETE" && finding.detail.includes("14 z 27")
    ))).toBe(true);
  });

  it("nehlásí nic, když jsou rozložené všechny desky", () => {
    const verdict = reviewTurnFamily({ ...base, boards: 33, boardsWithCheckpoint: 33 });

    expect(verdict.readyForReview).toBe(true);
    expect(verdict.boardCoverage).toBe(1);
    expect(verdict.findings).toEqual([]);
  });

  it("bez toho čísla se chová jako dřív, ne jako by chybělo všechno", () => {
    // Volající, který počet checkpointů neumí zjistit, nesmí dostat rodinu
    // označenou za prázdnou. Neznámé není totéž co nulové.
    const verdict = reviewTurnFamily({ ...base, boards: 13 });

    expect(verdict.readyForReview).toBe(true);
    expect(verdict.boardCoverage).toBe(1);
  });

  it("pořád blokuje nesoudržnost, ne jen hlásí šířku", () => {
    // Nález o šířce leží ve stejném poli jako vady, takže test "jsou tu nějaké
    // nálezy" by rodinu shodil za to, že o sobě řekla pravdu. Blokovat musí tier.
    const verdict = reviewTurnFamily({
      ...base,
      boards: 5,
      boardsWithCheckpoint: 27,
      writtenItems: 90,
    });

    expect(verdict.readyForReview).toBe(false);
    expect(verdict.failedTier).toBe("COMPLETE");
  });
});
