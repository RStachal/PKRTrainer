import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("mtt:texas-solver-owner-review-batch CLI", () => {
  it("creates a deterministic blank owner-decision template", () => {
    const root = fixtureRoot();
    const template = join(root, "decisions.json");
    try {
      const result = runBatch(`--root=${root}`, "--write-template", `--out=${template}`, "--json");
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, mode: "template", familyCount: 2 });
      expect(JSON.parse(readFileSync(template, "utf8"))).toEqual({
        schemaVersion: "pkrtrainer-texas-solver-owner-decisions-v1",
        decisions: [
          { familyId: "MTT9_20BB_BTN_BB_SRP", reviewer: "", reviewedAt: "", decision: "", scope: "", caveats: "" },
          { familyId: "MTT9_50BB_BTN_BB_SRP", reviewer: "", reviewedAt: "", decision: "", scope: "", caveats: "" },
        ],
      });
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
        schemaVersion: "pkrtrainer-texas-solver-owner-decisions-v1",
        decisions: [
          { familyId: "MTT9_20BB_BTN_BB_SRP", reviewer: "project owner", reviewedAt: "2026-07-15", decision: "no", scope: "", caveats: "tree is review-only" },
          { familyId: "MTT9_50BB_BTN_BB_SRP", reviewer: "", reviewedAt: "", decision: "", scope: "", caveats: "" },
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
        schemaVersion: "pkrtrainer-texas-solver-owner-decisions-v1",
        decisions: [{ familyId: "MTT9_20BB_BTN_BB_SRP", reviewer: "project owner", reviewedAt: "2026-07-15", decision: "scoped", scope: "", caveats: "narrow board set" }],
      }), "utf8");
      const result = runBatch(`--root=${root}`, `--decisions=${decisions}`, "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH", "--json");
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).errors).toContain("MTT9_20BB_BTN_BB_SRP: scope is required for yes or scoped.");
      expect(readFileSync(notes, "utf8")).toContain("Status: NEEDS_REVIEW");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "pkrtrainer-owner-review-batch-"));
  writeNotes(join(root, "MTT9_50BB_BTN_BB_SRP", "review-notes.md"));
  writeNotes(join(root, "MTT9_20BB_BTN_BB_SRP", "review-notes.md"));
  return root;
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
