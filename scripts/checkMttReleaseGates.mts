import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface GateCommand {
  label: string;
  npmArgs: readonly string[];
}

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  /** A replacement gate list, for testing this runner rather than the gates. */
  commandsPath: string | null;
}

/**
 * Where the gate list came from.
 *
 * Recorded in the report, and it matters: a run driven by an injected list has
 * checked nothing about the product. Anything that treats a green gate report as
 * release evidence has to be able to tell the two apart, so the distinction is
 * written into the artefact rather than left to whoever reads it.
 */
type CommandSource = "BUILT_IN" | "INJECTED";

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
  const commands = args.commandsPath === null ? gateCommands : loadCommands(args.commandsPath);
  const commandSource: CommandSource = args.commandsPath === null ? "BUILT_IN" : "INJECTED";
  const results = commands.map(runGateCommand);
  const failed = results.filter((result) => result.status !== 0);
  const report = buildReleaseGateReport(results, commandSource);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReleaseGateResults(report));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

interface ReleaseGateReport {
  valid: boolean;
  /** BUILT_IN for a real run; INJECTED means the gate list was supplied. */
  commandSource: CommandSource;
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
    "  npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json",
    "  npm run mtt:release-gates -- --commands=path/to/gates.json",
    "",
    "Runs every MTT release gate summary before returning the final aggregate exit code.",
    "--commands replaces the gate list and is for testing this runner, not for release:",
    "the report records commandSource INJECTED so such a run cannot pass as evidence.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  let commandsPath: string | null = null;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--commands=")) {
      const value = item.slice("--commands=".length).trim();
      if (value.length === 0) throw new Error(`--commands requires a path.

${usage()}`);
      commandsPath = resolve(value);
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
  return { json, outputPath, commandsPath };
}

/**
 * Read a gate list from a file.
 *
 * This exists so the runner can be tested without running ten real gates. That
 * cost 48 minutes of every full test run, for three assertions about how this
 * file aggregates and reports - none of which need a real gate. It also let the
 * test depend on exactly three gates failing for real, which coupled it to
 * whatever state the product happened to be in.
 */
function loadCommands(path: string): readonly GateCommand[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`--commands could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("--commands must hold a non-empty array of { label, npmArgs }.");
  }
  return parsed.map((entry, index) => {
    const item = entry as { label?: unknown; npmArgs?: unknown };
    if (typeof item.label !== "string" || !Array.isArray(item.npmArgs)) {
      throw new Error(`--commands entry ${index} needs a label and npmArgs.`);
    }
    return { label: item.label, npmArgs: item.npmArgs.map(String) };
  });
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

function buildReleaseGateReport(
  results: readonly GateCommandResult[],
  commandSource: CommandSource,
): ReleaseGateReport {
  const failed = results.filter((result) => result.status !== 0);
  return {
    valid: failed.length === 0,
    commandSource,
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
