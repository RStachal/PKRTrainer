import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface CliArgs {
  familyPlanPath: string;
  json: boolean;
  outputPath: string | null;
  parameterDir: string;
  summary: boolean;
}

interface DatabaseFamilyPlan {
  families: Array<{
    familyId: string;
    flopListFile: string;
    spots: string[];
  }>;
}

interface ParameterFileRow {
  fileName: string;
  path: string;
  familyId: string;
  boardId: string;
  dumpResult: string | null;
  knownFamily: boolean;
  blockers: string[];
}

interface FamilyCoverageRow {
  familyId: string;
  expectedFlops: number;
  expectedSpots: number;
  parameterFiles: number;
  dumpResults: number;
  status: "READY" | "MISSING" | "PARTIAL";
  blockers: string[];
}

interface ParameterPackReport {
  valid: boolean;
  familyPlanPath: string;
  parameterDir: string;
  counts: {
    expectedFamilies: number;
    parameterFiles: number;
    knownFamilyFiles: number;
    unknownFamilyFiles: number;
    missingFamilies: number;
    filesMissingDumpResult: number;
  };
  families: FamilyCoverageRow[];
  files: ParameterFileRow[];
  blockers: string[];
  nextSteps: string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-pack",
    "  npm run mtt:texas-solver-pack -- --summary",
    "  npm run mtt:texas-solver-pack -- --json",
    "  npm run mtt:texas-solver-pack -- --output=artifacts/texas-solver-parameter-pack/report.json",
    "  npm run mtt:texas-solver-pack -- --family-plan=<path> --parameter-dir=<path>",
    "",
    "Checks that the TexasSolver parameter pack covers the database families expected by solver verification.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let familyPlanPath = resolve("Agents/solver-input/gto-plus/sample-postflop-v1/database-families.json");
  let json = false;
  let outputPath: string | null = null;
  let parameterDir = resolve("Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_safe_flops_v1");
  let summary = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item.startsWith("--family-plan=")) {
      const value = item.slice("--family-plan=".length).trim();
      if (value.length === 0) throw new Error(`--family-plan requires a path.\n\n${usage()}`);
      familyPlanPath = resolve(value);
      continue;
    }
    if (item.startsWith("--parameter-dir=")) {
      const value = item.slice("--parameter-dir=".length).trim();
      if (value.length === 0) throw new Error(`--parameter-dir requires a path.\n\n${usage()}`);
      parameterDir = resolve(value);
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

  return { familyPlanPath, json, outputPath, parameterDir, summary };
}

function buildReport(args: CliArgs): ParameterPackReport {
  const families = readFamilyPlan(args.familyPlanPath);
  const expectedFamilyIds = new Set(families.map((family) => family.familyId));
  const files = readParameterFiles(args.parameterDir, expectedFamilyIds);
  const rows = families.map((family) => familyCoverageRow(family, files));
  const blockers = [
    ...(existsSync(args.parameterDir) ? [] : [`Parameter directory is missing: ${args.parameterDir}`]),
    ...rows.flatMap((row) => row.blockers),
    ...files.flatMap((file) => file.blockers),
  ];

  return {
    valid: blockers.length === 0,
    familyPlanPath: args.familyPlanPath,
    parameterDir: args.parameterDir,
    counts: {
      expectedFamilies: families.length,
      parameterFiles: files.length,
      knownFamilyFiles: files.filter((file) => file.knownFamily).length,
      unknownFamilyFiles: files.filter((file) => !file.knownFamily).length,
      missingFamilies: rows.filter((row) => row.status === "MISSING").length,
      filesMissingDumpResult: files.filter((file) => file.dumpResult === null).length,
    },
    families: rows,
    files,
    blockers,
    nextSteps: [
      "Run this check before an overnight TexasSolver console batch.",
      "Run run-console-selected.ps1 -Limit 10 -ListOnly and confirm all selected outputs are PENDING or intentionally EXISTS.",
      "After solving, run mtt:stage-texas-solver for each family and then mtt:solver-verification.",
    ],
  };
}

