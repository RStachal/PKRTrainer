import { spawnSync } from "node:child_process";

interface GateCommand {
  label: string;
  npmArgs: readonly string[];
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
];

try {
  const results = gateCommands.map(runGateCommand);
  const failed = results.filter((result) => result.status !== 0);
  console.log(renderReleaseGateResults(results));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

interface GateCommandResult extends GateCommand {
  status: number;
  stdout: string;
  stderr: string;
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
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function renderReleaseGateResults(results: readonly GateCommandResult[]): string {
  const failed = results.filter((result) => result.status !== 0);
  const lines = [
    "MTT release gates",
    `valid: ${failed.length === 0}`,
    `commands: ${results.length}`,
    `failed commands: ${failed.length}`,
  ];

  for (const result of results) {
    lines.push("");
    lines.push(`## ${result.label}`);
    lines.push(`status: ${result.status}`);
    if (result.stdout.length > 0) lines.push(stripNpmRunHeader(result.stdout));
    if (result.stderr.length > 0) {
      lines.push("stderr:");
      lines.push(stripNpmRunHeader(result.stderr));
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
