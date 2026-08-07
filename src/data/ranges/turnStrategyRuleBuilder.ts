import type { HandLabel } from "../../core/types";
import {
  parseTurnFamilyId,
  positionPatternForFamily,
  type TurnFamilyId,
} from "./turnFamilyId";
import {
  classesByDominantAction,
  readTurnSubgame,
  type TurnActionFrequency,
  type TurnSubgameNode,
} from "./turnSubgameReader";

/**
 * Turn a solved subgame into the rule a strategy pack would hold.
 *
 * Third and last piece of the path from the night solver to a player. The reader
 * turns one node's per-combination strategy into per-class strategy; the family
 * parser says which spot the directory was solved for; this joins them into the
 * shape `FlopProductionStrategyPack` already uses one street earlier - a rule
 * keyed by position pattern, node and depth, holding range buckets of hand
 * classes with an action and a frequency mix.
 *
 * ## What this deliberately does not do
 *
 * It does not write a pack, register an import slot or reach the resolver. Those
 * steps decide what a player is *shown*, and shipping 4.2 GB of solver output
 * into the product on the strength of a first read would be exactly the kind of
 * unreviewed promotion the provenance discipline here exists to prevent - the
 * flop packs went through a review gate and these have had none.
 *
 * What it does is make the data reviewable: a rule per subgame, with the
 * frequencies intact and the solver's own action labels preserved, so the
 * content can be inspected before anybody decides it is production.
 *
 * ## Bet sizes stay as the solver wrote them
 *
 * The solver labels actions `BET 33.000000`, `BET 625.000000` and so on - a size
 * in chips, not a fraction of the pot. Translating those into the product's
 * vocabulary needs the pot at that node, which lives in the parent, and guessing
 * the mapping would relabel a quarter-pot bet as a pot-sized one. The label is
 * carried through untranslated and the translation is left to whoever wires the
 * resolver, with the pot in hand.
 */

export interface TurnRangeBucket {
  /** The solver's own action label, untranslated. */
  action: string;
  handClasses: readonly HandLabel[];
  /** Combined weight of the classes here, in combinations. */
  combos: number;
  /** Frequency mix averaged over the bucket's classes. */
  mix: readonly TurnActionFrequency[];
}

export interface TurnStrategyRule {
  /** Directory name, so a rule can always be traced back to its solve. */
  sourceDirectory: string;
  familyId: string;
  positionPattern: string;
  node: TurnFamilyId["node"];
  potType: TurnFamilyId["potType"];
  stackBB: number;
  sprBand?: TurnFamilyId["sprBand"];
  heroOutOfPosition: boolean;
  board?: string;
  /** The node's actions, in the order the frequencies use. */
  actions: readonly string[];
  buckets: readonly TurnRangeBucket[];
  /** Hand classes read, before bucketing. */
  classCount: number;
}

const COMBOS = (handClass: string) => (
  handClass.length === 2 ? 6 : handClass.endsWith("s") ? 4 : 12
);

/**
 * Build one rule from a solved node and the directory it came from.
 *
 * Returns undefined when either half is unreadable, rather than a rule with
 * gaps. A rule missing its position pattern would be filed under nothing; one
 * missing its strategy would teach nothing - and a half-built rule that reaches
 * a pack is harder to notice than an absent one.
 */
export function buildTurnStrategyRule(
  directoryName: string,
  node: TurnSubgameNode,
): TurnStrategyRule | undefined {
  const family = parseTurnFamilyId(directoryName);
  if (family === undefined) return undefined;
  const strategy = readTurnSubgame(node);
  if (strategy === undefined) return undefined;

  const buckets: TurnRangeBucket[] = [];
  for (const [action, classes] of classesByDominantAction(strategy)) {
    const handClasses = classes.map((entry) => entry.handClass);
    const combos = handClasses.reduce((sum, hand) => sum + COMBOS(hand), 0);
    // Averaged across the bucket's classes, weighted by how many combinations
    // each class is worth. A bucket holding one pair and twelve offsuit hands is
    // mostly the offsuit hands, and an unweighted mean would say otherwise.
    const mix = strategy.actions.map((label, index) => {
      let weighted = 0;
      for (const entry of classes) {
        weighted += (entry.mix[index]?.frequency ?? 0) * COMBOS(entry.handClass);
      }
      return { action: label, frequency: Math.round((weighted / combos) * 1000) / 1000 };
    });
    buckets.push({ action, handClasses, combos, mix });
  }

  // Widest bucket first: the action most of the range takes is the one a reader
  // wants to see before the exceptions.
  buckets.sort((left, right) => right.combos - left.combos);

  return {
    sourceDirectory: directoryName,
    familyId: family.familyId,
    positionPattern: positionPatternForFamily(family),
    node: family.node,
    potType: family.potType,
    stackBB: family.stackBB,
    ...(family.sprBand ? { sprBand: family.sprBand } : {}),
    heroOutOfPosition: family.heroOutOfPosition,
    ...(family.board ? { board: family.board } : {}),
    actions: strategy.actions,
    buckets,
    classCount: strategy.classes.length,
  };
}

/**
 * Whether a rule is coherent enough to be worth reviewing.
 *
 * Not whether it is correct - nothing here can judge that - but whether it says
 * something complete. A rule failing these is a reading error rather than a
 * strategy anyone would disagree with.
 */
export function turnStrategyRuleProblems(rule: TurnStrategyRule): string[] {
  const problems: string[] = [];
  if (rule.buckets.length === 0) problems.push("no range buckets");
  if (rule.actions.length < 2) problems.push("fewer than two actions, so nothing was chosen");

  const seen = new Set<string>();
  for (const bucket of rule.buckets) {
    if (bucket.handClasses.length === 0) problems.push(`${bucket.action}: empty bucket`);
    for (const hand of bucket.handClasses) {
      // A class in two buckets would mean two dominant actions for one hand.
      if (seen.has(hand)) problems.push(`${hand} appears in more than one bucket`);
      seen.add(hand);
    }
    const total = bucket.mix.reduce((sum, item) => sum + item.frequency, 0);
    if (total < 0.95 || total > 1.05) {
      problems.push(`${bucket.action}: frequencies sum to ${total.toFixed(3)}`);
    }
    if (!rule.actions.includes(bucket.action)) {
      problems.push(`${bucket.action}: not among the node's actions`);
    }
  }
  return problems;
}
