import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildSolverBoardCoveragePlan,
  classifySolverBoardId,
  isSupportedSolverBoardId,
  TEXAS_SOLVER_BOARD_CATALOG_VERSION,
} from "../src/core/texasSolverBoardCatalog.ts";

const DEFAULT_MANIFEST_ROOT =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1";

interface CliArgs {
  manifestRoot: string;
  json: boolean;
  outputPath?: string;
}

interface CoverageManifest {
  executionProfile?: { treeProfile?: unknown };
  files?: Array<{ familyId?: unknown; boardId?: unknown }>;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args.manifestRoot);
  if (args.outputPath !== undefined) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderSummary(report));
  if (!report.valid) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let manifestRoot = resolve(DEFAULT_MANIFEST_ROOT);
  let json = false;
  let outputPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--manifest-root") {
      manifestRoot = resolve(requiredValue(argv, index, item));
      index += 1;
      continue;
    }
    if (item.startsWith("--manifest-root=")) {
      manifestRoot = resolve(item.slice("--manifest-root=".length));
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(requiredValue(argv, index, item));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(item.slice("--output=".length));
      continue;
    }
    if (item === "--help" || item === "-h") throw new Error(usage());
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { manifestRoot, json, outputPath };
}

function buildReport(manifestRoot: string) {
  if (!existsSync(manifestRoot)) throw new Error(`Manifest root does not exist: ${manifestRoot}`);
  const errors: string[] = [];
  const manifestNames = readdirSync(manifestRoot)
    .filter((name) => /^coverage-.*-manifest\.json$/i.test(name))
    .sort();
  const sourceManifestNames: string[] = [];
  const boardIds: string[] = [];
  const familyBoardPairs: string[] = [];
  const familyBoards = new Map<string, Set<string>>();

  for (const name of manifestNames) {
    const path = resolve(manifestRoot, name);
    let manifest: CoverageManifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8")) as CoverageManifest;
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (manifest.executionProfile?.treeProfile === "MEMORY_SAFE_REVIEW_ONLY") continue;
    sourceManifestNames.push(name);
    if (!Array.isArray(manifest.files)) {
      errors.push(`${name}: missing files array`);
      continue;
    }
    for (const [index, entry] of manifest.files.entries()) {
      if (typeof entry.familyId !== "string" || typeof entry.boardId !== "string") {
        errors.push(`${name}: files[${index}] is missing familyId or boardId`);
        continue;
      }
      if (!isSupportedSolverBoardId(entry.boardId)) {
        errors.push(`${name}: unsupported board id ${entry.boardId}`);
        continue;
      }
      boardIds.push(entry.boardId);
      familyBoardPairs.push(`${entry.familyId}/${entry.boardId}`);
      const boards = familyBoards.get(entry.familyId) ?? new Set<string>();
      boards.add(entry.boardId);
      familyBoards.set(entry.familyId, boards);
    }
  }

  const uniqueBoardIds = unique(boardIds).sort();
  const plan = buildSolverBoardCoveragePlan(uniqueBoardIds).map((row) => ({
    ...row,
    plannedBetaMinimumBoardIds: row.betaMinimumBoardIds.filter(
      (boardId) => !row.existingBoardIds.includes(boardId),
    ),
    plannedBetaDepthBoardIds: row.betaDepthBoardIds.filter(
      (boardId) => !row.existingBoardIds.includes(boardId),
    ),
  }));
  for (const row of plan) {
    if (row.betaMinimumBoardIds.length < row.betaMinimum) {
      errors.push(`${row.id}: cannot satisfy beta minimum target ${row.betaMinimum}`);
    }
    if (row.betaDepthBoardIds.length < row.betaDepth) {
      errors.push(`${row.id}: cannot satisfy beta depth target ${row.betaDepth}`);
    }
    if (row.growthBoardIds.length < row.growthTarget) {
      errors.push(`${row.id}: cannot satisfy growth target ${row.growthTarget}`);
    }
  }
  const classifiedBoards = uniqueBoardIds.map((boardId) => ({
    boardId,
    ...classifySolverBoardId(boardId),
  }));
  const families = [...familyBoards.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([familyId, boards]) => {
      const familyBoardIds = [...boards].sort();
      const countsByCohort = new Map<string, number>();
      for (const boardId of familyBoardIds) {
        const cohortId = classifySolverBoardId(boardId).cohortId;
        countsByCohort.set(cohortId, (countsByCohort.get(cohortId) ?? 0) + 1);
      }
      const cohorts = [...countsByCohort.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([cohortId, boardCount]) => ({ cohortId, boardCount }));
      const largestCohortCount = Math.max(0, ...cohorts.map((row) => row.boardCount));
      return {
        familyId,
        boardIds: familyBoardIds,
        boardCount: familyBoardIds.length,
        cohortCount: cohorts.length,
        largestCohortCount,
        largestCohortShare: familyBoardIds.length === 0
          ? 0
          : Math.round((largestCohortCount / familyBoardIds.length) * 1_000) / 1_000,
        declaredBetaShape: familyBoardIds.length >= 12 &&
          cohorts.length >= 6 &&
          largestCohortCount <= familyBoardIds.length / 2,
        cohorts,
      };
    });

  return {
    valid: errors.length === 0 && sourceManifestNames.length > 0,
    catalogVersion: TEXAS_SOLVER_BOARD_CATALOG_VERSION,
    coverageBasis: "DECLARED_SOURCE_MANIFESTS_NOT_SOLVE_COMPLETION",
    manifestRoot,
    counts: {
      sourceManifests: sourceManifestNames.length,
      uniqueBoards: uniqueBoardIds.length,
      uniqueFamilyBoardPairs: unique(familyBoardPairs).length,
      families: families.length,
      declaredBetaShapeFamilies: families.filter((family) => family.declaredBetaShape).length,
      cohorts: plan.length,
      betaMinimumTarget: plan.reduce((sum, row) => sum + row.betaMinimum, 0),
      betaMinimumGap: plan.reduce((sum, row) => sum + row.betaMinimumGap, 0),
      betaDepthTarget: plan.reduce((sum, row) => sum + row.betaDepth, 0),
      betaDepthGap: plan.reduce((sum, row) => sum + row.betaDepthGap, 0),
      growthTarget: plan.reduce((sum, row) => sum + row.growthTarget, 0),
      growthGap: plan.reduce((sum, row) => sum + row.growthGap, 0),
    },
    sourceManifestNames,
    classifiedBoards,
    cohorts: plan,
    families,
    errors,
    releasePolicy: {
      beta: "Six canonical rank boards per cohort globally; exact family/board EV remains gated by exact reviewed evidence.",
      betaDepth: "Twelve canonical rank boards per cohort continue in the background and do not block the first beta.",
      growth: "Twenty canonical rank boards per cohort are the long-term evidence target.",
      isomorphism: "Suit-isomorphic cards may share one exact solve; different rank boards never inherit exact action EV.",
      declaredFamilyShape: "Manifest shape is a scheduling signal only; solve completion and owner review remain separate release gates.",
    },
  };
}

