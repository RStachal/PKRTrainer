import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface HandoffCommand {
  label: string;
  npmArgs: readonly string[];
  outputPath: string;
  releaseBlocking: boolean;
}

interface CliArgs {
  json: boolean;
  outputPath: string;
  strict: boolean;
}

interface HandoffCommandResult extends HandoffCommand {
  status: number;
  artifactExists: boolean;
  stdout: string;
  stderr: string;
}

interface HandoffReport {
  valid: boolean;
  releaseReady: boolean;
  outputPath: string;
  counts: {
    commands: number;
    failedCommands: number;
    missingArtifacts: number;
    releaseBlockingFailures: number;
  };
  nextActionPacket: HandoffPacketArtifact;
  commands: readonly HandoffCommandResult[];
}

interface HandoffPacketArtifact {
  expected: boolean;
  directory: string;
  requiredFiles: readonly {
    path: string;
    exists: boolean;
  }[];
}

const DEFAULT_OUTPUT_PATH = "artifacts/mtt-handoff-report.json";

const handoffCommands: readonly HandoffCommand[] = [
  {
    label: "Range intake workspace guard",
    npmArgs: ["run", "range:intake:guard", "--", "--output=artifacts/range-intake-guard-report.json"],
    outputPath: "artifacts/range-intake-guard-report.json",
    releaseBlocking: true,
  },
  {
    label: "Range intake status",
    npmArgs: ["run", "range:intake", "--", "--output=artifacts/range-intake-report.json"],
    outputPath: "artifacts/range-intake-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT legal slots",
    npmArgs: ["run", "mtt:slots", "--", "--output=artifacts/mtt-slots-report.json"],
    outputPath: "artifacts/mtt-slots-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT completion production gate",
    npmArgs: ["run", "mtt:completion", "--", "--output=artifacts/mtt-completion-report.json"],
    outputPath: "artifacts/mtt-completion-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT intake priority plan",
    npmArgs: [
      "run",
      "mtt:intake-plan",
      "--",
      "--output=artifacts/mtt-intake-plan-report.json",
      "--board-dir=artifacts/mtt-intake-board",
    ],
    outputPath: "artifacts/mtt-intake-plan-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT blocker report",
    npmArgs: ["run", "mtt:blockers", "--", "--output=artifacts/mtt-blockers-report.json"],
    outputPath: "artifacts/mtt-blockers-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT next action",
    npmArgs: [
      "run",
      "mtt:next-action",
      "--",
      "--output=artifacts/mtt-next-action-report.json",
      "--packet-dir=artifacts/mtt-next-action/packet",
    ],
    outputPath: "artifacts/mtt-next-action-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT postflop target matrix",
    npmArgs: ["run", "mtt:postflop-matrix", "--", "--output=artifacts/mtt-postflop-matrix-report.json"],
    outputPath: "artifacts/mtt-postflop-matrix-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT postflop position matrix",
    npmArgs: ["run", "mtt:postflop-positions", "--", "--output=artifacts/mtt-postflop-positions-report.json"],
    outputPath: "artifacts/mtt-postflop-positions-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT postflop coverage detail",
    npmArgs: ["run", "mtt:postflop-coverage", "--", "--output=artifacts/mtt-postflop-coverage-report.json"],
    outputPath: "artifacts/mtt-postflop-coverage-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT postflop release gate",
    npmArgs: ["run", "mtt:postflop-release", "--", "--output=artifacts/mtt-postflop-release-report.json"],
    outputPath: "artifacts/mtt-postflop-release-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT postflop scoped pilot suite",
    npmArgs: ["run", "mtt:postflop-pilot-suite", "--", "--output=artifacts/mtt-postflop-pilot-suite/report.json"],
    outputPath: "artifacts/mtt-postflop-pilot-suite/report.json",
    releaseBlocking: false,
  },
  {
    label: "MTT postflop scoped pilot catalog",
    npmArgs: ["run", "mtt:postflop-pilot-catalog", "--", "--output=artifacts/mtt-postflop-pilot-catalog/report.json"],
    outputPath: "artifacts/mtt-postflop-pilot-catalog/report.json",
    releaseBlocking: false,
  },
  {
    label: "MTT scenario / learning path catalog",
    npmArgs: ["run", "mtt:scenario-catalog", "--", "--output=artifacts/mtt-scenario-catalog/report.json"],
    outputPath: "artifacts/mtt-scenario-catalog/report.json",
    releaseBlocking: false,
  },
  {
    label: "MTT solver verification plan",
    npmArgs: ["run", "mtt:solver-verification", "--", "--output=artifacts/mtt-solver-verification/report.json"],
    outputPath: "artifacts/mtt-solver-verification/report.json",
    releaseBlocking: false,
  },
  {
    label: "TexasSolver human review protocol",
    npmArgs: [
      "run",
      "mtt:texas-solver-review-protocol",
      "--",
      "--output=artifacts/texas-solver-review-protocol/report.json",
      "--packet-dir=artifacts/texas-solver-review-protocol/packet",
    ],
    outputPath: "artifacts/texas-solver-review-protocol/report.json",
    releaseBlocking: false,
  },
  {
    label: "TexasSolver parameter pack preflight",
    npmArgs: ["run", "mtt:texas-solver-pack", "--", "--output=artifacts/texas-solver-parameter-pack/report.json"],
    outputPath: "artifacts/texas-solver-parameter-pack/report.json",
    releaseBlocking: false,
  },
  {
    label: "Ready MTT intake validation",
    npmArgs: ["run", "mtt:validate-ready-intake", "--", "--output=artifacts/mtt-validate-ready-intake-report.json"],
    outputPath: "artifacts/mtt-validate-ready-intake-report.json",
    releaseBlocking: true,
  },
  {
    label: "Ready MTT intake promotion plan",
    npmArgs: ["run", "mtt:promote-ready", "--", "--output=artifacts/mtt-promote-ready-report.json"],
    outputPath: "artifacts/mtt-promote-ready-report.json",
    releaseBlocking: true,
  },
  {
    label: "Android WebView/device preflight",
    npmArgs: ["run", "e2e:android:preflight", "--", "--output=artifacts/e2e-android-preflight/report.json"],
    outputPath: "artifacts/e2e-android-preflight/report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT acceptance gate",
    npmArgs: ["run", "mtt:acceptance", "--", "--output=artifacts/mtt-acceptance-report.json"],
    outputPath: "artifacts/mtt-acceptance-report.json",
    releaseBlocking: true,
  },
  {
    label: "MTT release gates",
    npmArgs: ["run", "mtt:release-gates", "--", "--output=artifacts/mtt-release-gates-report.json"],
    outputPath: "artifacts/mtt-release-gates-report.json",
    releaseBlocking: true,
  },
];