function readFamilyPlan(path: string): DatabaseFamilyPlan["families"] {
  if (!existsSync(path)) throw new Error(`Missing database family plan: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as DatabaseFamilyPlan;
  if (!Array.isArray(parsed.families) || parsed.families.length === 0) {
    throw new Error(`database-families.json must contain at least one family.`);
  }
  return parsed.families;
}

function readParameterFiles(parameterDir: string, expectedFamilyIds: Set<string>): ParameterFileRow[] {
  if (!existsSync(parameterDir)) return [];
  return readdirSync(parameterDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
    .map((entry) => parameterFileRow(join(parameterDir, entry.name), entry.name, expectedFamilyIds))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "en"));
}

function parameterFileRow(path: string, fileName: string, expectedFamilyIds: Set<string>): ParameterFileRow {
  const baseName = fileName.replace(/\.txt$/i, "").replace(/^\d+_/, "");
  const separator = baseName.lastIndexOf("_");
  const familyId = separator > 0 ? baseName.slice(0, separator) : baseName;
  const boardId = separator > 0 ? baseName.slice(separator + 1) : "";
  const content = readFileSync(path, "utf8");
  const dumpResult = content.match(/^dump_result\s+(.+)$/m)?.[1]?.trim() ?? null;
  const knownFamily = expectedFamilyIds.has(familyId);
  const blockers = [
    ...(knownFamily ? [] : [`Unknown family in parameter file ${fileName}: ${familyId}`]),
    ...(boardId.length > 0 ? [] : [`Cannot infer board id from parameter file: ${fileName}`]),
    ...(dumpResult === null ? [`Missing dump_result in parameter file: ${fileName}`] : []),
  ];
  return { fileName, path, familyId, boardId, dumpResult, knownFamily, blockers };
}

function familyCoverageRow(
  family: DatabaseFamilyPlan["families"][number],
  files: ParameterFileRow[],
): FamilyCoverageRow {
  const familyFiles = files.filter((file) => file.familyId === family.familyId);
  const dumpResults = familyFiles.filter((file) => file.dumpResult !== null).length;
  const expectedFlops = Math.max(1, family.spots.length);
  const blockers = [
    ...(familyFiles.length === 0 ? [`Missing TexasSolver parameter file for family: ${family.familyId}`] : []),
    ...(familyFiles.length > 0 && dumpResults < familyFiles.length
      ? [`Some TexasSolver parameter files for family ${family.familyId} are missing dump_result.`]
      : []),
  ];
  const status = familyFiles.length === 0 ? "MISSING" : blockers.length === 0 ? "READY" : "PARTIAL";
  return {
    familyId: family.familyId,
    expectedFlops,
    expectedSpots: family.spots.length,
    parameterFiles: familyFiles.length,
    dumpResults,
    status,
    blockers,
  };
}

function renderReport(report: ParameterPackReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver parameter pack",
    `valid: ${report.valid}`,
    `expected families: ${report.counts.expectedFamilies}`,
    `parameter files: ${report.counts.parameterFiles}`,
    `known-family files: ${report.counts.knownFamilyFiles}`,
    `unknown-family files: ${report.counts.unknownFamilyFiles}`,
    `missing families: ${report.counts.missingFamilies}`,
    `files missing dump_result: ${report.counts.filesMissingDumpResult}`,
  ];
  if (summaryOnly) return lines.join("\n");

  for (const family of report.families) {
    lines.push(`${family.status} ${family.familyId}: parameters=${family.parameterFiles}, dumpResults=${family.dumpResults}, expectedSpots=${family.expectedSpots}`);
  }
  for (const file of report.files) {
    lines.push(`${file.knownFamily ? "OK" : "UNKNOWN"} ${file.fileName}: family=${file.familyId}, board=${file.boardId}, dump=${file.dumpResult ?? "MISSING"}`);
  }
  for (const blocker of report.blockers) lines.push(`blocker: ${blocker}`);
  lines.push("next steps:");
  for (const step of report.nextSteps) lines.push(`  - ${step}`);
  return lines.join("\n");
}
