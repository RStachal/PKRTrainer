import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type SolverKind = "all" | "gto-plus" | "texas-solver";
type VerificationStatus = "WAITING_FOR_SOLVER_OUTPUT" | "PARTIAL" | "READY_FOR_REVIEW";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  rootDir: string;
  solver: SolverKind;
  summary: boolean;
}

interface DatabaseFamilyPlan {
  packId: string;
  families: Array<{
    familyId: string;
    description: string;
    spots: string[];
    flopListFile: string;
    ipRangeFile: string;
    oopRangeFile: string;
  }>;
}

interface FamilyVerificationRow {
  familyId: string;
  description: string;
  solver: Exclude<SolverKind, "all">;
  spots: string[];
  flopCount: number;
  inputFiles: Array<{ path: string; present: boolean }>;
  expectedOutputs: Array<{ path: string; present: boolean; purpose: string }>;
  status: VerificationStatus;
  blockers: string[];
}

interface SolverVerificationReport {
  valid: boolean;
  solver: SolverKind;
  sourceRoot: string;
  counts: {
    families: number;
    familySolverRows: number;
    spots: number;
    flops: number;
    readyForReview: number;
    partial: number;
    waitingForSolverOutput: number;
    missingExpectedOutputs: number;
  };
  rows: FamilyVerificationRow[];
  nextSteps: string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:solver-verification",
    "  npm run mtt:solver-verification -- --summary",
    "  npm run mtt:solver-verification -- --json",
    "  npm run mtt:solver-verification -- --solver=texas-solver",
    "  npm run mtt:solver-verification -- --solver=gto-plus --output=artifacts/mtt-solver-verification/report.json",
    "",
    "Options:",
    "  --json",
    "  --summary",
    "  --output=<path>",
    "  --root=<path-to-sample-postflop-v1>",
    "  --solver=all|gto-plus|texas-solver",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildSolverVerificationReport(args);
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
  let json = false;
  let outputPath: string | null = null;
  let rootDir = resolve("Agents/solver-input/gto-plus/sample-postflop-v1");
  let solver: SolverKind = "all";
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
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    if (item.startsWith("--root=")) {
      const value = item.slice("--root=".length).trim();
      if (value.length === 0) throw new Error(`--root requires a path.\n\n${usage()}`);
      rootDir = resolve(value);
      continue;
    }
    if (item.startsWith("--solver=")) {
      solver = parseSolver(item.slice("--solver=".length));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, outputPath, rootDir, solver, summary };
}

function parseSolver(value: string): SolverKind {
  if (value === "all" || value === "gto-plus" || value === "texas-solver") return value;
  throw new Error(`Unsupported --solver value: ${value}\n\n${usage()}`);
}

function buildSolverVerificationReport(args: CliArgs): SolverVerificationReport {
  const familyPlan = readFamilyPlan(args.rootDir);
  const solvers: Array<Exclude<SolverKind, "all">> =
    args.solver === "all" ? ["gto-plus", "texas-solver"] : [args.solver];
  const rows = familyPlan.families.flatMap((family) =>
    solvers.map((solver) => familyRow(args.rootDir, family, solver)),
  );
  const uniqueSpots = new Set(familyPlan.families.flatMap((family) => family.spots));
  const flops = familyPlan.families.reduce((sum, family) => sum + readFlopList(args.rootDir, family.flopListFile).length, 0);
  const missingExpectedOutputs = rows.reduce(
    (sum, row) => sum + row.expectedOutputs.filter((output) => !output.present).length,
    0,
  );
  const report: SolverVerificationReport = {
    valid: rows.length > 0 && rows.every((row) => row.status === "READY_FOR_REVIEW"),
    solver: args.solver,
    sourceRoot: args.rootDir,
    counts: {
      families: familyPlan.families.length,
      familySolverRows: rows.length,
      spots: uniqueSpots.size,
      flops,
      readyForReview: rows.filter((row) => row.status === "READY_FOR_REVIEW").length,
      partial: rows.filter((row) => row.status === "PARTIAL").length,
      waitingForSolverOutput: rows.filter((row) => row.status === "WAITING_FOR_SOLVER_OUTPUT").length,
      missingExpectedOutputs,
    },
    rows,
    nextSteps: [
      "Create or solve each listed family in the selected solver.",
      "Export strategy/accuracy output into the expected output paths.",
      "Run this report again until rows are READY_FOR_REVIEW.",
      "Only then convert reviewed solver exports into normalized production range imports.",
    ],
  };
  return report;
}

