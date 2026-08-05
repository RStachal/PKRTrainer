/**
 * Where an EV set came from, which is never a detail.
 *
 * `SOLVER` is a reviewed export and is the only source a shipped range pack may
 * carry - `validateActionEvSet` still insists on it, because that validator
 * guards imports. `ALL_IN_EQUITY` is computed at runtime from the generated
 * preflop equity table for the two contexts where the spot fixes a price, and it
 * is a weaker claim: exact arithmetic over a sampled table, ignoring card removal
 * between ranges. Keeping the two apart means nobody has to guess which they are
 * looking at.
 */
export type ActionEvSource = "SOLVER" | "ALL_IN_EQUITY";
export type ActionEvUnit = "BB";

export interface ActionEvValue<Action extends string> {
  action: Action;
  evBb: number;
}

/**
 * Solver counterfactual values for every action offered at one decision node.
 * Frequencies are intentionally kept out of this contract: a mixed strategy
 * does not, by itself, prove the EV of any action.
 */
export interface ActionEvSet<Action extends string> {
  source: ActionEvSource;
  unit: ActionEvUnit;
  values: readonly ActionEvValue<Action>[];
  equivalentThresholdBb: number;
  acceptableThresholdBb: number;
}

export type ActionEvOutcome = "BEST" | "EQUIVALENT" | "ACCEPTABLE" | "MISTAKE";

export interface ActionEvEvaluation<Action extends string> {
  chosenAction: Action;
  chosenEvBb: number;
  bestEvBb: number;
  evLossBb: number;
  bestActions: readonly Action[];
  outcome: ActionEvOutcome;
}

const FLOAT_EPSILON = 1e-9;

export function evaluateActionEv<Action extends string>(
  set: ActionEvSet<Action>,
  chosenAction: Action,
): ActionEvEvaluation<Action> | null {
  const chosen = set.values.find((item) => item.action === chosenAction);
  if (!chosen || set.values.length === 0) return null;

  const bestEvBb = Math.max(...set.values.map((item) => item.evBb));
  const evLossBb = Math.max(0, bestEvBb - chosen.evBb);
  const bestActions = set.values
    .filter((item) => bestEvBb - item.evBb <= set.equivalentThresholdBb + FLOAT_EPSILON)
    .map((item) => item.action);

  let outcome: ActionEvOutcome;
  if (evLossBb <= FLOAT_EPSILON) outcome = "BEST";
  else if (evLossBb <= set.equivalentThresholdBb + FLOAT_EPSILON) outcome = "EQUIVALENT";
  else if (evLossBb <= set.acceptableThresholdBb + FLOAT_EPSILON) outcome = "ACCEPTABLE";
  else outcome = "MISTAKE";

  return {
    chosenAction,
    chosenEvBb: chosen.evBb,
    bestEvBb,
    evLossBb,
    bestActions,
    outcome,
  };
}

export function bestActionsForActionEv<Action extends string>(
  set: ActionEvSet<Action>,
): readonly Action[] {
  if (set.values.length === 0) return [];
  const bestEvBb = Math.max(...set.values.map((item) => item.evBb));
  return set.values
    .filter((item) => bestEvBb - item.evBb <= set.equivalentThresholdBb + FLOAT_EPSILON)
    .map((item) => item.action);
}

export function highestEvAction<Action extends string>(
  set: ActionEvSet<Action>,
): Action | null {
  let best: ActionEvValue<Action> | undefined;
  for (const item of set.values) {
    if (!best || item.evBb > best.evBb + FLOAT_EPSILON) best = item;
  }
  return best?.action ?? null;
}

export function isActionEvSetComplete<Action extends string>(
  set: ActionEvSet<Action> | undefined,
  legalActions: readonly Action[],
): set is ActionEvSet<Action> {
  return set !== undefined && validateActionEvSet(set, legalActions).length === 0;
}

export function validateActionEvSet<Action extends string>(
  set: ActionEvSet<Action>,
  legalActions: readonly Action[],
): string[] {
  const errors: string[] = [];
  const legal = new Set<string>(legalActions);
  const seen = new Set<string>();

  if (set.source !== "SOLVER") errors.push("source must be SOLVER");
  if (set.unit !== "BB") errors.push("unit must be BB");
  if (!isNonNegativeFinite(set.equivalentThresholdBb)) {
    errors.push("equivalentThresholdBb must be a non-negative finite number");
  }
  if (!isNonNegativeFinite(set.acceptableThresholdBb)) {
    errors.push("acceptableThresholdBb must be a non-negative finite number");
  }
  if (
    Number.isFinite(set.equivalentThresholdBb) &&
    Number.isFinite(set.acceptableThresholdBb) &&
    set.acceptableThresholdBb < set.equivalentThresholdBb
  ) {
    errors.push("acceptableThresholdBb must be greater than or equal to equivalentThresholdBb");
  }
  if (!Array.isArray(set.values) || set.values.length === 0) {
    errors.push("values must contain at least one action EV");
    return errors;
  }

  for (const item of set.values) {
    if (!legal.has(item.action)) errors.push(`action ${item.action} is not offered at this node`);
    if (seen.has(item.action)) errors.push(`action ${item.action} is duplicated`);
    seen.add(item.action);
    if (!Number.isFinite(item.evBb)) errors.push(`action ${item.action} evBb must be finite`);
  }
  for (const action of legalActions) {
    if (!seen.has(action)) errors.push(`action ${action} is missing an EV`);
  }

  return errors;
}

export function cloneActionEvSet<Action extends string>(
  set: ActionEvSet<Action>,
): ActionEvSet<Action> {
  return {
    ...set,
    values: set.values.map((item) => ({ ...item })),
  };
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
