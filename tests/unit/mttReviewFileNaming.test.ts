import { describe, expect, it } from "vitest";

import {
  ROOT_NODE,
  nodeHistoryArgs,
  reviewFileName,
} from "../../scripts/lib/mttReviewFileNaming.mts";

// The post-resolve pipeline deletes a family's draft before rebuilding it, so a
// wrong review filename does not merely fail a step - it loses the draft and the
// merge downstream finds nothing. That is exactly what happened to three SB
// families: the pipeline asked for `strategy-export.ROOT.review.json`, which is
// never written, and their scope merge died with "At least one input draft is
// required". These assertions pin the rule that caused it.

describe("review file naming", () => {
  it("names a root export without an infix", () => {
    // The extractor writes this when the node history is empty.
    expect(reviewFileName(ROOT_NODE)).toBe("strategy-export.review.json");
    expect(reviewFileName(ROOT_NODE)).not.toContain("ROOT");
  });

  it("names a walked node with its action as the infix", () => {
    expect(reviewFileName("CHECK")).toBe("strategy-export.CHECK.review.json");
  });

  it("passes no node history for a root export", () => {
    // `--node-history` requires at least one action, and "ROOT" is not an action;
    // asking the extractor to walk to it fails instead of exporting the root.
    expect(nodeHistoryArgs(ROOT_NODE)).toEqual([]);
  });

  it("passes the node history for a walked node", () => {
    expect(nodeHistoryArgs("CHECK")).toEqual(["--node-history=CHECK"]);
  });

  it("keeps the filename and the arguments consistent for every label", () => {
    // A label either walks and carries an infix, or does neither. A mix of the
    // two is the failure mode this module exists to prevent.
    for (const node of [ROOT_NODE, "CHECK", "BET_52", "CALL"]) {
      const walks = nodeHistoryArgs(node).length > 0;
      const hasInfix = reviewFileName(node) !== "strategy-export.review.json";
      expect(hasInfix, `label ${node}`).toBe(walks);
    }
  });
});
