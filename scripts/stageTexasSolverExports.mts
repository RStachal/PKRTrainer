import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_FAMILY_ID = "MTT9_50BB_BTN_BB_SRP";
const DEFAULT_TEXAS_SOLVER_OUTPUT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

interface CliArgs {
  familyId: string;
  json: boolean;
  outputPath: string | null;
  rawDir: string;
  reviewTemplate: boolean;
  solverOutputDir: string;
  summary: boolean;
  write: boolean;
}

interface RawExportInfo {
  fileName: string;
  path: string;
  bytes: number;
  parseableJson: boolean;
  topLevelKind: "array" | "object" | "other";
  topLevelKeys: string[];
}

interface StageReport {
  valid: boolean;
  write: boolean;
  familyId: string;
  rawDir: string;
  solverOutputDir: string;
  counts: {
    rawFiles: number;
    parseableJson: number;
    invalidJson: number;
    plannedWrites: number;
    writtenFiles: number;
  };
  rawExports: RawExportInfo[];
  plannedFiles: Array<{ path: string; written: boolean; purpose: string }>;
  blockers: string[];
  nextSteps: string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:stage-texas-solver",
    "  npm run mtt:stage-texas-solver -- --summary",
    "  npm run mtt:stage-texas-solver -- --json",
    "  npm run mtt:stage-texas-solver -- --write",
    "  npm run mtt:stage-texas-solver -- --write --review-template",
    "  npm run mtt:stage-texas-solver -- --family=MTT9_40BB_UTG_BB_SRP --write",
    "  npm run mtt:stage-texas-solver -- --raw-dir=<path> --solver-output-dir=<path>",
    "",
    "Notes:",
    "  This command stages raw TexasSolver JSON exports for review.",
    "  It never creates production normalized.json files.",
    "  By default it writes strategy-export.json and accuracy-report.json only.",
    "  review-notes.md is created only with --review-template and still requires human review.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildStageReport(args);
  if (args.write && report.blockers.length === 0) writeStageFiles(args, report);
  const finalReport = args.write && report.blockers.length === 0 ? buildStageReport(args) : report;
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(finalReport, null, 2) : renderReport(finalReport, args.summary));
  process.exitCode = finalReport.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let familyId = DEFAULT_FAMILY_ID;
  let json = false;
  let outputPath: string | null = null;
  let rawDir: string | null = null;
  let reviewTemplate = false;
  let solverOutputDir: string | null = null;
  let summary = false;
  let write = false;

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
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--review-template") {
      reviewTemplate = true;
      continue;
    }
    if (item.startsWith("--family=")) {
      const value = item.slice("--family=".length).trim();
      if (value.length === 0) throw new Error(`--family requires a value.\n\n${usage()}`);
      familyId = value;
      continue;
    }
    if (item === "--family") {
      familyId = nextArgValue(argv, index, "--family");
      index += 1;
      continue;
    }
    if (item.startsWith("--raw-dir=")) {
      const value = item.slice("--raw-dir=".length).trim();
      if (value.length === 0) throw new Error(`--raw-dir requires a path.\n\n${usage()}`);
      rawDir = resolve(value);
      continue;
    }
    if (item === "--raw-dir") {
      rawDir = resolve(nextArgValue(argv, index, "--raw-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--solver-output-dir=")) {
      const value = item.slice("--solver-output-dir=".length).trim();
      if (value.length === 0) throw new Error(`--solver-output-dir requires a path.\n\n${usage()}`);
      solverOutputDir = resolve(value);
      continue;
    }
    if (item === "--solver-output-dir") {
      solverOutputDir = resolve(nextArgValue(argv, index, "--solver-output-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArgValue(argv, index, "--output"));
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  const resolvedSolverOutputDir = solverOutputDir ?? defaultSolverOutputDir(familyId);
  const resolvedRawDir = rawDir ?? join(resolvedSolverOutputDir, "raw");

  return {
    familyId,
    json,
    outputPath,
    rawDir: resolvedRawDir,
    reviewTemplate,
    solverOutputDir: resolvedSolverOutputDir,
    summary,
    write,
  };
}

function defaultSolverOutputDir(familyId: string): string {
  return resolve(DEFAULT_TEXAS_SOLVER_OUTPUT_ROOT, familyId);
}

function nextArgValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildStageReport(args: CliArgs): StageReport {
  const rawExports = readRawExports(args.rawDir);
  const invalidJson = rawExports.filter((item) => !item.parseableJson);
  const plannedFiles = plannedStageFiles(args, rawExports.length > 0);
  const blockers = [
    ...(existsSync(args.rawDir) ? [] : [`Raw TexasSolver export directory is missing: ${args.rawDir}`]),
    ...(rawExports.length === 0 ? [`No raw TexasSolver JSON exports found in: ${args.rawDir}`] : []),
    ...invalidJson.map((item) => `Raw export is not parseable JSON: ${item.path}`),
  ];

  return {
    valid: blockers.length === 0,
    write: args.write,
    familyId: args.familyId,
    rawDir: args.rawDir,
    solverOutputDir: args.solverOutputDir,
    counts: {
      rawFiles: rawExports.length,
      parseableJson: rawExports.filter((item) => item.parseableJson).length,
      invalidJson: invalidJson.length,
      plannedWrites: plannedFiles.length,
      writtenFiles: plannedFiles.filter((item) => item.written).length,
    },
    rawExports,
    plannedFiles,
    blockers,
    nextSteps: [
      "Run TexasSolver console batch until raw JSON exports exist.",
      "Run this command with --write to stage strategy-export.json and accuracy-report.json.",
      "Review solver output and create review-notes.md only after human inspection.",
      "Run npm run mtt:solver-verification -- --solver=texas-solver to check readiness.",
    ],
  };
}

function readRawExports(rawDir: string): RawExportInfo[] {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => rawExportInfo(join(rawDir, entry.name), entry.name))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "en"));
}

