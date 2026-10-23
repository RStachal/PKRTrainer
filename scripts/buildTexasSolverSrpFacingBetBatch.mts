import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { texasSolverBoardForId } from "../src/core/texasSolverBoardCatalog.ts";

const DEFAULT_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_facing_bet_v1";
const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-srp-facing-bet-v1-manifest.json";
const LOWSPR_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_srp_facing_bet_lowspr_v1";
const LOWSPR_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-srp-facing-bet-lowspr-v1-manifest.json";
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
    familyId: "MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR",
    pot: 50,
    effectiveStack: 300,
    boards: ["A72r", "K98tt", "T76tt", "985mono"],
    purpose: "BTN vs BB single-raised-pot MID-SPR facing flop c-bet response probe.",
    coverageTags: ["MID_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "FLOP_FACING_BET", "XR_BLUFF_PROBE"],
  },
  {
    familyId: "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
    pot: 50,
    effectiveStack: 650,
    boards: ["K98tt", "T76tt", "QJ9tt", "654r"],
    purpose: "BTN vs BB single-raised-pot HIGH-SPR facing flop c-bet response probe.",
    coverageTags: ["HIGH_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "FLOP_FACING_BET", "XR_BLUFF_PROBE"],
  },
];

const LOWSPR_SCENARIOS: readonly Scenario[] = [
  {
    familyId: "MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR",
    pot: 50,
    effectiveStack: 125,
    boards: ["A72r", "T76tt", "QJ9tt", "654r"],
    purpose: "BTN vs BB single-raised-pot LOW-SPR facing flop c-bet response probe.",
    coverageTags: ["LOW_SPR", "SINGLE_RAISED", "SRP_BTN_VS_BB", "FLOP_FACING_BET", "XR_BLUFF_PROBE"],
  },
];

interface CliArgs {
  manifestPath: string;
  outputDir: string;
  scenarios: readonly Scenario[];
  variant: "default" | "lowspr";
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
    scenarios: args.scenarios,
    counts: { scenarios: args.scenarios.length, files: files.length },
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
  let variant: CliArgs["variant"] = "default";
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--variant") {
      variant = parseVariant(requiredValue(argv, index, "--variant"));
      index += 1;
      if (variant === "lowspr") {
        manifestPath = resolve(LOWSPR_MANIFEST);
        outputDir = resolve(LOWSPR_OUTPUT_DIR);
      }
      continue;
    }
    if (item.startsWith("--variant=")) {
      variant = parseVariant(inlineValue(item, "--variant"));
      if (variant === "lowspr") {
        manifestPath = resolve(LOWSPR_MANIFEST);
        outputDir = resolve(LOWSPR_OUTPUT_DIR);
      }
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
  return {
    manifestPath,
    outputDir,
    scenarios: variant === "lowspr" ? LOWSPR_SCENARIOS : SCENARIOS,
    variant,
    write,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-srp-facing-bet-batch",
    "  npm run mtt:texas-solver-srp-facing-bet-batch -- --write",
    "  npm run mtt:texas-solver-srp-facing-bet-batch -- --variant=lowspr --write",
    "",
    "Generates review-only BTN vs BB SRP FLOP_FACING_BET TexasSolver inputs.",
  ].join("\n");
}

function parseVariant(value: string): CliArgs["variant"] {
  if (value === "default" || value === "lowspr") return value;
  throw new Error(`Unsupported --variant value: ${value}\n\n${usage()}`);
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
  return args.scenarios.flatMap((scenario, scenarioIndex) => scenario.boards.map((boardId, boardIndex) => {
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
  for (const scenario of args.scenarios) {
    for (const boardId of scenario.boards) {
      const file = files.find((item) => item.familyId === scenario.familyId && item.boardId === boardId);
      if (file === undefined) throw new Error(`Missing generated file for ${scenario.familyId}/${boardId}.`);
      writeFileSync(file.path, renderParameter(scenario, boardId), "utf8");
    }
  }
  writeFileSync(args.manifestPath, `${JSON.stringify({
    packId: args.variant === "lowspr"
      ? "pkrtrainer-mtt-texas-solver-srp-facing-bet-lowspr-v1"
      : "pkrtrainer-mtt-texas-solver-srp-facing-bet-v1",
    generatedAt: "2026-07-07",
    parameterDir: repoRelativePath(args.outputDir),
    outputBase: OUTPUT_BASE,
    scenarios: args.scenarios,
    files: files.map((file) => ({ ...file, path: repoRelativePath(file.path), written: true })),
    notes: [
      "Review-only TexasSolver expansion for BTN vs BB SRP flop facing-bet response nodes.",
      "This complements the BTN vs CO 3bet-pot facing-bet pilot; do not promote without scoped gate support.",
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
    "set_range_oop AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,53s,43s,AKo,AQo,AJo,ATo,KQo,KJo,QJo",
    "set_range_ip AA,KK,QQ,JJ,TT,99,88,77,66,55,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,QJs,QTs,JTs,T9s,98s,87s,76s,65s,54s,AKo,AQo,AJo,ATo,KQo,KJo,QJo,JTo",
    "set_bet_sizes oop,flop,bet,50",
    "set_bet_sizes oop,flop,raise,75,100",
    "set_bet_sizes oop,flop,allin",
    "set_bet_sizes ip,flop,bet,33,50,75",
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
    args.variant === "lowspr"
      ? "npm run mtt:texas-solver-srp-facing-bet-batch -- --variant=lowspr --write"
      : "npm run mtt:texas-solver-srp-facing-bet-batch -- --write",
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
