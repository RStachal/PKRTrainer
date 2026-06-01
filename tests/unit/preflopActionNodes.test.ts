import { describe, expect, it } from "vitest";

import type { ActionContext, ActionKey } from "../../src/core/types";
import {
  MINIMUM_PREFLOP_ACTION_FAMILIES,
  actionFamilyForKey,
  contextSupportsActionKey,
  missingMinimumPreflopFamilies,
  preflopFamiliesForContext,
  relevantActionKeysForContext,
} from "../../src/core/preflopActionNodes";

const ALL_CONTEXTS: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

const ALL_ACTION_KEYS: ActionKey[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
  "JAM",
  "CALL_JAM",
];

describe("preflopActionNodes", () => {
  it("mapuje vsechny ActionKey do preflop action family", () => {
    expect(ALL_ACTION_KEYS.map(actionFamilyForKey)).toEqual([
      "FOLD",
      "CALL",
      "LIMP",
      "CALL",
      "OPEN_RAISE",
      "OPEN_RAISE",
      "OPEN_RAISE",
      "OPEN_RAISE",
      "OPEN_RAISE",
      "OPEN_RAISE",
      "THREE_BET",
      "FOUR_BET",
      "THREE_BET",
      "JAM",
      "CALL_JAM",
    ]);

    expect(missingMinimumPreflopFamilies(ALL_ACTION_KEYS)).toEqual([]);
    expect(MINIMUM_PREFLOP_ACTION_FAMILIES).toEqual([
      "FOLD",
      "CALL",
      "OPEN_RAISE",
      "THREE_BET",
      "FOUR_BET",
      "JAM",
      "CALL_JAM",
    ]);
  });

  it("definuje relevantni action families pro kazdy preflop node", () => {
    for (const context of ALL_CONTEXTS) {
      expect(preflopFamiliesForContext(context).length).toBeGreaterThan(0);
      expect(relevantActionKeysForContext(context).length).toBeGreaterThan(0);
    }

    expect(preflopFamiliesForContext("VS_OPEN")).toEqual([
      "FOLD",
      "CALL",
      "THREE_BET",
    ]);
    expect(preflopFamiliesForContext("PUSH_FOLD")).toEqual(["FOLD", "JAM"]);
    expect(preflopFamiliesForContext("VS_ALLIN")).toEqual(["FOLD", "CALL_JAM"]);
  });

  it("umi overit, zda je ActionKey relevantni pro konkretni node", () => {
    expect(contextSupportsActionKey("VS_OPEN", "3BET")).toBe(true);
    expect(contextSupportsActionKey("VS_OPEN", "4BET")).toBe(false);
    expect(contextSupportsActionKey("PUSH_FOLD", "JAM")).toBe(true);
    expect(contextSupportsActionKey("PUSH_FOLD", "CALL_JAM")).toBe(false);
    expect(contextSupportsActionKey("VS_ALLIN", "CALL_JAM")).toBe(true);
  });
});
