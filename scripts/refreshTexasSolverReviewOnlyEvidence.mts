import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const TREE_PROFILE = "MEMORY_SAFE_REVIEW_ONLY";
const DEFAULT_MANIFESTS = [
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-flop-review-v1-manifest.json",
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-followup-flop-review-v1-manifest.json",
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-owner-depth-flop-review-v1-manifest.json",
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-beta-min-board-review-v1-manifest.json",
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-beta-depth-board-review-v1-manifest.json",
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-low-memory-growth-board-review-v1-manifest.json",
];
const DEFAULT_REPORTS_DIR = "artifacts/texas-solver-review-only-owner-depth/reviews";
const DEFAULT_VIEWER_OUTPUT = "artifacts/texas-solver-review-only-owner-depth/viewer/index.html";
const DEFAULT_OUTPUT = "artifacts/texas-solver-review-only-owner-depth/refresh-report.json";
const DEFAULT_LOCK = "artifacts/texas-solver-review-only-owner-depth/refresh.lock";
const VITE_NODE = resolve("node_modules/vite-node/vite-node.mjs");

interface CliArgs {
  dryRun: boolean;
  lockPath: string;
  manifestPaths: string[];
  outputPath: string;
  reportsDir: string;
  summary: boolean;
  viewerEnabled: boolean;
  viewerOutput: string;
}

interface CoverageManifest {
  packId?: string;
  executionProfile?: { treeProfile?: string };
  outputBase?: string;
  scenarios?: Array<{ familyId?: string; boards?: string[] }>;
}

interface FamilyEvidence {
  boards: Set<string>;
  rawDir: string;
  rawPaths: Map<string, string>;
}

interface ExistingReviewReport {
  familyId?: unknown;
  files?: unknown;
  productionReady?: unknown;
  requestedBoards?: unknown;
  reviewOnlyTreeProfile?: unknown;
  status?: unknown;
  valid?: unknown;
}

interface RefreshReport {
  schemaVersion: 1;
  generatedAt: string;
  latestRawWriteAt: string | null;
  valid: boolean;
  busy: boolean;
  dryRun: boolean;
  treeProfile: typeof TREE_PROFILE;
  manifests: string[];
  manifestCoverage: ManifestCoverage[];
  eligibleFamilies: number;
  evidenceBoards: number;
  reports: number;
  plannedRefresh: number;
  refreshed: number;
  plannedStagingRefresh: number;
  stagingRefreshed: number;
  accuracyEvidenceBoards: number;
  accuracyEvidenceFamilies: number;
  failures: number;
  viewerWritten: boolean;
  viewerPath: string;
  errors: string[];
}

interface ManifestCoverage {
  packId: string;
  manifestPath: string;
  solvedBoards: number;
  expectedBoards: number;
  rawCompleteFamilies: number;
  families: number;
  complete: boolean;
}

