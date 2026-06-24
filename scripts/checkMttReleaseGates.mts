import { spawnSync } from "node:child_process";

interface GateCommand {
  label: string;
  npmArgs: readonly string[];
}

interface CliArgs {
  json: boolean;
}

const gateCommands: readonly GateCommand[] = [
  {
    label: "MTT completion production gate",
    npmArgs: ["run", "mtt:completion", "--", "--summary"],
  },
  {
    label: "MTT blocker summary",
    npmArgs: ["run", "mtt:blockers", "--", "--summary"],
  },
  {
    label: "MTT intake priority summary",
    npmArgs: ["run", "mtt:intake-plan", "--", "--summary"],
  },
  {
    label: "MTT next action",
    npmArgs: ["run", "mtt:next-action"],
  },
  {
    label: "MTT postflop final release gate",
    npmArgs: ["run", "mtt:postflop-release", "--", "--summary"],
  },
  {
    label: "Range intake workspace guard",
    npmArgs: ["run", "range:intake:guard"],
  },
  {
    label: "Ready intake slots",
    npmArgs: ["run", "range:intake", "--", "--ready-only"],
  },
  {
    label: "Ready MTT intake validation",
    npmArgs: ["run", "mtt:validate-ready-intake"],
  },
  {
    label: "MTT registry integrity",
    npmArgs: ["run", "mtt:registry-integrity"],
  },
  {
    label: "Android WebView/device preflight",
    npmArgs: ["run", "e2e:android:preflight"],
  },
];

try {
  const args = parseArgs(process.argv.slice(2));
  const results = gateCommands.map(runGateCommand);
  const failed = results.filter((result) => result.status !== 0);
  const report = buildReleaseGateReport(results);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReleaseGateResults(report));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

interface ReleaseGateReport {
  valid: boolean;
  counts: {
    commands: number;
    failedCommands: number;
  };
  commands: readonly GateCommandResult[];
}

interface GateCommandResult extends GateCommand {
  status: number;
  stdout: string;
  stderr: string;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:release-gates",
    "  npm run mtt:release-gates -- --json",
    "",
    "Runs every MTT release gate summary before returning the final aggregate exit code.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json };
}

function runGateCommand(command: GateCommand): GateCommandResult {
  const result = spawnSync(npmCommand(), npmCommandArgs(command.npmArgs), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });

  return {
    ...command,
    status: result.status ?? 1,
    stdout: stripNpmRunHeader(result.stdout.trim()),
    stderr: stripNpmRunHeader(result.stderr.trim()),
  };
}

function buildReleaseGateReport(results: readonly GateCommandResult[]): ReleaseGateReport {
  const failed = results.filter((result) => result.status !== 0);
  return {
    valid: failed.length === 0,
    counts: {
      commands: results.length,
      failedCommands: failed.length,
    },
    commands: results,
  };
}

function renderReleaseGateResults(report: ReleaseGateReport): string {
  const lines = [
    "MTT release gates",
    `valid: ${report.valid}`,
    `commands: ${report.counts.commands}`,
    `failed commands: ${report.counts.failedCommands}`,
  ];

  for (const result of report.commands) {
    lines.push("");
    lines.push(`## ${result.label}`);
    lines.push(`status: ${result.status}`);
    if (result.stdout.length > 0) lines.push(result.stdout);
    if (result.stderr.length > 0) {
      lines.push("stderr:");
      lines.push(result.stderr);
    }
  }

  return lines.join("\n");
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
