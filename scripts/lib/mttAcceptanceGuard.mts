/**
 * Refuse to rebuild shipped content out of families the accuracy grader withheld.
 *
 * `mtt:texas-solver-mechanical-acceptance` grades every solved family against the
 * exploitability target and records "no" for the ones that miss it. That verdict
 * is written into each family's `review-notes.md` and a decisions JSON, and until
 * now nothing read either back: the pilot gate does not consult them, nor does
 * the module builder. A family graded "no" therefore flowed into a pilot pack and
 * reached a paying player, and nobody chose that - it happened by default.
 *
 * Worse, neither record is version controlled, so the verdict exists only on the
 * machine that produced it. It cannot be enforced anywhere downstream. The one
 * place it can be enforced is here, in the pipeline that turns solver output into
 * shipped content, while the evidence is still on disk.
 *
 * This is deliberately a check, not a filter. Dropping a withheld family would
 * silently punch a hole in a pilot's SPR coverage, which is worse than shipping
 * slightly-unconverged content. The point is that a human decides, so a withheld
 * family makes the rebuild report a failure and says exactly which board missed.
 */

export type AcceptanceDecision = "scoped" | "no" | string;

export interface AcceptanceRecord {
  familyId: string;
  decision: AcceptanceDecision;
  caveats: string;
}

export interface WithheldFamily {
  familyId: string;
  /** The rules of shipped packs that draw on this family. */
  ruleIds: readonly string[];
  caveats: string;
}

/** The family a pilot rule was built from: the head of its id, upper-cased. */
export function familyIdFromRuleId(ruleId: string): string {
  return ruleId.split("-", 1)[0].toUpperCase();
}

/** A decision that is present and is not an acceptance. */
export function isWithheld(decision: AcceptanceDecision): boolean {
  const value = decision.trim().toLowerCase();
  return value.length > 0 && value !== "scoped" && value !== "yes";
}

/**
 * Which families behind these rules were withheld.
 *
 * A family with no decision at all is NOT reported: absent evidence is not a
 * withholding, and treating it as one would fail every run on a machine that has
 * not graded yet. Missing coverage is a separate concern from a failed grade.
 */
export function withheldFamiliesForRules(
  ruleIds: readonly string[],
  decisions: readonly AcceptanceRecord[],
): WithheldFamily[] {
  const byFamily = new Map<string, AcceptanceRecord>();
  for (const record of decisions) byFamily.set(record.familyId.toUpperCase(), record);

  const rulesByFamily = new Map<string, string[]>();
  for (const ruleId of ruleIds) {
    const family = familyIdFromRuleId(ruleId);
    const list = rulesByFamily.get(family) ?? [];
    list.push(ruleId);
    rulesByFamily.set(family, list);
  }

  const withheld: WithheldFamily[] = [];
  for (const [family, rules] of [...rulesByFamily].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    const record = byFamily.get(family);
    if (record === undefined || !isWithheld(record.decision)) continue;
    withheld.push({ familyId: family, ruleIds: rules, caveats: record.caveats });
  }
  return withheld;
}

/** One line per withheld family, carrying the grader's own reason. */
export function renderWithheldFamilies(withheld: readonly WithheldFamily[]): string {
  if (withheld.length === 0) return "No shipped pack draws on a withheld family.";
  return [
    `${withheld.length} shipped family(ies) were withheld by the accuracy grader `
    + "but their content is still in the rebuilt packs:",
    ...withheld.map((item) => `  ${item.familyId} (rules: ${item.ruleIds.join(", ")}): ${item.caveats}`),
    "Finish solving those boards and re-grade, or decide explicitly to ship them.",
  ].join("\n");
}