try {
  const args = parseArgs(process.argv.slice(2));
  const results = handoffCommands.map(runHandoffCommand);
  const report = buildReport(args.outputPath, results);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));
  process.exitCode = report.valid && (!args.strict || report.releaseReady) ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:handoff",
    "  npm run mtt:handoff -- --json",
    "  npm run mtt:handoff -- --strict",
    "  npm run mtt:handoff -- --output=artifacts/mtt-handoff-report.json",
    "",
    "Regenerates every source-free MTT handoff JSON artifact. The command exits 0 when artifacts were written,",
    "even if production-data gates correctly remain red before legal range imports. Add --strict for final release checks.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath = resolve(DEFAULT_OUTPUT_PATH);
  let strict = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--strict") {
      strict = true;
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, outputPath, strict };
}

function runHandoffCommand(command: HandoffCommand): HandoffCommandResult {
  rmSync(command.outputPath, { force: true });
  const result = spawnSync(npmCommand(), npmCommandArgs(command.npmArgs), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });

  return {
    ...command,
    status: result.status ?? 1,
    artifactExists: existsSync(command.outputPath),
    stdout: stripNpmRunHeader(result.stdout.trim()),
    stderr: stripNpmRunHeader(result.stderr.trim()),
  };
}

function buildReport(outputPath: string, results: readonly HandoffCommandResult[]): HandoffReport {
  const failedCommands = results.filter((result) => result.status !== 0);
  const missingArtifacts = results.filter((result) => !result.artifactExists);
  const releaseBlockingFailures = failedCommands.filter((result) => result.releaseBlocking);
  const nextActionPacket = inspectNextActionPacket();
  const missingPacketArtifacts = nextActionPacket.requiredFiles.filter((file) => !file.exists);
  const missingArtifactCount = missingArtifacts.length + missingPacketArtifacts.length;

  return {
    valid: missingArtifactCount === 0,
    releaseReady: releaseBlockingFailures.length === 0 && missingArtifactCount === 0,
    outputPath,
    counts: {
      commands: results.length,
      failedCommands: failedCommands.length,
      missingArtifacts: missingArtifactCount,
      releaseBlockingFailures: releaseBlockingFailures.length,
    },
    nextActionPacket,
    commands: results,
  };
}

