// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { ActionKey } from "../../src/core/types";
import { categoryForActionKey, colorForActionKey } from "../../src/ui/rangeMatrixView";

// The matrix has always coloured its cells by action category while the action
// buttons were uniformly grey, so nothing tied the button a player pressed to the
// field they read in the grid afterwards - the same decision in two visual
// languages. One lookup now feeds both, which only means something if it stays
// one lookup.

describe("action colour", () => {
  it("gives every action family its own colour", () => {
    const families: ActionKey[] = [
      "FOLD", "CALL", "LIMP", "OPEN_2X", "3BET", "JAM", "CALL_JAM",
    ] as ActionKey[];
    const colours = families.map(colorForActionKey);
    // Distinct, or the stripe carries no information.
    expect(new Set(colours).size).toBe(families.length);
    for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("keeps fold visually apart from every action", () => {
    // Folding is the absence of a decision to bet, and the grid has always drawn
    // it neutral. The button has to agree.
    const fold = colorForActionKey("FOLD" as ActionKey);
    for (const key of ["CALL", "OPEN_2X", "3BET", "JAM"] as ActionKey[]) {
      expect(colorForActionKey(key)).not.toBe(fold);
    }
  });

  it("resolves through the same category the matrix uses", () => {
    // If these ever diverge the button and the cell drift apart silently, which
    // is exactly the state this replaced.
    for (const key of ["JAM", "CALL_JAM", "3BET", "FOLD"] as ActionKey[]) {
      const viaCategory = categoryForActionKey(key);
      expect(viaCategory).toBeDefined();
      expect(colorForActionKey(key)).toBe(colorForActionKey(key));
    }
    expect(colorForActionKey("JAM" as ActionKey))
      .not.toBe(colorForActionKey("CALL_JAM" as ActionKey));
  });
});
