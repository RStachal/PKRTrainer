import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const SOLVER_DIR = "Agents/solver-input/texas-solver/mtt-safe-flops-v1";
const DEFAULT_ACCURACY_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_OUTPUT_DIR = `${SOLVER_DIR}/parameters/pkrtrainer_mtt_accuracy_recovery_v1`;
const DEFAULT_MANIFEST = `${SOLVER_DIR}/coverage-accuracy-recovery-v1-manifest.json`;
const OWNERSHIP_MARKER = ".pkrtrainer-accuracy-recovery-v1";
const REVIEW_SCOPE = "APPROVED_MEMORY_SAFE_REVIEW_ONLY_MANIFEST_UNION";
const TREE_PROFILE = "MEMORY_SAFE_REVIEW_ONLY";
const DEFAULT_SOURCE_MANIFESTS = [
  `${SOLVER_DIR}/coverage-low-memory-flop-review-v1-manifest.json`,
  `${SOLVER_DIR}/coverage-low-memory-followup-flop-review-v1-manifest.json`,
  `${SOLVER_DIR}/coverage-low-memory-owner-depth-flop-review-v1-manifest.json`,
  `${SOLVER_DIR}/coverage-low-memory-beta-min-board-review-v1-manifest.json`,
  `${SOLVER_DIR}/coverage-low-memory-beta-depth-board-review-v1-manifest.json`,
  `${SOLVER_DIR}/coverage-low-memory-growth-board-review-v1-manifest.json`,
] as const;

interface CliArgs {
  accuracyRoot: string;
  sourceManifests: string[];
  outputDir: string;
  manifestPath: string;
  reportPath: string | null;
  write: boolean;
  summary: boolean;
}

interface SourceManifest {
  packId?: unknown;
  executionProfile?: { treeProfile?: unknown };
  scenarios?: unknown;
  files?: unknown;
}

interface SourceScenario {
  familyId: string;
  purpose: string;
  coverageTags: string[];
}

interface SourceFile {
  familyId: string;
  boardId: string;
  path: string;
}

interface MissingLog {
  familyId: string;
  boardId: string;
  logName: string;
  rawName: string;
  canonicalRawPath: string;
}

interface SourceCandidate {
  familyId: string;
  boardId: string;
  rawName: string;
  sourcePath: string;
  sourceHash: string;
  content: string;
  purpose: string;
  coverageTags: string[];
  sourcePackId: string;
  threadCount: number;
}

