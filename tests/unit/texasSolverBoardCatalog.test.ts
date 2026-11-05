import { describe, expect, it } from "vitest";

import {
  buildSolverBoardCoveragePlan,
  classifySolverBoardId,
  enumerateCanonicalSolverBoardIds,
  LEGACY_TEXAS_SOLVER_BOARDS,
  parseTexasSolverBoard,
  representativeFlopForBoardId,
  SOLVER_BOARD_COHORTS,
  texasSolverBoardForId,
} from "../../src/core/texasSolverBoardCatalog";

describe("TexasSolver board catalog", () => {
  it("pins all 40 existing boards and classifies each into one cohort", () => {
    const boardIds = Object.keys(LEGACY_TEXAS_SOLVER_BOARDS);
    expect(boardIds).toHaveLength(40);
    for (const boardId of boardIds) {
      expect(parseTexasSolverBoard(texasSolverBoardForId(boardId))).toHaveLength(3);
      expect(representativeFlopForBoardId(boardId)).toEqual(
        parseTexasSolverBoard(LEGACY_TEXAS_SOLVER_BOARDS[
          boardId as keyof typeof LEGACY_TEXAS_SOLVER_BOARDS
        ]),
      );
      expect(SOLVER_BOARD_COHORTS.map((cohort) => cohort.id)).toContain(
        classifySolverBoardId(boardId).cohortId,
      );
    }
  });

  it("derives valid rainbow, two-tone and monotone cards without duplicates", () => {
    expect(representativeFlopForBoardId("AKQr")).toEqual([
      { rank: "A", suit: "s" },
      { rank: "K", suit: "h" },
      { rank: "Q", suit: "d" },
    ]);
    expect(representativeFlopForBoardId("AA7tt")).toEqual([
      { rank: "A", suit: "s" },
      { rank: "A", suit: "h" },
      { rank: "7", suit: "s" },
    ]);
    expect(() => representativeFlopForBoardId("AA7mono")).toThrow(/cannot contain a paired rank/i);
    expect(() => representativeFlopForBoardId("777tt")).toThrow(/cannot be two-tone/i);
  });

  it("keeps strategic cohort boundaries stable for wheels, suits and pairing", () => {
    expect(classifySolverBoardId("A32r").cohortId).toBe("ACE_HIGH_DYNAMIC");
    expect(classifySolverBoardId("A92r").cohortId).toBe("ACE_HIGH_DRY_RAINBOW");
    expect(classifySolverBoardId("T93mono").cohortId).toBe("HIGH_MONOTONE");
    expect(classifySolverBoardId("987tt").cohortId).toBe("MIDDLE_DYNAMIC");
    expect(classifySolverBoardId("AA7tt").cohortId).toBe("PAIRED_TWO_TONE");
    expect(classifySolverBoardId("888r").cohortId).toBe("TRIPS_RAINBOW");
  });

  it("builds non-overlapping 6/12/growth board targets for every strategic cohort", () => {
    const plan = buildSolverBoardCoveragePlan();
    expect(plan).toHaveLength(14);
    expect(plan.map((row) => row.id)).toEqual(SOLVER_BOARD_COHORTS.map((row) => row.id));
    expect(plan.every((row) => row.betaMinimumBoardIds.length >= 6)).toBe(true);
    expect(plan.every((row) => row.betaDepthBoardIds.length >= 12)).toBe(true);
    expect(plan.every((row) => row.growthBoardIds.length >= row.growthTarget)).toBe(true);
    expect(plan.find((row) => row.id === "LOW_DRY_RAINBOW")?.growthTarget).toBe(13);
    expect(plan.find((row) => row.id === "TRIPS_RAINBOW")?.growthTarget).toBe(13);
    expect(plan.filter((row) => row.growthTarget === 20)).toHaveLength(12);
    expect(plan.flatMap((row) => row.betaMinimumBoardIds)
      .filter((boardId) => !(boardId in LEGACY_TEXAS_SOLVER_BOARDS))).toHaveLength(45);
    expect(plan.flatMap((row) => row.betaDepthBoardIds.filter(
      (boardId) => !row.betaMinimumBoardIds.includes(boardId),
    ))).toHaveLength(83);
    expect(plan.flatMap((row) => row.growthBoardIds.filter(
      (boardId) => !row.betaDepthBoardIds.includes(boardId),
    ))).toHaveLength(98);
    expect(new Set(plan.flatMap((row) => row.growthBoardIds)).size).toBe(
      plan.flatMap((row) => row.growthBoardIds).length,
    );
  });

  it("enumerates only supported physical board ids", () => {
    const ids = enumerateCanonicalSolverBoardIds();
    expect(ids.length).toBeGreaterThan(1_000);
    expect(new Set(ids).size).toBe(ids.length);
    for (const boardId of ids) expect(representativeFlopForBoardId(boardId)).toHaveLength(3);
  });
});
