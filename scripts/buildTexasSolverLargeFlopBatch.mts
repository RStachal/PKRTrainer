import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const OUTPUT_BASE = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
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

const SRP_EXPANSION_BOARDS = ["A95r", "KQ5r", "Q84r", "J73r", "976tt", "A85mono"] as const;
const THREE_BET_EXPANSION_BOARDS = ["AK5r", "KJ4tt", "J73r", "997r", "875tt", "A85mono"] as const;

const BOARD_TO_TEXAS_SOLVER: Record<string, string> = {
  A95r: "As,9d,5c",
  KQ5r: "Ks,Qd,5c",
  Q84r: "Qs,8d,4c",
  J73r: "Js,7d,3c",
  "976tt": "9s,7s,6d",
  A85mono: "As,8s,5s",
  AK5r: "As,Kd,5c",
  KJ4tt: "Ks,Js,4d",
  "997r": "9s,9d,7c",
  "875tt": "8s,7s,5d",
  A72r: "As,7d,2c",
  T84r: "Ts,8d,4c",
  QJ2tt: "Qs,Jh,2h",
  JT9tt: "Js,Th,9h",
  "883r": "8s,8d,3c",
  "765tt": "7s,6s,5d",
  Q76mono: "Qs,7s,6s",
  K83r: "Ks,8d,3c",
  Q72r: "Qs,7d,2c",
  AT4mono: "As,Ts,4s",
  "986tt": "9s,8s,6d",
  "742r": "7s,4d,2c",
};

interface Scenario {
  familyId: string;
  templatePath: string;
  boards: readonly string[];
  purpose: string;
  coverageTags: readonly string[];
}

interface CliArgs {
  preset: "active" | "next" | "followup";
  manifestPath: string;
  outputDir: string;
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
  return {
    preset,
    manifestPath: manifestPath ?? resolve(defaults.manifest),
    outputDir: outputDir ?? resolve(defaults.outputDir),
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
      BOARD_TO_TEXAS_SOLVER[boardId] === undefined ? [`Missing board mapping for ${boardId}.`] : []
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
      `${args.preset === "active" ? "Large" : args.preset === "next" ? "Next" : "Follow-up"} review-only TexasSolver flop expansion batch across existing validated pilot families.`,
      "This batch intentionally deepens board-texture evidence without inventing new position/range identities.",
      "It is not full MTT production coverage and must not be promoted without source-free review, normalization and gate validation.",
      "MTT_CORE_V1 preflop scope is complete; this batch is non-blocking P4 evidence expansion.",
      ...(args.preset !== "active" ? [
        "This prepared batch is intentionally outside the active autostart queue and cannot start TexasSolver by itself.",
        "It removes set_raise_limit 3 because the installed TexasSolver v0.2.0 console reports that directive as unrecognized; removal preserves the console default used by the active batch.",
      ] : []),
    ],
    commands: nextCommands(args),
  };
  writeIfChanged(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function renderParameter(template: string, familyId: string, boardId: string, preset: CliArgs["preset"]): string {
  const board = BOARD_TO_TEXAS_SOLVER[boardId];
  if (board === undefined) throw new Error(`Unsupported board id: ${boardId}`);
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
  return [
    ...commands,
    "npm run mtt:texas-solver-autostart-install",
    "npm run mtt:texas-solver-autostart-status",
    `npm run mtt:texas-solver-background-status -- --manifest "${manifest}" --summary`,
  ];
}

function parsePreset(value: string): CliArgs["preset"] {
  if (value === "active" || value === "next" || value === "followup") return value;
  throw new Error(`--preset must be active, next or followup, received: ${value}`);
}

function batchFor(preset: CliArgs["preset"]): {
  outputDir: string;
  manifest: string;
  packId: string;
  generatedAt: string;
} {
  if (preset === "next") return NEXT_BATCH;
  if (preset === "followup") return FOLLOWUP_BATCH;
  return ACTIVE_BATCH;
}

function scenariosFor(preset: CliArgs["preset"]): readonly Scenario[] {
  if (preset === "active") return SCENARIOS;
  const boards = preset === "next"
    ? { srp: NEXT_SRP_BOARDS, threeBet: NEXT_THREE_BET_BOARDS }
    : { srp: FOLLOWUP_SRP_BOARDS, threeBet: FOLLOWUP_THREE_BET_BOARDS };
  return SCENARIOS.map((scenario) => ({
    ...scenario,
    boards: scenario.coverageTags.includes("THREE_BET_POT") ? boards.threeBet : boards.srp,
  }));
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
