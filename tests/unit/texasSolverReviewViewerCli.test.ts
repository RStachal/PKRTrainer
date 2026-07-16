import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-viewer CLI", () => {
  it("builds a source-safe reviewer index with working family and status filters", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-review-viewer-"));
    const input = join(directory, "review.report.json");
    const output = join(directory, "viewer.html");
    try {
      writeFileSync(input, JSON.stringify({
        valid: true,
        status: "NEEDS_REVIEW",
        productionReady: false,
        familyId: "MTT9_50BB_BTN_BB_SRP",
        nodeHistory: ["CHECK"],
        counts: { rawFiles: 1, parsedFiles: 1, blockedFiles: 0, combos: 12, handClasses: 3 },
        files: [{
          boardId: "A72r",
          comboCount: 12,
          handClassCount: 3,
          nodeType: "action_node",
          player: 0,
          handClasses: {
            AJs: { comboCount: 1, averageByAction: { CHECK: 0.2, BET_25: 0.8 }, dominantAction: "BET_25", dominantFrequency: 0.8 },
          },
        }],
        anomalies: [],
        blockers: ["Human poker review is required."],
      }, null, 2), "utf8");

      const result = runViewer(`--input=${input}`, `--output=${output}`);

      expect(result.status).toBe(0);
      const html = readFileSync(output, "utf8");
      expect(html).toContain('id="family-filter"');
      expect(html).toContain('id="status-filter"');
      expect(html).toContain('id="download-owner-decisions"');
      expect(html).toContain('id="owner-reviewer"');
      expect(html).toContain("pkrtrainer-texas-solver-owner-decisions-v1");
      expect(html).toContain('data-review-card');
      expect(html).toContain('data-status="NEEDS_REVIEW"');
      expect(html).toContain("Review evidence only.");
      expect(html).toContain("Human poker review is required.");
      expect(html).not.toContain('"strategy"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runViewer(...args: string[]) {
  const npmArgs = ["run", "mtt:texas-solver-viewer", "--", ...args];
  return spawnSync(process.platform === "win32" ? "cmd" : "npm", process.platform === "win32" ? ["/c", "npm", ...npmArgs] : npmArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
}