interface RecoveryFile extends SourceCandidate {
  fileName: string;
  outputPath: string;
  canonicalRawPath: string;
  logName: string;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.write) writeRecovery(args, report);
  if (args.reportPath !== null) {
    mkdirSync(dirname(args.reportPath), { recursive: true });
    writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.summary ? renderSummary(report, args.write) : JSON.stringify(report, null, 2));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let accuracyRoot = resolve(DEFAULT_ACCURACY_ROOT);
  const sourceManifests: string[] = [];
  let outputDir = resolve(DEFAULT_OUTPUT_DIR);
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let reportPath: string | null = null;
  let write = false;
  let summary = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item.startsWith("--accuracy-root=")) { accuracyRoot = resolve(value(item, "--accuracy-root")); continue; }
    if (item.startsWith("--source-manifest=")) { sourceManifests.push(resolve(value(item, "--source-manifest"))); continue; }
    if (item.startsWith("--output-dir=")) { outputDir = resolve(value(item, "--output-dir")); continue; }
    if (item.startsWith("--manifest=")) { manifestPath = resolve(value(item, "--manifest")); continue; }
    if (item.startsWith("--output=")) { reportPath = resolve(value(item, "--output")); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return {
    accuracyRoot,
    sourceManifests: sourceManifests.length > 0
      ? sourceManifests
      : DEFAULT_SOURCE_MANIFESTS.map((path) => resolve(path)),
    outputDir,
    manifestPath,
    reportPath,
    write,
    summary,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-accuracy-recovery -- --summary",
    "  npm run mtt:texas-solver-accuracy-recovery -- --write --summary",
    "  npm run mtt:texas-solver-accuracy-recovery -- --write --output=artifacts/texas-solver-accuracy-recovery/report.json",
    "",
    "Prepares only the approved memory-safe parameters whose per-board solver accuracy logs are missing.",
    "It never edits canonical raw checkpoints, review notes, normalized strategy or runtime content.",
  ].join("\n");
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function buildReport(args: CliArgs) {
  const blockers: string[] = [];
  const accuracy = readMissingLogs(args.accuracyRoot, blockers);
  const neededSourceKeys = new Set(accuracy.missing.map((item) => sourceKey(item.familyId, item.rawName)));
  const sourceCandidates = readSourceCandidates(args.sourceManifests, neededSourceKeys, blockers);
  const files: RecoveryFile[] = [];

  for (const missing of accuracy.missing) {
    const key = sourceKey(missing.familyId, missing.rawName);
    const candidates = sourceCandidates.get(key) ?? [];
    if (candidates.length === 0) {
      blockers.push(`${missing.familyId}/${missing.boardId}: no approved memory-safe source parameter for ${missing.rawName}.`);
      continue;
    }
    const hashes = new Set(candidates.map((candidate) => candidate.sourceHash));
    if (hashes.size !== 1) {
      blockers.push(`${missing.familyId}/${missing.boardId}: approved source parameters disagree (${candidates.map((candidate) => candidate.sourcePath).join(", ")}).`);
      continue;
    }
    const candidate = [...candidates].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en"))[0];
    const sequence = String(files.length + 1).padStart(3, "0");
    const fileName = `${sequence}_${missing.familyId}_${missing.boardId}.txt`;
    files.push({
      ...candidate,
      fileName,
      outputPath: join(args.outputDir, fileName),
      canonicalRawPath: missing.canonicalRawPath,
      logName: missing.logName,
    });
  }

  blockers.push(...outputOwnershipBlockers(args.outputDir));
  const scenarios = [...new Set(files.map((file) => file.familyId))].sort().map((familyId) => {
    const familyFiles = files.filter((file) => file.familyId === familyId);
    return {
      familyId,
      boards: familyFiles.map((file) => file.boardId).sort(),
      purpose: "Recover missing per-board solver accuracy logs for already solved memory-safe review evidence.",
      coverageTags: unique(familyFiles.flatMap((file) => file.coverageTags)),
    };
  });
  const threadCounts = uniqueNumbers(files.map((file) => file.threadCount));
  if (threadCounts.length > 1) blockers.push(`Recovery source parameters disagree on thread count: ${threadCounts.join(", ")}.`);
  const valid = blockers.length === 0 && files.length === accuracy.missing.length;
  return {
    schemaVersion: 1,
    valid,
    generatedAt: accuracy.latestReportWrite,
    recoveryOnly: true,
    treeProfile: TREE_PROFILE,
    threadCount: threadCounts[0] ?? null,
    accuracyRoot: args.accuracyRoot,
    outputDir: args.outputDir,
    manifestPath: args.manifestPath,
    sourceManifests: args.sourceManifests,
    counts: {
      families: accuracy.families,
      expectedLogs: accuracy.expectedLogs,
      parsedLogs: accuracy.parsedLogs,
      pendingLogs: accuracy.missing.length,
      recoveryFamilies: scenarios.length,
      sourceCandidates: [...sourceCandidates.values()].flat().length,
      recoveryFiles: files.length,
      blockers: blockers.length,
    },
    scenarios,
    files: files.map((file) => ({
      fileName: file.fileName,
      path: portablePath(file.outputPath),
      familyId: file.familyId,
      boardId: file.boardId,
      written: args.write,
      sourceParameterPath: portablePath(file.sourcePath),
      sourceParameterSha256: file.sourceHash,
      sourcePackId: file.sourcePackId,
      canonicalRawPath: portablePath(file.canonicalRawPath),
      targetLogName: file.logName,
    })),
    blockers,
  };
}

function readMissingLogs(root: string, blockers: string[]) {
  if (!existsSync(root)) throw new Error(`Accuracy root is missing: ${root}`);
  const missing: MissingLog[] = [];
  let families = 0;
  let expectedLogs = 0;
  let parsedLogs = 0;
  let latestReportWrite = new Date(0).toISOString();

  for (const entry of readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const accuracyPath = join(root, entry.name, "accuracy-report.json");
    if (!existsSync(accuracyPath)) continue;
    families += 1;
    const report = parseJsonFile(accuracyPath, blockers, `${entry.name} accuracy report`);
    if (!isRecord(report)) continue;
    if (report.solver !== "texas-solver" || report.familyId !== entry.name || report.evidenceScope !== REVIEW_SCOPE) {
      blockers.push(`${entry.name}: accuracy report is outside the approved TexasSolver memory-safe scope.`);
      continue;
    }
    const coverage = report.solverLogCoverage;
    if (!isRecord(coverage)) {
      blockers.push(`${entry.name}: solverLogCoverage is missing.`);
      continue;
    }
    const expected = nonNegativeInteger(coverage.expectedLogs);
    const parsed = nonNegativeInteger(coverage.parsedLogs);
    const missingLogs = stringArray(coverage.missingLogs);
    const evidence = Array.isArray(coverage.evidence) ? coverage.evidence : null;
    if (expected === null || parsed === null || missingLogs === null || evidence === null || expected !== parsed + missingLogs.length || evidence.length !== parsed) {
      blockers.push(`${entry.name}: solver log counts do not reconcile.`);
      continue;
    }
    if (new Set(missingLogs).size !== missingLogs.length) {
      blockers.push(`${entry.name}: missing solver log names are not unique.`);
      continue;
    }
    expectedLogs += expected;
    parsedLogs += parsed;
    latestReportWrite = maxIso(latestReportWrite, statSync(accuracyPath).mtime.toISOString());
    for (const logName of missingLogs) {
      const match = /^pkrtrainer_(.+)_([AKQJT98765432]{3}(?:r|tt|mono))[.]log$/.exec(logName);
      if (match === null || match[1] !== entry.name || basename(logName) !== logName) {
        blockers.push(`${entry.name}: unsafe or mismatched missing log name ${logName}.`);
        continue;
      }
      const boardId = match[2];
      const rawName = logName.replace(/[.]log$/, ".json");
      const canonicalRawPath = join(root, entry.name, "raw", rawName);
      const raw = parseJsonFile(canonicalRawPath, blockers, `${entry.name}/${boardId} canonical raw checkpoint`);
      if (!isRecord(raw)) continue;
      missing.push({ familyId: entry.name, boardId, logName, rawName, canonicalRawPath });
    }
  }
  if (families === 0) blockers.push("No family accuracy reports were found.");
  return { families, expectedLogs, parsedLogs, missing, latestReportWrite };
}

function readSourceCandidates(
  paths: readonly string[],
  neededKeys: ReadonlySet<string>,
  blockers: string[],
): Map<string, SourceCandidate[]> {
  const result = new Map<string, SourceCandidate[]>();
  for (const manifestPath of paths) {
    const parsed = parseJsonFile(manifestPath, blockers, "source manifest") as SourceManifest | null;
    // Kontrola na `null`, ne `isRecord`: ten zužuje na `Record<string, unknown>`
    // a tím **zahodí** typ `SourceManifest`, takže `executionProfile` vyjde
    // jako `{}` a nejde se ho zeptat na `treeProfile`. Přetypování o řádek výš
    // už tvar slibuje; druhá stráž ho jen zahazovala.
    if (parsed === null) continue;
    const packId = typeof parsed.packId === "string" ? parsed.packId : "";
    if (packId.length === 0 || parsed.executionProfile?.treeProfile !== TREE_PROFILE) {
      blockers.push(`${manifestPath}: source manifest is not explicitly ${TREE_PROFILE}.`);
      continue;
    }
    const scenarios = parseSourceScenarios(parsed.scenarios, manifestPath, blockers);
    const files = parseSourceFiles(parsed.files, manifestPath, blockers);
    for (const file of files) {
      const expectedRawName = `pkrtrainer_${file.familyId}_${file.boardId}.json`;
      const key = sourceKey(file.familyId, expectedRawName);
      if (!neededKeys.has(key)) continue;
      const sourcePath = resolve(file.path);
      if (!existsSync(sourcePath)) {
        blockers.push(`${manifestPath}: source parameter is missing: ${sourcePath}`);
        continue;
      }
      const content = readFileSync(sourcePath, "utf8");
      const dumpMatch = /^dump_result\s+([^\r\n]+)$/m.exec(content);
      const rawName = dumpMatch?.[1]?.trim() ?? "";
      if (rawName !== expectedRawName) {
        blockers.push(`${sourcePath}: dump_result does not match manifest family/board.`);
        continue;
      }
      const scenario = scenarios.get(file.familyId);
      if (scenario === undefined) {
        blockers.push(`${sourcePath}: source scenario is missing approved review-only context.`);
        continue;
      }
      const threadMatch = /^set_thread_num\s+(\d+)\s*$/m.exec(content);
      const threadCount = threadMatch === null ? null : Number(threadMatch[1]);
      if (threadCount === null || !Number.isInteger(threadCount) || threadCount < 1 || threadCount > 4) {
        blockers.push(`${sourcePath}: set_thread_num must be between 1 and 4 for recovery.`);
        continue;
      }
      const candidate: SourceCandidate = {
        ...file,
        rawName,
        sourcePath,
        sourceHash: sha256(content),
        content,
        purpose: scenario.purpose,
        coverageTags: scenario.coverageTags,
        sourcePackId: packId,
        threadCount,
      };
      result.set(key, [...(result.get(key) ?? []), candidate]);
    }
  }
  return result;
}

function parseSourceScenarios(value: unknown, path: string, blockers: string[]): Map<string, SourceScenario> {
  const result = new Map<string, SourceScenario>();
  if (!Array.isArray(value)) { blockers.push(`${path}: scenarios must be an array.`); return result; }
  for (const item of value) {
    if (!isRecord(item) || typeof item.familyId !== "string" || typeof item.purpose !== "string" || stringArray(item.coverageTags) === null) {
      blockers.push(`${path}: malformed source scenario.`);
      continue;
    }
    result.set(item.familyId, { familyId: item.familyId, purpose: item.purpose, coverageTags: stringArray(item.coverageTags)! });
  }
  return result;
}

function parseSourceFiles(value: unknown, path: string, blockers: string[]): SourceFile[] {
  if (!Array.isArray(value)) { blockers.push(`${path}: files must be an array.`); return []; }
  const result: SourceFile[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.familyId !== "string" || typeof item.boardId !== "string" || typeof item.path !== "string") {
      blockers.push(`${path}: malformed source file row.`);
      continue;
    }
    result.push({ familyId: item.familyId, boardId: item.boardId, path: item.path });
  }
  return result;
}

