import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTurnStrategyRule,
  turnStrategyRuleProblems,
} from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Joining a solved subgame to the spot it was solved for.
 *
 * Third piece of the bridge, and the last one that can be built without deciding
 * what a player is shown. 160 rules built from real artefacts across the
 * families, none unbuildable, none incoherent.
 *
 * The rule deliberately keeps the solver's own action labels - `BET 33.000000`
 * is a size in chips, and turning it into the product's vocabulary needs the pot
 * at that node, which lives in the parent. Guessing the mapping would relabel a
 * quarter-pot bet as a pot-sized one, so the translation waits for whoever wires
 * the resolver with the pot in hand.
 */

const ROOT = "artifacts/decomposition";

function someRules(limitDirectories: number, perDirectory: number) {
  const rules = [];
  const failures: string[] = [];
  for (const directory of readdirSync(ROOT).filter((name) => name.includes("__")).slice(0, limitDirectories)) {
    let files: string[];
    try {
      files = readdirSync(join(ROOT, directory))
        .filter((name) => name.endsWith(".json") && name !== "plan.json");
    } catch {
      continue;
    }
    for (const file of files.slice(0, perDirectory)) {
      const node = JSON.parse(readFileSync(join(ROOT, directory, file), "utf8"));
      const rule = buildTurnStrategyRule(directory, node);
      if (rule === undefined) failures.push(`${directory}/${file}`);
      else rules.push(rule);
    }
  }
  return { rules, failures };
}

describe("turn strategy rule builder", () => {
  it("refuses a rule with either half missing", () => {
    // A rule missing its pattern is filed under nothing; one missing its
    // strategy teaches nothing. Half-built rules that reach a pack are harder to
    // notice than absent ones.
    const node = { actions: ["CHECK", "BET 75.000000"], strategy: { strategy: { AsKs: [0.4, 0.6] } } };
    expect(buildTurnStrategyRule("not-a-family-name", node)).toBeUndefined();
    expect(buildTurnStrategyRule("MTT9_25BB_BTN_BB_SRP__222r", {})).toBeUndefined();
    expect(buildTurnStrategyRule("MTT9_25BB_BTN_BB_SRP__222r", node)).toBeDefined();
  });

  it("weights a bucket's mix by combinations, not by class count", () => {
    // A bucket holding one pair and one offsuit hand is mostly the offsuit hand:
    // twelve combinations against six. An unweighted mean would say otherwise.
    const rule = buildTurnStrategyRule("MTT9_25BB_BTN_BB_SRP__222r", {
      actions: ["CHECK", "BET 75.000000"],
      strategy: {
        strategy: {
          "AhAd": [0.0, 1.0],   // AA, 6 combos, pure bet
          "KhQd": [0.4, 0.6],   // KQo, 12 combos, bet-leaning
        },
      },
    })!;
    const bucket = rule.buckets.find((item) => item.action === "BET 75.000000")!;
    expect(bucket.handClasses.sort()).toEqual(["AA", "KQo"]);
    expect(bucket.combos).toBe(18);
    // (1.0*6 + 0.6*12) / 18 = 0.733, not the unweighted 0.8.
    expect(bucket.mix[1].frequency).toBeCloseTo(0.733, 2);
  });

  it("breaks a tie toward the earlier action", () => {
    // A hand split exactly between two actions has no dominant one, and the
    // reader keeps the first. Asserted so it is a decision rather than a
    // side effect of how the maximum is taken - a 50/50 hand landing in the
    // betting bucket would read as a bet the solver never preferred.
    const rule = buildTurnStrategyRule("MTT9_25BB_BTN_BB_SRP__222r", {
      actions: ["CHECK", "BET 75.000000"],
      strategy: { strategy: { KhQd: [0.5, 0.5] } },
    })!;
    expect(rule.buckets).toHaveLength(1);
    expect(rule.buckets[0].action).toBe("CHECK");
  });

  it("puts each hand class in exactly one bucket", () => {
    const rule = buildTurnStrategyRule("MTT9_25BB_BTN_BB_SRP__222r", {
      actions: ["CHECK", "BET 75.000000"],
      strategy: { strategy: { AhAd: [0.1, 0.9], "2h3d": [0.9, 0.1] } },
    })!;
    expect(turnStrategyRuleProblems(rule)).toEqual([]);
    const all = rule.buckets.flatMap((bucket) => bucket.handClasses);
    expect(new Set(all).size).toBe(all.length);
  });

  it("builds coherent rules from the real artefacts", () => {
    if (!existsSync(ROOT)) {
      // Not in version control; asserted rather than skipped quietly.
      expect(existsSync(ROOT), `${ROOT} absent - solver artefacts not checked`).toBe(false);
      return;
    }
    const { rules, failures } = someRules(30, 3);
    expect(failures).toEqual([]);
    expect(rules.length).toBeGreaterThan(50);

    for (const rule of rules) {
      expect(turnStrategyRuleProblems(rule), rule.sourceDirectory).toEqual([]);
      // Every rule can be traced back to the solve it came from, which is the
      // property that makes any of this reviewable.
      expect(rule.sourceDirectory).toContain(rule.familyId);
      expect(rule.positionPattern).toMatch(/^(SRP|3BP)_[A-Z0-9_]+_VS_[A-Z0-9_]+$/);
      expect(rule.buckets.length).toBeGreaterThan(0);
      // Buckets are widest first, so a reader meets the main line before the
      // exceptions.
      const combos = rule.buckets.map((bucket) => bucket.combos);
      expect([...combos].sort((left, right) => right - left)).toEqual(combos);
    }
  });
});
