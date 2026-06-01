import type { ActionContext, ActionKey } from "./types";

export type PreflopActionFamily =
  | "FOLD"
  | "CALL"
  | "OPEN_RAISE"
  | "THREE_BET"
  | "FOUR_BET"
  | "JAM"
  | "CALL_JAM"
  | "LIMP";

export const MINIMUM_PREFLOP_ACTION_FAMILIES = [
  "FOLD",
  "CALL",
  "OPEN_RAISE",
  "THREE_BET",
  "FOUR_BET",
  "JAM",
  "CALL_JAM",
] as const satisfies readonly PreflopActionFamily[];

export const ACTION_KEY_FAMILY: Record<ActionKey, PreflopActionFamily> = {
  FOLD: "FOLD",
  CALL: "CALL",
  LIMP: "LIMP",
  OVERLIMP: "CALL",
  OPEN_2X: "OPEN_RAISE",
  OPEN_25X: "OPEN_RAISE",
  OPEN_3X: "OPEN_RAISE",
  ISO_2X: "OPEN_RAISE",
  ISO_25X: "OPEN_RAISE",
  ISO_3X: "OPEN_RAISE",
  "3BET": "THREE_BET",
  SQUEEZE: "THREE_BET",
  "4BET": "FOUR_BET",
  JAM: "JAM",
  CALL_JAM: "CALL_JAM",
};

const CONTEXT_ACTION_FAMILIES: Record<ActionContext, readonly PreflopActionFamily[]> = {
  RFI: ["FOLD", "OPEN_RAISE", "LIMP"],
  VS_LIMP: ["FOLD", "CALL", "OPEN_RAISE", "LIMP"],
  VS_OPEN: ["FOLD", "CALL", "THREE_BET"],
  VS_3BET: ["FOLD", "CALL", "FOUR_BET"],
  VS_4BET: ["FOLD", "CALL", "JAM"],
  SQUEEZE: ["FOLD", "CALL", "THREE_BET"],
  BVB: ["FOLD", "CALL", "OPEN_RAISE", "THREE_BET", "JAM"],
  PUSH_FOLD: ["FOLD", "JAM"],
  VS_ALLIN: ["FOLD", "CALL_JAM"],
};

export function actionFamilyForKey(key: ActionKey): PreflopActionFamily {
  return ACTION_KEY_FAMILY[key];
}

export function preflopFamiliesForContext(
  context: ActionContext,
): readonly PreflopActionFamily[] {
  return CONTEXT_ACTION_FAMILIES[context];
}

export function contextSupportsActionKey(
  context: ActionContext,
  key: ActionKey,
): boolean {
  return preflopFamiliesForContext(context).includes(actionFamilyForKey(key));
}

export function relevantActionKeysForContext(context: ActionContext): ActionKey[] {
  const families = new Set(preflopFamiliesForContext(context));
  return (Object.keys(ACTION_KEY_FAMILY) as ActionKey[]).filter((key) => (
    families.has(ACTION_KEY_FAMILY[key])
  ));
}

export function missingMinimumPreflopFamilies(
  keys: readonly ActionKey[],
): PreflopActionFamily[] {
  const present = new Set(keys.map(actionFamilyForKey));
  return MINIMUM_PREFLOP_ACTION_FAMILIES.filter((family) => !present.has(family));
}
