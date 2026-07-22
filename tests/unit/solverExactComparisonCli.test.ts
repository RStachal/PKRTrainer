import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOLVER_EXACT_NODE_SCHEMA_VERSION } from "../../src/core/solverComparison.ts";

describe("range:cross-check-exact CLI", () => {
  it("writes a source-safe exact combo strategy and EV comparison", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-exact-solver-compare-"));
    try {
      const paths = comparisonPaths(directory);
      writeFileSync(paths.left, JSON.stringify(exportFixture("texas-solver")), "utf8");
      const right = exportFixture("gto-plus");
      right.rows[0].frequenciesPct = { CHECK: 52, BET_33: 48 };
      right.rows[0].evsBb = { CHECK: 1.002, BET_33: 1.004 };
      writeFileSync(paths.right, JSON.stringify(right), "utf8");

      const result = invoke(paths, "--json");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        strategyValuesGenerated: string;
        productionPromotion: string;
        setupFingerprintMatch: boolean;
        sources: { left: { sha256: string; setupSha256: string }; right: { sha256: string; setupSha256: string } };
        comparison: { comparable: boolean; evidenceLevel: string; metrics: { rows: number; evComparedRows: number } };
      };
      expect(report).toMatchObject({
        valid: true,
        strategyValuesGenerated: "none",
        productionPromotion: "none",
        setupFingerprintMatch: true,
        comparison: {
          comparable: true,
          evidenceLevel: "EXACT_COMBO_STRATEGY_AND_EV",
          metrics: { rows: 1, evComparedRows: 1 },
        },
      });
      expect(report.sources.left.sha256).not.toBe(report.sources.right.sha256);
      expect(report.sources.left.setupSha256).toBe(report.sources.right.setupSha256);
      expect(report.sources.left).toMatchObject({ path: "texas-solver.json" });
      expect(report.sources.right).toMatchObject({ path: "other-solver.json" });
      expect(result.stdout).not.toContain('"evsBb"');
      expect(result.stdout).not.toContain(directory.replace(/\\/g, "/"));
      expect(existsSync(paths.output)).toBe(true);
      expect(readFileSync(paths.markdown, "utf8")).toContain("No row exceeded the configured tolerances.");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the two solvers did not use the same board setup", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-exact-solver-mismatch-"));
    try {
      const paths = comparisonPaths(directory);
      writeFileSync(paths.left, JSON.stringify(exportFixture("texas-solver")), "utf8");
      const right = exportFixture("gto-plus");
      right.spot.board = ["Ks", "8d", "3c"];
      writeFileSync(paths.right, JSON.stringify(right), "utf8");

      const result = invoke(paths, "--json");

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as {
        valid: boolean;
        setupFingerprintMatch: boolean;
        comparison: { comparable: boolean; blockers: string[]; metrics: unknown };
      };
      expect(report).toMatchObject({
        valid: false,
        setupFingerprintMatch: false,
        comparison: { comparable: false, metrics: null },
      });
      expect(report.comparison.blockers[0]).toContain("Canonical spot setup differs");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never allows a report to overwrite a private solver export", () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-exact-solver-path-"));
    try {
      const paths = comparisonPaths(directory);
      const leftContent = JSON.stringify(exportFixture("texas-solver"));
      writeFileSync(paths.left, leftContent, "utf8");
      writeFileSync(paths.right, JSON.stringify(exportFixture("gto-plus")), "utf8");

      const result = invoke({ ...paths, output: paths.left });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must not overwrite either solver export");
      expect(readFileSync(paths.left, "utf8")).toBe(leftContent);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

interface Paths {
  left: string;
  markdown: string;
  output: string;
  right: string;
}

function comparisonPaths(directory: string): Paths {
  return {
    left: join(directory, "texas-solver.json"),
    right: join(directory, "other-solver.json"),
    output: join(directory, "report.json"),
    markdown: join(directory, "report.md"),
  };
}

function invoke(paths: Paths, ...extra: string[]) {
  return spawnSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    "scripts/compareSolverExactNodes.mts",
    `--left=${paths.left}`,
    `--right=${paths.right}`,
    `--output=${paths.output}`,
    `--markdown=${paths.markdown}`,
    ...extra,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function exportFixture(solverId: string) {
  return {
    schemaVersion: SOLVER_EXACT_NODE_SCHEMA_VERSION,
    solver: { id: solverId, version: "test-v1" },
    spot: {
      spotId: "MTT9_50BB_BTN_BB_SRP_A72R_ROOT",
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "FLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
      players: [
        {
          seatId: "IP",
          position: "BTN",
          startingStackBb: 50,
          rangeFingerprint: `sha256:${"a".repeat(64)}`,
        },
        {
          seatId: "OOP",
          position: "BB",
          startingStackBb: 50,
          rangeFingerprint: `sha256:${"b".repeat(64)}`,
        },
      ],
      actingSeatId: "OOP",
      board: ["As", "7d", "2c"],
      potBb: 5.5,
      effectiveStackBb: 47.5,
      potType: "SINGLE_RAISED",
      nodePath: [],
      variantConfigFingerprint: `sha256:${"d".repeat(64)}`,
      treeFingerprint: `sha256:${"c".repeat(64)}`,
    },
    granularity: "COMBO",
    actions: [
      { id: "CHECK", kind: "CHECK" },
      { id: "BET_33", kind: "BET", sizePotPct: 33 },
    ],
    rows: [{
      key: "AsAh",
      rangeWeight: 1,
      frequenciesPct: { CHECK: 50, BET_33: 50 },
      evsBb: { CHECK: 1, BET_33: 1.005 },
    }],
    accuracy: {
      exploitabilityBb: 0.25,
      targetExploitabilityBb: 0.5,
      iterations: 1000,
    },
  };
}
