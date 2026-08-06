import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { isWithheld, rulesByFamilyIn, familyIdFromRuleId, type AcceptanceRecord } from "./mttAcceptanceGuard.mts";
import { assessPinDrift, type PinDriftRow } from "./facingBetPinDrift.mts";
import { reviewFileName } from "./mttReviewFileNaming.mts";
import { join } from "node:path";

/**
 * The problems that can reach shipped strategy content without anyone deciding so.
 *
 * Three, and each was found the hard way.
 *
 * A family can mix the authoritative full solver tree with the reduced
 * review-only one, which makes its aggregate a blend of two different games. A
 * family can fail the accuracy grader while its content still sits in a pack,
 * because the verdict was recorded in artifacts nobody read back. And a
 * facing-bet rule trains one villain bet size, pinned from an earlier run, which
 * can stop being the size the solver actually uses most.
 *
 * The rebuild pipeline reports both, but that is the wrong and only place: the
 * decision to ship is made at the release gates, and a library can be shipped
 * without a rebuild ever running. So the questions live here, asked the same way
 * by whoever needs them.
 */

const ACCEPTANCE_DECISIONS = "artifacts/texas-solver-review-protocol/mechanical-acceptance-decisions.json";

/** Families whose boards sit on both trees at once, per the provenance audit. */
export function mixedTreeFamilies(): Set<string> {
  try {
    // Spawned directly rather than through `npm run` with a shell: the shell
    // option makes Node emit a deprecation warning on stderr, and callers of this
    // are gates whose tests hold them to producing none.
    const output = execFileSync(process.execPath, [
      "scripts/run-cli.mjs",
      "scripts/auditTexasSolverTreeProvenance.mts",
      "--json",
    ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const start = output.indexOf("{");
    if (start < 0) return new Set();
    const report = JSON.parse(output.slice(start)) as {
      families?: Array<{ familyId?: unknown; fullTree?: unknown; reducedTree?: unknown }>;
    };
    const mixed = new Set<string>();
    for (const row of report.families ?? []) {
      if (Number(row.fullTree) > 0 && Number(row.reducedTree) > 0) mixed.add(String(row.familyId).toUpperCase());
    }
    return mixed;
  } catch {
    // A risk we cannot measure is reported as absent rather than as a failure:
    // these callers describe the library, they do not gate on tooling working.
    return new Set();
  }
}

/** Families the accuracy grader refused, keyed by family, with its reason. */
export function withheldFamilies(): Map<string, string> {
  if (!existsSync(ACCEPTANCE_DECISIONS)) return new Map();
  try {
    const parsed = JSON.parse(readFileSync(ACCEPTANCE_DECISIONS, "utf8")) as { decisions?: AcceptanceRecord[] };
    const withheld = new Map<string, string>();
    for (const record of parsed.decisions ?? []) {
      if (isWithheld(record.decision)) withheld.set(record.familyId.toUpperCase(), record.caveats);
    }
    return withheld;
  } catch {
    return new Map();
  }
}

const SOLVER_OUTPUT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

export interface ShippedContentRisks {
  mixedTreeRules: Map<string, string[]>;
  withheldRules: Map<string, string[]>;
  driftedPins: PinDriftRow[];
  /** One sentence per risk, empty when the library is clean. */
  limits: string[];
}

/**
 * Which shipped rules carry each risk. Rule ids come from the caller so this
 * works from a loaded pack as easily as from the generated modules on disk.
 */
export function shippedContentRisks(ruleIds: readonly string[]): ShippedContentRisks {
  const mixed = mixedTreeFamilies();
  const mixedTreeRules = rulesByFamilyIn(ruleIds, mixed);
  const withheldRules = rulesByFamilyIn(ruleIds, new Set(withheldFamilies().keys()));

  // A facing-bet rule trains one villain bet size, pinned from an earlier run.
  // Only genuinely judged drift counts: a family still spanning both trees is
  // reported as unjudged and must not be presented as a finding.
  const driftedPins = ruleIds.flatMap((ruleId) => {
    const familyId = familyIdFromRuleId(ruleId);
    const row = assessPinDrift({
      ruleId,
      familyId,
      villainReviewPath: join(SOLVER_OUTPUT_ROOT, familyId, reviewFileName("CHECK")),
      familyMixesTrees: mixed.has(familyId),
    });
    return row !== null && row.verdict === "DRIFTED" ? [row] : [];
  });

  const limits: string[] = [];
  if (mixedTreeRules.size > 0) {
    const rules = [...mixedTreeRules.values()].flat();
    limits.push(
      `${rules.length} of ${ruleIds.length} shipped rules come from ${mixedTreeRules.size} family(ies) `
      + "that still mix the full and reduced solver trees, so those aggregates blend two different "
      + `games: ${[...mixedTreeRules.keys()].join(", ")}. Their boards are queued for re-solve.`,
    );
  }
  if (withheldRules.size > 0) {
    const rules = [...withheldRules.values()].flat();
    limits.push(
      `${rules.length} of ${ruleIds.length} shipped rules come from ${withheldRules.size} family(ies) `
      + "the accuracy grader withheld for missing the exploitability target: "
      + `${[...withheldRules.keys()].join(", ")}.`,
    );
  }
  if (driftedPins.length > 0) {
    limits.push(
      `${driftedPins.length} of ${ruleIds.length} shipped rules face a villain bet size that is `
      + "no longer the one the solver uses most: "
      + driftedPins.map((row) => (
        `${row.ruleId} trains ${row.pinnedAction} at ${(row.pinnedFrequency * 100).toFixed(1)}% `
        + `where ${row.topAction} is used ${(row.topFrequency * 100).toFixed(1)}%`
        // Without this the reader takes every drift for the same thing. Where no
        // size carries a majority of the villain's bets, re-pinning raises the
        // number and leaves the spot as it was; that is worth doing on the next
        // rebuild and is not worth holding a release for.
        + (row.betSizingIsSplit
          ? ` (no size carries a majority of the villain's bets; the top is ${(row.topShareOfBets * 100).toFixed(0)}% of them, so re-pinning changes the number more than the spot)`
          : "")
      )).join("; ") + ".",
    );
  }
  return { mixedTreeRules, withheldRules, driftedPins, limits };
}
