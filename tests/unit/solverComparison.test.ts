import { describe, expect, it } from "vitest";
import {
  compareSolverExactNodes,
  SOLVER_EXACT_NODE_SCHEMA_VERSION,
  validateSolverExactNodeExport,
  type SolverExactNodeExport,
} from "../../src/core/solverComparison.ts";

const RANGE_A = `sha256:${"a".repeat(64)}`;
const RANGE_B = `sha256:${"b".repeat(64)}`;
const TREE = `sha256:${"c".repeat(64)}`;
const VARIANT_CONFIG = `sha256:${"d".repeat(64)}`;

describe("exact solver comparison", () => {
  it("compares the exact combo strategy and preserves equivalent EV actions", () => {
    const left = exportFixture("texas-solver");
    const right = exportFixture("gto-plus");
    right.rows[0].frequenciesPct.CHECK = 52;
    right.rows[0].frequenciesPct.BET_33 = 48;
    right.rows[0].evsBb!.CHECK = 1.002;
    right.rows[0].evsBb!.BET_33 = 1.004;
    right.rows[1].frequenciesPct.CHECK = 68;
    right.rows[1].frequenciesPct.BET_33 = 32;

    const report = compareSolverExactNodes(left, right);

    expect(report).toMatchObject({
      valid: true,
      comparable: true,
      evidenceLevel: "EXACT_COMBO_STRATEGY_AND_EV",
      leftErrors: [],
      rightErrors: [],
      blockers: [],
      metrics: {
        rows: 2,
        frequencyOutliers: 0,
        evComparedRows: 2,
        evOutliers: 0,
        disjointBestActionRows: 0,
        disjointBestActionRangeWeightPct: 0,
      },
    });
    expect(report.rows[0]).toMatchObject({
      key: "AsAh",
      leftBestActions: ["BET_33", "CHECK"],
      rightBestActions: ["BET_33", "CHECK"],
      bestActionSetsOverlap: true,
      pass: true,
    });
  });

  it("fails closed when the canonical tree or range setup differs", () => {
    const left = exportFixture("texas-solver");
    const right = exportFixture("gto-plus");
    right.spot.treeFingerprint = `sha256:${"d".repeat(64)}`;

    const report = compareSolverExactNodes(left, right);

    expect(report).toMatchObject({
      valid: false,
      comparable: false,
      evidenceLevel: "NOT_COMPARABLE",
      metrics: null,
      rows: [],
    });
    expect(report.blockers[0]).toContain("Canonical spot setup differs");
  });

  it("flags disjoint best-action sets even when frequency tolerance is relaxed", () => {
    const left = exportFixture("texas-solver");
    const right = exportFixture("gto-plus");
    left.rows[0].evsBb = { CHECK: 1, BET_33: 0 };
    right.rows[0].evsBb = { CHECK: 0, BET_33: 1 };

    const report = compareSolverExactNodes(left, right, {
      maxActionEvDeltaBb: 2,
      maxDisjointBestActionPct: 0,
    });

    expect(report.valid).toBe(false);
    expect(report.comparable).toBe(true);
    expect(report.metrics).toMatchObject({
      evOutliers: 0,
      disjointBestActionRows: 1,
      disjointBestActionRowPct: 50,
      disjointBestActionRangeWeightPct: 55.5556,
    });
    expect(report.rows[0]).toMatchObject({
      leftBestActions: ["CHECK"],
      rightBestActions: ["BET_33"],
      bestActionSetsOverlap: false,
      pass: false,
    });
  });

  it("keeps frequency-only evidence explicit instead of treating it as EV", () => {
    const left = exportFixture("texas-solver");
    const right = exportFixture("gto-plus");
    left.rows.forEach((row) => delete row.evsBb);
    right.rows.forEach((row) => delete row.evsBb);

    const report = compareSolverExactNodes(left, right);

    expect(report).toMatchObject({
      valid: true,
      comparable: true,
      evidenceLevel: "EXACT_COMBO_STRATEGY",
      metrics: { evComparedRows: 0, maxActionEvDeltaBb: null },
    });
    expect(report.warnings[0]).toContain("no complete per-action EV payload");
  });

  it("rejects partial EV coverage and inaccurate solver exports", () => {
    const document = exportFixture("texas-solver");
    delete document.rows[1].evsBb;
    document.accuracy.exploitabilityBb = 0.6;

    const errors = validateSolverExactNodeExport(document);

    expect(errors).toEqual(expect.arrayContaining([
      "Per-action EV must be present for every row or omitted from the whole export.",
      "accuracy.exploitabilityBb 0.6 exceeds target 0.5.",
    ]));
  });

  it("rejects a nonsensical percentage tolerance", () => {
    const report = compareSolverExactNodes(
      exportFixture("texas-solver"),
      exportFixture("gto-plus"),
      { maxMeanStrategyDistancePct: 101 },
    );

    expect(report).toMatchObject({ valid: false, comparable: false, metrics: null });
    expect(report.blockers).toContain("maxMeanStrategyDistancePct must not exceed 100.");
  });

  it("binds variant economics and the pinned accuracy target into setup identity", () => {
    const left = exportFixture("texas-solver");
    const differentEconomics = exportFixture("gto-plus");
    differentEconomics.spot.variantConfigFingerprint = `sha256:${"e".repeat(64)}`;
    expect(compareSolverExactNodes(left, differentEconomics)).toMatchObject({
      valid: false,
      comparable: false,
    });

    const differentTarget = exportFixture("gto-plus");
    differentTarget.accuracy.targetExploitabilityBb = 0.4;
    expect(compareSolverExactNodes(left, differentTarget)).toMatchObject({
      valid: false,
      comparable: false,
    });
  });
});

function exportFixture(solverId: string): MutableSolverExport {
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
        { seatId: "IP", position: "BTN", startingStackBb: 50, rangeFingerprint: RANGE_A },
        { seatId: "OOP", position: "BB", startingStackBb: 50, rangeFingerprint: RANGE_B },
      ],
      actingSeatId: "OOP",
      board: ["As", "7d", "2c"],
      potBb: 5.5,
      effectiveStackBb: 47.5,
      potType: "SINGLE_RAISED",
      nodePath: [],
      variantConfigFingerprint: VARIANT_CONFIG,
      treeFingerprint: TREE,
    },
    granularity: "COMBO",
    actions: [
      { id: "CHECK", kind: "CHECK" },
      { id: "BET_33", kind: "BET", sizePotPct: 33 },
    ],
    rows: [
      {
        key: "AsAh",
        rangeWeight: 1,
        frequenciesPct: { CHECK: 50, BET_33: 50 },
        evsBb: { CHECK: 1, BET_33: 1.005 },
      },
      {
        key: "KcKd",
        rangeWeight: 0.8,
        frequenciesPct: { CHECK: 70, BET_33: 30 },
        evsBb: { CHECK: 0.9, BET_33: 1 },
      },
    ],
    accuracy: {
      exploitabilityBb: 0.25,
      targetExploitabilityBb: 0.5,
      iterations: 1000,
    },
  };
}

type MutableSolverExport = SolverExactNodeExport & {
  spot: SolverExactNodeExport["spot"] & { treeFingerprint: string };
  rows: Array<{
    key: string;
    rangeWeight: number;
    frequenciesPct: Record<string, number>;
    evsBb?: Record<string, number>;
  }>;
};
