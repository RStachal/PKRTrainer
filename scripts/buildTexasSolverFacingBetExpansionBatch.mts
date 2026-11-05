import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { texasSolverBoardForId } from "../src/core/texasSolverBoardCatalog.ts";

const DEFAULT_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_facing_bet_expansion_v1";
const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-facing-bet-expansion-v1-manifest.json";

const OUTPUT_BASE = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

interface Scenario {
  familyId: string;
  pot: number;
  effectiveStack: number;
  boards: readonly string[];
  purpose: string;
  coverageTags: readonly string[];
}

const SCENARIOS: readonly Scenario[] = [
  {
    familyId: "MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR",
    pot: 157,
    effectiveStack: 280,
    boards: ["A76tt", "K98tt", "T76tt", "654r"],
    purpose: "CO vs BTN 3bet-pot LOW-SPR facing flop bet response probe with dynamic boards.",
    coverageTags: ["LOW_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "FLOP_FACING_BET", "XR_BLUFF_PROBE"],
  },
  {
    familyId: "MTT9_70BB_CO_BTN_3BP_FACING_MIDSPR",
    pot: 157,
    effectiveStack: 520,
    boards: ["J87r", "T76tt", "985mono", "654r", "QJ9tt", "876tt"],
    purpose: "CO vs BTN 3bet-pot MID-SPR facing flop bet response probe for natural check-raise bluffs.",
    coverageTags: ["MID_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "FLOP_FACING_BET", "XR_BLUFF_PROBE"],
  },
  {
    familyId: "MTT9_110BB_CO_BTN_3BP_FACING_MIDHIGH",
    pot: 157,
    effectiveStack: 900,
    boards: ["K98tt", "J87r", "T76tt", "985mono", "QJ9tt", "876tt"],
    purpose: "CO vs BTN 3bet-pot upper-MID SPR facing flop bet response probe to bridge MID and HIGH pilots.",
    coverageTags: ["MID_SPR", "THREE_BET_POT", "3BP_BTN_VS_CO", "FLOP_FACING_BET", "XR_BLUFF_PROBE"],
  },
];

interface CliArgs {
  manifestPath: string;
  outputDir: string;
  write: boolean;
}

interface GeneratedFile {
  fileName: string;
  path: string;
  familyId: string;
  boardId: string;
  written: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const files = buildFiles(args);
  const report = {
    valid: true,
    outputDir: args.outputDir,
    manifestPath: args.manifestPath,
    scenarios: SCENARIOS,
    counts: { scenarios: SCENARIOS.length, files: files.length },
    files: files.map((file) => ({ ...file, written: args.write })),
    nextCommands: nextCommands(args),
  };
  if (args.write) writeBatch(args, files);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let outputDir = resolve(DEFAULT_OUTPUT_DIR);
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
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

  return { manifestPath, outputDir, write };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-facing-bet-expansion-batch",
    "  npm run mtt:texas-solver-facing-bet-expansion-batch -- --write",
    "",
    "Generates review-only BTN vs CO 3bet-pot FLOP_FACING_BET TexasSolver inputs.",
    "The board/range set intentionally targets natural check-raise bluff candidates for LOW/MID coverage.",
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

function buildFiles(args: CliArgs): GeneratedFile[] {
  return SCENARIOS.flatMap((scenario, scenarioIndex) => scenario.boards.map((boardId, boardIndex) => {
    const sequence = String(scenarioIndex * 20 + boardIndex + 1).padStart(2, "0");
    const fileName = `${sequence}_${scenario.familyId}_${boardId}.txt`;
    return {
      fileName,
      path: join(args.outputDir, fileName),
      familyId: scenario.familyId,
      boardId,
      written: false,
    };
  }));
}

function writeBatch(args: CliArgs, files: readonly GeneratedFile[]): void {
  mkdirSync(args.outputDir, { recursive: true });
  mkdirSync(dirname(args.manifestPath), { recursive: true });

  for (const scenario of SCENARIOS) {
    for (const boardId of scenario.boards) {
      const file = files.find((item) => item.familyId === scenario.familyId && item.boardId === boardId);
      if (file === undefined) throw new Error(`Missing generated file for ${scenario.familyId}/${boardId}.`);
      writeFileSync(file.path, renderParameter(scenario, boardId), "utf8");
    }
  }

  writeFileSync(args.manifestPath, `${JSON.stringify({
    packId: "pkrtrainer-mtt-texas-solver-facing-bet-expansion-v1",
    generatedAt: "2026-07-02",
    parameterDir: repoRelativePath(args.outputDir),
    outputBase: OUTPUT_BASE,
    scenarios: SCENARIOS,
    files: files.map((file) => ({ ...file, path: repoRelativePath(file.path), written: true })),
    notes: [
      "Review-only TexasSolver expansion for BTN vs CO 3bet-pot flop facing-bet response nodes.",
      "Generated after HIGH-SPR CHECK>BET_39 passed the scoped facing-bet pilot gate.",
      "Ranges intentionally include more suited connectors/gappers in the OOP caller range to test real check-raise bluff frequencies; do not promote without gate validation.",
    ],
    commands: nextCommands(args),
  }, null, 2)}\n`, "utf8");
}

function renderParameter(scenario: Scenario, boardId: string): string {
  const board = texasSolverBoardForId(boardId);
  return [
    `set_pot ${scenario.pot}`,
    `set_effective_stack ${scenario.effectiveStack}`,
    `set_board ${board}`,
    "set_range_oop QQ,JJ,TT,99,88,77,66,55,44,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,KQs,KJs,KTs,K9s,QJs,QTs,Q9s,JTs,J9s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,AQo,KQo,QJo",
    "set_range_ip AA,KK,QQ,JJ,TT,99,88,AKs,AQs,AJs,ATs,A9s,A8s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,QJs,QTs,JTs,T9s,98s,87s,76s,65s,54s,AKo,AQo,AJo,KQo,KJo,QJo",
    "set_bet_sizes oop,flop,bet,50",
    "set_bet_sizes oop,flop,raise,75,100",
    "set_bet_sizes oop,flop,allin",
    "set_bet_sizes ip,flop,bet,25,33,50",
    "set_bet_sizes ip,flop,raise,75,100",
    "set_bet_sizes ip,flop,allin",
    "set_bet_sizes oop,turn,bet,50",
    "set_bet_sizes oop,turn,raise,100",
    "set_bet_sizes oop,turn,donk,50",
    "set_bet_sizes oop,turn,allin",
    "set_bet_sizes ip,turn,bet,50",
    "set_bet_sizes ip,turn,raise,100",
    "set_bet_sizes ip,turn,allin",
    "set_bet_sizes oop,river,bet,50",
    "set_bet_sizes oop,river,raise,100",
    "set_bet_sizes oop,river,allin",
    "set_bet_sizes ip,river,bet,50",
    "set_bet_sizes ip,river,raise,100",
    "set_bet_sizes oop,river,donk,50",
    "set_bet_sizes ip,river,allin",
    "set_allin_threshold 0.67",
    "set_raise_limit 3",
    "build_tree",
    "set_thread_num 8",
    "set_accuracy 0.5",
    "set_max_iteration 200",
    "set_print_interval 10",
    "set_use_isomorphism 1",
    "start_solve",
    "set_dump_rounds 2",
    `dump_result pkrtrainer_${scenario.familyId}_${boardId}.json`,
    "",
  ].join("\n");
}

function nextCommands(args: CliArgs): string[] {
  const parameterRoot = repoPowerShellPath(args.outputDir);
  const manifest = repoPowerShellPath(args.manifestPath);
  return [
    "npm run mtt:texas-solver-facing-bet-expansion-batch -- --write",
    `npm run mtt:texas-solver-scenario-audit -- --manifest "${manifest}" --summary`,
    `.\u005cAgents\u005csolver-input\u005ctexas-solver\u005cmtt-safe-flops-v1\u005crun-console-selected.ps1 -ParameterRoot "${parameterRoot}" -Limit 999 -ListOnly`,
    `.\u005cAgents\u005csolver-input\u005ctexas-solver\u005cmtt-safe-flops-v1\u005crun-console-selected.ps1 -ParameterRoot "${parameterRoot}" -Limit 999`,
    `npm run mtt:texas-solver-coverage-status -- --manifest "${manifest}" --summary`,
  ];
}

function repoRelativePath(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function repoPowerShellPath(path: string): string {
  return `.\u005c${relative(process.cwd(), path).replaceAll("/", "\\")}`;
}