function rawExportInfo(path: string, fileName: string): RawExportInfo {
  const content = readFileSync(path, "utf8");
  try {
    const parsed = JSON.parse(content) as unknown;
    const topLevelKind = Array.isArray(parsed)
      ? "array"
      : parsed !== null && typeof parsed === "object"
        ? "object"
        : "other";
    const topLevelKeys = topLevelKind === "object"
      ? Object.keys(parsed as Record<string, unknown>).slice(0, 25)
      : [];
    return {
      fileName,
      path,
      bytes: Buffer.byteLength(content, "utf8"),
      parseableJson: true,
      topLevelKind,
      topLevelKeys,
    };
  } catch {
    return {
      fileName,
      path,
      bytes: Buffer.byteLength(content, "utf8"),
      parseableJson: false,
      topLevelKind: "other",
      topLevelKeys: [],
    };
  }
}

function plannedStageFiles(args: CliArgs, hasRawExports: boolean): StageReport["plannedFiles"] {
  const paths = [
    {
      path: join(args.solverOutputDir, "strategy-export.json"),
      purpose: "machine-readable index of raw TexasSolver strategy dumps",
    },
    {
      path: join(args.solverOutputDir, "accuracy-report.json"),
      purpose: "machine-readable TexasSolver run/accuracy staging summary",
    },
  ];
  if (args.reviewTemplate) {
    paths.push({
      path: join(args.solverOutputDir, "review-notes.md"),
      purpose: "human review notes template",
    });
  }
  return paths.map((item) => ({
    ...item,
    written: hasRawExports && existsSync(item.path),
  }));
}

function writeStageFiles(args: CliArgs, report: StageReport): void {
  mkdirSync(args.solverOutputDir, { recursive: true });
  writeFileSync(
    join(args.solverOutputDir, "strategy-export.json"),
    `${JSON.stringify({
      solver: "texas-solver",
      familyId: args.familyId,
      status: "RAW_EXPORT_STAGED",
      rawExportCount: report.rawExports.length,
      rawExports: report.rawExports,
      warning: "Raw solver dumps are staged for review only; do not import directly as production normalized.json.",
    }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(args.solverOutputDir, "accuracy-report.json"),
    `${JSON.stringify({
      solver: "texas-solver",
      familyId: args.familyId,
      status: "NEEDS_REVIEW",
      rawExportCount: report.rawExports.length,
      parseableJson: report.counts.parseableJson,
      invalidJson: report.counts.invalidJson,
      accuracySource: "Not parsed from TexasSolver logs yet; reviewer must inspect raw run output.",
      warning: "This file is a staging summary, not a production accuracy certificate.",
    }, null, 2)}\n`,
    "utf8",
  );
  if (args.reviewTemplate) {
    writeFileSync(
      join(args.solverOutputDir, "review-notes.md"),
      renderReviewTemplate(args, report),
      "utf8",
    );
  }
}

function renderReviewTemplate(args: CliArgs, report: StageReport): string {
  return [
    `# TexasSolver review notes: ${args.familyId}`,
    "",
    "Status: NEEDS_REVIEW",
    "",
    "## Raw exports",
    "",
    ...report.rawExports.map((item) => `- ${item.fileName} (${item.bytes} bytes, parseableJson=${item.parseableJson})`),
    "",
    "## Reviewer checklist",
    "",
    "- [ ] Confirm all expected flops solved.",
    "- [ ] Confirm solver accuracy / exploitability is acceptable.",
    "- [ ] Confirm no raw export is a partial/truncated file.",
    "- [ ] Confirm first-node strategy can be mapped to PKRTrainer action taxonomy.",
    "- [ ] Confirm board coverage, player mapping, tree sizing and range assumptions match the intended PKRTrainer slot.",
    "- [ ] Record exact scope below before any normalized.json/permission.json promotion.",
    "- [ ] Replace this status with `Status: REVIEWED` only after human review.",
    "",
    "Reviewer:",
    "Reviewed at:",
    "Usable for production: no",
    "Usable scope:",
    "Production caveats:",
    "",
  ].join("\n");
}

function renderReport(report: StageReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver export staging",
    `valid: ${report.valid}`,
    `write: ${report.write}`,
    `family: ${report.familyId}`,
    `raw exports: ${report.counts.rawFiles}`,
    `parseable JSON: ${report.counts.parseableJson}`,
    `invalid JSON: ${report.counts.invalidJson}`,
    `planned writes: ${report.counts.plannedWrites}`,
    `written files: ${report.counts.writtenFiles}`,
  ];
  if (summaryOnly) return lines.join("\n");

  for (const item of report.rawExports) {
    lines.push(`raw: ${item.fileName} | bytes=${item.bytes} | json=${item.parseableJson} | kind=${item.topLevelKind}`);
  }
  for (const file of report.plannedFiles) {
    lines.push(`${file.written ? "OK" : "PENDING"} ${file.purpose}: ${file.path}`);
  }
  for (const blocker of report.blockers) lines.push(`blocker: ${blocker}`);
  lines.push("next steps:");
  for (const step of report.nextSteps) lines.push(`  - ${step}`);
  return lines.join("\n");
}
