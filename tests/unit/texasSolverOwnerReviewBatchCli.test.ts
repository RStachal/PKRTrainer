import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { OWNER_DECISION_SCHEMA_VERSION, ownerEvidenceFromFamilyDir } from "../../scripts/texasSolverOwnerEvidence.mts";

describe("mtt:texas-solver-owner-review-batch CLI", () => {
  it("creates a deterministic blank owner-decision template", () => {
    const root = fixtureRoot();
    const template = join(root, "decisions.json");
    try {
      const result = runBatch(`--root=${root}`, "--write-template", `--out=${template}`, "--json");
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, mode: "template", familyCount: 2 });
      const document = JSON.parse(readFileSync(template, "utf8")) as {
        schemaVersion: string;
        decisions: Array<Record<string, string>>;
      };
      expect(document.schemaVersion).toBe(OWNER_DECISION_SCHEMA_VERSION);
      expect(document.decisions.map((decision) => decision.familyId)).toEqual([
        "MTT9_20BB_BTN_BB_SRP",
        "MTT9_50BB_BTN_BB_SRP",
      ]);
      for (const decision of document.decisions) {
        expect(decision.evidenceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(decision).toMatchObject({ reviewer: "", reviewedAt: "", decision: "", scope: "", caveats: "" });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes only explicit, valid human decisions after confirmation", () => {
    const root = fixtureRoot();
    const decisions = join(root, "decisions.json");
    const selectedNotes = join(root, "MTT9_20BB_BTN_BB_SRP", "review-notes.md");
    const blankNotes = join(root, "MTT9_50BB_BTN_BB_SRP", "review-notes.md");
    try {
      writeFileSync(decisions, JSON.stringify({
        schemaVersion: OWNER_DECISION_SCHEMA_VERSION,
        decisions: [
          reviewDecision(root, "MTT9_20BB_BTN_BB_SRP", { reviewer: "project owner", reviewedAt: "2026-07-15", decision: "no", caveats: "tree is review-only" }),
          reviewDecision(root, "MTT9_50BB_BTN_BB_SRP"),
        ],
      }), "utf8");

      const dryRun = runBatch(`--root=${root}`, `--decisions=${decisions}`, "--json");
      expect(dryRun.status).toBe(0);
      expect(JSON.parse(dryRun.stdout)).toMatchObject({ valid: true, writePerformed: false, selectedCount: 1 });
      expect(readFileSync(selectedNotes, "utf8")).toContain("Status: NEEDS_REVIEW");

      const write = runBatch(`--root=${root}`, `--decisions=${decisions}`, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH", "--json");
      expect(write.status).toBe(0);
      expect(JSON.parse(write.stdout)).toMatchObject({ valid: true, writePerformed: true, selectedCount: 1, changedCount: 1 });
      expect(readFileSync(selectedNotes, "utf8")).toContain("Usable for production: no");
      expect(readFileSync(selectedNotes, "utf8")).toContain("Review evidence fingerprint: sha256:");
      expect(readFileSync(blankNotes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an incomplete scoped decision without changing review notes", () => {
    const root = fixtureRoot();
    const decisions = join(root, "decisions.json");
    const notes = join(root, "MTT9_20BB_BTN_BB_SRP", "review-notes.md");
    try {
      writeFileSync(decisions, JSON.stringify({
        schemaVersion: OWNER_DECISION_SCHEMA_VERSION,
        decisions: [reviewDecision(root, "MTT9_20BB_BTN_BB_SRP", { reviewer: "project owner", reviewedAt: "2026-07-15", decision: "scoped", caveats: "narrow board set" })],
      }), "utf8");
      const result = runBatch(`--root=${root}`, `--decisions=${decisions}`, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH", "--json");
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).errors).toContain("MTT9_20BB_BTN_BB_SRP: scope is required for yes or scoped.");
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed decision entries before previewing any write", () => {
    const root = fixtureRoot();
    const decisions = join(root, "decisions.json");
    const notes = join(root, "MTT9_20BB_BTN_BB_SRP", "review-notes.md");
    try {
      writeFileSync(decisions, JSON.stringify({
        schemaVersion: OWNER_DECISION_SCHEMA_VERSION,
        decisions: [null],
      }), "utf8");

      const result = runBatch(`--root=${root}`, `--decisions=${decisions}`, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH", "--json");

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("string fields for every decision entry");
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a decision after its source-safe evidence changes", () => {
    const root = fixtureRoot();
    const decisions = join(root, "decisions.json");
    const family = "MTT9_20BB_BTN_BB_SRP";
    const notes = join(root, family, "review-notes.md");
    try {
      writeFileSync(decisions, JSON.stringify({
        schemaVersion: OWNER_DECISION_SCHEMA_VERSION,
        decisions: [reviewDecision(root, family, { reviewer: "project owner", reviewedAt: "2026-07-15", decision: "no", caveats: "tree is review-only" })],
      }), "utf8");
      writeFileSync(join(root, family, "strategy-export.review.json"), JSON.stringify({ familyId: family, status: "CHANGED" }), "utf8");

      const result = runBatch(`--root=${root}`, `--decisions=${decisions}`, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH", "--json");

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).errors).toContain(`${family}: evidenceFingerprint is stale for the current owner evidence.`);
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pkrtrainer-owner-review-batch-"));
  writeFamilyFixture(root, "MTT9_50BB_BTN_BB_SRP");
  writeFamilyFixture(root, "MTT9_20BB_BTN_BB_SRP");
  return root;
}

function writeFamilyFixture(root: string, familyId: string): void {
  const familyDir = join(root, familyId);
  writeNotes(join(familyDir, "review-notes.md"));
  writeFileSync(join(familyDir, "strategy-export.review.json"), JSON.stringify({ familyId, status: "NEEDS_REVIEW" }), "utf8");
  writeFileSync(join(familyDir, "accuracy-report.json"), JSON.stringify({ familyId, solver: "texas-solver" }), "utf8");
}

function reviewDecision(root: string, familyId: string, values: Partial<Record<"reviewer" | "reviewedAt" | "decision" | "scope" | "caveats", string>> = {}) {
  return {
    familyId,
    evidenceFingerprint: ownerEvidenceFromFamilyDir(join(root, familyId), familyId).fingerprint,
    reviewer: "",
    reviewedAt: "",
    decision: "",
    scope: "",
    caveats: "",
    ...values,
  };
}

function writeNotes(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, ["# Review", "", "Status: NEEDS_REVIEW", "", "Reviewer:", "Reviewed at:", "Usable for production:", "Usable scope:", "Production caveats:", ""].join("\n"), "utf8");
}

function runBatch(...args: string[]) {
  return spawnSync(process.execPath, ["node_modules/vite-node/vite-node.mjs", "scripts/recordTexasSolverOwnerReviewBatch.mts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}
