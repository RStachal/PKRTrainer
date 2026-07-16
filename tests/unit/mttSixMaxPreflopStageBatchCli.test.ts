import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:sixmax-preflop-stage-batch CLI", () => {
  it("fails closed before any raw staging when the four candidate pairs are incomplete", () => {
    const draftDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-stage-"));
    const rawRoot = join(draftDir, "raw");
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/stageMttSixMaxPreflopIntakeBatch.mts",
        `--draft-dir=${draftDir}`,
        `--raw-root=${rawRoot}`,
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout) as { valid: boolean; writePerformed: boolean; rows: Array<{ errors: string[] }> };
      expect(parsed.valid).toBe(false);
      expect(parsed.writePerformed).toBe(false);
      expect(parsed.rows).toHaveLength(4);
      expect(parsed.rows.every((row) => row.errors.includes("Candidate is missing.") && row.errors.includes("Permission manifest is missing."))).toBe(true);
    } finally {
      rmSync(draftDir, { recursive: true, force: true });
    }
  });

  it("accepts a read-only summary request without enabling writes", () => {
    const draftDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-stage-summary-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/stageMttSixMaxPreflopIntakeBatch.mts",
        `--draft-dir=${draftDir}`,
        "--summary",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("Unsupported argument");
      expect(result.stdout).toContain("write performed: false");
    } finally {
      rmSync(draftDir, { recursive: true, force: true });
    }
  });
});
