/**
 * How a TexasSolver strategy review is named on disk.
 *
 * The extractor walks a node history - a list of actions - to reach the node it
 * exports, and names the file after that path. A root export walks nowhere, so
 * it has an empty history and carries no infix at all.
 *
 * That asymmetry is easy to get wrong from the outside, because draft
 * directories label the root case with the word "ROOT". Treating that label as
 * if it were an action produces two failures at once: the extractor is asked to
 * walk to a node named ROOT, which does not exist, and the caller then looks for
 * `strategy-export.ROOT.review.json`, which is never written. Downstream the
 * draft is already deleted, so the family silently loses its content.
 *
 * Kept as a shared helper so the rule lives in one place and can be tested
 * without executing a pipeline.
 */

/** Draft-directory label meaning "the whole tree", not an action to walk to. */
export const ROOT_NODE = "ROOT";

/** The review filename the extractor writes for a given draft node label. */
export function reviewFileName(node: string): string {
  return node === ROOT_NODE
    ? "strategy-export.review.json"
    : `strategy-export.${node}.review.json`;
}

/**
 * The `--node-history` arguments to pass for a draft node label: none for a root
 * export, because the flag requires at least one action and rejects an empty
 * value.
 */
export function nodeHistoryArgs(node: string): string[] {
  return node === ROOT_NODE ? [] : [`--node-history=${node}`];
}
