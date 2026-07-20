import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("reuses staged canonical provenance instead of requiring duplicate owner metadata", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-provenance-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--incremental",
        "--write",
        "--confidence=HIGH",
        "--confirm=BUILD_MTT_SIXMAX_P1_CANDIDATES",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout) as {
        permissionMode: string;
        writePerformed: boolean;
        counts: { waiting: number };
      };
      expect(parsed).toMatchObject({
        permissionMode: "CANONICAL_STAGED_MANIFEST",
        writePerformed: false,
        counts: { waiting: 4 },
      });
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

  it("treats absent exports as waiting in incremental mode", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-incremental-"));
    try {
      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--incremental",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        valid: boolean;
        mode: string;
        writePerformed: boolean;
        counts: { ready: number; waiting: number; invalid: number };
        rows: Array<{ status: string }>;
      };
      expect(parsed).toMatchObject({
        valid: true,
        mode: "INCREMENTAL",
        writePerformed: false,
        counts: { ready: 0, waiting: 4, invalid: 0 },
      });
      expect(parsed.rows.every((row) => row.status === "WAITING")).toBe(true);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("blocks a partially filled export in incremental mode", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-partial-"));
    try {
      const packId = "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1";
      writeFileSync(join(sourceDir, `${packId}.csv`), [
        "rowKind,packId,tableFormat,blindSpeed,ante,evModel,position,sourceStackBB,bucket,context,handClass,strictActions,lenientActions,actionEvsBb,equivalentThresholdBb,acceptableThresholdBb,sourceReferenceId,reviewer,reviewedAt,notes",
        `HAND_CLASS_DECISION,${packId},SIX_MAX,REGULAR,ON,CHIP_EV,BTN,40,40,RFI,AA,OPEN_2X,OPEN_2X,,,,owned-a,owner,2026-07-20,partial fixture`,
      ].join("\n"), "utf8");

      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--incremental",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout) as {
        valid: boolean;
        counts: { ready: number; waiting: number; invalid: number };
        rows: Array<{ packId: string; status: string; records: number | null; preflightConfidence: string; errors: string[] }>;
      };
      expect(parsed.valid).toBe(false);
      expect(parsed.counts).toEqual({ ready: 0, waiting: 3, invalid: 1 });
      expect(parsed.rows.find((row) => row.packId === packId)).toMatchObject({
        status: "INVALID",
        records: 1,
        preflightConfidence: "MEDIUM",
      });
      const errors = parsed.rows.find((row) => row.packId === packId)?.errors.join("\n") ?? "";
      expect(errors).not.toContain("confidence is LOW");
      expect(errors).not.toContain("legal production licenseKind");
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("treats an untouched blank scaffold as waiting", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "pkrtrainer-sixmax-intake-scaffold-"));
    try {
      const packId = "mtt-six-max-regular-preflop-chip-ev-ante-on-production-v1";
      writeFileSync(join(sourceDir, `${packId}.csv`), [
        "rowKind,packId,tableFormat,blindSpeed,ante,evModel,position,sourceStackBB,bucket,context,handClass,strictActions,lenientActions,actionEvsBb,equivalentThresholdBb,acceptableThresholdBb,sourceReferenceId,reviewer,reviewedAt,notes",
        `HAND_CLASS_DECISION,${packId},SIX_MAX,REGULAR,ON,CHIP_EV,BTN,40,40,RFI,AA,,,,,,,,,fill from reviewed source`,
      ].join("\n"), "utf8");

      const result = spawnSync(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/runMttSixMaxPreflopIntakeBatch.mts",
        `--source-dir=${sourceDir}`,
        "--incremental",
        "--json",
      ], { cwd: process.cwd(), encoding: "utf8" });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        counts: { ready: number; waiting: number; invalid: number };
        rows: Array<{ packId: string; status: string; records: number | null }>;
      };
      expect(parsed.counts).toEqual({ ready: 0, waiting: 4, invalid: 0 });
      expect(parsed.rows.find((row) => row.packId === packId)).toMatchObject({
        status: "WAITING",
        records: 0,
      });
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