interface EvidenceScan {
  families: Map<string, FamilyEvidence>;
  manifestCoverage: ManifestCoverage[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const lockAcquired = acquireLock(args.lockPath);
  if (!lockAcquired) {
    const message = `Review-only refresh already owns the lock: ${args.lockPath}`;
    console.log(message);
    process.exitCode = 0;
  } else {
    try {
      const report = refreshEvidence(args);
      writeJsonAtomic(args.outputPath, report);
      console.log(renderReport(report, args.summary));
      process.exitCode = report.valid ? 0 : 1;
    } finally {
      releaseLock(args.lockPath);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let dryRun = false;
  const manifestPaths: string[] = [];
  let outputPath = resolve(DEFAULT_OUTPUT);
  let reportsDir = resolve(DEFAULT_REPORTS_DIR);
  let summary = false;
  let viewerEnabled = true;
  let viewerOutput = resolve(DEFAULT_VIEWER_OUTPUT);
  let lockPath = resolve(DEFAULT_LOCK);

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") dryRun = true;
    else if (item === "--summary") summary = true;
    else if (item === "--no-viewer") viewerEnabled = false;
    else if (item.startsWith("--manifest=")) manifestPaths.push(resolve(inlineValue(item, "--manifest")));
    else if (item === "--manifest") {
      manifestPaths.push(resolve(nextValue(argv, index, "--manifest")));
      index += 1;
    } else if (item.startsWith("--output=")) outputPath = resolve(inlineValue(item, "--output"));
    else if (item.startsWith("--reports-dir=")) reportsDir = resolve(inlineValue(item, "--reports-dir"));
    else if (item.startsWith("--viewer-output=")) viewerOutput = resolve(inlineValue(item, "--viewer-output"));
    else if (item.startsWith("--lock-path=")) lockPath = resolve(inlineValue(item, "--lock-path"));
    else if (item === "--help" || item === "-h") throw new Error(usage());
    else throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return {
    dryRun,
    lockPath,
    manifestPaths: manifestPaths.length > 0 ? manifestPaths : DEFAULT_MANIFESTS.map((path) => resolve(path)),
    outputPath,
    reportsDir,
    summary,
    viewerEnabled,
    viewerOutput,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-review-only-refresh -- --summary",
    "  npm run mtt:texas-solver-review-only-refresh -- --manifest=<path> --dry-run --summary",
    "",
    "Unions solved boards from MEMORY_SAFE_REVIEW_ONLY manifests and refreshes only stale review evidence.",
    "It never writes normalized strategy, review decisions or production runtime content.",
  ].join("\n");
}

function nextValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.`);
  return value;
}

function refreshEvidence(args: CliArgs): RefreshReport {
  const errors: string[] = [];
  const scan = collectEvidence(args.manifestPaths);
  const evidence = scan.families;
  const familyIds = [...evidence.keys()].sort();
  let plannedRefresh = 0;
  let refreshed = 0;
  let plannedStagingRefresh = 0;
  let stagingRefreshed = 0;
  let failures = 0;

  mkdirSync(args.reportsDir, { recursive: true });
  for (const familyId of familyIds) {
    const family = evidence.get(familyId);
    if (family === undefined || family.boards.size === 0) continue;
    const boards = [...family.boards].sort();
    const reportPath = join(args.reportsDir, `${familyId}.review.json`);
    if (reportIsFresh(reportPath, familyId, boards, family.rawPaths)) continue;
    plannedRefresh += 1;
    if (args.dryRun) continue;
    const result = runViteNode("scripts/extractTexasSolverReview.mts", [
      `--family=${familyId}`,
      `--boards=${boards.join(",")}`,
      `--raw-dir=${family.rawDir}`,
      `--review-only-tree-profile=${TREE_PROFILE}`,
      `--output=${reportPath}`,
      "--summary",
    ]);
    if (!result.ok) {
      failures += 1;
      errors.push(`${familyId}: ${result.error}`);
      continue;
    }
    refreshed += 1;
  }

  const reportPaths = familyIds
    .map((familyId) => join(args.reportsDir, `${familyId}.review.json`))
    .filter((path) => existsSync(path));
  for (const familyId of familyIds) {
    const family = evidence.get(familyId);
    const reportPath = join(args.reportsDir, `${familyId}.review.json`);
    if (family === undefined || !existsSync(reportPath)) continue;
    const familyDir = dirname(family.rawDir);
    if (stagedEvidenceIsFresh(familyId, familyDir, reportPath)) continue;
    plannedStagingRefresh += 1;
    if (args.dryRun) continue;
    const result = runViteNode("scripts/stageTexasSolverExports.mts", [
      `--family=${familyId}`,
      `--raw-dir=${family.rawDir}`,
      `--solver-output-dir=${familyDir}`,
      `--review-evidence=${reportPath}`,
      "--write",
      "--summary",
    ]);
    if (!result.ok) {
      failures += 1;
      errors.push(`${familyId} staged evidence: ${result.error}`);
      continue;
    }
    stagingRefreshed += 1;
  }
  const accuracyCoverage = stagedAccuracyCoverage(familyIds, evidence);
  let viewerWritten = false;
  if (!args.dryRun && args.viewerEnabled && reportPaths.length > 0 && viewerNeedsRefresh(args.viewerOutput, reportPaths)) {
    const result = runViteNode("scripts/buildTexasSolverReviewViewer.mts", [
      ...reportPaths.map((path) => `--input=${path}`),
      "--no-waves",
      "--title=TexasSolver cumulative review-only evidence",
      `--output=${args.viewerOutput}`,
    ]);
    if (result.ok) viewerWritten = true;
    else {
      failures += 1;
      errors.push(`viewer: ${result.error}`);
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    latestRawWriteAt: latestRawWriteAt(evidence),
    valid: failures === 0,
    busy: false,
    dryRun: args.dryRun,
    treeProfile: TREE_PROFILE,
    manifests: args.manifestPaths,
    manifestCoverage: scan.manifestCoverage,
    eligibleFamilies: familyIds.length,
    evidenceBoards: familyIds.reduce((sum, familyId) => sum + (evidence.get(familyId)?.boards.size ?? 0), 0),
    reports: reportPaths.length,
    plannedRefresh,
    refreshed,
    plannedStagingRefresh,
    stagingRefreshed,
    accuracyEvidenceBoards: accuracyCoverage.boards,
    accuracyEvidenceFamilies: accuracyCoverage.families,
    failures,
    viewerWritten,
    viewerPath: args.viewerOutput,
    errors,
  };
}

function stagedEvidenceIsFresh(familyId: string, familyDir: string, reviewPath: string): boolean {
  const strategyPath = join(familyDir, "strategy-export.json");
  const accuracyPath = join(familyDir, "accuracy-report.json");
  if (!existsSync(strategyPath) || !existsSync(accuracyPath)) return false;
  try {
    const review = JSON.parse(readFileSync(reviewPath, "utf8")) as ExistingReviewReport;
    const strategy = JSON.parse(readFileSync(strategyPath, "utf8")) as Record<string, unknown>;
    const accuracy = JSON.parse(readFileSync(accuracyPath, "utf8")) as Record<string, unknown>;
    const files = Array.isArray(review.files) ? review.files : [];
    const rawFileNames = files.flatMap((value) => {
      if (typeof value !== "object" || value === null) return [];
      const fileName = (value as Record<string, unknown>).fileName;
      return typeof fileName === "string" ? [fileName] : [];
    });
    if (rawFileNames.length === 0) return false;
    const latestSourceWrite = Math.max(
      statSync(reviewPath).mtimeMs,
      ...rawFileNames.flatMap((fileName) => {
        const logPath = join(familyDir, "solver-logs", fileName.replace(/\.json$/i, ".log"));
        return existsSync(logPath) ? [statSync(logPath).mtimeMs] : [];
      }),
    );
    const expectedEvidencePath = resolve(reviewPath);
    return strategy.familyId === familyId
      && strategy.rawExportCount === rawFileNames.length
      && strategy.reviewEvidencePath === expectedEvidencePath
      && accuracy.familyId === familyId
      && accuracy.rawExportCount === rawFileNames.length
      && accuracy.reviewEvidencePath === expectedEvidencePath
      && accuracy.evidenceScope === "APPROVED_MEMORY_SAFE_REVIEW_ONLY_MANIFEST_UNION"
      && statSync(strategyPath).mtimeMs >= latestSourceWrite
      && statSync(accuracyPath).mtimeMs >= latestSourceWrite;
  } catch {
    return false;
  }
}

function stagedAccuracyCoverage(
  familyIds: readonly string[],
  evidence: ReadonlyMap<string, FamilyEvidence>,
): { boards: number; families: number } {
  let boards = 0;
  let families = 0;
  for (const familyId of familyIds) {
    const family = evidence.get(familyId);
    if (family === undefined) continue;
    const path = join(dirname(family.rawDir), "accuracy-report.json");
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const coverage = parsed.solverLogCoverage;
      if (typeof coverage !== "object" || coverage === null) continue;
      const parsedLogs = (coverage as Record<string, unknown>).parsedLogs;
      if (typeof parsedLogs !== "number" || !Number.isInteger(parsedLogs) || parsedLogs <= 0) continue;
      boards += parsedLogs;
      families += 1;
    } catch {
      // Invalid accuracy evidence remains absent from the measured total.
    }
  }
  return { boards, families };
}

function latestRawWriteAt(evidence: ReadonlyMap<string, FamilyEvidence>): string | null {
  const rawPaths = [...evidence.values()].flatMap((family) => [...family.rawPaths.values()]);
  if (rawPaths.length === 0) return null;
  return new Date(Math.max(...rawPaths.map((path) => statSync(path).mtimeMs))).toISOString();
}

function collectEvidence(manifestPaths: readonly string[]): EvidenceScan {
  const evidence = new Map<string, FamilyEvidence>();
  const manifestCoverage: ManifestCoverage[] = [];
  for (const manifestPath of manifestPaths) {
    if (!existsSync(manifestPath)) throw new Error(`Missing review-only manifest: ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CoverageManifest;
    if (manifest.executionProfile?.treeProfile !== TREE_PROFILE) {
      throw new Error(`Manifest is not ${TREE_PROFILE}: ${manifestPath}`);
    }
    if (typeof manifest.outputBase !== "string" || !Array.isArray(manifest.scenarios)) {
      throw new Error(`Invalid review-only manifest structure: ${manifestPath}`);
    }
    const outputBase = resolve(manifest.outputBase);
    let solvedBoards = 0;
    let expectedBoards = 0;
    let rawCompleteFamilies = 0;
    for (const scenario of manifest.scenarios) {
      const familyId = scenario.familyId ?? "";
      if (!/^[A-Za-z0-9_]+$/.test(familyId) || !Array.isArray(scenario.boards)) {
        throw new Error(`Invalid family or board list in ${manifestPath}: ${familyId || "<missing>"}`);
      }
      const rawDir = join(outputBase, familyId, "raw");
      const family = evidence.get(familyId) ?? { boards: new Set<string>(), rawDir, rawPaths: new Map<string, string>() };
      if (family.rawDir !== rawDir) throw new Error(`Family ${familyId} resolves to multiple raw directories.`);
      const rawNames = existsSync(rawDir) ? readdirSync(rawDir).filter((name) => name.toLowerCase().endsWith(".json")) : [];
      let solvedInFamily = 0;
      for (const board of scenario.boards) {
        expectedBoards += 1;
        if (!/^[A-Za-z0-9_-]+$/.test(board)) throw new Error(`Invalid board ID for ${familyId}: ${board}`);
        const rawName = findRawName(rawNames, board);
        if (rawName === undefined) continue;
        solvedBoards += 1;
        solvedInFamily += 1;
        family.boards.add(board);
        family.rawPaths.set(board, join(rawDir, rawName));
      }
      if (scenario.boards.length > 0 && solvedInFamily === scenario.boards.length) rawCompleteFamilies += 1;
      evidence.set(familyId, family);
    }
    manifestCoverage.push({
      packId: manifest.packId ?? basename(manifestPath, ".json"),
      manifestPath,
      solvedBoards,
      expectedBoards,
      rawCompleteFamilies,
      families: manifest.scenarios.length,
      complete: expectedBoards > 0 && solvedBoards === expectedBoards,
    });
  }
  return {
    families: new Map([...evidence].filter(([, family]) => family.boards.size > 0)),
    manifestCoverage,
  };
}

function findRawName(rawNames: readonly string[], board: string): string | undefined {
  return rawNames.find((name) => name.toLowerCase().endsWith(`_${board.toLowerCase()}.json`));
}

function reportIsFresh(
  reportPath: string,
  familyId: string,
  boards: readonly string[],
  rawPaths: ReadonlyMap<string, string>,
): boolean {
  if (!existsSync(reportPath)) return false;
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as ExistingReviewReport;
    const existingBoards = Array.isArray(report.requestedBoards)
      ? report.requestedBoards.filter((value): value is string => typeof value === "string").sort()
      : [];
    const latestRawWrite = Math.max(...boards.map((board) => statSync(requiredRawPath(rawPaths, board)).mtimeMs));
    return report.valid === true
      && report.status === "REVIEW_ONLY_EVIDENCE"
      && report.reviewOnlyTreeProfile === TREE_PROFILE
      && report.familyId === familyId
      && existingBoards.join("|") === boards.join("|")
      && statSync(reportPath).mtimeMs >= latestRawWrite;
  } catch {
    return false;
  }
}

