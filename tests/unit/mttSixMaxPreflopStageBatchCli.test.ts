import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("treats absent reviewed pairs as waiting in incremental mode", () => {
    const draftDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-stage-incremental-"));
    const rawRoot = join(draftDir, "raw");
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/stageMttSixMaxPreflopIntakeBatch.mts",
        `--draft-dir=${draftDir}`,
        `--raw-root=${rawRoot}`,
        "--incremental",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        valid: boolean;
        mode: string;
        counts: { ready: number; waiting: number; invalid: number };
      };
      expect(parsed).toMatchObject({
        valid: true,
        mode: "INCREMENTAL",
        counts: { ready: 0, waiting: 4, invalid: 0 },
      });
    } finally {
      rmSync(draftDir, { recursive: true, force: true });
    }
  });

  it("recognizes the already staged canonical permission while waiting for normalized data", () => {
    const draftDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-stage-canonical-"));
    const rawRoot = join(draftDir, "raw");
    try {
      const packId = "mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1";
      const rawPackDir = join(rawRoot, packId);
      mkdirSync(rawPackDir, { recursive: true });
      writeFileSync(join(rawPackDir, "permission.json"), "{}\n", "utf8");
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/stageMttSixMaxPreflopIntakeBatch.mts",
        `--draft-dir=${draftDir}`,
        `--raw-root=${rawRoot}`,
        "--incremental",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        rows: Array<{ packId: string; status: string; permissionSource: string; errors: string[] }>;
      };
      expect(parsed.rows.find((row) => row.packId === packId)).toMatchObject({
        status: "WAITING",
        permissionSource: "CANONICAL",
        errors: ["Candidate is missing."],
      });
    } finally {
      rmSync(draftDir, { recursive: true, force: true });
    }
  });

  it("fails closed on a partial reviewed pair in incremental mode", () => {
    const draftDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-stage-partial-"));
    const rawRoot = join(draftDir, "raw");
    try {
      const packId = "mtt-six-max-regular-preflop-chip-ev-ante-off-production-v1";
      const packDir = join(draftDir, packId);
      mkdirSync(packDir);
      writeFileSync(join(packDir, "normalized.candidate.json"), "{}\n", "utf8");
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/stageMttSixMaxPreflopIntakeBatch.mts",
        `--draft-dir=${draftDir}`,
        `--raw-root=${rawRoot}`,
        "--incremental",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout) as {
        valid: boolean;
        counts: { ready: number; waiting: number; invalid: number };
        rows: Array<{ packId: string; status: string; errors: string[] }>;
      };
      expect(parsed.valid).toBe(false);
      expect(parsed.counts).toEqual({ ready: 0, waiting: 3, invalid: 1 });
      expect(parsed.rows.find((row) => row.packId === packId)).toMatchObject({
        status: "INVALID",
        errors: ["Permission manifest is missing."],
      });
    } finally {
      rmSync(draftDir, { recursive: true, force: true });
    }
  });
});
