import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEFAULT_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_3bp_repair_v1";
const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-3bp-repair-v1-manifest.json";

const FAMILY_ID = "MTT9_35BB_CO_BTN_3BP_REPAIR";
const OUTPUT_BASE = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

const BOARD_TO_TEXAS_SOLVER: Record<string, string> = {
  A72r: "As,7d,2c",
  K83r: "Ks,8d,3c",
  QJ2tt: "Qs,Jh,2h",
  JT9tt: "Js,Th,9h",
  "765tt": "7s,6s,5d",
  AT4mono: "As,Ts,4s",
  Q76mono: "Qs,7s,6s",
  "986tt": "9s,8s,6d",
};

const BOARDS = ["A72r", "K83r", "QJ2tt", "JT9tt", "AT4mono", "Q76mono", "765tt", "986tt"] as const;

interface CliArgs {
  manifestPath: string;
  outputDir: string;
  write: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const files = BOARDS.map((boardId, index) => ({
    fileName: `${String(index + 1).padStart(2, "0")}_${FAMILY_ID}_${boardId}.txt`,
    path: join(args.outputDir, `${String(index + 1).padStart(2, "0")}_${FAMILY_ID}_${boardId}.txt`),
    familyId: FAMILY_ID,
    boardId,
    written: args.write,
  }));
  const report = {
    valid: true,
    familyId: FAMILY_ID,
    outputDir: args.outputDir,
    manifestPath: args.manifestPath,
    counts: { files: files.length },
    files,
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
    "  npm run mtt:texas-solver-3bp-repair-batch",
    "  npm run mtt:texas-solver-3bp-repair-batch -- --write",
    "",
    "Generates a review-only CO vs BTN 3bet-pot repair batch with a wider IP 3bet range.",
    "The goal is to test whether a representative bluff lane can be produced before any pilot promotion.",
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

function writeBatch(
  args: CliArgs,
  files: Array<{ fileName: string; path: string; familyId: string; boardId: string; written: boolean }>,
): void {
  mkdirSync(args.outputDir, { recursive: true });
  mkdirSync(dirname(args.manifestPath), { recursive: true });
  for (const file of files) {
    writeFileSync(file.path, renderParameter(file.boardId), "utf8");
  }
  writeFileSync(args.manifestPath, `${JSON.stringify({
    packId: "pkrtrainer-mtt-texas-solver-3bp-repair-v1",
    generatedAt: "2026-07-02",
    parameterDir: repoRelativePath(args.outputDir),
    outputBase: OUTPUT_BASE,
    scenarios: [{
      familyId: FAMILY_ID,
      pot: 157,
      effectiveStack: 286,
      boards: [...BOARDS],
      purpose: "CO vs BTN 3bet-pot c-bet repair probe with wider IP 3bet bluff candidates.",
      coverageTags: ["LOW_SPR", "3BP_BTN_VS_CO", "THREE_BET_POT_CBET", "REPAIR_PROBE", "WIDER_IP_3BET_RANGE"],
    }],
    files: files.map((file) => ({ ...file, path: repoRelativePath(file.path), written: true })),
    notes: [
      "Review-only TexasSolver repair probe.",
      "This intentionally widens the IP 3bet range to include suited connector/gapper bluff candidates.",
      "It must not be treated as production poker data without review and no-false-green pilot validation.",
    ],
    commands: nextCommands(args),
  }, null, 2)}\n`, "utf8");
}

function renderParameter(boardId: string): string {
  const board = BOARD_TO_TEXAS_SOLVER[boardId];
  if (board === undefined) throw new Error(`Unsupported board id: ${boardId}`);
  return [
    "set_pot 157",
    "set_effective_stack 286",
    `set_board ${board}`,
    "set_range_oop QQ,JJ,TT,99,88,77,66,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,AQo,KQo",
    "set_range_ip AA,KK,QQ,JJ,TT,99,88,AKs,AQs,AJs,ATs,A9s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,65s,54s,97s,86s,75s,AKo,AQo,KQo",
    "set_bet_sizes oop,flop,bet,50",
    "set_bet_sizes oop,flop,raise,100",
    "set_bet_sizes oop,flop,allin",
    "set_bet_sizes ip,flop,bet,25,50",
    "set_bet_sizes ip,flop,raise,100",
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
    `dump_result pkrtrainer_${FAMILY_ID}_${boardId}.json`,
    "",
  ].join("\n");
}

function nextCommands(args: CliArgs): string[] {
  const parameterRoot = repoPowerShellPath(args.outputDir);
  const manifest = repoPowerShellPath(args.manifestPath);
  return [
    "npm run mtt:texas-solver-3bp-repair-batch -- --write",
    `.\u005cAgents\u005csolver-input\u005ctexas-solver\u005cmtt-safe-flops-v1\u005crun-console-selected.ps1 -ParameterRoot "${parameterRoot}" -Limit 999 -ListOnly`,
    `npm run mtt:texas-solver-coverage-status -- --manifest "${manifest}" --summary`,
  ];
}

function repoRelativePath(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function repoPowerShellPath(path: string): string {
  return `.\u005c${relative(process.cwd(), path).replaceAll("/", "\\")}`;
}
