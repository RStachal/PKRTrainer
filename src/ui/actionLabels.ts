import type { ActionId } from "../domain/spot";

export const ACTION_LABELS: Record<ActionId, string> = {
  FOLD: "Fold",
  CHECK: "Check",
  CALL: "Call",
  BET: "Bet",
  RAISE: "Raise",
  OPEN: "Open",
  JAM: "Jam",
};

export function getActionLabel(action: ActionId): string {
  return ACTION_LABELS[action];
}
