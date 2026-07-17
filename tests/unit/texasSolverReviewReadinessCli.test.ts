import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const VITE_NODE = resolve(ROOT, "node_modules/vite-node/vite-node.mjs");
const SCRIPT = resolve(ROOT, "scripts/checkTexasSolverReviewReadiness.mts");
const DIVERSE_BOARDS = [
  "A72r", "A62tt", "K72r", "K65tt", "T72r", "T82tt",
  "632r", "853tt", "AK7mono", "632mono", "K44r", "822r",
];

describe("mtt:texas-solver-review-readiness CLI", () => {
  it("oddeli mechanickou board-shape pripravenost od lidskeho poker review", () => {
    const temporary = mkdtempSync(join(tmpdir(), "pkrtrainer-review-readiness-"));
    try {
      const reviewsDir = join(temporary, "reviews");
      const protocolPath = join(temporary, "protocol.json");
      const outputPath = join(temporary, "report.json");
      const markdownPath = join(temporary, "MECHANICAL_READINESS.md");
      mkdirSync(reviewsDir, { recursive: true });
      writeEvidence(reviewsDir, "READY_SHAPE_FAMILY", DIVERSE_BOARDS);
      writeEvidence(reviewsDir, "PARTIAL_SHAPE_FAMILY", DIVERSE_BOARDS.slice(0, 5));
      writeProtocol(protocolPath, [
        protocolRow("READY_SHAPE_FAMILY", false, false),
        protocolRow("PARTIAL_SHAPE_FAMILY", true, true),
      ]);

      execFileSync(process.execPath, [
        VITE_NODE,
        SCRIPT,
        `--reviews-dir=${reviewsDir}`,
        `--protocol-report=${protocolPath}`,
        `--output=${outputPath}`,
        `--markdown-output=${markdownPath}`,
        "--summary",
      ], { cwd: ROOT, encoding: "utf8" });

      const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
        valid: boolean;
        basis: string;
        counts: { mechanicalShapeReady: number; ownerProtocolReady: number; productionEligible: number };
        rows: Array<{ familyId: string; mechanicalShapeReady: boolean; nextGate: string }>;
      };
      expect(report.valid).toBe(true);
      expect(report.basis).toBe("REVIEW_ONLY_EVIDENCE_NOT_POKER_APPROVAL");
      expect(report.counts).toMatchObject({
        mechanicalShapeReady: 1,
        ownerProtocolReady: 1,
        productionEligible: 1,
      });
      expect(report.rows.find((row) => row.familyId === "READY_SHAPE_FAMILY")).toMatchObject({
        mechanicalShapeReady: true,
        nextGate: "HUMAN_POKER_REVIEW",
      });
      expect(report.rows.find((row) => row.familyId === "PARTIAL_SHAPE_FAMILY")).toMatchObject({
        mechanicalShapeReady: false,
        nextGate: "MORE_REVIEW_ONLY_EVIDENCE",
      });
      const markdown = readFileSync(markdownPath, "utf8");
      expect(markdown).toContain("This source-safe report measures solved board diversity");
      expect(markdown).toContain("| READY_SHAPE_FAMILY | 12 |");
      expect(markdown).toContain("not a poker verdict");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("selze zavrene pri duplicitnim nebo nepodporovanem board ID", () => {
    const temporary = mkdtempSync(join(tmpdir(), "pkrtrainer-review-readiness-invalid-"));
    try {
      const reviewsDir = join(temporary, "reviews");
      const protocolPath = join(temporary, "protocol.json");
      mkdirSync(reviewsDir, { recursive: true });
      writeEvidence(reviewsDir, "INVALID_EVIDENCE_FAMILY", ["A72r", "A72r", "BAD"]);
      writeProtocol(protocolPath, [protocolRow("INVALID_EVIDENCE_FAMILY", false, false)]);

      const result = spawnSync(process.execPath, [
        VITE_NODE,
        SCRIPT,
        `--reviews-dir=${reviewsDir}`,
        `--protocol-report=${protocolPath}`,
      ], { cwd: ROOT, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("next=EVIDENCE_REPAIR");
      expect(result.stdout).toContain("review-only evidence is malformed or invalid");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});

function writeEvidence(reviewsDir: string, familyId: string, requestedBoards: string[]): void {
  writeFileSync(join(reviewsDir, `${familyId}.review.json`), `${JSON.stringify({
    valid: true,
    status: "REVIEW_ONLY_EVIDENCE",
    productionReady: false,
    familyId,
    requestedBoards,
    reviewOnlyTreeProfile: "MEMORY_SAFE_REVIEW_ONLY",
    blockers: [],
    anomalies: [],
  }, null, 2)}\n`, "utf8");
}

function writeProtocol(path: string, rows: Record<string, unknown>[]): void {
  writeFileSync(path, `${JSON.stringify({ valid: false, rows }, null, 2)}\n`, "utf8");
}

function protocolRow(
  familyId: string,
  protocolReady: boolean,
  productionEligible: boolean,
): Record<string, unknown> {
  return {
    familyId,
    status: protocolReady ? "REVIEWED_PRODUCTION" : "NEEDS_REVIEW",
    protocolReady,
    productionEligible,
    blockers: protocolReady ? [] : ["Human review required."],
  };
}
