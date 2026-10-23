import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import {
  buildSolverBoardCoveragePlan,
  isSupportedSolverBoardId,
  LEGACY_TEXAS_SOLVER_BOARDS,
  texasSolverBoardForId,
} from "../src/core/texasSolverBoardCatalog.ts";

const OUTPUT_BASE = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
type BatchPreset =
  | "active"
  | "next"
  | "followup"
  | "owner-depth"
  | "beta-min"
  | "beta-depth"
  | "growth";
const ACTIVE_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_large_flop_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-large-flop-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-large-flop-review-v1",
  generatedAt: "2026-07-10",
} as const;
const NEXT_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_next_flop_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-next-flop-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-next-flop-review-v1",
  generatedAt: "2026-07-14",
} as const;
const FOLLOWUP_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_followup_flop_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-followup-flop-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-followup-flop-review-v1",
  generatedAt: "2026-07-16",
} as const;
const OWNER_DEPTH_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_owner_depth_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-owner-depth-flop-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-owner-depth-flop-review-v1",
  generatedAt: "2026-07-16",
} as const;
const BETA_MIN_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_beta_min_board_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-beta-min-board-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-beta-min-board-review-v1",
  generatedAt: "2026-07-16",
} as const;
const BETA_DEPTH_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_beta_depth_board_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-beta-depth-board-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-beta-depth-board-review-v1",
  generatedAt: "2026-07-16",
} as const;
const GROWTH_BATCH = {
  outputDir: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_growth_board_review_v1",
  manifest: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-growth-board-review-v1-manifest.json",
  packId: "pkrtrainer-mtt-texas-solver-growth-board-review-v1",
  generatedAt: "2026-07-16",
} as const;

const SRP_EXPANSION_BOARDS = ["A95r", "KQ5r", "Q84r", "J73r", "976tt", "A85mono"] as const;
const THREE_BET_EXPANSION_BOARDS = ["AK5r", "KJ4tt", "J73r", "997r", "875tt", "A85mono"] as const;

interface Scenario {
  familyId: string;
  templatePath: string;
  boards: readonly string[];
  purpose: string;
  coverageTags: readonly string[];
}

interface CliArgs {
  preset: BatchPreset;
  manifestPath: string;
  outputDir: string;
  reviewOnlyManifest: boolean;
  write: boolean;
  summary: boolean;
}

interface GeneratedFile {
  fileName: string;
  path: string;
  familyId: string;
  boardId: string;
  written: boolean;
}