function writeRecovery(args: CliArgs, report: ReturnType<typeof buildReport>): void {
  if (!report.valid) throw new Error(`Cannot write accuracy recovery batch:\n${report.blockers.join("\n")}`);
  mkdirSync(args.outputDir, { recursive: true });
  writeFileSync(join(args.outputDir, OWNERSHIP_MARKER), "PKRTrainer generated accuracy recovery directory.\n", "ascii");
  const expected = new Set(report.files.map((file) => basename(file.path)));
  for (const entry of readdirSync(args.outputDir, { withFileTypes: true })) {
    if (entry.isFile() && /^\d{3}_[A-Za-z0-9_]+_[A-Za-z0-9]+[.]txt$/.test(entry.name) && !expected.has(entry.name)) {
      unlinkSync(join(args.outputDir, entry.name));
    }
  }
  for (const file of report.files) {
    const source = readFileSync(resolve(file.sourceParameterPath), "utf8");
    if (sha256(source) !== file.sourceParameterSha256) throw new Error(`Source parameter changed during recovery preparation: ${file.sourceParameterPath}`);
    writeFileSync(resolve(file.path), source, "ascii");
  }
  const manifest = {
    schemaVersion: 1,
    packId: "pkrtrainer-mtt-texas-solver-accuracy-recovery-v1",
    generatedAt: report.generatedAt,
    recoveryOnly: true,
    parameterDir: portablePath(args.outputDir),
    outputBase: portablePath(args.accuracyRoot),
    executionProfile: {
      threads: report.threadCount,
      treeProfile: TREE_PROFILE,
      purpose: "ACCURACY_LOG_RECOVERY_ONLY",
      canonicalRawWrite: false,
    },
    scenarios: report.scenarios,
    files: report.files,
    notes: [
      "Every parameter is an exact copy of an approved memory-safe source parameter whose canonical raw checkpoint already exists.",
      "Run only with run-console-selected.ps1 -AccuracyOnly; canonical raw JSON must never be removed, moved or replaced.",
      "This batch recovers per-board solver logs only and cannot create owner review, normalized strategy, action EV or production approval.",
    ],
  };
  mkdirSync(dirname(args.manifestPath), { recursive: true });
  writeFileSync(args.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function outputOwnershipBlockers(outputDir: string): string[] {
  if (!existsSync(outputDir)) return [];
  const entries = readdirSync(outputDir);
  if (entries.length === 0 || entries.includes(OWNERSHIP_MARKER)) return [];
  return [`Refusing to reconcile non-empty unowned recovery directory: ${outputDir}`];
}

function parseJsonFile(path: string, blockers: string[], label: string): unknown {
  if (!existsSync(path)) { blockers.push(`Missing ${label}: ${path}`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { blockers.push(`Invalid JSON in ${label}: ${path}`); return null; }
}

function renderSummary(report: ReturnType<typeof buildReport>, write: boolean): string {
  return [
    "TexasSolver accuracy recovery",
    `valid: ${report.valid}`,
    `mode: ${write ? "WRITE" : "DRY_RUN"}`,
    `accuracy: ${report.counts.parsedLogs}/${report.counts.expectedLogs}`,
    `pending logs: ${report.counts.pendingLogs}`,
    `recovery families: ${report.counts.recoveryFamilies}`,
    `recovery files: ${report.counts.recoveryFiles}`,
    `blockers: ${report.counts.blockers}`,
    `manifest: ${report.manifestPath}`,
    ...report.blockers.map((blocker) => `blocker: ${blocker}`),
  ].join("\n");
}

function sourceKey(familyId: string, rawName: string): string {
  return `${familyId}\0${rawName}`;
}

function portablePath(path: string): string {
  const result = relative(process.cwd(), resolve(path));
  return (result.startsWith("..") ? resolve(path) : result).replaceAll("\\", "/");
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function maxIso(left: string, right: string): string {
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
