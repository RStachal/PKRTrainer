import { describe, expect, it } from "vitest";

import { generatedMttPostflopPilotPacks } from "../../src/data/ranges/mttPostflopPilotPacks.generated";

/**
 * What the postflop pilot packs must not contradict about themselves.
 *
 * The preflop table was audited this way and six defect classes came out of it,
 * so the same technique is pointed at postflop. Seven packs, nineteen rules, 972
 * range buckets.
 *
 * All four properties held on the first run, which is a statement about the
 * packs rather than about the audit - the same scan on preflop did not come back
 * clean.
 *
 * One check is deliberately guarded rather than asserted. Whether a bucket's
 * recommended action matches its own best expected value cannot be tested,
 * because **no bucket carries expected value at all**: 972 of 972 have none. The
 * check would pass by finding nothing, which is how a guard goes quiet without
 * anyone noticing, so instead the absence is asserted directly. When solver
 * exports start carrying EV the count changes, this test fails, and the real
 * comparison replaces it.
 *
 * What postflop does carry is action frequencies, on every bucket and marked
 * EXACT, so a player is shown the actual mix rather than a list of action names.
 * That is the postflop counterpart of the preflop EV bubbles.
 */

interface Bucket {
  label: string;
  action: string;
  handClasses?: readonly string[];
  actionMix?: readonly { action: string; frequencyPct: number; visibility: string }[];
  actionEvs?: { values?: readonly { action: string; evBb: number }[] };
}

interface Rule {
  id: string;
  sprMin: number;
  sprMax: number;
  actions: readonly string[];
  recommendedAction: string;
  rangeBuckets: readonly Bucket[];
}

function everyRule(): { packId: string; rule: Rule }[] {
  return generatedMttPostflopPilotPacks.flatMap((entry) => {
    const pack = entry.pack as unknown as { id: string; rules: readonly Rule[] };
    return pack.rules.map((rule) => ({ packId: pack.id, rule }));
  });
}

function everyBucket(): { packId: string; rule: Rule; bucket: Bucket }[] {
  return everyRule().flatMap(({ packId, rule }) => (
    rule.rangeBuckets.map((bucket) => ({ packId, rule, bucket }))
  ));
}

describe("postflop pack invariants", () => {
  it("covers enough rules and buckets for the results to mean something", () => {
    expect(everyRule().length).toBeGreaterThan(15);
    expect(everyBucket().length).toBeGreaterThan(500);
  });

  it("has action frequencies that sum to a whole strategy", () => {
    const bad: string[] = [];
    for (const { packId, rule, bucket } of everyBucket()) {
      if (!bucket.actionMix?.length) continue;
      const sum = bucket.actionMix.reduce((total, item) => total + item.frequencyPct, 0);
      // A point and a half of slack for rounding in the export; more than that
      // is a mix that does not describe a complete strategy.
      if (Math.abs(sum - 100) > 1.5) {
        bad.push(`${packId}/${rule.id}/${bucket.label}: ${sum.toFixed(1)}%`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("never puts one hand in two buckets with different actions", () => {
    // The same holding cannot be both a bet and a check in the same node, or the
    // trainer marks a player wrong for the answer it also recommends.
    const bad: string[] = [];
    for (const { packId, rule } of everyRule()) {
      const assigned = new Map<string, string>();
      for (const bucket of rule.rangeBuckets) {
        for (const hand of bucket.handClasses ?? []) {
          const previous = assigned.get(hand);
          if (previous !== undefined && previous !== bucket.action) {
            bad.push(`${packId}/${rule.id}: ${hand} is ${previous} and ${bucket.action}`);
          }
          assigned.set(hand, bucket.action);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("gives every rule a stack-depth window that exists", () => {
    for (const { packId, rule } of everyRule()) {
      expect(rule.sprMin, `${packId}/${rule.id}`).toBeLessThan(rule.sprMax);
      expect(rule.sprMin).toBeGreaterThanOrEqual(0);
    }
  });

  it("recommends only an action the rule offers", () => {
    for (const { packId, rule } of everyRule()) {
      expect(rule.actions, `${packId}/${rule.id}`).toContain(rule.recommendedAction);
    }
    for (const { packId, rule, bucket } of everyBucket()) {
      expect(rule.actions, `${packId}/${rule.id}/${bucket.label}`).toContain(bucket.action);
    }
  });

  it("shows the player exact frequencies rather than action names alone", () => {
    const withMix = everyBucket().filter(({ bucket }) => bucket.actionMix?.length);
    expect(withMix.length).toBeGreaterThan(500);
    const exact = withMix.filter(({ bucket }) => (
      bucket.actionMix!.every((item) => item.visibility === "EXACT")
    ));
    // Postflop's counterpart of the preflop EV bubbles: a number, not a label.
    expect(exact.length).toBe(withMix.length);
  });

  it("carries no postflop expected value yet, and says so rather than checking nothing", () => {
    // Guarding the guard. A comparison of recommended action against best EV
    // would pass trivially while this is zero, so the zero is what is asserted.
    // When solver exports begin carrying EV this fails, and the comparison it is
    // standing in for should replace it.
    const withEv = everyBucket().filter(({ bucket }) => bucket.actionEvs?.values?.length);
    expect(withEv.length).toBe(0);
  });
});
