import type { AnteMode } from "../../core/types";
import type { BlindSpeed, EvModel, GameVariant, TableFormat } from "../../core/trainingProfile";
import { reviewTurnFamily, type TurnFamilyEvidence } from "./turnReviewGate";
import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * A turn strategy pack, and the rule that only review-ready families enter one.
 *
 * The flop side ships `FlopProductionStrategyPack`: rules keyed by node,
 * position pattern, texture and SPR band, each holding range buckets. This is
 * the same idea one street later, built from the night solver's own output
 * rather than from a chart.
 *
 * ## Provenance is a field, not a footnote
 *
 * The flop packs learned this the hard way - the product must never present a
 * heuristic answer as solver-backed, and the check has to be structural rather
 * than inferred from wording, because rephrasing a sentence should not relabel
 * anybody's content. A turn pack carries the same distinction from the start,
 * plus the thing the flop packs cannot: every rule names the directory it was
 * solved in, so any answer a player sees can be traced to the run that produced
 * it.
 *
 * ## The gate is enforced here, not left to the caller
 *
 * `buildTurnStrategyPack` refuses a family the review gate has not passed. That
 * is deliberate: a builder that accepts anything and trusts its caller to have
 * checked is how 142 missing subgames become a pack that answers most turns and
 * falls silently through the rest. The refusal is a returned reason rather than
 * a throw, so a caller assembling several families reports which ones were left
 * out instead of dying on the first.
 */

export type TurnStrategyProvenance = "SOLVER_BACKED";

export interface TurnStrategyPackDimensions {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeeds: readonly BlindSpeed[];
  street: "TURN";
  evModel: EvModel;
  antes: readonly AnteMode[];
}

export interface TurnStrategyPack {
  id: string;
  version: string;
  createdAt: string;
  /** Every rule here came from a solve, and the gate agreed it was worth reading. */
  provenance: TurnStrategyProvenance;
  /** LOW until a player has reviewed the content; the gate checks shape, not poker. */
  confidence: "LOW" | "MEDIUM" | "HIGH";
  dimensions: TurnStrategyPackDimensions;
  /** Families included, so a reader can see the scope without counting rules. */
  familyIds: readonly string[];
  assumptions: readonly string[];
  rules: readonly TurnStrategyRule[];
}

export interface TurnPackBuildInput {
  id: string;
  createdAt: string;
  evidence: TurnFamilyEvidence;
  /** Every rule built for this family, not just the sample the gate inspected. */
  rules: readonly TurnStrategyRule[];
}

export type TurnPackBuildResult =
  | { ok: true; pack: TurnStrategyPack }
  | { ok: false; reason: string };

/**
 * Build a pack from one family, or say why not.
 *
 * The confidence is LOW and stays LOW. The review gate checks that a family is
 * traceable, complete, converged and coherent - none of which is a statement
 * about whether the strategy is any good. A tree missing a bet size converges
 * beautifully to the wrong game, and only a player can see that, so the pack
 * says LOW until one has.
 */
export function buildTurnStrategyPack(input: TurnPackBuildInput): TurnPackBuildResult {
  const verdict = reviewTurnFamily(input.evidence);
  if (!verdict.readyForReview) {
    const first = verdict.findings[0]?.detail ?? "no detail";
    return { ok: false, reason: `${input.evidence.familyId} blocked at ${verdict.failedTier}: ${first}` };
  }
  if (input.rules.length === 0) {
    return { ok: false, reason: `${input.evidence.familyId} passed the gate but produced no rules` };
  }

  const mismatched = input.rules.find((rule) => rule.familyId !== input.evidence.familyId);
  if (mismatched !== undefined) {
    // A rule from another family would ship one solve's strategy under another's
    // name, which is the failure mode nothing downstream can detect.
    return {
      ok: false,
      reason: `${input.evidence.familyId}: rule from ${mismatched.familyId} in the same pack`,
    };
  }

  const first = input.rules[0];
  return {
    ok: true,
    pack: {
      id: input.id,
      version: "turn-solved-v1",
      createdAt: input.createdAt,
      provenance: "SOLVER_BACKED",
      confidence: "LOW",
      dimensions: {
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeeds: ["REGULAR"],
        street: "TURN",
        evModel: "CHIP_EV",
        antes: ["OFF", "ON"],
      },
      familyIds: [input.evidence.familyId],
      assumptions: [
        `Built from ${input.rules.length} solved turn subgames across ${input.evidence.boards} boards.`,
        ...(verdict.boardCoverage < 1 ? [
          `Rodina pokrývá ${(verdict.boardCoverage * 100).toFixed(0)} % dostupných desek; zbytek zatím nebyl rozložen a pack na něj neodpovídá.`,
        ] : []),
        `Position pattern ${verdict.positionPattern}, ${first.node}, ${first.stackBB}BB effective.`,
        "Bet sizes carry the solver's own labels in chips; translating them needs the pot at the node.",
        "Frequencies within a hand class are averaged across its combinations, so a class cannot express a preference between them.",
        "Confidence stays LOW until a player reviews the content: the gate checks shape, not whether the strategy is good.",
        `Every rule names the directory it was solved in, so any answer can be traced to its run.`,
      ],
      rules: input.rules,
    },
  };
}

/** Rules whose stated stack depth falls inside a bucket, for resolver lookup. */
export function turnRulesForDepth(
  pack: TurnStrategyPack,
  effectiveStackBB: number,
  toleranceBB = 10,
): TurnStrategyRule[] {
  return pack.rules.filter((rule) => Math.abs(rule.stackBB - effectiveStackBB) <= toleranceBB);
}
