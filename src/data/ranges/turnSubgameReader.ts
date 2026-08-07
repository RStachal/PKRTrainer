import type { HandLabel } from "../../core/types";

/**
 * Read a solved turn subgame into the shape a strategy pack needs.
 *
 * The night window has produced 35,144 of these across 261 boards and nothing
 * reads them - there is no converter, no pack builder, no import slot, so the
 * path from a solved subgame to a player does not exist. This is the first piece
 * of that path, and it is deliberately the piece that can be checked against the
 * real files before anything is built on top.
 *
 * ## What a subgame holds
 *
 * An action node carries the actions available, and a strategy table mapping
 * every concrete combination the player can hold to a frequency for each action,
 * in the same order:
 *
 * ```
 *   actions:  ["CHECK", "BET 33.000000", "BET 75.000000", "BET 625.000000"]
 *   strategy: { "2h2d": [0.00, 0.22, 0.78, 0.00], ... }   // 295 combinations
 * ```
 *
 * ## What a pack needs
 *
 * Range buckets keyed by hand *class* - 295 combinations become 169 classes at
 * most - each with an action and a frequency mix. So the work is grouping
 * combinations into classes and averaging their frequencies.
 *
 * The averaging is plain rather than weighted, and that is a real choice. A
 * solver gives 4c3c and 4d3d different frequencies because the board makes them
 * different hands; a class that merges them is already an approximation, and
 * weighting one combination over another inside the class would be inventing a
 * preference the class cannot express. The count is reported so a caller can see
 * how thin any class is.
 */

/** A solved node exactly as the decomposition writes it. */
export interface TurnSubgameNode {
  node_type?: string;
  player?: number;
  actions?: readonly string[];
  strategy?: { actions?: readonly string[]; strategy?: Readonly<Record<string, readonly number[]>> };
}

export interface TurnActionFrequency {
  /** The solver's own action label, e.g. "BET 75.000000". */
  action: string;
  frequency: number;
}

export interface TurnClassStrategy {
  handClass: HandLabel;
  /** Combinations of this class present in the subgame. */
  combos: number;
  /** Frequencies per action, in the node's action order, averaged over combos. */
  mix: readonly TurnActionFrequency[];
  /** The action with the highest averaged frequency. */
  dominantAction: string;
}

export interface TurnSubgameStrategy {
  actions: readonly string[];
  classes: readonly TurnClassStrategy[];
  /** Combinations read, before grouping. */
  combosRead: number;
}

const RANK_ORDER = "23456789TJQKA";

/**
 * The class a concrete two-card holding belongs to.
 *
 * `2h2d` is a pair, `4c3c` suited, `4c3d` offsuit, and the higher rank leads -
 * the same spelling the rest of the project uses, so a class read here can be
 * looked up anywhere else without translation.
 */
export function handClassOf(combo: string): HandLabel | undefined {
  if (combo.length !== 4) return undefined;
  const [firstRank, firstSuit, secondRank, secondSuit] = combo;
  const high = RANK_ORDER.indexOf(firstRank.toUpperCase());
  const low = RANK_ORDER.indexOf(secondRank.toUpperCase());
  if (high < 0 || low < 0) return undefined;
  if (high === low) return `${RANK_ORDER[high]}${RANK_ORDER[low]}` as HandLabel;
  const [hi, lo] = high > low ? [high, low] : [low, high];
  const suited = firstSuit === secondSuit ? "s" : "o";
  return `${RANK_ORDER[hi]}${RANK_ORDER[lo]}${suited}` as HandLabel;
}

/**
 * Group a solved node's per-combination strategy into per-class strategy.
 *
 * Returns undefined for anything that is not an action node with a strategy
 * table, rather than an empty result - a subgame that cannot be read is
 * different from one that says nothing, and only the first is a problem.
 */
export function readTurnSubgame(node: TurnSubgameNode): TurnSubgameStrategy | undefined {
  const actions = node.actions ?? node.strategy?.actions;
  const table = node.strategy?.strategy;
  if (actions === undefined || actions.length === 0 || table === undefined) return undefined;

  const totals = new Map<HandLabel, { sums: number[]; combos: number }>();
  let combosRead = 0;

  for (const [combo, frequencies] of Object.entries(table)) {
    if (frequencies.length !== actions.length) continue;
    const handClass = handClassOf(combo);
    if (handClass === undefined) continue;
    combosRead += 1;
    const existing = totals.get(handClass) ?? { sums: new Array(actions.length).fill(0), combos: 0 };
    for (let index = 0; index < actions.length; index += 1) {
      existing.sums[index] += frequencies[index];
    }
    existing.combos += 1;
    totals.set(handClass, existing);
  }

  if (combosRead === 0) return undefined;

  const classes: TurnClassStrategy[] = [];
  for (const [handClass, { sums, combos }] of totals) {
    const mix = sums.map((sum, index) => ({
      action: actions[index],
      // Rounded to a tenth of a percent. The solver writes values like 4.9e-08,
      // which are zero in any sense a player cares about and only make a
      // frequency list unreadable.
      frequency: Math.round((sum / combos) * 1000) / 1000,
    }));
    const dominant = mix.reduce((best, item) => (item.frequency > best.frequency ? item : best));
    classes.push({ handClass, combos, mix, dominantAction: dominant.action });
  }

  classes.sort((left, right) => left.handClass.localeCompare(right.handClass));
  return { actions: [...actions], classes, combosRead };
}

/**
 * Every hand class that plays one action most often.
 *
 * This is the range bucket a pack wants: a list of classes sharing a dominant
 * action. What it is not is a claim that the action is pure - the mix is kept on
 * each class so a bucket can carry the frequencies rather than flatten them,
 * which is the difference between teaching a strategy and teaching a rule.
 */
export function classesByDominantAction(
  strategy: TurnSubgameStrategy,
): ReadonlyMap<string, readonly TurnClassStrategy[]> {
  const grouped = new Map<string, TurnClassStrategy[]>();
  for (const entry of strategy.classes) {
    const bucket = grouped.get(entry.dominantAction) ?? [];
    bucket.push(entry);
    grouped.set(entry.dominantAction, bucket);
  }
  return grouped;
}
