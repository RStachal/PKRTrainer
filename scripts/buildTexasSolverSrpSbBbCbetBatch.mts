import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { texasSolverBoardForId } from "../src/core/texasSolverBoardCatalog.ts";

const DEFAULT_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_sb_bb_oop_cbet_v1";
const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-srp-sb-bb-oop-cbet-v1-manifest.json";
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
    familyId: "MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR",
    pot: 50,
    effectiveStack: 125,
    boards: ["A72r", "K98tt", "T76tt", "654r"],
    purpose: "SB vs BB single-raised-pot LOW-SPR OOP flop c-bet probe.",
    coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR"],
  },
  {
    familyId: "MTT9_50BB_SB_BB_SRP_OOP_CBET_MIDSPR",
    pot: 50,
    effectiveStack: 300,
    boards: ["A72r", "K98tt", "QJ9tt", "985mono"],
    purpose: "SB vs BB single-raised-pot MID-SPR OOP flop c-bet probe.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR"],
  },
  {
    familyId: "MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR",
    pot: 50,
    effectiveStack: 650,
    boards: ["K98tt", "T76tt", "QJ9tt", "985mono"],
    purpose: "SB vs BB single-raised-pot HIGH-SPR OOP flop c-bet probe.",
    coverageTags: ["HIGH_SPR", "SINGLE_RAISED", "SRP_SB_VS_BB", "SINGLE_RAISED_POT_CBET", "OOP_AGGRESSOR"],
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
    "  npm run mtt:texas-solver-srp-sb-bb-cbet-batch",
    "  npm run mtt:texas-solver-srp-sb-bb-cbet-batch -- --write",
    "",
    "Generates review-only SB vs BB SRP OOP flop c-bet TexasSolver inputs.",
    "This is evidence for future full-production coverage, not a production promotion.",
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
    packId: "pkrtrainer-mtt-texas-solver-srp-sb-bb-oop-cbet-v1",
    generatedAt: "2026-07-08",
    parameterDir: repoRelativePath(args.outputDir),
    outputBase: OUTPUT_BASE,
    scenarios: SCENARIOS,
    files: files.map((file) => ({ ...file, path: repoRelativePath(file.path), written: true })),
    notes: [
      "Review-only TexasSolver expansion for SB vs BB single-raised-pot OOP flop c-bet nodes.",
      "SB is the preflop aggressor but acts OOP postflop, so this batch intentionally differs from BTN vs BB SRP c-bet pilots.",
      "Generated from source-free operator assumptions; poker review and normalization policy are required before any production promotion.",
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
    "set_range_oop AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,K4s,K3s,K2s,QJs,QTs,Q9s,Q8s,Q7s,Q6s,Q5s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,96s,87s,86s,76s,75s,65s,64s,54s,53s,43s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,A5o,KQo,KJo,KTo,K9o,QJo,QTo,JTo,T9o,98o",
    "set_range_ip AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,K4s,K3s,K2s,QJs,QTs,Q9s,Q8s,Q7s,Q6s,Q5s,Q4s,Q3s,Q2s,JTs,J9s,J8s,J7s,J6s,J5s,J4s,J3s,T9s,T8s,T7s,T6s,T5s,98s,97s,96s,95s,87s,86s,85s,84s,76s,75s,74s,65s,64s,63s,54s,53s,52s,43s,42s,32s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,A6o,A5o,A4o,A3o,A2o,KQo,KJo,KTo,K9o,K8o,K7o,K6o,K5o,QJo,QTo,Q9o,Q8o,Q7o,JTo,J9o,J8o,J7o,T9o,T8o,98o,97o,87o,76o,65o",
    "set_bet_sizes oop,flop,bet,33,50,75",
    "set_bet_sizes oop,flop,raise,75,100",
    "set_bet_sizes oop,flop,allin",
    "set_bet_sizes ip,flop,bet,33,50",
    "set_bet_sizes ip,flop,raise,75,100",
    "set_bet_sizes ip,flop,allin",
    "set_bet_sizes oop,turn,bet,50,75",
    "set_bet_sizes oop,turn,raise,100",
    "set_bet_sizes oop,turn,donk,50",
    "set_bet_sizes oop,turn,allin",
    "set_bet_sizes ip,turn,bet,50,75",
    "set_bet_sizes ip,turn,raise,100",
    "set_bet_sizes ip,turn,allin",
    "set_bet_sizes oop,river,bet,50,75",
    "set_bet_sizes oop,river,raise,100",
    "set_bet_sizes oop,river,allin",
    "set_bet_sizes ip,river,bet,50,75",
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
    "npm run mtt:texas-solver-srp-sb-bb-cbet-batch -- --write",
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