function requiredRawPath(rawPaths: ReadonlyMap<string, string>, board: string): string {
  const path = rawPaths.get(board);
  if (path === undefined) throw new Error(`Missing raw path for solved board ${board}.`);
  return path;
}

function viewerNeedsRefresh(viewerPath: string, reportPaths: readonly string[]): boolean {
  if (!existsSync(viewerPath)) return true;
  const viewerWrite = statSync(viewerPath).mtimeMs;
  return reportPaths.some((path) => statSync(path).mtimeMs > viewerWrite);
}

function runViteNode(scriptPath: string, args: readonly string[]): { ok: boolean; error: string } {
  const result = spawnSync(process.execPath, [VITE_NODE, resolve(scriptPath), ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status === 0) return { ok: true, error: "" };
  return {
    ok: false,
    error: (result.stderr || result.stdout || `exit ${result.status ?? "unknown"}`).trim(),
  };
}

function acquireLock(lockPath: string): boolean {
  mkdirSync(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx");
      try {
        writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      } finally {
        closeSync(descriptor);
      }
      return true;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      const ownerPid = readLockPid(lockPath);
      if (ownerPid !== null && processIsAlive(ownerPid)) return false;
      try {
        unlinkSync(lockPath);
      } catch {
        return false;
      }
    }
  }
  return false;
}

