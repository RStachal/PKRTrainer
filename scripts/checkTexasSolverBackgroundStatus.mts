import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-v2-manifest.json";
const DEFAULT_LOG_DIR = "artifacts/texas-solver-background";

interface CliArgs {
  manifestPath: string;
  logDir: string;
  json: boolean;
  summary: boolean;
}

interface CoverageManifest {
  outputBase: string;
  scenarios: Array<{
    familyId: string;
    boards: string[];
  }>;
}

interface SolverProcess {
  pid: number;
  name: string;
  startedAt: string | null;
  commandLine: string | null;
}

interface FamilyStatus {
  familyId: string;
  solved: number;
  expected: number;
  status: "RAW_COMPLETE" | "RAW_PARTIAL" | "WAITING_FOR_RAW";
}

interface BackgroundStatusReport {
  valid: boolean;
  manifestPath: string;
  outputBase: string | null;
  processes: readonly SolverProcess[];
  coverage: {
    families: number;
    rawComplete: number;
    rawPartial: number;
    waitingForRaw: number;
    boardsSolved: number;
    boardsExpected: number;
    rows: readonly FamilyStatus[];
  };
  logs: readonly {
    path: string;
    modifiedAt: string;
    tail: readonly string[];
  }[];
  warnings: readonly string[];
  errors: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let logDir = resolve(DEFAULT_LOG_DIR);
  let json = false;
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
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
    if (item === "--log-dir") {
      logDir = resolve(requiredValue(argv, index, "--log-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--log-dir=")) {
      logDir = resolve(inlineValue(item, "--log-dir"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { manifestPath, logDir, json, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-background-status",
    "  npm run mtt:texas-solver-background-status -- --manifest .\\Agents\\solver-input\\texas-solver\\mtt-safe-flops-v1\\coverage-srp-sb-bb-oop-cbet-v1-manifest.json --summary",
    "",
    "Reports local TexasSolver console processes, raw coverage progress and latest background logs.",
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

function buildReport(args: CliArgs): BackgroundStatusReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifest = readManifest(args.manifestPath, errors);
  const rows = manifest === null ? [] : familyRows(manifest);
  const processes = runningSolverProcesses(warnings);
  if (processes.length === 0) warnings.push("No TexasSolver console process is currently visible from this Windows session.");
  const logs = latestLogs(args.logDir);
  if (logs.length === 0) warnings.push(`No background log files found in ${args.logDir}.`);

  return {
    valid: errors.length === 0,
    manifestPath: args.manifestPath,
    outputBase: manifest === null ? null : resolve(manifest.outputBase),
    processes,
    coverage: {
      families: rows.length,
      rawComplete: rows.filter((row) => row.status === "RAW_COMPLETE").length,
      rawPartial: rows.filter((row) => row.status === "RAW_PARTIAL").length,
      waitingForRaw: rows.filter((row) => row.status === "WAITING_FOR_RAW").length,
      boardsSolved: rows.reduce((sum, row) => sum + row.solved, 0),
      boardsExpected: rows.reduce((sum, row) => sum + row.expected, 0),
      rows,
    },
    logs,
    warnings,
    errors,
  };
}

function readManifest(path: string, errors: string[]): CoverageManifest | null {
  if (!existsSync(path)) {
    errors.push(`Missing manifest: ${path}`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as CoverageManifest;
}

function familyRows(manifest: CoverageManifest): FamilyStatus[] {
  const outputBase = resolve(manifest.outputBase);
  return manifest.scenarios.map((scenario) => {
    const rawDir = join(outputBase, scenario.familyId, "raw");
    const rawFiles = existsSync(rawDir)
      ? readdirSync(rawDir).filter((name) => name.toLowerCase().endsWith(".json"))
      : [];
    const solved = scenario.boards.filter((board) => rawFiles.some((name) => name.includes(`_${board}.json`))).length;
    return {
      familyId: scenario.familyId,
      solved,
      expected: scenario.boards.length,
      status: solved === scenario.boards.length
        ? "RAW_COMPLETE"
        : solved > 0
          ? "RAW_PARTIAL"
          : "WAITING_FOR_RAW",
    };
  });
}

function runningSolverProcesses(warnings: string[]): SolverProcess[] {
  if (process.platform !== "win32") return [];
  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'console_solver|TexasSolver' } | Select-Object ProcessId,Name,@{Name='StartedAt';Expression={$_.CreationDate.ToString('o')}},CommandLine | ConvertTo-Json -Compress",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (output.length === 0) return [];
    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.flatMap((row) => processFromCimRow(row));
  } catch (error) {
    warnings.push(`Could not query Windows solver processes: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function processFromCimRow(row: unknown): SolverProcess[] {
  if (row === null || typeof row !== "object") return [];
  const record = row as Record<string, unknown>;
  const pid = Number(record.ProcessId);
  if (!Number.isFinite(pid)) return [];
  return [{
    pid,
    name: String(record.Name ?? ""),
    startedAt: typeof record.StartedAt === "string" ? record.StartedAt : null,
    commandLine: typeof record.CommandLine === "string" ? record.CommandLine : null,
  }];
}

function latestLogs(logDir: string): BackgroundStatusReport["logs"] {
  if (!existsSync(logDir)) return [];
  return readdirSync(logDir)
    .filter((name) => name.toLowerCase().endsWith(".log"))
    .map((name) => {
      const path = join(logDir, name);
      const stat = statSync(path);
      return {
        path,
        modifiedAt: stat.mtime.toISOString(),
        tail: readableTail(path),
      };
    })
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
    .slice(0, 3);
}

function readableTail(path: string): string[] {
  return readFileSync(path, "utf8")
    .replace(/\u0008/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^[#\]\[ 0-9%]+$/.test(line))
    .slice(-8);
}

function renderReport(report: BackgroundStatusReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver background status",
    `valid: ${report.valid}`,
    `processes: ${report.processes.length}`,
    `families: ${report.coverage.families}`,
    `raw complete: ${report.coverage.rawComplete}`,
    `raw partial: ${report.coverage.rawPartial}`,
    `waiting for raw: ${report.coverage.waitingForRaw}`,
    `boards solved: ${report.coverage.boardsSolved}/${report.coverage.boardsExpected}`,
  ];
  for (const process of report.processes) {
    lines.push(`process ${process.pid}: ${process.name} started=${process.startedAt ?? "unknown"}`);
  }
  for (const row of report.coverage.rows) {
    lines.push(`${row.familyId}: ${row.status} (${row.solved}/${row.expected})`);
  }
  if (!summaryOnly) {
    for (const log of report.logs) {
      lines.push(`log ${basename(log.path)} modified=${log.modifiedAt}`);
      for (const line of log.tail) lines.push(`  ${line}`);
    }
  }
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  for (const error of report.errors) lines.push(`error: ${error}`);
  return lines.join("\n");
}
