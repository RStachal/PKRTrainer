import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const DEFAULT_SOURCE_DIR = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_safe_flops_v1";
const DEFAULT_OUTPUT_DIR = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_coverage_v2";
const DEFAULT_MANIFEST = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-v2-manifest.json";

interface CliArgs {
  manifestPath: string;
  outputDir: string;
  sourceDir: string;
  write: boolean;
}

interface Scenario {
  familyId: string;
  templateFile: string;
  pot: number;
  effectiveStack: number;
  boards: readonly string[];
  purpose: string;
  coverageTags: readonly string[];
}

interface GeneratedFile {
  fileName: string;
  path: string;
  familyId: string;
  boardId: string;
  written: boolean;
}

const BOARD_TO_TEXAS_SOLVER: Record<string, string> = {
  A72r: "As,7d,2c",
  K83r: "Ks,8d,3c",
  QJ2tt: "Qs,Jh,2h",
  JT9tt: "Js,Th,9h",
  "883r": "8s,8d,3c",
  "765tt": "7s,6s,5d",
  AT4mono: "As,Ts,4s",
  Q76mono: "Qs,7s,6s",
  T84r: "Ts,8d,4c",
  Q72r: "Qs,7d,2c",
  KQ5r: "Ks,Qd,5c",
  "986tt": "9s,8s,6d",
  "742r": "7s,4d,2c",
};

