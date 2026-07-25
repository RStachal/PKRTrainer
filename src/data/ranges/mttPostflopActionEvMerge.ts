import { isActionEvSetComplete } from "../../core/actionEv";
import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";

/**
 * Overlay reviewed counterfactual action EV onto a strategy pilot pack.
 *
 * Strategy and EV arrive on different clocks: the pilot's lanes and buckets come
 * from the solver's strategy export and ship first, while action EV needs a
 * separate EV-capable solve that is not available yet. When that EV does arrive -
 * validated into a candidate pack by the action-EV intake - this attaches it to
 * the matching buckets so the trainer can show EV next to the buttons without
 * regenerating the strategy itself.
 *
 * The base pack is the structural source of truth. EV is only ever an overlay: it
 * can add `actionEvs` to a bucket, never change a lane, an action, or a hand
 * class. A candidate whose structure does not line up with the base - different
 * rules, buckets, or a set of priced actions that is not exactly the rule's legal
 * actions - is reported as an error rather than silently dropped, so a stale EV
 * export cannot quietly fail to reach the buttons.
 */
export interface ActionEvMergeResult {
  pack: FlopProductionStrategyPack;
  mergedBuckets: number;
  totalBuckets: number;
  errors: string[];
}

export function mergeActionEvIntoPilotPack(
  base: FlopProductionStrategyPack,
  actionEvCandidate: FlopProductionStrategyPack,
): ActionEvMergeResult {
  const errors: string[] = [];
  const totalBuckets = base.rules.reduce((sum, rule) => sum + rule.rangeBuckets.length, 0);

  const candidateRules = new Map(actionEvCandidate.rules.map((rule) => [rule.id, rule]));
  let mergedBuckets = 0;

  const rules = base.rules.map((rule) => {
    const candidateRule = candidateRules.get(rule.id);
    if (candidateRule === undefined) {
      errors.push(`Action-EV candidate has no rule ${rule.id}.`);
      return rule;
    }
    if (candidateRule.rangeBuckets.length !== rule.rangeBuckets.length) {
      errors.push(
        `Rule ${rule.id}: candidate has ${candidateRule.rangeBuckets.length} buckets, base has ${rule.rangeBuckets.length}.`,
      );
      return rule;
    }

    const rangeBuckets = rule.rangeBuckets.map((bucket, bucketIndex) => {
      const candidateBucket = candidateRule.rangeBuckets[bucketIndex];
      if (candidateBucket.label !== bucket.label) {
        errors.push(`Rule ${rule.id} bucket ${bucketIndex}: label ${JSON.stringify(candidateBucket.label)} does not match base ${JSON.stringify(bucket.label)}.`);
        return bucket;
      }
      const actionEvs = candidateBucket.actionEvs;
      if (actionEvs === undefined) {
        errors.push(`Rule ${rule.id} bucket ${bucketIndex} (${bucket.label}): candidate carries no action EV.`);
        return bucket;
      }
      if (!isActionEvSetComplete(actionEvs, rule.actions)) {
        errors.push(`Rule ${rule.id} bucket ${bucketIndex} (${bucket.label}): action EV is not complete for actions ${rule.actions.join(",")}.`);
        return bucket;
      }
      mergedBuckets += 1;
      return { ...bucket, actionEvs };
    });

    return { ...rule, rangeBuckets };
  });

  return {
    pack: errors.length === 0 ? { ...base, rules } : base,
    mergedBuckets: errors.length === 0 ? mergedBuckets : 0,
    totalBuckets,
    errors,
  };
}
