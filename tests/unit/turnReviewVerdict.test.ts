import { describe, expect, it } from "vitest";

import {
  confidenceForFamily,
  parseTurnReviewVerdicts,
  turnRuleContentHash,
  type TurnReviewVerdictRecord,
} from "../../src/data/ranges/turnReviewVerdict";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Cesta z LOW ven, a hlavně to, že se po ní nedá projít omylem.
 *
 * Veškerý solverový turn obsah byl LOW, LOW všude blokuje produkci, a nic
 * neumělo zaznamenat, že se na obsah někdo podíval - takže se dalo solvit
 * donekonečna a nikdy nic nedodat. Verdikt tu cestu otevírá a otisk obsahu
 * zajišťuje, že se požehnání nedědí přes přegenerování.
 */
function rule(overrides: Record<string, unknown> = {}): TurnStrategyRule {
  return {
    familyId: "F",
    sourceDirectory: "F__aaa",
    positionPattern: "SRP_CO_VS_BB",
    potType: "SINGLE_RAISED",
    node: "CBET",
    stackBB: 25,
    actions: ["CHECK", "BET 10.000000"],
    buckets: [{ action: "CHECK", combos: 100, handClasses: ["AA", "KK"] }],
    heroOutOfPosition: true,
    classCount: 2,
    ...overrides,
  } as unknown as TurnStrategyRule;
}

const verdict = (over: Partial<TurnReviewVerdictRecord> = {}): TurnReviewVerdictRecord => ({
  familyId: "F",
  contentHash: turnRuleContentHash([rule()]),
  outcome: "ACCEPTED",
  reviewedAt: "2026-08-11",
  reviewer: "tester",
  ...over,
});

describe("review verdikt turn rodiny", () => {
  it("otisk se nemění formátováním, ale mění obsahem", () => {
    const base = turnRuleContentHash([rule()]);
    // Jiné pořadí pravidel je totéž čtení.
    expect(turnRuleContentHash([rule(), rule({ sourceDirectory: "F__bbb" })]))
      .toBe(turnRuleContentHash([rule({ sourceDirectory: "F__bbb" }), rule()]));
    // Jiná akce v kbelíku je jiné čtení.
    expect(turnRuleContentHash([rule({
      buckets: [{ action: "BET 10.000000", combos: 100, handClasses: ["AA", "KK"] }],
    })])).not.toBe(base);
    // Jiná ruka v kbelíku taky.
    expect(turnRuleContentHash([rule({
      buckets: [{ action: "CHECK", combos: 100, handClasses: ["AA", "QQ"] }],
    })])).not.toBe(base);
  });

  it("bez čtení zůstává LOW", () => {
    const result = confidenceForFamily("F", turnRuleContentHash([rule()]), []);
    expect(result.confidence).toBe("LOW");
    expect(result.reason).toContain("nečetl");
  });

  it("po přijetí dá MEDIUM, ne HIGH", () => {
    // Jeden čtenář je jeden názor. HIGH by mělo znamenat něco silnějšího a dokud
    // to neexistuje, nemá se ta hodnota rozdávat.
    const result = confidenceForFamily("F", turnRuleContentHash([rule()]), [verdict()]);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("propadne, když se obsah od čtení změnil", () => {
    // Tohle je ta půlka, kvůli které modul existuje: přegenerování rodiny z
    // nových solvů nesmí tiše zdědit požehnání staré verze.
    const changed = turnRuleContentHash([rule({ stackBB: 40 })]);
    const result = confidenceForFamily("F", changed, [verdict()]);
    expect(result.confidence).toBe("LOW");
    expect(result.reason).toContain("obsah se od čtení změnil");
  });

  it("nepřijaté čtení nezvedá důvěru a řekne proč", () => {
    const result = confidenceForFamily("F", turnRuleContentHash([rule()]), [
      verdict({ outcome: "NEEDS_WORK", notes: "BTN sází moc" }),
    ]);
    expect(result.confidence).toBe("LOW");
    expect(result.reason).toContain("BTN sází moc");
  });

  it("odmítne soubor, kterému nerozumí, místo aby si domýšlel", () => {
    expect(parseTurnReviewVerdicts("nesmysl")).toEqual([]);
    expect(parseTurnReviewVerdicts('{"verdicts":[]}')).toEqual([]);
    expect(parseTurnReviewVerdicts(JSON.stringify({
      schemaVersion: "PKRTRAINER_TURN_REVIEW_V1",
      verdicts: [verdict(), { familyId: "X" }],
    }))).toHaveLength(1);
  });
});
