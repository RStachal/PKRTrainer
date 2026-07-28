import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { isWithheld, rulesByFamilyIn, type AcceptanceRecord } from "./mttAcceptanceGuard.mts";

/**
 * The two family-level problems that can reach shipped strategy content.
 *
 * Both were found the hard way. A family can mix the authoritative full solver
 * tree with the reduced review-only one, which makes its aggregate a blend of two
 * different games; and a family can fail the accuracy grader while its content
 * still sits in a pack, because the verdict was recorded in artifacts nobody read
 * back.
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
      "node_modules/vite-node/vite-node.mjs",
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

export interface ShippedContentRisks {
  mixedTreeRules: Map<string, string[]>;
  withheldRules: Map<string, string[]>;
  /** One sentence per risk, empty when the library is clean. */
  limits: string[];
}

/**
 * Which shipped rules carry each risk. Rule ids come from the caller so this
 * works from a loaded pack as easily as from the generated modules on disk.
 */
export function shippedContentRisks(ruleIds: readonly string[]): ShippedContentRisks {
  const mixedTreeRules = rulesByFamilyIn(ruleIds, mixedTreeFamilies());
  const withheldRules = rulesByFamilyIn(ruleIds, new Set(withheldFamilies().keys()));

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
  return { mixedTreeRules, withheldRules, limits };
}
