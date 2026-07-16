import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:sixmax-preflop-intake-batch CLI", () => {
  it("fails closed when one or more of the four exact solver CSV files are missing", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout) as { valid: boolean; writePerformed: boolean; rows: Array<{ exists: boolean; errors: string[] }> };
      expect(parsed.valid).toBe(false);
      expect(parsed.writePerformed).toBe(false);
      expect(parsed.rows).toHaveLength(4);
      expect(parsed.rows.every((row) => !row.exists && row.errors.includes("CSV is missing."))).toBe(true);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("requires an explicit non-low confidence decision before candidate writes", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-confidence-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--write",
        "--reviewer=project owner",
        "--rights-owner=project owner",
        "--source-location=local owned solver export",
        "--confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--confidence=MEDIUM|HIGH");
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("accepts a read-only summary request without enabling writes", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-summary-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--summary",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("Unsupported argument");
      expect(result.stdout).toContain("write performed: false");
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
