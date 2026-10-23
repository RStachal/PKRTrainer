import { describe, expect, it } from "vitest";

import {
  familiesNeededFor,
  planReviewUnlock,
} from "../../src/data/ranges/reviewUnlockPlan";
import { supersededByRepair } from "../../scripts/lib/solvedPackBuilding.mts";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";
import type { TurnReviewVerdictRecord } from "../../src/data/ranges/turnReviewVerdict";

/**
 * Plán čtení odpovídá na jinou otázku než fronta anomálií.
 *
 * Fronta se řadí podle odchylky obrany od nabízených kurzů - to říká, **kde
 * hledat chybu**. Čtenář má ale jinou otázku: mám dvě hodiny a rodin přes
 * dvacet, co přečíst. Na tu odpovídá objem dodávaných rozhodnutí, a protože
 * rodina má pack na všech třech ulicích a čte se jeden spot, počítá se po
 * rodinách.
 */
function pack(familyId: string, rules: number, hash = "h1"): TurnStrategyPack {
  return {
    familyIds: [familyId],
    id: `pack-${familyId}`,
    contentHash: hash,
    confidence: "LOW",
    rules: Array.from({ length: rules }, (_, index) => ({ id: index })),
  } as unknown as TurnStrategyPack;
}

const accepted = (
  familyId: string, street: "FLOP" | "TURN" | "RIVER", contentHash = "h1",
): TurnReviewVerdictRecord => ({
  familyId, street, contentHash, outcome: "ACCEPTED",
  reviewedAt: "2026-08-19", reviewer: "test",
});

describe("plán čtení", () => {
  const byStreet = {
    FLOP: [pack("SMALL", 10), pack("BIG", 100)],
    TURN: [pack("SMALL", 10), pack("BIG", 100)],
    RIVER: [pack("BIG", 100)],
  };

  it("řadí podle toho, kolik obsahu se přečtením odemkne", () => {
    const plan = planReviewUnlock(byStreet, []);
    expect(plan.rows.map((row) => row.familyId)).toEqual(["BIG", "SMALL"]);
    expect(plan.rows[0].unlockableRules).toBe(300);
    expect(plan.rows[1].unlockableRules).toBe(20);
    expect(plan.shippedRules).toBe(320);
  });

  it("přečtenou ulici už do odemknutelných nepočítá", () => {
    const plan = planReviewUnlock(byStreet, [accepted("BIG", "TURN")]);
    const big = plan.rows.find((row) => row.familyId === "BIG");
    // Sto pravidel je přečtených, takže zbývá odemknout dvě stě, ne tři sta.
    expect(big?.unlockableRules).toBe(200);
    expect(plan.readRules).toBe(100);
  });

  it("verdikt vydaný na jiný obsah neplatí", () => {
    // Tohle je celý smysl otisku. Kdyby plán počítal propadlý verdikt jako
    // přečtený, tvrdil by, že je hotové něco, co nikdo na téhle podobě neviděl.
    const plan = planReviewUnlock(byStreet, [accepted("BIG", "TURN", "jiny-otisk")]);
    expect(plan.readRules).toBe(0);
    expect(plan.rows.find((row) => row.familyId === "BIG")?.unlockableRules).toBe(300);
  });

  it("souhrnný podíl roste a končí na sto procentech", () => {
    const plan = planReviewUnlock(byStreet, []);
    expect(plan.rows[0].cumulativeShare).toBeCloseTo(300 / 320);
    expect(plan.rows[plan.rows.length - 1].cumulativeShare).toBeCloseTo(1);
  });

  it("řekne, kolik rodin stačí na daný podíl", () => {
    const plan = planReviewUnlock(byStreet, []);
    expect(familiesNeededFor(plan, 0.5)).toBe(1);
    expect(familiesNeededFor(plan, 1)).toBe(2);
  });

  it("pořadí je opakovatelné i při shodě objemu", () => {
    // Bez druhého kritéria by se plán mezi běhy přeskládal a nešel by citovat.
    const tie = { FLOP: [pack("B", 50), pack("A", 50)], TURN: [], RIVER: [] };
    expect(planReviewUnlock(tie, []).rows.map((row) => row.familyId)).toEqual(["A", "B"]);
  });
});

describe("nahrazené rodiny", () => {
  const manifest = 'familyId: "MTT9_35BB_CO_BTN_3BP_REPAIR",\nfamilyId: "MTT9_40BB_UTG_BB_SRP",';

  it("pozná rodinu, kterou nahradila opravená verze", () => {
    expect(supersededByRepair("MTT9_35BB_CO_BTN_3BP", manifest))
      .toBe("MTT9_35BB_CO_BTN_3BP_REPAIR");
  });

  it("opravenou verzi samotnou nezakazuje", () => {
    expect(supersededByRepair("MTT9_35BB_CO_BTN_3BP_REPAIR", manifest)).toBeUndefined();
  });

  it("rodinu bez opravené verze pustí", () => {
    expect(supersededByRepair("MTT9_40BB_UTG_BB_SRP", manifest)).toBeUndefined();
  });
});
