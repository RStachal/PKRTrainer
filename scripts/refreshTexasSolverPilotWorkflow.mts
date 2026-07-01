import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_OUTPUT = "artifacts/texas-solver-pilot-refresh/report.json";
const NPM_BIN = "npm";

interface CliArgs {
  dryRun: boolean;
  outputPath: string;
  skipViewer: boolean;
  summary: boolean;
}

interface WorkflowStep {
  id: string;
  command: readonly string[];
  skipped: boolean;
  valid: boolean;
  output: string;
  error: string | null;
}

interface WorkflowReport {
  valid: boolean;
  generatedAt: string;
  dryRun: boolean;
  steps: readonly WorkflowStep[];
  nextCommands: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = runWorkflow(args);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(renderReport(report, args));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let dryRun = false;
  let outputPath = resolve(DEFAULT_OUTPUT);
  let skipViewer = false;
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (item === "--skip-viewer") {
      skipViewer = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArg(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { dryRun, outputPath, skipViewer, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-pilot-refresh -- --summary",
    "  npm run mtt:texas-solver-pilot-refresh -- --dry-run --summary",
    "  npm run mtt:texas-solver-pilot-refresh -- --skip-viewer",
    "",
    "Refreshes the local TexasSolver pilot workflow without promoting production data:",
    "coverage status -> ingest completed families -> pilot suite -> review viewer.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function runWorkflow(args: CliArgs): WorkflowReport {
  const steps: WorkflowStep[] = [];
  steps.push(runStep("coverage-status", ["run", "mtt:texas-solver-coverage-status", "--", "--summary"]));
  steps.push(
    runStep("ingest-completed", [
      "run",
      "mtt:texas-solver-ingest-completed",
      "--",
      ...(args.dryRun ? ["--dry-run"] : []),
      "--summary",
    ]),
  );
  steps.push(runStep("pilot-suite", ["run", "mtt:postflop-pilot-suite", "--", "--summary"]));
  steps.push(
    args.skipViewer
      ? {
          id: "review-viewer",
          command: [NPM_BIN, "run", "mtt:texas-solver-viewer"],
          skipped: true,
          valid: true,
          output: "Skipped by --skip-viewer.",
          error: null,
        }
      : runStep("review-viewer", ["run", "mtt:texas-solver-viewer"]),
  );

  return {
    valid: steps.every((step) => step.valid),
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    steps,
    nextCommands: [
      "npm run mtt:texas-solver-coverage-status -- --summary",
      "npm run mtt:texas-solver-pilot-refresh -- --summary",
      "npm run mtt:postflop-pilot-suite -- --summary",
    ],
  };
}

function runStep(id: string, command: readonly string[]): WorkflowStep {
  try {
    const output = execSync([NPM_BIN, ...command].join(" "), {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { id, command: [NPM_BIN, ...command], skipped: false, valid: true, output, error: null };
  } catch (error) {
    const output =
      error !== null && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: unknown }).stdout ?? "")
        : "";
    const stderr =
      error !== null && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    const message = error instanceof Error ? error.message : String(error);
    return {
      id,
      command: [NPM_BIN, ...command],
      skipped: false,
      valid: false,
      output,
      error: [message, stderr].filter((part) => part.trim().length > 0).join("\n"),
    };
  }
}

function renderReport(report: WorkflowReport, args: CliArgs): string {
  const lines = [
    "TexasSolver pilot workflow refresh",
    `valid: ${report.valid}`,
    `dryRun: ${report.dryRun}`,
    `report: ${args.outputPath}`,
  ];
  for (const step of report.steps) {
    lines.push(`${step.valid ? "OK" : "FAIL"} ${step.id}${step.skipped ? " (skipped)" : ""}`);
    if (!args.summary || !step.valid) {
      const trimmedOutput = step.output.trim();
      if (trimmedOutput.length > 0) lines.push(indent(args.summary ? tailLines(trimmedOutput, 12) : trimmedOutput));
      if (step.error !== null) lines.push(indent(step.error));
    }
  }
  return lines.join("\n");
}

function indent(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => `  ${line}`)
    .join("\n");
}

function tailLines(text: string, limit: number): string {
  const lines = text.split(/\r?\n/u);
  return lines.slice(Math.max(0, lines.length - limit)).join("\n");
}