function readFamilyPlan(rootDir: string): DatabaseFamilyPlan {
  const path = join(rootDir, "database-families.json");
  if (!existsSync(path)) throw new Error(`Missing database family plan: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as DatabaseFamilyPlan;
  if (!Array.isArray(parsed.families) || parsed.families.length === 0) {
    throw new Error(`database-families.json must contain at least one family.`);
  }
  return parsed;
}

function familyRow(
  rootDir: string,
  family: DatabaseFamilyPlan["families"][number],
  solver: Exclude<SolverKind, "all">,
): FamilyVerificationRow {
  const flopCount = readFlopList(rootDir, family.flopListFile).length;
  const inputFiles = [
    family.flopListFile,
    family.ipRangeFile,
    family.oopRangeFile,
  ].map((relativePath) => ({ path: join(rootDir, relativePath), present: existsSync(join(rootDir, relativePath)) }));
  const expectedOutputs = expectedOutputFiles(rootDir, family.familyId, solver);
  const presentOutputs = expectedOutputs.filter((output) => output.present).length;
  const status = statusFor(presentOutputs, expectedOutputs.length);
  const blockers = [
    ...inputFiles.filter((input) => !input.present).map((input) => `Missing input file: ${input.path}`),
    ...expectedOutputs.filter((output) => !output.present).map((output) => `Missing ${output.purpose}: ${output.path}`),
  ];

  return {
    familyId: family.familyId,
    description: family.description,
    solver,
    spots: family.spots,
    flopCount,
    inputFiles,
    expectedOutputs,
    status,
    blockers,
  };
}

function expectedOutputFiles(
  rootDir: string,
  familyId: string,
  solver: Exclude<SolverKind, "all">,
): FamilyVerificationRow["expectedOutputs"] {
  const outputRoot = join(rootDir, "output", solver, familyId);
  return [
    {
      path: join(outputRoot, "strategy-export.json"),
      present: existsSync(join(outputRoot, "strategy-export.json")),
      purpose: "normalized solver strategy export",
    },
    {
      path: join(outputRoot, "accuracy-report.json"),
      present: existsSync(join(outputRoot, "accuracy-report.json")),
      purpose: "solver accuracy report",
    },
    {
      path: join(outputRoot, "review-notes.md"),
      present: existsSync(join(outputRoot, "review-notes.md")),
      purpose: "human review notes",
    },
  ];
}

function readFlopList(rootDir: string, relativePath: string): string[] {
  const path = join(rootDir, relativePath);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function statusFor(presentOutputs: number, totalOutputs: number): VerificationStatus {
  if (presentOutputs === totalOutputs) return "READY_FOR_REVIEW";
  if (presentOutputs > 0) return "PARTIAL";
  return "WAITING_FOR_SOLVER_OUTPUT";
}

function renderReport(report: SolverVerificationReport, summaryOnly: boolean): string {
  const lines = [
    "MTT solver verification report",
    `valid: ${report.valid}`,
    `solver: ${report.solver}`,
    `families: ${report.counts.families}`,
    `family solver rows: ${report.counts.familySolverRows}`,
    `spots: ${report.counts.spots}`,
    `flops: ${report.counts.flops}`,
    `ready for review: ${report.counts.readyForReview}`,
    `partial: ${report.counts.partial}`,
    `waiting for solver output: ${report.counts.waitingForSolverOutput}`,
    `missing expected outputs: ${report.counts.missingExpectedOutputs}`,
  ];
  if (summaryOnly) return lines.join("\n");

  report.rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.solver} | ${row.familyId} | ${row.status}`);
    lines.push(`   spots: ${row.spots.join(", ")}`);
    lines.push(`   flops: ${row.flopCount}`);
    for (const output of row.expectedOutputs) {
      lines.push(`   ${output.present ? "OK" : "MISSING"} ${output.purpose}: ${output.path}`);
    }
    for (const blocker of row.blockers) lines.push(`   blocker: ${blocker}`);
  });

  lines.push("next steps:");
  for (const nextStep of report.nextSteps) lines.push(`  - ${nextStep}`);
  return lines.join("\n");
}
