import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const VITE_NODE = resolve(ROOT, "node_modules/vite-node/vite-node.mjs");
const STATUS_SCRIPT = resolve(ROOT, "scripts/checkTexasSolverCoverageBatchStatus.mts");
const DRAFT_ROOT = resolve(ROOT, "artifacts/texas-solver-review-integration/normalized-drafts");

describe("mtt:texas-solver-coverage-status CLI", () => {
  it("oznaci memory-safe manifest jako review-only a nevystavi staging prikazy", () => {
    const temporary = mkdtempSync(join(tmpdir(), "pkrtrainer-coverage-memory-safe-"));
    let aliasDir = "";
    let normalizedDir = "";
    try {
      const outputBase = join(temporary, "output");
      const familyId = "TEST_MEMORY_SAFE_FACING_BET_FAMILY";
      aliasDir = join(DRAFT_ROOT, `${familyId}-FACING-BET-BEST`);
      normalizedDir = join(DRAFT_ROOT, `${familyId}-CHECK`);
      mkdirSync(aliasDir, { recursive: true });
      mkdirSync(normalizedDir, { recursive: true });
      writeFileSync(join(aliasDir, "best-candidate.json"), JSON.stringify({
        nodeHistory: "CHECK>BET_50",
        betAction: "BET_50",
        gateValid: true,
      }), "utf8");
      const rawDir = join(outputBase, familyId, "raw");
      mkdirSync(rawDir, { recursive: true });
      writeFileSync(join(rawDir, `pkrtrainer_${familyId}_A72r.json`), "{}", "utf8");
      writeFileSync(join(outputBase, familyId, "strategy-export.json"), "{}", "utf8");
      writeFileSync(join(outputBase, familyId, "strategy-export.CHECK.review.json"), "{}", "utf8");
      writeFileSync(join(outputBase, familyId, "review-notes.md"), "stale fixture", "utf8");
      writeFileSync(join(normalizedDir, "normalized.candidate.json"), "{}", "utf8");
      const manifestPath = join(temporary, "manifest.json");
      writeFileSync(manifestPath, `${JSON.stringify({
        packId: "memory-safe-status-fixture",
        generatedAt: "2026-07-15",
        parameterDir: temporary,
        outputBase,
        executionProfile: { treeProfile: "MEMORY_SAFE_REVIEW_ONLY" },
        scenarios: [{ familyId, pot: 50, effectiveStack: 300, boards: ["A72r"], purpose: "fixture", coverageTags: [] }],
        files: [{ fileName: "fixture.txt", path: "fixture.txt", familyId, boardId: "A72r", written: true }],
      }, null, 2)}\n`, "utf8");

      const output = execFileSync(process.execPath, [
        VITE_NODE,
        STATUS_SCRIPT,
        `--manifest=${manifestPath}`,
        "--json",
      ], { cwd: ROOT, encoding: "utf8" });
      const report = JSON.parse(output) as {
        reviewOnlyTreeProfile: string | null;
        rows: Array<{
          nextCommands: string[];
          normalizedDraft: boolean;
          staged: { strategyExport: boolean; review: boolean; reviewNotes: boolean };
          facingBetBest: { present: boolean; nodeHistory: string | null };
        }>;
        nextCommands: string[];
      };
      expect(report.reviewOnlyTreeProfile).toBe("MEMORY_SAFE_REVIEW_ONLY");
      expect(report.rows[0].nextCommands).toEqual([]);
      expect(report.rows[0].staged).toMatchObject({ strategyExport: false, review: false, reviewNotes: false });
      expect(report.rows[0].normalizedDraft).toBe(false);
      expect(report.rows[0].facingBetBest).toMatchObject({ present: false, nodeHistory: null });
      expect(report.nextCommands.join("\n")).toContain("Automatic staging and normalization remain disabled");
    } finally {
      if (aliasDir.length > 0) rmSync(aliasDir, { recursive: true, force: true });
      if (normalizedDir.length > 0) rmSync(normalizedDir, { recursive: true, force: true });
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("recognizes SB vs BB root reviews and ROOT drafts without suggesting CHECK work", () => {
    const temporary = mkdtempSync(join(tmpdir(), "pkrtrainer-coverage-status-"));
    const readyFamily = "TEST_SB_BB_SRP_OOP_CBET_LOWSPR_READY";
    const pendingFamily = "TEST_SB_BB_SRP_OOP_CBET_HIGHSPR_PENDING";
    const readyDraft = join(DRAFT_ROOT, `${readyFamily}-ROOT`);
    const pendingDraft = join(DRAFT_ROOT, `${pendingFamily}-ROOT`);

    try {
      const outputBase = join(temporary, "output");
      writeRootFamily(outputBase, readyFamily, "A95r", true);
      writeRootFamily(outputBase, pendingFamily, "KQ5r", false);
      mkdirSync(readyDraft, { recursive: true });
      writeFileSync(join(readyDraft, "normalized.candidate.json"), "{}\n", "utf8");

      const manifestPath = join(temporary, "manifest.json");
      const reportPath = join(temporary, "report.json");
      writeFileSync(manifestPath, JSON.stringify({
        packId: "coverage-status-root-review-test",
        generatedAt: "2026-07-14",
        parameterDir: temporary,
        outputBase,
        scenarios: [
          scenario(readyFamily, "A95r"),
          scenario(pendingFamily, "KQ5r"),
        ],
        files: [
          file(readyFamily, "A95r"),
          file(pendingFamily, "KQ5r"),
        ],
      }, null, 2), "utf8");

      execFileSync(process.execPath, [
        VITE_NODE,
        STATUS_SCRIPT,
        "--manifest",
        manifestPath,
        "--json",
        "--output",
        reportPath,
      ], { cwd: ROOT, encoding: "utf8" });

      const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
        rows: Array<{
          familyId: string;
          staged: { review: boolean; reviewKind: string; checkReview: boolean };
          normalizedDraft: boolean;
          nextCommands: string[];
        }>;
      };
      const ready = report.rows.find((row) => row.familyId === readyFamily)!;
      const pending = report.rows.find((row) => row.familyId === pendingFamily)!;

      expect(ready.staged).toMatchObject({ review: true, reviewKind: "ROOT", checkReview: true });
      expect(ready.normalizedDraft).toBe(true);
      expect(ready.nextCommands).toEqual([]);
      expect(pending.staged).toMatchObject({ review: false, reviewKind: "ROOT", checkReview: false });
      expect(pending.nextCommands.join("\n")).toContain(`--family=${pendingFamily} --write`);
      expect(pending.nextCommands.join("\n")).not.toContain("--node-history=CHECK");
      expect(pending.nextCommands.join("\n")).toContain("strategy-export.review.json");
      expect(pending.nextCommands.join("\n")).toContain(`${pendingFamily}-ROOT`);
    } finally {
      rmSync(readyDraft, { recursive: true, force: true });
      rmSync(pendingDraft, { recursive: true, force: true });
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});

function writeRootFamily(
  outputBase: string,
  familyId: string,
  board: string,
  reviewed: boolean,
): void {
  const familyDir = join(outputBase, familyId);
  mkdirSync(join(familyDir, "raw"), { recursive: true });
  writeFileSync(join(familyDir, "raw", `solver_${board}.json`), "{}\n", "utf8");
  writeFileSync(join(familyDir, "strategy-export.json"), "{}\n", "utf8");
  writeFileSync(join(familyDir, "review-notes.md"), "# Review\n", "utf8");
  if (reviewed) writeFileSync(join(familyDir, "strategy-export.review.json"), "{}\n", "utf8");
}

function scenario(familyId: string, board: string): Record<string, unknown> {
  return {
    familyId,
    pot: 50,
    effectiveStack: 650,
    boards: [board],
    purpose: "Root review status test.",
    coverageTags: ["SRP_SB_VS_BB", "OOP_AGGRESSOR"],
  };
}

function file(familyId: string, board: string): Record<string, unknown> {
  return {
    fileName: `${familyId}_${board}.txt`,
    path: `${familyId}_${board}.txt`,
    familyId,
    boardId: board,
    written: true,
  };
}