function readLockPid(lockPath: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: unknown };
    return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseLock(lockPath: string): void {
  try {
    const ownerPid = readLockPid(lockPath);
    if (ownerPid === process.pid) unlinkSync(lockPath);
  } catch {
    // A removed lock already represents the desired final state.
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function renderReport(report: RefreshReport, summary: boolean): string {
  const lines = [
    "TexasSolver cumulative review-only refresh",
    `generated at: ${report.generatedAt}`,
    `latest raw at scan: ${report.latestRawWriteAt ?? "none"}`,
    `valid: ${report.valid}`,
    `dry run: ${report.dryRun}`,
    `families: ${report.eligibleFamilies}`,
    `evidence boards: ${report.evidenceBoards}`,
    ...report.manifestCoverage.map((coverage) => (
      `coverage: ${coverage.packId} ${coverage.solvedBoards}/${coverage.expectedBoards}, raw-complete families ${coverage.rawCompleteFamilies}/${coverage.families}`
    )),
    `reports: ${report.reports}`,
    `planned refresh: ${report.plannedRefresh}`,
    `refreshed: ${report.refreshed}`,
    `planned staging refresh: ${report.plannedStagingRefresh}`,
    `staging refreshed: ${report.stagingRefreshed}`,
    `accuracy evidence: ${report.accuracyEvidenceBoards} boards across ${report.accuracyEvidenceFamilies} families`,
    `failures: ${report.failures}`,
    `viewer written: ${report.viewerWritten}`,
  ];
  if (!summary) lines.push(...report.errors.map((error) => `error: ${error}`));
  return lines.join("\n");
}
