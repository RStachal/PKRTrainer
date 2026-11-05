import { describe, expect, it } from "vitest";

import { generatedMttPostflopPilotPacks } from "../../src/data/ranges/mttPostflopPilotPacks.generated";

/**
 * What the postflop pilots cover, and the shape of what they do not.
 *
 * Nineteen rules across seven packs, and the useful question is not how many
 * there are but which decisions a player can reach that none of them answer.
 * Laid out as a grid of position pattern against action node:
 *
 *                    SRP cbet        facing bet      3bet-pot cbet
 *   3BP_BTN_VS_CO      -             SPR 0-20        SPR 0-20
 *   SRP_BTN_VS_BB    SPR 0-20        SPR 0-20          -
 *   SRP_CO_VS_BB     SPR 0-20          -               -
 *   SRP_SB_VS_BB     SPR 0-20          -               -
 *   SRP_UTG_VS_BB    SPR 3-8           -               -
 *
 * Eight of fifteen cells are empty, and three of those are structural rather
 * than gaps - a single-raised pot has no three-bet-pot cbet node, and a
 * three-bet-pot pattern has no single-raised one. The five that are real gaps
 * are the facing-bet node at the cutoff, small blind and under the gun, and
 * whatever sits outside SPR 3-8 under the gun.
 *
 * Board texture is not a gap anywhere: every rule carries all thirteen textures
 * bar one, so a player never falls through because of the flop that came.
 *
 * The under-the-gun window is the sharpest edge. Every other pattern runs 0 to
 * 20; that one runs 3 to 8, so a UTG-versus-BB flop at SPR 1 or SPR 15 matches
 * no rule at all while the same spot on the button matches one.
 *
 * This test pins the map rather than demanding it be complete. A pilot is
 * allowed to be partial; what it is not allowed to do is shrink without anyone
 * noticing, or grow without the note above being brought up to date.
 */

interface Rule {
  actionNode: string;
  potType: string;
  positionPattern: string;
  boardTextures: readonly string[];
  sprMin: number;
  sprMax: number;
}

const RULES: Rule[] = generatedMttPostflopPilotPacks.flatMap((entry) => (
  (entry.pack as unknown as { rules: readonly Rule[] }).rules.slice()
));

function forCell(pattern: string, node: string): Rule[] {
  return RULES.filter((rule) => rule.positionPattern === pattern && rule.actionNode === node);
}

function sprSpan(rules: Rule[]): [number, number] | null {
  if (rules.length === 0) return null;
  return [
    Math.min(...rules.map((rule) => rule.sprMin)),
    Math.max(...rules.map((rule) => rule.sprMax)),
  ];
}

describe("postflop coverage map", () => {
  it("has the rule count the map was drawn from", () => {
    expect(RULES.length).toBe(19);
  });

  it("covers SPR 0 to 20 everywhere except under the gun", () => {
    const full = [
      ["SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET"],
      ["SRP_BTN_VS_BB", "FLOP_FACING_BET"],
      ["SRP_CO_VS_BB", "SINGLE_RAISED_POT_CBET"],
      ["SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET"],
      ["3BP_BTN_VS_CO", "THREE_BET_POT_CBET"],
      ["3BP_BTN_VS_CO", "FLOP_FACING_BET"],
    ];
    for (const [pattern, node] of full) {
      expect(sprSpan(forCell(pattern, node)), `${pattern}/${node}`).toEqual([0, 20]);
    }
    // The exception, asserted so it cannot quietly become the norm or quietly
    // disappear: a UTG flop outside this window matches nothing.
    expect(sprSpan(forCell("SRP_UTG_VS_BB", "SINGLE_RAISED_POT_CBET"))).toEqual([3, 8]);
  });

  it("leaves the facing-bet node unsolved outside the button", () => {
    // Three patterns can be bet into and have no answer for it. Named rather
    // than counted, so filling one shows up here as a change.
    for (const pattern of ["SRP_CO_VS_BB", "SRP_SB_VS_BB", "SRP_UTG_VS_BB"]) {
      expect(forCell(pattern, "FLOP_FACING_BET"), pattern).toHaveLength(0);
    }
    expect(forCell("SRP_BTN_VS_BB", "FLOP_FACING_BET").length).toBeGreaterThan(0);
  });

  it("never drops a player through because of board texture", () => {
    // Texture is the one dimension with no holes, so a flop that arrives cannot
    // be the reason a spot goes unanswered.
    const textures = new Set(RULES.flatMap((rule) => rule.boardTextures));
    expect(textures.size).toBe(13);
    for (const rule of RULES) {
      expect(rule.boardTextures.length, `${rule.positionPattern}/${rule.actionNode}`)
        .toBeGreaterThanOrEqual(12);
    }
  });

  it("keeps pot type and action node consistent", () => {
    for (const rule of RULES) {
      if (rule.actionNode === "THREE_BET_POT_CBET") expect(rule.potType).toBe("THREE_BET_POT");
      if (rule.actionNode === "SINGLE_RAISED_POT_CBET") expect(rule.potType).toBe("SINGLE_RAISED");
    }
  });
});
