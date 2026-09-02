import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { itWithSolverOutput } from "../solverInputs";

import {
  MTT_POSTFLOP_MIXED_TREE_FAMILIES,
  treeIntegrityForRuleId,
} from "../../src/data/ranges/postflopTreeIntegrity";
import { familyIdFromRuleId } from "../../src/data/ranges/postflopSolvedSpr";
import { generatedMttPostflopPilotPacks } from "../../src/data/ranges/mttPostflopPilotPacks.generated";
import { ALL_BOARD_TEXTURES } from "../../src/core/postflopGenerator";

// A hand-kept list of families is only as good as whatever keeps it honest.
// These are the two things that can rot: it can name a family that no longer
// ships, and it can miss one the audit has since found.

function shippedRuleIds(): string[] {
  return generatedMttPostflopPilotPacks.flatMap((entry) => entry.pack.rules.map((rule) => rule.id));
}

describe("postflop tree integrity", () => {
  it("flags a rule from a mixed-tree family and leaves the rest alone", () => {
    expect(treeIntegrityForRuleId("mtt9_150bb_co_btn_3bp_highspr-check-aggregate")).toBe("MIXED_TREES");
    expect(treeIntegrityForRuleId("mtt9_50bb_btn_bb_srp-check-aggregate")).toBe("UNIFORM");
  });

  it("reads the family from the rule id the same way the SPR table does", () => {
    // Two tables keyed by family id that disagreed about how to derive it would
    // be worse than one, so they share the derivation rather than repeating it.
    expect(familyIdFromRuleId("mtt9_150bb_co_btn_3bp_highspr-check-bet_39-aggregate"))
      .toBe("MTT9_150BB_CO_BTN_3BP_HIGHSPR");
  });

  it("names only families that actually ship rules", () => {
    // An entry for a family nobody trains is a caveat that can never be shown and
    // a line nobody will ever remove.
    const shippedFamilies = new Set(shippedRuleIds().map(familyIdFromRuleId));
    for (const family of MTT_POSTFLOP_MIXED_TREE_FAMILIES) {
      expect(shippedFamilies.has(family), `${family} ships no rules`).toBe(true);
    }
  });

  itWithSolverOutput("agrees with what the tree-provenance audit reports", () => {
    // The one that matters. If a re-solve clears a family, or a new one starts
    // mixing, this fails rather than letting the app quietly describe a library
    // it no longer has. Spawned directly rather than through `npm run`, because
    // the shell option makes Node emit a deprecation warning on stderr.
    const output = execFileSync(process.execPath, [
      "scripts/run-cli.mjs",
      "scripts/auditTexasSolverTreeProvenance.mts",
      "--json",
    ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

    const report = JSON.parse(output.slice(output.indexOf("{"))) as {
      families: Array<{ familyId: string; fullTree: number; reducedTree: number }>;
    };
    const mixing = new Set(
      report.families
        .filter((family) => family.fullTree > 0 && family.reducedTree > 0)
        .map((family) => family.familyId.toUpperCase()),
    );
    const shippedFamilies = new Set(shippedRuleIds().map(familyIdFromRuleId));
    // Only the ones that ship: a mixing family nobody trains needs no caveat.
    const shippedAndMixing = [...mixing].filter((family) => shippedFamilies.has(family)).sort();

    expect(shippedAndMixing).toEqual([...MTT_POSTFLOP_MIXED_TREE_FAMILIES].sort());
  }, 120_000);
});

describe("board texture disclosure", () => {
  it("finds that the shipped rules are aggregates covering every texture", () => {
    // The measurement the disclosure rests on. If a later pilot ships genuinely
    // texture-specific rules this fails, and the "one aggregate for every
    // texture" line has to stop being the normal case.
    const agnostic = generatedMttPostflopPilotPacks.flatMap((entry) => entry.pack.rules)
      .filter((rule) => ALL_BOARD_TEXTURES.every((texture) => rule.boardTextures.includes(texture)));

    expect(agnostic.length).toBe(18);
    expect(shippedRuleIds().length).toBe(19);
    // The nineteenth is one texture short of universal, which is why the
    // disclosure reports coverage as a fraction rather than a yes-or-no flag.
    const narrowest = Math.min(...generatedMttPostflopPilotPacks
      .flatMap((entry) => entry.pack.rules)
      .map((rule) => ALL_BOARD_TEXTURES.filter((texture) => rule.boardTextures.includes(texture)).length));
    expect(narrowest).toBe(12);
  });

  it("keeps rule selection working even though the texture term cancels", () => {
    // Every rule declaring the same textures means the texture part of the score
    // is identical across candidates, so SPR width decides. Pinned because it is
    // easy to read the score and believe texture is doing work it is not.
    const rules = generatedMttPostflopPilotPacks.flatMap((entry) => entry.pack.rules);
    const textureCounts = new Set(rules.map((rule) => rule.boardTextures.length));
    expect(textureCounts.size).toBeLessThanOrEqual(2);
  });
});
