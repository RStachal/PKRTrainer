import { describe, expect, it } from "vitest";

import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { createFlopProductionStrategyResolverChain } from "../../src/data/ranges/flopProductionStrategyResolver";
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
 * SECOND, and now repaired: two naming schemes coexisted. The generator emits
 * BTN_VS_BB, SB_VS_BB and EP_VS_BB alongside the SRP-prefixed names the rules
 * carry, so the button-versus-blind situation reached its pilot about half the
 * time and fell through to the heuristic the rest.
 *
 * The resolver reads a legacy name as its solved equivalent rather than anything
 * being renamed. A rename would touch the generator, the packs, stats records
 * already written under the old names and the citation policy listing both
 * spellings, and getting it wrong silently mislabels solved content as heuristic
 * or the reverse. A lookup cannot mislabel anything.
 *
 * That took solver-backed coverage from 11.9 percent to 21.1 without solving one
 * new board. The first attempt changed nothing, because the position check
 * existed in two functions: the filter admitted the legacy names and the second
 * pass rejected them again.
 *
 * OOP_RAISER_VS_IP_CALLER and OOP_CALLER_VS_IP_3BETTOR stay unmapped. They name
 * no seats, so choosing a pairing for them would be inventing the thing this
 * avoids.
 */

const LEGACY_PATTERNS = [
  "BTN_VS_BB", "SB_VS_BB", "EP_VS_BB",
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

  it("still emits the legacy pattern names, which the resolver now reads", () => {
    // The generator has not changed and does not need to: the resolver reads the
    // old spelling as the solved one. This pins that the situation still exists,
    // so the day the generator is cleaned up the note above stops being true.
    const legacy = LEGACY_PATTERNS.reduce((sum, name) => sum + (counts.get(name) ?? 0), 0);
    expect(legacy, "legacy names have gone - update the note above").toBeGreaterThan(0);
    expect(legacy / total).toBeGreaterThan(0.05);
    // No rule carries a legacy name; the equivalence lives in the resolver.
    for (const name of LEGACY_PATTERNS) {
      expect(rulePatterns().has(name), `${name} now has a rule`).toBe(false);
    }
  });

  it("no longer spells a pattern by role when it knows the seats", () => {
    // Both role names are gone from what the intent produces. They described a
    // situation the intent could name exactly - it was holding both seats and
    // passing them in - and spelling them by role discarded that at the one
    // point a solved pack has to be matched.
    //
    // Asserted against the generator's own output rather than the type, because
    // the type still permits them: stats records written under the old spelling
    // still have to parse.
    expect(counts.get("OOP_RAISER_VS_IP_CALLER") ?? 0).toBe(0);
    expect(counts.get("OOP_CALLER_VS_IP_3BETTOR") ?? 0).toBe(0);
  });

  it("resolves the three mappable legacy names to solved content", () => {
    // The repair, asserted where it matters: a spot carrying the old spelling
    // gets solver-backed content rather than the public heuristic.
    const resolver = createFlopProductionStrategyResolverChain(
      generatedMttPostflopPilotPacks.map((entry) => entry.pack),
    );
    let legacySpots = 0;
    let legacySolved = 0;
    for (let seed = 1; seed <= 3000; seed += 1) {
      const spot = generatePostflopSpot({
        seed, street: "FLOP", strategyResolver: resolver, allowFallback: true,
      });
      const training = postflopSpotToTrainingSpot(spot, "CZ");
      if (training === null || training === undefined) continue;
      if (!["BTN_VS_BB", "SB_VS_BB", "EP_VS_BB"].includes(training.positionPattern)) continue;
      legacySpots += 1;
      const source = training.explanation.source;
      if (source.kind === "STRATEGY_PACK" && source.provenance === "SOLVER_BACKED") {
        legacySolved += 1;
      }
    }
    expect(legacySpots, "no legacy-named spots generated").toBeGreaterThan(100);
    // Not all of them - SPR and texture still have to match - but a real share,
    // where before the repair it was none. Measured 2026-09-22: 36.2 % with six
    // of the seven pilots labelled LOW after the reader rejected them (decision
    // 9a, diary 248/259) - a LOW pack does not resolve, so only the UTG vs BB
    // pilot answers here until the BTN-BB families are re-solved and re-read.
    expect(legacySolved / legacySpots).toBeGreaterThan(0.25);
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