function renderSummary(report: ReturnType<typeof buildReport>): string {
  return [
    "TexasSolver canonical flop catalog",
    `valid: ${report.valid}`,
    `catalog version: ${report.catalogVersion}`,
    `coverage basis: ${report.coverageBasis}`,
    `source manifests: ${report.counts.sourceManifests}`,
    `unique boards: ${report.counts.uniqueBoards}`,
    `unique family/board pairs: ${report.counts.uniqueFamilyBoardPairs}`,
    `declared beta family shape: ${report.counts.declaredBetaShapeFamilies}/${report.counts.families}`,
    `cohorts: ${report.counts.cohorts}`,
    `declared beta minimum: ${report.counts.betaMinimumTarget - report.counts.betaMinimumGap}/${report.counts.betaMinimumTarget}`,
    `declared beta depth: ${report.counts.betaDepthTarget - report.counts.betaDepthGap}/${report.counts.betaDepthTarget}`,
    `declared growth: ${report.counts.growthTarget - report.counts.growthGap}/${report.counts.growthTarget}`,
    ...report.cohorts.map((row) => (
      `${row.id}: ${row.existingBoardIds.length}/${row.betaMinimum} beta-min, ` +
      `${row.betaMinimumGap} missing; planned ${row.plannedBetaMinimumBoardIds.join(",") || "none"}`
    )),
    ...report.errors.map((error) => `error: ${error}`),
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-board-catalog",
    "  npm run mtt:texas-solver-board-catalog -- --json",
    "  npm run mtt:texas-solver-board-catalog -- --manifest-root=<path>",
    "  npm run mtt:texas-solver-board-catalog -- --json --output=<path>",
  ].join("\n");
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
