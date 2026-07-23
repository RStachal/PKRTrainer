import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface FamilyAssessment {
  familyId: string;
  disposition: "ACCEPTED" | "WITHHELD";
  decision: "yes" | "no" | "scoped";
  boards: number;
  maxExploitability: number | null;
  overTargetBoards: Array<{ boardId: string; exploitability: number }>;
  structurallyComplete: boolean;
}

interface AcceptanceReport {
  valid: boolean;
  basis: string;
  reviewerId: string;
  counts: { families: number; accepted: number; withheld: number; overTargetBoards: number };
  families: FamilyAssessment[];
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pkrtrainer-mechanical-acceptance-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("mtt:texas-solver-mechanical-acceptance CLI", () => {
  it("accepts a converged family and withholds one with an over-target board", () => {
    writeFamily("MTT9_CLEAN_FAMILY", [
      ["K83r", 0.42],
      ["A72r", 0.48],
      ["JT9tt", 0.31],
    ]);
    writeFamily("MTT9_DIRTY_FAMILY", [
      ["K83r", 10.42],
      ["A72r", 0.48],
      ["QJ2tt", 0.29],
    ]);

    const report = invokeJson("--reviewed-at=2026-07-23");

    expect(report.valid).toBe(true);
    expect(report.basis).toBe("MECHANICAL_SOLVER_EVIDENCE_NOT_HUMAN_POKER_VERDICT");
    expect(report.reviewerId).toBe("PKRTRAINER_MECHANICAL_ACCEPTANCE_V1");
    expect(report.counts).toMatchObject({ families: 2, accepted: 1, withheld: 1, overTargetBoards: 1 });

    const clean = family(report, "MTT9_CLEAN_FAMILY");
    expect(clean).toMatchObject({ disposition: "ACCEPTED", decision: "scoped", structurallyComplete: true });
    expect(clean.overTargetBoards).toHaveLength(0);

    const dirty = family(report, "MTT9_DIRTY_FAMILY");
    expect(dirty).toMatchObject({ disposition: "WITHHELD", decision: "no" });
    expect(dirty.overTargetBoards).toHaveLength(1);
    expect(dirty.overTargetBoards[0]).toMatchObject({ boardId: "K83r", exploitability: 10.42 });
  });

  it("emits an audited decisions file that marks the mechanical, non-human basis", () => {
    writeFamily("MTT9_CLEAN_FAMILY", [["K83r", 0.42], ["A72r", 0.48]]);
    const out = join(root, "decisions.json");

    const result = invoke("--reviewed-at=2026-07-23", `--out=${out}`, "--summary");
    expect(result.status).toBe(0);

    const decisions = JSON.parse(readFileSync(out, "utf8")) as {
      schemaVersion: string;
      decisions: Array<{ reviewer: string; decision: string; scope: string; caveats: string }>;
    };
    expect(decisions.schemaVersion).toBe("pkrtrainer-texas-solver-owner-decisions-v2");
    expect(decisions.decisions[0]).toMatchObject({
      reviewer: "PKRTRAINER_MECHANICAL_ACCEPTANCE_V1",
      decision: "scoped",
      scope: "beta-field-review",
    });
    expect(decisions.decisions[0].caveats).toContain("not a human poker verdict");
  });

  it("withholds a structurally incomplete family even when recorded boards are under target", () => {
    // Two evidence rows but the report declares three expected logs: incomplete.
    writeFamily("MTT9_PARTIAL_FAMILY", [["K83r", 0.42], ["A72r", 0.40]], { expectedLogs: 3 });

    const report = invokeJson("--reviewed-at=2026-07-23");
    const partial = family(report, "MTT9_PARTIAL_FAMILY");
    expect(partial.disposition).toBe("WITHHELD");
    expect(partial.structurallyComplete).toBe(false);
  });

  it("rejects an unknown option", () => {
    const result = invoke("--unknown");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported argument: --unknown");
  });
});

function writeFamily(
  familyId: string,
  boards: ReadonlyArray<readonly [string, number]>,
  options: { expectedLogs?: number } = {},
): void {
  const dir = join(root, familyId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "review-notes.md"), `# ${familyId}\n\nStatus: NEEDS_REVIEW\n`, "utf8");
  // ownerEvidenceFromFamilyDir requires at least one *.review.json whose familyId matches.
  writeFileSync(join(dir, "strategy-export.review.json"), JSON.stringify({ familyId }), "utf8");
  const expectedLogs = options.expectedLogs ?? boards.length;
  const accuracy = {
    familyId,
    solver: "texas-solver",
    status: "NEEDS_REVIEW",
    rawExportCount: boards.length,
    parseableJson: boards.length,
    invalidJson: 0,
    solverLogCoverage: {
      expectedLogs,
      parsedLogs: boards.length,
      missingLogs: [],
      evidence: boards.map(([boardId, value]) => ({
        rawFileName: `pkrtrainer_${familyId}_${boardId}.json`,
        source: "PER_BOARD_LOG",
        sourceName: `pkrtrainer_${familyId}_${boardId}.log`,
        value,
      })),
    },
  };
  writeFileSync(join(dir, "accuracy-report.json"), JSON.stringify(accuracy), "utf8");
}

function family(report: AcceptanceReport, familyId: string): FamilyAssessment {
  const match = report.families.find((item) => item.familyId === familyId);
  if (match === undefined) throw new Error(`Family missing from report: ${familyId}`);
  return match;
}

function invokeJson(...args: string[]): AcceptanceReport {
  const result = invoke("--json", ...args);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as AcceptanceReport;
}

function invoke(...args: string[]) {
  return spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/assessTexasSolverMechanicalAcceptance.mts",
    `--root=${root}`,
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
