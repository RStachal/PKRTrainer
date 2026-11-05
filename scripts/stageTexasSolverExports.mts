import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_FAMILY_ID = "MTT9_50BB_BTN_BB_SRP";
const DEFAULT_TEXAS_SOLVER_OUTPUT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

interface CliArgs {
  familyId: string;
  json: boolean;
  outputPath: string | null;
  queueLogDir: string;
  rawDir: string;
  reviewEvidencePath: string | null;
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
    "  npm run mtt:stage-texas-solver -- --review-evidence=<validated cumulative review.json> --write",
    "  npm run mtt:stage-texas-solver -- --queue-log-dir=artifacts/texas-solver-autostart",
    "",
    "Notes:",
    "  This command stages raw TexasSolver JSON exports for review.",
    "  It never creates production normalized.json files.",
    "  By default it writes strategy-export.json and accuracy-report.json only.",
    "  --review-evidence reuses a fresh validated MEMORY_SAFE_REVIEW_ONLY report instead of reparsing raw JSON.",
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
  let queueLogDir = resolve("artifacts/texas-solver-autostart");
  let rawDir: string | null = null;
  let reviewEvidencePath: string | null = null;
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
    if (item.startsWith("--review-evidence=")) {
      const value = item.slice("--review-evidence=".length).trim();
      if (value.length === 0) throw new Error(`--review-evidence requires a path.\n\n${usage()}`);
      reviewEvidencePath = resolve(value);
      continue;
    }
    if (item === "--review-evidence") {
      reviewEvidencePath = resolve(nextArgValue(argv, index, "--review-evidence"));
      index += 1;
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
    if (item.startsWith("--queue-log-dir=")) {
      const value = item.slice("--queue-log-dir=".length).trim();
      if (value.length === 0) throw new Error(`--queue-log-dir requires a path.\n\n${usage()}`);
      queueLogDir = resolve(value);
      continue;
    }
    if (item === "--queue-log-dir") {
      queueLogDir = resolve(nextArgValue(argv, index, "--queue-log-dir"));
      index += 1;
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
    queueLogDir,
    rawDir: resolvedRawDir,
    reviewEvidencePath,
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
  const rawExports = args.reviewEvidencePath === null
    ? readRawExports(args.rawDir)
    : readRawExportsFromReviewEvidence(args.reviewEvidencePath, args.familyId, args.rawDir);
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

function readRawExportsFromReviewEvidence(
  reviewPath: string,
  familyId: string,
  rawDir: string,
): RawExportInfo[] {
  if (!existsSync(reviewPath)) throw new Error(`Review evidence report is missing: ${reviewPath}`);
  const parsed = JSON.parse(readFileSync(reviewPath, "utf8")) as Record<string, unknown>;
  if (
    parsed.valid !== true
    || parsed.status !== "REVIEW_ONLY_EVIDENCE"
    || parsed.productionReady !== false
    || parsed.reviewOnlyTreeProfile !== "MEMORY_SAFE_REVIEW_ONLY"
    || parsed.familyId !== familyId
  ) {
    throw new Error(`Review evidence is not a valid MEMORY_SAFE_REVIEW_ONLY report for ${familyId}: ${reviewPath}`);
  }
  const reportBlockers = Array.isArray(parsed.blockers) ? parsed.blockers : [];
  if (reportBlockers.length > 0) throw new Error(`Review evidence contains blockers: ${reviewPath}`);
  const requestedBoards = Array.isArray(parsed.requestedBoards) ? parsed.requestedBoards : [];
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  if (files.length === 0 || requestedBoards.length !== files.length) {
    throw new Error(`Review evidence board/file coverage is incomplete: ${reviewPath}`);
  }

  const resolvedRawDir = resolve(rawDir);
  const reportWrite = statSync(reviewPath).mtimeMs;
  const seen = new Set<string>();
  return files.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error(`Review evidence contains an invalid file row: ${reviewPath}`);
    const row = value as Record<string, unknown>;
    const fileName = typeof row.fileName === "string" ? row.fileName : "";
    const path = typeof row.path === "string" ? resolve(row.path) : "";
    const blockers = Array.isArray(row.blockers) ? row.blockers : [];
    const expectedPath = resolve(resolvedRawDir, fileName);
    if (!/^pkrtrainer_[A-Za-z0-9_-]+\.json$/i.test(fileName) || path !== expectedPath || seen.has(fileName.toLowerCase())) {
      throw new Error(`Review evidence contains an unsafe or duplicate raw path: ${fileName || "<missing>"}`);
    }
    if (blockers.length > 0 || !existsSync(path)) throw new Error(`Reviewed raw export is missing or blocked: ${path}`);
    if (statSync(path).mtimeMs > reportWrite) throw new Error(`Review evidence is older than raw export: ${path}`);
    seen.add(fileName.toLowerCase());
    return {
      fileName,
      path,
      bytes: statSync(path).size,
      parseableJson: true,
      topLevelKind: "object" as const,
      topLevelKeys: [],
    };
  }).sort((a, b) => a.fileName.localeCompare(b.fileName, "en"));
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
  const logSummary = summarizeSolverLogs(args, report.rawExports);
  writeFileSync(
    join(args.solverOutputDir, "strategy-export.json"),
    `${JSON.stringify({
      solver: "texas-solver",
      familyId: args.familyId,
      status: "RAW_EXPORT_STAGED",
      rawExportCount: report.rawExports.length,
      rawExports: report.rawExports,
      ...(args.reviewEvidencePath === null ? {} : { reviewEvidencePath: args.reviewEvidencePath }),
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
      ...(args.reviewEvidencePath === null ? {} : {
        reviewEvidencePath: args.reviewEvidencePath,
        evidenceScope: "APPROVED_MEMORY_SAFE_REVIEW_ONLY_MANIFEST_UNION",
      }),
      solverLogCoverage: logSummary,
      accuracySource: logSummary.parsedLogs > 0
        ? "Parsed from local TexasSolver console evidence; human review still decides adequacy."
        : "No per-board TexasSolver console evidence is available yet; reviewer must inspect raw run output.",
      exploitability: report.rawExports.length === 1 ? logSummary.lastTotalExploitability : null,
      warning: "This file is a staging summary, not a production accuracy certificate. Multi-board families retain exploitability only per raw export in solverLogCoverage.evidence.",
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

interface SolverLogEvidence {
  rawFileName: string;
  source: "PER_BOARD_LOG" | "QUEUE_LOG";
  sourceName: string;
  value: number;
}

function summarizeSolverLogs(args: CliArgs, rawExports: readonly RawExportInfo[]) {
  const logRoot = join(args.solverOutputDir, "solver-logs");
  const expectedLogs = rawExports.map((item) => item.fileName.replace(/\.json$/i, ".log"));
  const perBoardEvidence = expectedLogs.flatMap((name) => {
    const path = join(logRoot, name);
    if (!existsSync(path)) return [];
    const value = lastExploitability(readSolverText(path));
    return value === null ? [] : [{
      rawFileName: name.replace(/\.log$/i, ".json"),
      source: "PER_BOARD_LOG" as const,
      sourceName: name,
      value,
    }];
  });
  const perBoardByRaw = new Map(perBoardEvidence.map((item) => [item.rawFileName, item]));
  const queueEvidence = queueLogEvidence(args.queueLogDir, rawExports)
    .filter((item) => !perBoardByRaw.has(item.rawFileName));
  const evidence = [...perBoardEvidence, ...queueEvidence];
  return {
    expectedLogs: expectedLogs.length,
    parsedLogs: evidence.length,
    perBoardLogs: perBoardEvidence.length,
    queueLogEntries: queueEvidence.length,
    missingLogs: expectedLogs.filter((name) => !evidence.some((item) => item.rawFileName === name.replace(/\.log$/i, ".json"))),
    evidence,
    lastTotalExploitability: evidence.at(-1)?.value ?? null,
  };
}

function queueLogEvidence(
  queueLogDir: string,
  rawExports: readonly RawExportInfo[],
): SolverLogEvidence[] {
  if (!existsSync(queueLogDir)) return [];
  const entries = readdirSync(queueLogDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^queue-.*\.log$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
  const attempts = new Map<string, Array<{
    parameter: string;
    rawFileName: string;
    sourceName: string;
    value: number;
  }>>();

  for (const name of entries) {
    let active: {
      parameter: string;
      rawFileName: string;
      exploitability: number | null;
    } | null = null;
    for (const line of readSolverText(join(queueLogDir, name)).split(/\r?\n/)) {
      const begin = line.match(/\bPKRTRAINER_SOLVER_BEGIN\s+parameter=([^\s]+\.txt)\s+raw=([^\s]+\.json)\b/i);
      if (begin !== null) {
        active = {
          parameter: markerFileName(begin[1]),
          rawFileName: markerFileName(begin[2]),
          exploitability: null,
        };
      }
      const value = lastExploitability(line);
      if (active !== null && value !== null) active.exploitability = value;
      const end = line.match(/\bPKRTRAINER_SOLVER_END\s+parameter=([^\s]+\.txt)\s+raw=([^\s]+\.json)\s+exit=0\b/i);
      if (end === null) continue;
      const parameter = markerFileName(end[1]);
      const rawFileName = markerFileName(end[2]);
      if (
        active !== null
        && active.parameter === parameter
        && active.rawFileName === rawFileName
        && active.exploitability !== null
      ) {
        const key = rawFileName.toLowerCase();
        const values = attempts.get(key) ?? [];
        values.push({
          parameter,
          rawFileName,
          sourceName: name,
          value: active.exploitability,
        });
        attempts.set(key, values);
      }
      active = null;
    }
  }

  return rawExports.flatMap((raw) => {
    const expectedParameter = raw.fileName
      .replace(/^pkrtrainer_/i, "")
      .replace(/\.json$/i, ".txt");
    const matches = (attempts.get(raw.fileName.toLowerCase()) ?? [])
      .filter((evidence) => evidence.parameter.replace(/^\d+_/, "") === expectedParameter);
    if (matches.length !== 1) return [];
    return [{
      rawFileName: raw.fileName,
      source: "QUEUE_LOG" as const,
      sourceName: matches[0].sourceName,
      value: matches[0].value,
    }];
  });
}

function readSolverText(path: string): string {
  const content = readFileSync(path);
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) {
    return content.subarray(2).toString("utf16le");
  }
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
    const body = Buffer.from(content.subarray(2));
    if (body.length % 2 !== 0) throw new Error(`Invalid UTF-16BE solver log: ${path}`);
    body.swap16();
    return body.toString("utf16le");
  }
  return content.toString("utf8").replace(/^\uFEFF/, "");
}

function markerFileName(value: string): string {
  return value.trim().replace(/^.*[\\/]/, "");
}

function lastExploitability(text: string): number | null {
  const matches = [...text.matchAll(/Total exploitability\s+(-?\d+(?:\.\d+)?)\s+(?:precent|percent)/gi)];
  const value = matches.at(-1)?.[1];
  return value === undefined ? null : Number(value);
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