const SCENARIOS: readonly Scenario[] = [
  {
    familyId: "MTT9_20BB_BTN_BB_SRP_LOWSPR",
    templateFile: "01_MTT9_50BB_BTN_BB_SRP_A72r.txt",
    pot: 50,
    effectiveStack: 100,
    boards: ["A72r", "T84r", "JT9tt", "AT4mono"],
    purpose: "BTN vs BB SRP low-SPR c-bet pilot coverage.",
    coverageTags: ["LOW_SPR", "SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET"],
  },
  {
    familyId: "MTT9_80BB_BTN_BB_SRP_HIGHSPR",
    templateFile: "01_MTT9_50BB_BTN_BB_SRP_A72r.txt",
    pot: 50,
    effectiveStack: 500,
    boards: ["A72r", "T84r", "QJ2tt", "Q76mono"],
    purpose: "BTN vs BB SRP high-SPR c-bet pilot coverage.",
    coverageTags: ["HIGH_SPR", "SRP_BTN_VS_BB", "SINGLE_RAISED_POT_CBET"],
  },
  {
    familyId: "MTT9_40BB_UTG_BB_SRP",
    templateFile: "09_MTT9_40BB_UTG_BB_SRP_Q72r.txt",
    pot: 50,
    effectiveStack: 160,
    boards: ["K83r", "T84r", "JT9tt", "AT4mono", "883r", "Q76mono"],
    purpose: "UTG vs BB SRP texture coverage using the existing UTG/BB range template.",
    coverageTags: ["MID_SPR", "SRP_UTG_VS_BB", "SINGLE_RAISED_POT_CBET"],
  },
  {
    familyId: "MTT9_35BB_CO_BTN_3BP",
    templateFile: "10_MTT9_35BB_CO_BTN_3BP_K83r.txt",
    pot: 157,
    effectiveStack: 286,
    boards: ["A72r", "T84r", "QJ2tt", "JT9tt", "AT4mono", "Q76mono", "883r"],
    purpose: "CO vs BTN 3bet-pot c-bet texture coverage using the existing 3BP range template.",
    coverageTags: ["LOW_SPR", "3BP_BTN_VS_CO", "THREE_BET_POT_CBET"],
  },
];

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildCoverageBatch(args);
  if (args.write) writeCoverageBatch(args, report);
  console.log(JSON.stringify({
    ...report,
    files: report.files.map((file) => ({ ...file, written: args.write })),
    nextCommands: nextCommands(args),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let outputDir = resolve(DEFAULT_OUTPUT_DIR);
  let sourceDir = resolve(DEFAULT_SOURCE_DIR);
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
    if (item === "--source-dir") {
      sourceDir = resolve(requiredValue(argv, index, "--source-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--source-dir=")) {
      sourceDir = resolve(inlineValue(item, "--source-dir"));
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

  return { manifestPath, outputDir, sourceDir, write };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-coverage-batch",
    "  npm run mtt:texas-solver-coverage-batch -- --write",
    "",
    "Generates an expanded TexasSolver parameter batch for missing MTT postflop pilot coverage.",
    "It creates additional local solver inputs only; it does not mark any StrategyPack production-ready.",
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

function buildCoverageBatch(args: CliArgs): {
  valid: boolean;
  sourceDir: string;
  outputDir: string;
  manifestPath: string;
  scenarios: readonly Scenario[];
  counts: { scenarios: number; files: number };
  files: GeneratedFile[];
  blockers: string[];
} {
  const blockers = [
    ...(existsSync(args.sourceDir) ? [] : [`Missing source template directory: ${args.sourceDir}`]),
    ...SCENARIOS.flatMap((scenario) => (
      existsSync(join(args.sourceDir, scenario.templateFile))
        ? []
        : [`Missing template file for ${scenario.familyId}: ${scenario.templateFile}`]
    )),
  ];
  const files = SCENARIOS.flatMap((scenario, scenarioIndex) => scenario.boards.map((boardId, boardIndex) => {
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
  return {
    valid: blockers.length === 0,
    sourceDir: args.sourceDir,
    outputDir: args.outputDir,
    manifestPath: args.manifestPath,
    scenarios: SCENARIOS,
    counts: { scenarios: SCENARIOS.length, files: files.length },
    files,
    blockers,
  };
}

function writeCoverageBatch(args: CliArgs, report: ReturnType<typeof buildCoverageBatch>): void {
  if (!report.valid) throw new Error(`Cannot write coverage batch:\n${report.blockers.join("\n")}`);
  mkdirSync(args.outputDir, { recursive: true });
  mkdirSync(dirname(args.manifestPath), { recursive: true });

  for (const scenario of SCENARIOS) {
    const template = readFileSync(join(args.sourceDir, scenario.templateFile), "utf8");
    scenario.boards.forEach((boardId, boardIndex) => {
      const sequence = String(SCENARIOS.indexOf(scenario) * 20 + boardIndex + 1).padStart(2, "0");
      const fileName = `${sequence}_${scenario.familyId}_${boardId}.txt`;
      const text = renderParameterFile(template, scenario, boardId);
      writeFileSync(join(args.outputDir, fileName), text, "utf8");
    });
  }

  const manifest = {
    packId: "pkrtrainer-mtt-texas-solver-coverage-v2",
    generatedAt: "2026-07-01",
    parameterDir: repoRelativePath(args.outputDir),
    outputBase: "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver",
    scenarios: SCENARIOS,
    files: report.files.map((file) => ({ ...file, path: repoRelativePath(file.path), written: true })),
    notes: [
      "Expanded background solve batch for pilot coverage gaps.",
      "Generated from existing local TexasSolver templates and range assumptions.",
      "This batch is not full MTT production coverage; it is input evidence for review and pilot-pack promotion only.",
      "Uncovered full-ring position families still require reviewed range templates before solving.",
    ],
    commands: nextCommands(args),
  };
  writeFileSync(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function renderParameterFile(template: string, scenario: Scenario, boardId: string): string {
  const board = BOARD_TO_TEXAS_SOLVER[boardId];
  if (board === undefined) throw new Error(`No TexasSolver board mapping for ${boardId}`);
  const dumpName = `pkrtrainer_${scenario.familyId}_${boardId}.json`;
  return template
    .replace(/^set_pot\s+\d+$/m, `set_pot ${scenario.pot}`)
    .replace(/^set_effective_stack\s+\d+$/m, `set_effective_stack ${scenario.effectiveStack}`)
    .replace(/^set_board\s+.+$/m, `set_board ${board}`)
    .replace(/^dump_result\s+.+$/m, `dump_result ${dumpName}`);
}

function nextCommands(args: CliArgs): string[] {
  const parameterRoot = repoPowerShellPath(args.outputDir);
  const manifestPath = repoPowerShellPath(args.manifestPath);
  return [
    `npm run mtt:texas-solver-coverage-batch -- --write`,
    `.\u005cAgents\u005csolver-input\u005ctexas-solver\u005cmtt-safe-flops-v1\u005crun-console-selected.ps1 -ParameterRoot "${parameterRoot}" -Limit 999 -ListOnly`,
    `.\u005cAgents\u005csolver-input\u005ctexas-solver\u005cmtt-safe-flops-v1\u005cstart-background-solve.ps1 -ParameterRoot "${parameterRoot}" -Manifest "${manifestPath}" -LogName "coverage-v2" -StartWatcher`,
    `npm run mtt:texas-solver-background-status -- --manifest "${manifestPath}" --summary`,
  ];
}

function repoRelativePath(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function repoPowerShellPath(path: string): string {
  return `.\u005c${relative(process.cwd(), path).replaceAll("/", "\\")}`;
}
