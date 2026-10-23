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
  inputPath: string | null;
  cpuSeconds: number | null;
  workingSetBytes: number | null;
}

interface FamilyStatus {
  familyId: string;
  solved: number;
  expected: number;
  missingBoards: readonly string[];
  status: "RAW_COMPLETE" | "RAW_PARTIAL" | "WAITING_FOR_RAW";
}

interface BackgroundStatusReport {
  valid: boolean;
  manifestPath: string;
  outputBase: string | null;
  processes: readonly SolverProcess[];
  systemMemory: {
    totalBytes: number | null;
    freeBytes: number | null;
    freePercent: number | null;
  };
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
  const systemMemory = currentSystemMemory(warnings);
  if (processes.length === 0) warnings.push("No TexasSolver console process is currently visible from this Windows session.");
  if (systemMemory.freePercent !== null && systemMemory.freePercent < 10) {
    warnings.push(`Low physical memory: ${formatGigabytes(systemMemory.freeBytes)} free (${systemMemory.freePercent.toFixed(1)}%). Do not start another solver process or batch while the current solver is active.`);
  }
  const logs = latestLogs(args.logDir);
  if (logs.length === 0) warnings.push(`No background log files found in ${args.logDir}.`);

  return {
    valid: errors.length === 0,
    manifestPath: args.manifestPath,
    outputBase: manifest === null ? null : resolve(manifest.outputBase),
    processes,
    systemMemory,
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
    const solvedBoards = scenario.boards.filter((board) => rawFiles.some((name) => name.includes(`_${board}.json`)));
    const solved = solvedBoards.length;
    return {
      familyId: scenario.familyId,
      solved,
      expected: scenario.boards.length,
      missingBoards: scenario.boards.filter((board) => !solvedBoards.includes(board)),
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
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'console_solver|TexasSolver' } | Select-Object ProcessId,Name,@{Name='StartedAt';Expression={$_.CreationDate.ToString('o')}},CommandLine,KernelModeTime,UserModeTime,WorkingSetSize | ConvertTo-Json -Compress",
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
    inputPath: typeof record.CommandLine === "string" ? inputPathFromCommandLine(record.CommandLine) : null,
    cpuSeconds: cpuSecondsFromCim(record),
    workingSetBytes: finiteNumber(record.WorkingSetSize),
  }];
}

function inputPathFromCommandLine(commandLine: string): string | null {
  const match = /(?:^|\s)-i\s+(?:"([^"]+)"|(\S+))/i.exec(commandLine);
  return match?.[1] ?? match?.[2] ?? null;
}

function currentSystemMemory(warnings: string[]): BackgroundStatusReport["systemMemory"] {
  const unknown = { totalBytes: null, freeBytes: null, freePercent: null };
  if (process.platform !== "win32") return unknown;
  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$os = Get-CimInstance Win32_OperatingSystem; $computer = Get-CimInstance Win32_ComputerSystem; [pscustomobject]@{ TotalBytes = $computer.TotalPhysicalMemory; FreeBytes = ([Int64]$os.FreePhysicalMemory * 1KB) } | ConvertTo-Json -Compress",
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const totalBytes = finiteNumber(parsed.TotalBytes);
    const freeBytes = finiteNumber(parsed.FreeBytes);
    const freePercent = totalBytes === null || freeBytes === null || totalBytes <= 0
      ? null
      : Math.round((freeBytes / totalBytes) * 1000) / 10;
    return { totalBytes, freeBytes, freePercent };
  } catch (error) {
    warnings.push(`Could not query Windows physical memory: ${error instanceof Error ? error.message : String(error)}`);
    return unknown;
  }
}

function cpuSecondsFromCim(record: Record<string, unknown>): number | null {
  const kernel = finiteNumber(record.KernelModeTime);
  const user = finiteNumber(record.UserModeTime);
  if (kernel === null || user === null) return null;
  return Math.round(((kernel + user) / 10_000_000) * 10) / 10;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatGigabytes(value: number | null): string {
  return value === null ? "unknown" : `${(value / 1024 ** 3).toFixed(2)}GB`;
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
    `physical memory: free=${formatGigabytes(report.systemMemory.freeBytes)} total=${formatGigabytes(report.systemMemory.totalBytes)}${report.systemMemory.freePercent === null ? "" : ` (${report.systemMemory.freePercent.toFixed(1)}%)`}`,
  ];
  for (const process of report.processes) {
    const input = process.inputPath === null ? "" : ` input=${basename(process.inputPath)}`;
    const cpu = process.cpuSeconds === null ? "" : ` cpu=${process.cpuSeconds}s`;
    const memory = process.workingSetBytes === null ? "" : ` memory=${formatGigabytes(process.workingSetBytes)}`;
    lines.push(`process ${process.pid}: ${process.name} started=${process.startedAt ?? "unknown"}${cpu}${memory}${input}`);
  }
  for (const row of report.coverage.rows) {
    const missing = row.missingBoards.length > 0 ? ` missing=${row.missingBoards.join(",")}` : "";
    lines.push(`${row.familyId}: ${row.status} (${row.solved}/${row.expected})${missing}`);
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