const SCENARIOS: readonly Scenario[] = [
  {
    familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_coverage_v2/01_MTT9_20BB_BTN_BB_SRP_LOWSPR_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "BTN vs BB SRP c-bet LOW-SPR board expansion for review depth.",
    coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_50BB_BTN_BB_SRP",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_safe_flops_v1/01_MTT9_50BB_BTN_BB_SRP_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "BTN vs BB SRP c-bet MID-SPR board expansion for review depth.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_80BB_BTN_BB_SRP_HIGHSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_coverage_v2/21_MTT9_80BB_BTN_BB_SRP_HIGHSPR_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "BTN vs BB SRP c-bet HIGH-SPR board expansion for review depth.",
    coverageTags: ["HIGH_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_co_bb_cbet_v1/01_MTT9_25BB_CO_BB_SRP_CBET_LOWSPR_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "CO vs BB SRP c-bet LOW-SPR board expansion for review depth.",
    coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_CO_VS_BB", "SINGLE_RAISED_POT_CBET", "IP_AGGRESSOR", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_50BB_CO_BB_SRP_CBET_MIDSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_co_bb_cbet_v1/21_MTT9_50BB_CO_BB_SRP_CBET_MIDSPR_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "CO vs BB SRP c-bet MID-SPR board expansion for review depth.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_CO_VS_BB", "SINGLE_RAISED_POT_CBET", "IP_AGGRESSOR", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_co_bb_cbet_v1/41_MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR_K98tt.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "CO vs BB SRP c-bet HIGH-SPR board expansion for review depth.",
    coverageTags: ["HIGH_SPR", "SINGLE_RAISED", "SRP_CO_VS_BB", "SINGLE_RAISED_POT_CBET", "IP_AGGRESSOR", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_sb_bb_oop_cbet_v1/01_MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "SB vs BB SRP OOP c-bet LOW-SPR board expansion for review depth.",
    coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_sb_bb_oop_cbet_v1/21_MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR_A72r.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "SB vs BB SRP OOP c-bet MID-SPR board expansion for review depth.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_sb_bb_oop_cbet_v1/41_MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR_K98tt.txt",
    boards: SRP_EXPANSION_BOARDS,
    purpose: "SB vs BB SRP OOP c-bet HIGH-SPR board expansion for review depth.",
    coverageTags: ["HIGH_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_35BB_CO_BTN_3BP_REPAIR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_3bp_repair_v1/01_MTT9_35BB_CO_BTN_3BP_REPAIR_A72r.txt",
    boards: THREE_BET_EXPANSION_BOARDS,
    purpose: "BTN vs CO 3bet-pot c-bet LOW-SPR board expansion for review depth.",
    coverageTags: ["LOW_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "THREE_BET_POT_CBET", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_80BB_CO_BTN_3BP_MIDSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_3bp_expansion_v1/01_MTT9_80BB_CO_BTN_3BP_MIDSPR_A72r.txt",
    boards: THREE_BET_EXPANSION_BOARDS,
    purpose: "BTN vs CO 3bet-pot c-bet MID-SPR board expansion for review depth.",
    coverageTags: ["MID_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "THREE_BET_POT_CBET", "LARGE_FLOP_REVIEW"],
  },
  {
    familyId: "MTT9_150BB_CO_BTN_3BP_HIGHSPR",
    templatePath:
      "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_3bp_expansion_v1/21_MTT9_150BB_CO_BTN_3BP_HIGHSPR_A72r.txt",
    boards: THREE_BET_EXPANSION_BOARDS,
    purpose: "BTN vs CO 3bet-pot c-bet HIGH-SPR board expansion for review depth.",
    coverageTags: ["HIGH_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "THREE_BET_POT_CBET", "LARGE_FLOP_REVIEW"],
  },
];
const NEXT_SRP_BOARDS = ["A72r", "T84r", "QJ2tt", "883r", "765tt", "Q76mono"] as const;
const NEXT_THREE_BET_BOARDS = ["A72r", "T84r", "QJ2tt", "JT9tt", "883r", "Q76mono"] as const;
const FOLLOWUP_SRP_BOARDS = ["K83r", "Q72r", "JT9tt", "AT4mono", "986tt", "742r"] as const;
const FOLLOWUP_THREE_BET_BOARDS = ["K83r", "Q72r", "JT9tt", "AT4mono", "986tt", "742r"] as const;
const OWNER_DEPTH_BOARDS = ["AKQtt", "K72r", "J85tt", "T97r", "664r", "432mono", "AQ6r", "KJTmono", "955tt"] as const;

const OWNER_DEPTH_SCENARIOS: readonly Scenario[] = [
  {
    familyId: "MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_facing_bet_lowspr_v1/01_MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR_A72r.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs BB SRP facing-bet LOW-SPR owner-review depth.",
    coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "FACING_BET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_facing_bet_v1/01_MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR_A72r.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs BB SRP facing-bet MID-SPR owner-review depth.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "FACING_BET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_facing_bet_v1/21_MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR_K98tt.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs BB SRP facing-bet HIGH-SPR owner-review depth.",
    coverageTags: ["HIGH_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "FACING_BET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_40BB_UTG_BB_SRP",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_coverage_v2/41_MTT9_40BB_UTG_BB_SRP_K83r.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "UTG vs BB SRP owner-review depth across underrepresented textures.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_UTG_VS_BB", "SINGLE_RAISED_POT_CBET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_35BB_CO_BTN_3BP",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_coverage_v2/61_MTT9_35BB_CO_BTN_3BP_A72r.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs CO 3bet-pot LOW-SPR owner-review depth.",
    coverageTags: ["LOW_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "THREE_BET_POT_CBET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_facing_bet_expansion_v1/01_MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR_A76tt.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs CO 3bet-pot facing-bet LOW-SPR owner-review depth.",
    coverageTags: ["LOW_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "FACING_BET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_facing_bet_expansion_v1/21_MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR_J87r.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs CO 3bet-pot facing-bet MID-SPR owner-review depth.",
    coverageTags: ["MID_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "FACING_BET", "OWNER_REVIEW_DEPTH"],
  },
  {
    familyId: "MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH",
    templatePath: "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_facing_bet_expansion_v1/41_MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH_K98tt.txt",
    boards: OWNER_DEPTH_BOARDS,
    purpose: "BTN vs CO 3bet-pot facing-bet MID/HIGH-SPR owner-review depth.",
    coverageTags: ["MID_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "FACING_BET", "OWNER_REVIEW_DEPTH"],
  },
];

const BOARD_COVERAGE_PLAN = buildSolverBoardCoveragePlan();
const BETA_MIN_MISSING_BOARDS = BOARD_COVERAGE_PLAN
  .flatMap((row) => row.betaMinimumBoardIds)
  .filter((boardId) => !(boardId in LEGACY_TEXAS_SOLVER_BOARDS));
const BETA_DEPTH_INCREMENT_BOARDS = BOARD_COVERAGE_PLAN
  .flatMap((row) => row.betaDepthBoardIds.filter(
    (boardId) => !row.betaMinimumBoardIds.includes(boardId),
  ));
const GROWTH_INCREMENT_BOARDS = BOARD_COVERAGE_PLAN
  .flatMap((row) => row.growthBoardIds.filter(
    (boardId) => !row.betaDepthBoardIds.includes(boardId),
  ));

const BOARD_COVERAGE_SCENARIOS = [...SCENARIOS, ...OWNER_DEPTH_SCENARIOS] as const;
const BETA_MIN_SCENARIOS = boardCoverageScenarios(
  BETA_MIN_MISSING_BOARDS,
  "BETA_MIN_BOARD_COVERAGE",
  "Canonical beta-minimum board cohort completion.",
);
const BETA_DEPTH_SCENARIOS = boardCoverageScenarios(
  BETA_DEPTH_INCREMENT_BOARDS,
  "BETA_DEPTH_BOARD_COVERAGE",
  "Canonical 12-board-per-cohort depth expansion.",
);
const GROWTH_SCENARIOS = boardCoverageScenarios(
  GROWTH_INCREMENT_BOARDS,
  "GROWTH_BOARD_COVERAGE",
  "Long-term canonical board evidence expansion.",
);

function boardCoverageScenarios(
  boards: readonly string[],
  coverageTag: string,
  purpose: string,
): readonly Scenario[] {
  return BOARD_COVERAGE_SCENARIOS.map((scenario, scenarioIndex, scenarios) => ({
    ...scenario,
    boards: boards.filter(
      (_boardId, boardIndex) => boardIndex % scenarios.length === scenarioIndex,
    ),
    purpose: `${scenario.purpose} ${purpose}`,
    coverageTags: unique([...scenario.coverageTags, coverageTag]),
  }));
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.write) writeBatch(args, report);
  const output = {
    ...report,
    files: report.files.map((file) => ({ ...file, written: args.write })),
    nextCommands: nextCommands(args),
  };
  console.log(args.summary ? renderSummary(output) : JSON.stringify(output, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let preset: CliArgs["preset"] = "active";
  let manifestPath: string | undefined;
  let outputDir: string | undefined;
  let reviewOnlyManifest = false;
  let write = false;
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--review-only-manifest") {
      reviewOnlyManifest = true;
      continue;
    }
    if (item === "--preset") {
      preset = parsePreset(requiredValue(argv, index, "--preset"));
      index += 1;
      continue;
    }
    if (item.startsWith("--preset=")) {
      preset = parsePreset(inlineValue(item, "--preset"));
      continue;
    }
    if (item === "--output-dir") {
      outputDir = resolve(requiredValue(argv, index, "--output-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output-dir=")) {
      outputDir = resolve(inlineValue(item, "--output-dir"));
      continue;
    }
    if (item === "--manifest") {
      manifestPath = resolve(requiredValue(argv, index, "--manifest"));
      index += 1;
      continue;
    }
    if (item.startsWith("--manifest=")) {
      manifestPath = resolve(inlineValue(item, "--manifest"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  const defaults = batchFor(preset);
  if (reviewOnlyManifest && preset !== "growth") {
    throw new Error("--review-only-manifest is currently supported only with --preset=growth.");
  }
  return {
    preset,
    manifestPath: manifestPath ?? resolve(
      reviewOnlyManifest
        ? "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-growth-board-review-v1-manifest.json"
        : defaults.manifest,
    ),
    outputDir: outputDir ?? resolve(defaults.outputDir),
    reviewOnlyManifest,
    write,
    summary,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-large-flop-batch",
    "  npm run mtt:texas-solver-large-flop-batch -- --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=next --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=followup --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=owner-depth --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=beta-min --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=beta-depth --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=growth --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=growth --review-only-manifest --write",
    "  npm run mtt:texas-solver-large-flop-batch -- --preset=next --summary",
    "",
    "Generates an isolated review-only TexasSolver flop board expansion batch.",
    "The next preset writes a separate batch and never changes the active autostart queue.",
    "It reuses existing reviewed family templates and does not mark any pack production-ready.",
  ].join("\n");
}

function buildReport(args: CliArgs): {
  valid: boolean;
  preset: CliArgs["preset"];
  outputDir: string;
  manifestPath: string;
  scenarios: readonly Scenario[];
  counts: { scenarios: number; files: number; blockers: number };
  files: GeneratedFile[];
  blockers: string[];
} {
  const scenarios = scenariosFor(args.preset);
  const blockers = [
    ...scenarios.flatMap((scenario) => (
      existsSync(resolve(scenario.templatePath))
        ? []
        : [`Missing template file for ${scenario.familyId}: ${scenario.templatePath}`]
    )),
    ...unique(scenarios.flatMap((scenario) => scenario.boards)).flatMap((boardId) => (
      !isSupportedSolverBoardId(boardId) ? [`Missing board mapping for ${boardId}.`] : []
    )),
  ];
  const files = scenarios.flatMap((scenario, scenarioIndex) => scenario.boards.map((boardId, boardIndex) => {
    const sequence = String(scenarioIndex * 100 + boardIndex + 1).padStart(3, "0");
    const fileName = `${sequence}_${scenario.familyId}_${boardId}.txt`;
    return {
      fileName,
      path: join(args.outputDir, fileName),
      familyId: scenario.familyId,
      boardId,
      written: false,
    };
  }));
  if (!args.reviewOnlyManifest && (
    args.preset === "owner-depth" || args.preset === "beta-min" ||
    args.preset === "beta-depth" || args.preset === "growth"
  )) {
    blockers.push(...familyBoardDuplicateBlockers(args, files, args.preset));
  }

  return {
    valid: blockers.length === 0,
    preset: args.preset,
    outputDir: args.outputDir,
    manifestPath: args.manifestPath,
    scenarios,
    counts: { scenarios: scenarios.length, files: files.length, blockers: blockers.length },
    files,
    blockers,
  };
}

function writeBatch(args: CliArgs, report: ReturnType<typeof buildReport>): void {
  if (!report.valid) throw new Error(`Cannot write large flop batch:\n${report.blockers.join("\n")}`);
  mkdirSync(args.outputDir, { recursive: true });
  mkdirSync(dirname(args.manifestPath), { recursive: true });

  for (const scenario of report.scenarios) {
    const template = readFileSync(resolve(scenario.templatePath), "utf8");
    for (const boardId of scenario.boards) {
      const file = report.files.find((item) => item.familyId === scenario.familyId && item.boardId === boardId);
      if (file === undefined) throw new Error(`Missing generated file for ${scenario.familyId}/${boardId}.`);
      writeIfChanged(file.path, renderParameter(template, scenario.familyId, boardId, args.preset));
    }
  }

  const batch = batchFor(args.preset);
  const manifest = {
    packId: batch.packId,
    generatedAt: batch.generatedAt,
    parameterDir: repoRelativePath(args.outputDir),
    outputBase: OUTPUT_BASE,
    scenarios: report.scenarios.map((scenario) => ({
      ...scenario,
      templatePath: repoRelativePath(resolve(scenario.templatePath)),
    })),
    files: report.files.map((file) => ({ ...file, path: repoRelativePath(file.path), written: true })),
    notes: [
      `${batchLabel(args.preset)} review-only TexasSolver flop expansion batch across existing validated pilot families.`,
      "This batch intentionally deepens board-texture evidence without inventing new position/range identities.",
      "It is not full MTT production coverage and must not be promoted without source-free review, normalization and gate validation.",
      "MTT_CORE_V1 preflop scope is complete; this batch is non-blocking P4 evidence expansion.",
      ...(args.preset !== "active" ? [
        "This prepared batch is intentionally outside the active autostart queue and cannot start TexasSolver by itself.",
        "It removes set_raise_limit 3 because the installed TexasSolver v0.2.0 console reports that directive as unrecognized; removal preserves the console default used by the active batch.",
      ] : []),
      ...(args.reviewOnlyManifest ? [
        "MEMORY_SAFE_REVIEW_ONLY tree: this manifest records raw exports created by the bounded manual day/night runners. It is not comparable to a full-tree production solve.",
        "Review-only evidence: automatic staging, normalization, pilot refresh and action-EV publication are disabled.",
      ] : []),
    ],
    commands: nextCommands(args),
    ...(args.reviewOnlyManifest ? {
      executionProfile: {
        treeProfile: "MEMORY_SAFE_REVIEW_ONLY",
        minimumFreeMemoryPercent: 35,
        maximumCpuPercent: 40,
        stopBelowFreeMemoryPercent: 25,
        processPriority: "BelowNormal",
      },
    } : {}),
  };
  writeIfChanged(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function renderParameter(template: string, familyId: string, boardId: string, preset: CliArgs["preset"]): string {
  const board = texasSolverBoardForId(boardId);
  const compatibleTemplate = preset !== "active"
    // TexasSolver v0.2.0 logs this directive as unrecognized. Keep the active batch frozen;
    // only the isolated next batch omits a command that the installed console already ignores.
    ? template.replace(/^set_raise_limit\s+.+(?:\r?\n|$)/m, "")
    : template;
  return compatibleTemplate
    .replace(/^set_board\s+.+$/m, `set_board ${board}`)
    .replace(/^dump_result\s+.+$/m, `dump_result pkrtrainer_${familyId}_${boardId}.json`);
}

function nextCommands(args: CliArgs): string[] {
  const parameterRoot = repoPowerShellPath(args.outputDir);
  const manifest = repoPowerShellPath(args.manifestPath);
  const commands = [
    `npm run mtt:texas-solver-large-flop-batch -- --preset=${args.preset} --write`,
    `npm run mtt:texas-solver-scenario-audit -- --manifest "${manifest}" --summary`,
    `.\u005cAgents\u005csolver-input\u005ctexas-solver\u005cmtt-safe-flops-v1\u005crun-console-selected.ps1 -ParameterRoot "${parameterRoot}" -Limit 999 -ListOnly`,
  ];
  if (args.reviewOnlyManifest) {
    return [
      `npm run mtt:texas-solver-coverage-status -- --manifest "${manifest}" --summary`,
      "MEMORY_SAFE_REVIEW_ONLY evidence is intentionally excluded from automatic staging and normalization.",
    ];
  }
  if (args.preset === "next") {
    return [
      ...commands,
      "npm run mtt:solver-batch-prep-status",
      "Wait for the active queue to complete and its evidence review before any queue change.",
    ];
  }
  if (args.preset === "followup") {
    return [
      ...commands,
      "The resource-balanced low-memory worker starts this follow-up only after the next-review manifest is raw-complete.",
    ];
  }
  if (args.preset === "owner-depth") {
    return [
      ...commands,
      "npm run mtt:texas-solver-low-memory-install",
      "The resource-balanced low-memory worker starts this owner-depth phase only after the follow-up manifest is raw-complete.",
    ];
  }
  if (args.preset === "beta-min") {
    return [
      ...commands,
      "This isolated 45-board wave starts only after owner-depth is raw-complete.",
      "It completes global six-board cohort calibration without multiplying every board by every family.",
    ];
  }
  if (args.preset === "beta-depth") {
    return [
      ...commands,
      "Keep this 83-board wave outside every active worker until beta-minimum solving and review are complete.",
    ];
  }
  if (args.preset === "growth") {
    return [
      ...commands,
      "Keep this 98-board long-term wave outside every active worker until beta-depth review is complete.",
    ];
  }
  return [
    ...commands,
    "npm run mtt:texas-solver-autostart-install",
    "npm run mtt:texas-solver-autostart-status",
    `npm run mtt:texas-solver-background-status -- --manifest "${manifest}" --summary`,
  ];
}

function parsePreset(value: string): CliArgs["preset"] {
  if (
    value === "active" || value === "next" || value === "followup" ||
    value === "owner-depth" || value === "beta-min" ||
    value === "beta-depth" || value === "growth"
  ) return value;
  throw new Error(`--preset must be active, next, followup, owner-depth, beta-min, beta-depth or growth, received: ${value}`);
}

function batchFor(preset: CliArgs["preset"]): {
  outputDir: string;
  manifest: string;
  packId: string;
  generatedAt: string;
} {
  if (preset === "next") return NEXT_BATCH;
  if (preset === "followup") return FOLLOWUP_BATCH;
  if (preset === "owner-depth") return OWNER_DEPTH_BATCH;
  if (preset === "beta-min") return BETA_MIN_BATCH;
  if (preset === "beta-depth") return BETA_DEPTH_BATCH;
  if (preset === "growth") return GROWTH_BATCH;
  return ACTIVE_BATCH;
}

function scenariosFor(preset: CliArgs["preset"]): readonly Scenario[] {
  if (preset === "active") return SCENARIOS;
  if (preset === "owner-depth") return OWNER_DEPTH_SCENARIOS;
  if (preset === "beta-min") return BETA_MIN_SCENARIOS;
  if (preset === "beta-depth") return BETA_DEPTH_SCENARIOS;
  if (preset === "growth") return GROWTH_SCENARIOS;
  const boards = preset === "next"
    ? { srp: NEXT_SRP_BOARDS, threeBet: NEXT_THREE_BET_BOARDS }
    : { srp: FOLLOWUP_SRP_BOARDS, threeBet: FOLLOWUP_THREE_BET_BOARDS };
  return SCENARIOS.map((scenario) => ({
    ...scenario,
    boards: scenario.coverageTags.includes("THREE_BET_POT") ? boards.threeBet : boards.srp,
  }));
}

function batchLabel(preset: BatchPreset): string {
  if (preset === "active") return "Large";
  if (preset === "next") return "Next";
  if (preset === "followup") return "Follow-up";
  if (preset === "owner-depth") return "Owner-depth";
  if (preset === "beta-min") return "Beta-minimum";
  if (preset === "beta-depth") return "Beta-depth";
  return "Growth";
}

function familyBoardDuplicateBlockers(
  args: CliArgs,
  files: readonly GeneratedFile[],
  label: "owner-depth" | "beta-min" | "beta-depth" | "growth",
): string[] {
  const manifestDir = dirname(args.manifestPath);
  const targetManifest = resolve(args.manifestPath);
  const existing = new Map<string, string[]>();
  const blockers: string[] = [];
  let manifestNames: string[];

  try {
    manifestNames = readdirSync(manifestDir)
      .filter((name) => /^coverage-.*-manifest\.json$/i.test(name))
      .sort();
  } catch (error) {
    return [`Could not inspect existing coverage manifests in ${manifestDir}: ${error instanceof Error ? error.message : String(error)}`];
  }

  for (const manifestName of manifestNames) {
    const manifestPath = resolve(manifestDir, manifestName);
    if (manifestPath === targetManifest) continue;

    let manifest: {
      executionProfile?: { treeProfile?: unknown };
      files?: unknown;
    };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as typeof manifest;
    } catch (error) {
      blockers.push(`Could not parse existing coverage manifest ${manifestName}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (manifest.executionProfile?.treeProfile === "MEMORY_SAFE_REVIEW_ONLY") continue;
    if (!Array.isArray(manifest.files)) {
      blockers.push(`Existing coverage manifest ${manifestName} has no files array.`);
      continue;
    }
    for (const entry of manifest.files) {
      const item = entry as { familyId?: unknown; boardId?: unknown };
      if (typeof item.familyId !== "string" || typeof item.boardId !== "string") {
        blockers.push(`Existing coverage manifest ${manifestName} contains a file without familyId/boardId.`);
        continue;
      }
      const key = `${item.familyId}/${item.boardId}`;
      existing.set(key, [...(existing.get(key) ?? []), manifestName]);
    }
  }

  const generated = new Set<string>();
  for (const file of files) {
    const key = `${file.familyId}/${file.boardId}`;
    if (generated.has(key)) blockers.push(`${label} batch repeats generated family/board ${key}.`);
    generated.add(key);
    const sources = existing.get(key);
    if (sources !== undefined) {
      blockers.push(`${label} family/board ${key} already exists in ${sources.join(", ")}.`);
    }
  }
  return blockers;
}

function writeIfChanged(path: string, content: string): void {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return;
  writeFileSync(path, content, "utf8");
}

function renderSummary(report: ReturnType<typeof buildReport> & { nextCommands: string[] }): string {
  return [
    "TexasSolver review batch",
    `valid: ${report.valid}`,
    `preset: ${report.preset}`,
    `scenarios: ${report.counts.scenarios}`,
    `files: ${report.counts.files}`,
    `blockers: ${report.counts.blockers}`,
    ...report.blockers.map((blocker) => `blocker: ${blocker}`),
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function repoRelativePath(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function repoPowerShellPath(path: string): string {
  return `.\u005c${relative(process.cwd(), path).replaceAll("/", "\\")}`;
}

function unique<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
