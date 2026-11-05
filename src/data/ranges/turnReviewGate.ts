import { parseTurnFamilyId, positionPatternForFamily } from "./turnFamilyId";
import { turnStrategyRuleProblems, type TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * What a solved turn family has to satisfy before anyone decides it is content.
 *
 * 4.2 GB of solver output exists and no path carries it to a player. The missing
 * step is not a converter - that is built - but a decision, and the decision
 * needs criteria that can be checked rather than felt. This is those criteria.
 *
 * ## Four tiers, cheapest first
 *
 * Each tier is a different kind of doubt, and they are ordered so a family fails
 * on the cheapest question it fails at rather than after the most expensive one.
 *
 * 1. **Traceable** - the directory name parses into a spot. There is no manifest
 *    tying a solve to a situation, so a family whose name cannot be read has
 *    lost the only record of what it is about, and nothing downstream can
 *    recover it.
 *
 * 2. **Complete** - every subgame the plan listed was actually written. This is
 *    the tier that earns its place: `MTT9_40BB_UTG_BB_SRP` planned 2,152 items
 *    and wrote 2,010, so 142 turn lines have no strategy. A pack built from it
 *    would answer most turns and silently fall through on the rest, which is
 *    worse than not shipping it, because the gap is invisible from the outside.
 *
 * 3. **Converged** - the decomposition's own `coverageAchieved` reached its
 *    target. This is the solver grading itself and is taken at face value; the
 *    gate's job is to notice when the number is absent or short, not to second
 *    guess how it was computed.
 *
 * 4. **Coherent** - the rules built from it hold together: frequencies sum to
 *    one, no hand class in two buckets, every bucket action among the node's
 *    actions. A failure here is a reading error rather than a strategy anyone
 *    would disagree with.
 *
 * ## What this gate deliberately does not judge
 *
 * Whether the strategy is *good*. Nothing here can tell a well-solved spot from
 * a badly-specified one - a tree missing a bet size converges beautifully to the
 * wrong game. That judgement needs a player, and the gate's purpose is to make
 * sure only the families worth a player's time reach one.
 */

export type TurnReviewTier = "TRACEABLE" | "COMPLETE" | "CONVERGED" | "COHERENT";

export interface TurnFamilyEvidence {
  familyId: string;
  /** Boards with a written plan. */
  boards: number;
  /**
   * Boards the family has a monolithic checkpoint for, planned or not.
   *
   * Bez tohohle čísla brána tvrdila COMPLETE i rodině, které se rozložila
   * polovina desek. `MTT9_40BB_UTG_BB_SRP` má dvacet sedm checkpointů a třináct
   * plánů, a projde - protože se ptala jen na to, jestli se zapsalo všechno, co
   * plán vyjmenoval. Deska bez plánu v žádném plánu není, takže ji nic nehledá.
   */
  boardsWithCheckpoint?: number;
  /** Subgames the plans listed. */
  plannedItems: number;
  /** Subgame files actually written. */
  writtenItems: number;
  /** Lowest `coverageAchieved` across the family's boards. */
  minCoverage: number;
  /** The target those plans were run against. */
  coverageTarget: number;
  /** Rules built for inspection, however many the caller chose to build. */
  sampledRules: readonly TurnStrategyRule[];
}

export interface TurnReviewFinding {
  tier: TurnReviewTier;
  detail: string;
}

export interface TurnReviewVerdict {
  familyId: string;
  positionPattern?: string;
  /** True when every tier passed and a reviewer's time is not being wasted. */
  readyForReview: boolean;
  /** The first tier that failed, when one did. */
  failedTier?: TurnReviewTier;
  findings: readonly TurnReviewFinding[];
  /** Share of planned subgames actually written, 0 to 1. */
  completeness: number;
  /** Share of available boards that were planned at all, 0 to 1. */
  boardCoverage: number;
}

/** Coverage the decomposition is run against; below this a board is unconverged. */
export const TURN_COVERAGE_TARGET = 0.99;

/**
 * Judge one family's evidence.
 *
 * Stops at the first failed tier. A family that cannot be traced does not need
 * its frequencies checked, and reporting four failures where one caused the
 * others makes the real problem harder to see.
 */
export function reviewTurnFamily(evidence: TurnFamilyEvidence): TurnReviewVerdict {
  const findings: TurnReviewFinding[] = [];
  const completeness = evidence.plannedItems === 0
    ? 0
    : evidence.writtenItems / evidence.plannedItems;

  const available = evidence.boardsWithCheckpoint ?? evidence.boards;
  const boardCoverage = available === 0 ? 0 : Math.min(1, evidence.boards / available);

  const family = parseTurnFamilyId(`${evidence.familyId}__probe`);
  if (family === undefined) {
    findings.push({
      tier: "TRACEABLE",
      detail: `family name does not parse, so the spot it was solved for is unrecoverable`,
    });
    return { familyId: evidence.familyId, readyForReview: false, failedTier: "TRACEABLE", findings, completeness, boardCoverage };
  }
  const positionPattern = positionPatternForFamily(family);

  if (evidence.boards === 0) {
    findings.push({ tier: "COMPLETE", detail: "no boards with a plan" });
    return { familyId: evidence.familyId, positionPattern, readyForReview: false, failedTier: "COMPLETE", findings, completeness, boardCoverage };
  }
  if (evidence.writtenItems < evidence.plannedItems) {
    const missing = evidence.plannedItems - evidence.writtenItems;
    findings.push({
      tier: "COMPLETE",
      detail: `${missing} of ${evidence.plannedItems} planned subgames were never written, so ${missing} turn lines have no strategy`,
    });
    return { familyId: evidence.familyId, positionPattern, readyForReview: false, failedTier: "COMPLETE", findings, completeness, boardCoverage };
  }

  // Nerozložené desky se hlásí, ale rodinu neblokují.
  //
  // Pack odpovídá jen na desky, které vyřešil, a na ostatní se přizná - takže
  // třináct desek z dvaceti sedmi není špatný obsah, jen užší. Blokovat by
  // znamenalo stáhnout obsah, který funguje. Mlčet by znamenalo tvrdit COMPLETE
  // o rodině, které chybí polovina board space, a to je horší.
  if (boardCoverage < 1) {
    const missing = available - evidence.boards;
    findings.push({
      tier: "COMPLETE",
      detail: `${missing} z ${available} desek nemá plán, takže rodina pokrývá ${(boardCoverage * 100).toFixed(0)} % dostupného board space`,
    });
  }

  if (evidence.minCoverage < evidence.coverageTarget) {
    findings.push({
      tier: "CONVERGED",
      detail: `lowest board coverage ${evidence.minCoverage.toFixed(3)} is under the ${evidence.coverageTarget} target`,
    });
    return { familyId: evidence.familyId, positionPattern, readyForReview: false, failedTier: "CONVERGED", findings, completeness, boardCoverage };
  }

  for (const rule of evidence.sampledRules) {
    for (const problem of turnStrategyRuleProblems(rule)) {
      findings.push({ tier: "COHERENT", detail: `${rule.sourceDirectory}: ${problem}` });
    }
    // A rule whose pattern disagrees with its family means the directory and the
    // parse have drifted apart, and everything filed under it would be misfiled.
    if (rule.positionPattern !== positionPattern) {
      findings.push({
        tier: "COHERENT",
        detail: `${rule.sourceDirectory}: pattern ${rule.positionPattern} does not match the family's ${positionPattern}`,
      });
    }
  }
  // Blokuje jen nesoudržnost, ne hlášení o šířce.
  //
  // Nález o nerozložených deskách je informace, ne vada, a leží ve stejném poli
  // jako vady - takže test na "jsou tu nějaké nálezy" by rodinu shodil za to, že
  // o sobě řekla pravdu. Kontroluje se proto tier, ne počet.
  if (findings.some((finding) => finding.tier === "COHERENT")) {
    return { familyId: evidence.familyId, positionPattern, readyForReview: false, failedTier: "COHERENT", findings, completeness, boardCoverage };
  }

  return { familyId: evidence.familyId, positionPattern, readyForReview: true, findings, completeness, boardCoverage };
}

/** One line per family, ordered worst first so what needs attention leads. */
export function renderTurnReviewReport(verdicts: readonly TurnReviewVerdict[]): string {
  const ordered = [...verdicts].sort((left, right) => {
    if (left.readyForReview !== right.readyForReview) return left.readyForReview ? 1 : -1;
    return left.completeness - right.completeness;
  });
  const lines = [
    "Turn solver review gate",
    `families: ${verdicts.length}`,
    `ready for review: ${verdicts.filter((item) => item.readyForReview).length}`,
    "",
  ];
  for (const verdict of ordered) {
    const status = verdict.readyForReview ? "READY" : `BLOCKED at ${verdict.failedTier}`;
    lines.push(`${verdict.familyId}  ${status}  complete ${(verdict.completeness * 100).toFixed(1)}%`);
    for (const finding of verdict.findings.slice(0, 3)) lines.push(`    ${finding.detail}`);
  }
  return lines.join("\n");
}
