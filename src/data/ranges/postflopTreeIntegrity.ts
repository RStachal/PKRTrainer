import { familyIdFromRuleId } from "./postflopSolvedSpr";

/**
 * Families whose shipped content is aggregated over two different solver trees.
 *
 * The library was solved by two parameter sets over time: an authoritative full
 * tree, and a reduced one produced by the memory-safe low-memory worker. The
 * reduced tree has no turn or river raise, no donk and no all-in, so it is a
 * different game rather than a coarser description of the same one. A family
 * holding boards of both kinds produces aggregates that blend the two.
 *
 * The release gate has named these families since the mixing was discovered, and
 * the roadmap records them - but only where an operator would read them. A player
 * paying to train the spot was told nothing, while being told plainly when the
 * shown SPR sits far from the solved one. This closes that gap: same shape as
 * `MTT_POSTFLOP_SOLVED_SPR`, same route to the screen.
 *
 * Derived data, kept honest by two tests: every entry must name a family that
 * actually ships, and the set must agree with what the tree-provenance audit
 * reports. When those boards are re-solved onto one tree the family leaves this
 * table and the caveat disappears on its own.
 *
 * Last reconciled with the audit on 2026-07-29: 531 full-tree boards, 46 reduced,
 * three families holding both. The third, MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH,
 * ships no rules and so is absent here by design rather than by oversight.
 */
export const MTT_POSTFLOP_MIXED_TREE_FAMILIES: readonly string[] = [
  "MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR",
  "MTT9_150BB_CO_BTN_3BP_HIGHSPR",
];

export type TreeIntegrity = "UNIFORM" | "MIXED_TREES";

/**
 * Whether a shipped rule's content came from a single solver tree.
 *
 * Returns UNIFORM for everything not named above, which is the honest default:
 * the audit classifies every board in the library, so a family absent from the
 * list has been checked rather than merely not looked at.
 */
export function treeIntegrityForRuleId(ruleId: string): TreeIntegrity {
  return MTT_POSTFLOP_MIXED_TREE_FAMILIES.includes(familyIdFromRuleId(ruleId))
    ? "MIXED_TREES"
    : "UNIFORM";
}
