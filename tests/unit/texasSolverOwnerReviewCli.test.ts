import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { ownerEvidenceFromFamilyDir } from "../../scripts/texasSolverOwnerEvidence.mts";

describe("mtt:texas-solver-owner-review CLI", () => {
  it("defaults to a dry run and writes only after explicit confirmation", () => {
    const root = mkdtempSync(join(tmpdir(), "pkrtrainer-owner-review-"));
    const family = "MTT9_50BB_BTN_BB_SRP";
    const notes = join(root, family, "review-notes.md");
    try {
      writeFixture(notes);
      const args = baseArgs(root, family, "--decision=scoped", "--scope=BTN vs BB pilot", "--caveats=narrow board set");
      const dryRun = runOwnerReview(...args, "--json");

      expect(dryRun.status).toBe(0);
      expect(JSON.parse(dryRun.stdout)).toMatchObject({ valid: true, writePerformed: false, decision: "scoped" });
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");

      const write = runOwnerReview(...args, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW", "--json");
      expect(write.status).toBe(0);
      expect(JSON.parse(write.stdout)).toMatchObject({ valid: true, writePerformed: true, decision: "scoped" });
      const saved = readFileSync(notes, "utf8");
      expect(saved).toContain("Status: REVIEWED");
      expect(saved).toContain("Review evidence fingerprint: sha256:");
      expect(saved).toContain("Reviewer: project owner");
      expect(saved).toContain("Reviewed at: 2026-07-15");
      expect(saved).toContain("Usable for production: scoped: BTN vs BB pilot");
      expect(saved).toContain("Usable scope: BTN vs BB pilot");
      expect(saved).toContain("Production caveats: narrow board set");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a scoped decision without a human-provided scope", () => {
    const root = mkdtempSync(join(tmpdir(), "pkrtrainer-owner-review-invalid-"));
    const family = "MTT9_50BB_BTN_BB_SRP";
    const notes = join(root, family, "review-notes.md");
    try {
      writeFixture(notes);
      const result = runOwnerReview(...baseArgs(root, family, "--decision=scoped", "--caveats=narrow board set"));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--scope is required for yes or scoped decisions.");
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to write a decision when review notes do not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "pkrtrainer-owner-review-missing-"));
    const family = "MTT9_50BB_BTN_BB_SRP";
    try {
      const result = runOwnerReview(
        ...baseArgs(root, family, "--decision=no", "--caveats=not reviewed for production"),
        "--write",
        "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW",
        "--json",
      );
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ valid: false, writePerformed: false });
      expect(existsSync(join(root, family, "review-notes.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a stale evidence fingerprint without changing review notes", () => {
    const root = mkdtempSync(join(tmpdir(), "pkrtrainer-owner-review-stale-"));
    const family = "MTT9_50BB_BTN_BB_SRP";
    const notes = join(root, family, "review-notes.md");
    try {
      writeFixture(notes);
      const args = baseArgs(root, family, "--decision=no", "--caveats=not usable");
      writeFileSync(join(root, family, "strategy-export.review.json"), JSON.stringify({ familyId: family, status: "CHANGED" }), "utf8");

      const result = runOwnerReview(...args, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW", "--json");

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).errors).toContain("Evidence fingerprint is stale for the current owner evidence.");
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeFixture(path: string): void {
  const familyDir = dirname(path);
  const familyId = familyDir.replace(/\\/g, "/").split("/").at(-1)!;
  mkdirSync(familyDir, { recursive: true });
  writeFileSync(path, ["# Review", "", "Status: NEEDS_REVIEW", "", "Reviewer:", "Reviewed at:", "Usable for production:", "Usable scope:", "Production caveats:", ""].join("\n"), "utf8");
  writeFileSync(join(familyDir, "strategy-export.review.json"), JSON.stringify({ familyId, status: "NEEDS_REVIEW" }), "utf8");
  writeFileSync(join(familyDir, "accuracy-report.json"), JSON.stringify({ familyId, solver: "texas-solver" }), "utf8");
}

function baseArgs(root: string, family: string, ...extra: string[]): string[] {
  const familyDir = join(root, family);
  const evidenceFingerprint = existsSync(familyDir)
    ? ownerEvidenceFromFamilyDir(familyDir, family).fingerprint
    : `sha256:${"0".repeat(64)}`;
  return [
    `--root=${root}`,
    `--family=${family}`,
    `--evidence-fingerprint=${evidenceFingerprint}`,
    "--reviewer=project owner",
    "--reviewed-at=2026-07-15",
    ...extra,
  ];
}

function runOwnerReview(...args: string[]) {
  return spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/recordTexasSolverOwnerReview.mts",
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}
