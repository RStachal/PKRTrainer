import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { generatedMttPostflopPilotPacks } from "../../src/data/ranges/mttPostflopPilotPacks.generated";

/**
 * Whether solved postflop content can actually be reached by a player.
 *
 * Coverage was mapped by reading the rules, which answers what exists. This asks
 * the other half - what a player meets - and the two do not agree.
 *
 * Twelve percent of generated flop spots resolve to solver-backed content; the
 * other 88 come from the public heuristic. Most of that is simply scope: the
 * generator produces 33 position patterns and the pilots cover 5. But two parts
 * of it are defects rather than scope.
 *
 * FIRST: `3BP_BTN_VS_CO` is never generated. Two of the seven pilot packs - the
 * three-bet-pot cbet and the facing-bet node, both SPR 0 to 20 across all
 * thirteen textures - answer a spot the app cannot produce. That is solved
 * content no player can ever see.
 *
 * SECOND: two naming schemes coexist. The generator emits BTN_VS_BB, SB_VS_BB,
 * EP_VS_BB and OOP_RAISER_VS_IP_CALLER alongside the SRP-prefixed names the
 * rules match on, at 12.4 percent of spots against 11.9 for the names that do
 * match. So the button-versus-blind situation reaches its pilot roughly half the
 * time and falls through to the heuristic the rest, for no reason a player could
 * describe.
 *
 * Neither is fixed here. Renaming patterns touches the generator, the packs, the
 * stats records already written under the old names, and the citation policy
 * that lists both spellings - and getting it wrong silently mislabels solved
 * content, which is worse than the gap. These tests pin the state so the repair
 * can be measured when it is made.
 */

const LEGACY_PATTERNS = [
  "BTN_VS_BB", "SB_VS_BB", "EP_VS_BB", "OOP_RAISER_VS_IP_CALLER",
];

function generatedPatternCounts(seeds: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const spot = generatePostflopSpot({ seed, street: "FLOP" });
    const training = postflopSpotToTrainingSpot(spot, "CZ");
    if (training === null || training === undefined) continue;
    counts.set(training.positionPattern, (counts.get(training.positionPattern) ?? 0) + 1);
  }
  return counts;
}

function rulePatterns(): Set<string> {
  const patterns = new Set<string>();
  for (const entry of generatedMttPostflopPilotPacks) {
    const pack = entry.pack as unknown as { rules: readonly { positionPattern: string }[] };
    for (const rule of pack.rules) patterns.add(rule.positionPattern);
  }
  return patterns;
}

describe("postflop reachability", () => {
  const counts = generatedPatternCounts(3000);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  it("generates enough spots for the shares to mean anything", () => {
    expect(total).toBeGreaterThan(2500);
    expect(counts.size).toBeGreaterThan(25);
  });

  it("has a solved pattern the generator never produces", () => {
    // Two pilot packs answer this and nothing asks them. Asserted so that the
    // day the generator learns to produce it, this fails and the note above
    // stops being true.
    expect(rulePatterns().has("3BP_BTN_VS_CO")).toBe(true);
    expect(counts.get("3BP_BTN_VS_CO") ?? 0).toBe(0);
  });

  it("still emits the legacy pattern names alongside the matched ones", () => {
    // The same poker situation under two labels, only one of which the rules
    // match. Roughly one spot in eight carries the unmatched spelling.
    const legacy = LEGACY_PATTERNS.reduce((sum, name) => sum + (counts.get(name) ?? 0), 0);
    expect(legacy, "legacy names have gone - update the note above").toBeGreaterThan(0);
    expect(legacy / total).toBeGreaterThan(0.05);
    for (const name of LEGACY_PATTERNS) {
      expect(rulePatterns().has(name), `${name} now has a rule`).toBe(false);
    }
  });

  it("reaches the four patterns that do have rules", () => {
    // These work, and the test says so - otherwise a regression that broke all
    // matching would look the same as the gaps above.
    for (const pattern of ["SRP_BTN_VS_BB", "SRP_SB_VS_BB", "SRP_UTG_VS_BB", "SRP_CO_VS_BB"]) {
      expect(counts.get(pattern) ?? 0, pattern).toBeGreaterThan(0);
      expect(rulePatterns().has(pattern), pattern).toBe(true);
    }
  });
});
