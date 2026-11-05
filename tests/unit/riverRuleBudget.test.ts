import { describe, expect, it } from "vitest";

import { pickRiverRulesWithinBudget } from "../../scripts/lib/riverRuleBudget.mts";

/**
 * Výběr riverových pravidel do rozpočtu rodiny.
 *
 * Plný cyklus 19. 10. 2026 vzal 21 riverovým packům 103 desek: uvnitř
 * rozhodnutí se střídalo po turnových podhrách v pořadí adresářů, a když
 * podher přibylo víc, než činí podíl rozpočtu, první kolo skončilo dřív, než
 * došlo na desky z konce abecedy. Tady se ta situace staví v malém.
 */
interface Rule {
  decision: string;
  board: string;
  subgame: string;
  reach: number;
  id: string;
}

const keys = {
  decision: (rule: Rule) => rule.decision,
  board: (rule: Rule) => rule.board,
  subgame: (rule: Rule) => rule.subgame,
  reach: (rule: Rule) => rule.reach,
};

function family(boards: number, subgamesPerBoard: number, rulesPerSubgame: number, decision = "LEAD|OOP"): Rule[] {
  const rules: Rule[] = [];
  for (let board = 1; board <= boards; board += 1) {
    const name = `b${String(board).padStart(2, "0")}`;
    for (let subgame = 1; subgame <= subgamesPerBoard; subgame += 1) {
      for (let at = 0; at < rulesPerSubgame; at += 1) {
        rules.push({
          decision, board: name, subgame: `${name}/s${subgame}`, reach: 0.5, id: `${decision}:${name}:${subgame}:${at}`,
        });
      }
    }
  }
  return rules;
}

describe("pickRiverRulesWithinBudget", () => {
  it("každá deska s vrstvou se do packu dostane, i když má podher víc, než je podíl rozpočtu", () => {
    // 15 desek po 10 podhrách, podíl 20: střídání po podhrách by vzalo
    // 20 podher ze dvou prvních desek a třináct desek by vypadlo.
    const kept = pickRiverRulesWithinBudget(family(15, 10, 2), 20, keys);
    expect(kept).toHaveLength(20);
    expect(new Set(kept.map((rule) => rule.board)).size).toBe(15);
  });

  it("když se desky nevejdou, vypadnou nejméně dosahované, ne ty s pozdějším jménem", () => {
    const reach: Record<string, number> = { a: 0.1, b: 0.9, c: 0.5, d: 0.8, e: 0.2 };
    const rules = Object.entries(reach).map(([board, value]) => ({
      decision: "LEAD|OOP", board, subgame: `${board}/s1`, reach: value, id: board,
    }));
    const kept = pickRiverRulesWithinBudget(rules, 3, keys);
    expect(kept.map((rule) => rule.board)).toEqual(["b", "d", "c"]);
  });

  it("v desce se střídají podhry, v podhře rozhoduje dosah", () => {
    const rules: Rule[] = [
      { decision: "LEAD|OOP", board: "x", subgame: "x/s1", reach: 0.4, id: "s1-0.4" },
      { decision: "LEAD|OOP", board: "x", subgame: "x/s1", reach: 0.5, id: "s1-0.5" },
      { decision: "LEAD|OOP", board: "x", subgame: "x/s1", reach: 0.3, id: "s1-0.3" },
      { decision: "LEAD|OOP", board: "x", subgame: "x/s2", reach: 0.1, id: "s2-0.1" },
      { decision: "LEAD|OOP", board: "x", subgame: "x/s2", reach: 0.9, id: "s2-0.9" },
    ];
    expect(pickRiverRulesWithinBudget(rules, 10, keys).map((rule) => rule.id))
      .toEqual(["s2-0.9", "s1-0.5", "s2-0.1", "s1-0.4", "s1-0.3"]);
  });

  it("rozpočet se dělí rovným dílem mezi rozhodnutí a výsledek je proložený", () => {
    // Bajtový strop modulu drží prefix: ořez nesmí sebrat celé poslední rozhodnutí.
    const rules = [...family(4, 2, 3, "LEAD|OOP"), ...family(4, 2, 3, "FACING|IP")];
    const kept = pickRiverRulesWithinBudget(rules, 10, keys);
    expect(kept.filter((rule) => rule.decision === "LEAD|OOP")).toHaveLength(5);
    expect(kept.filter((rule) => rule.decision === "FACING|IP")).toHaveLength(5);
    const prefix = kept.slice(0, 4).map((rule) => rule.decision);
    expect(prefix.filter((decision) => decision === "LEAD|OOP")).toHaveLength(2);
    // A v každém rozhodnutí jsou v prefixu různé desky.
    const leadBoards = kept.slice(0, 8).filter((rule) => rule.decision === "LEAD|OOP").map((rule) => rule.board);
    expect(new Set(leadBoards).size).toBe(leadBoards.length);
  });

  it("menší rodina než rozpočet projde celá, každé pravidlo jednou", () => {
    const rules = family(3, 2, 2);
    const kept = pickRiverRulesWithinBudget(rules, 300, keys);
    expect(kept).toHaveLength(rules.length);
    expect(new Set(kept.map((rule) => rule.id)).size).toBe(rules.length);
  });
});
