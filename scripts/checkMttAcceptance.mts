import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface AcceptanceCommand {
  label: string;
  npmArgs: readonly string[];
}

interface CliArgs {
  json: boolean;
  outputPath: string | null;
}

const acceptanceCommands: readonly AcceptanceCommand[] = [
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
    label: "Ready MTT intake validation",
    npmArgs: ["run", "mtt:validate-ready-intake"],
  },
  {
    label: "MTT source-free UI guard",
    npmArgs: ["test", "--", "tests/unit/uiNoSourceCitation.test.ts"],
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
  const results = acceptanceCommands.map(runAcceptanceCommand);
  const failed = results.filter((result) => result.status !== 0);
  const report = buildAcceptanceReport(results);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderAcceptanceResults(report));
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

interface AcceptanceReport {
  valid: boolean;
  checklist: string;
  counts: {
    commands: number;
    failedCommands: number;
  };
  commands: readonly AcceptanceCommandResult[];
}

interface AcceptanceCommandResult extends AcceptanceCommand {
  status: number;
  stdout: string;
  stderr: string;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:acceptance",
    "  npm run mtt:acceptance -- --json",
    "  npm run mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json",
    "",
    "Runs the final MTT-only acceptance gate. It is green only when the MTT app is complete.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
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
  return { json, outputPath };
}

function runAcceptanceCommand(command: AcceptanceCommand): AcceptanceCommandResult {
  const result = spawnSync(npmCommand(), npmCommandArgs(command.npmArgs), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
    shell: false,
  });

  return {
    ...command,
    status: result.status ?? 1,
    stdout: stripNpmRunHeader(result.stdout.trim()),
    stderr: stripNpmRunHeader(result.stderr.trim()),
  };
}

function buildAcceptanceReport(results: readonly AcceptanceCommandResult[]): AcceptanceReport {
  const failed = results.filter((result) => result.status !== 0);
  return {
    valid: failed.length === 0,
    checklist: "Agents/mtt-done-checklist.md",
    counts: {
      commands: results.length,
      failedCommands: failed.length,
    },
    commands: results,
  };
}

function renderAcceptanceResults(report: AcceptanceReport): string {
  const lines = [
    "MTT acceptance gate",
    `valid: ${report.valid}`,
    `checklist: ${report.checklist}`,
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