function renderReport(report: HandoffReport): string {
  const lines = [
    "MTT handoff artifacts",
    `valid: ${report.valid}`,
    `releaseReady: ${report.releaseReady}`,
    `report: ${report.outputPath}`,
    `commands: ${report.counts.commands}`,
    `failed commands: ${report.counts.failedCommands}`,
    `missing artifacts: ${report.counts.missingArtifacts}`,
    `release-blocking failures: ${report.counts.releaseBlockingFailures}`,
  ];

  for (const result of report.commands) {
    lines.push(`${result.artifactExists ? "OK" : "MISSING"} status=${result.status} ${result.outputPath} (${result.label})`);
  }
  if (report.nextActionPacket.expected) {
    lines.push(`next-action packet: ${report.nextActionPacket.directory}`);
    for (const file of report.nextActionPacket.requiredFiles) {
      lines.push(`${file.exists ? "OK" : "MISSING"} ${file.path}`);
    }
  }

  return lines.join("\n");
}

function inspectNextActionPacket(): HandoffPacketArtifact {
  const reportPath = "artifacts/mtt-next-action-report.json";
  const packetRoot = "artifacts/mtt-next-action/packet";
  const fallback = {
    expected: true,
    directory: packetRoot,
    requiredFiles: [
      {
        path: join(packetRoot, "README.md"),
        exists: existsSync(join(packetRoot, "README.md")),
      },
    ],
  };
  if (!existsSync(reportPath)) return fallback;

  try {
    const parsed = JSON.parse(readFileSync(reportPath, "utf8")) as {
      nextAction?: { packId?: unknown } | null;
    };
    const packId = typeof parsed.nextAction?.packId === "string"
      ? parsed.nextAction.packId
      : null;
    if (packId === null) return fallback;
    const directory = join(packetRoot, packId);
    return {
      expected: true,
      directory,
      requiredFiles: [
        join(directory, "README.md"),
        join(directory, "expected-paths.json"),
        join(directory, "NORMALIZED_JSON_REQUIREMENTS.md"),
        join(directory, "PERMISSION_JSON_REQUIREMENTS.md"),
      ].map((path) => ({ path, exists: existsSync(path) })),
    };
  } catch {
    return fallback;
  }
}

function stripNpmRunHeader(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("> "))
    .join("\n")
    .trim();
}

function npmCommand(): string {
  return process.platform === "win32" ? "cmd" : "npm";
}

function npmCommandArgs(args: readonly string[]): string[] {
  return process.platform === "win32" ? ["/c", "npm", ...args] : [...args];
}
