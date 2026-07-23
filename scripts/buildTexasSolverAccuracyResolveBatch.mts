import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

/**
 * Targeted re-solve batch for boards whose recorded exploitability is above the
 * solver's own accuracy target. These boards under-converged, mostly because the
 * memory-safe recovery worker solved them with a reduced iteration budget. The
 * mechanical acceptance gate withholds their families until they converge.
 *
 * This generator does NOT invent any solver parameters. For each over-target
 * board it copies the exact authoritative full-tree parameter file (excluding
 * the reduced-tree low-memory sets) and only raises `set_max_iteration` to give
 * convergence headroom while keeping the accuracy target. The dump filename is
 * preserved so a completed re-solve replaces the same canonical raw checkpoint
 * through the normal ingest path. It writes a staged batch plus a manifest; it
 * never runs the solver and never writes strategy or production data.
 */

const DEFAULT_ACCURACY_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_PARAM_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";
const DEFAULT_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_accuracy_resolve_v1";
// Deliberately not a `coverage-*-manifest.json` name. Those manifests declare new
// board coverage and the batch builders scan them to reject duplicate work. This
// batch is a repair over already-covered boards, so it must stay out of that scan.
const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/accuracy-resolve-v1-manifest.json";
const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_ITERATIONS = 600;
// Prefer the canonical pilot source when a board exists in several full-tree sets.
const PREFERRED_SET = "pkrtrainer_mtt_safe_flops_v1";

interface OverTargetBoard {
  familyId: string;
  boardId: string;
  exploitability: number;
  sourcePath: string;
  fileName: string;
}

interface CliArgs {
  accuracyRoot: string;
  paramRoot: string;
  outputDir: string;
  manifestPath: string;
  threshold: number;
  iterations: number;
  write: boolean;
  json: boolean;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = build(args);
  if (args.write && report.valid) writeBatch(args, report.boards);
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report, args));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-accuracy-resolve-batch -- --summary",
    "  npm run mtt:texas-solver-accuracy-resolve-batch -- --write --summary",
    "  npm run mtt:texas-solver-accuracy-resolve-batch -- --iterations=800 --json",
    "",
    "Stages a re-solve batch for over-target boards by copying their authoritative",
    "full-tree parameter files with a raised iteration budget. It never runs the",
    "solver and never writes strategy or production data.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let accuracyRoot = resolve(DEFAULT_ACCURACY_ROOT);
  let paramRoot = resolve(DEFAULT_PARAM_ROOT);
  let outputDir = resolve(DEFAULT_OUTPUT_DIR);
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let threshold = DEFAULT_THRESHOLD;
  let iterations = DEFAULT_ITERATIONS;
  let write = false;
  let json = false;
  let summary = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item.startsWith("--accuracy-root=")) { accuracyRoot = resolve(value(item, "--accuracy-root")); continue; }
    if (item.startsWith("--param-root=")) { paramRoot = resolve(value(item, "--param-root")); continue; }
    if (item.startsWith("--output-dir=")) { outputDir = resolve(value(item, "--output-dir")); continue; }
    if (item.startsWith("--manifest=")) { manifestPath = resolve(value(item, "--manifest")); continue; }
    if (item.startsWith("--threshold=")) { threshold = Number(value(item, "--threshold")); continue; }
    if (item.startsWith("--iterations=")) { iterations = Number(value(item, "--iterations")); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error("--threshold must be a positive number.");
  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error("--iterations must be a positive integer.");
  return { accuracyRoot, paramRoot, outputDir, manifestPath, threshold, iterations, write, json, summary };
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function build(args: CliArgs) {
  const overTarget = readOverTargetBoards(args);
  const index = buildAuthoritativeParamIndex(args.paramRoot);
  const blockers: string[] = [];
  const boards: OverTargetBoard[] = [];

  for (const board of overTarget) {
    const key = dumpKey(board.familyId, board.boardId);
    const source = index.get(key);
    if (source === undefined) {
      blockers.push(`No authoritative full-tree parameter file for ${board.familyId} ${board.boardId}.`);
      continue;
    }
    boards.push({ ...board, sourcePath: source, fileName: "" });
  }

  boards.sort((left, right) =>
    left.familyId.localeCompare(right.familyId, "en") || left.boardId.localeCompare(right.boardId, "en"));
  boards.forEach((board, index) => {
    board.fileName = `${String(index + 1).padStart(3, "0")}_${board.familyId}_${board.boardId}.txt`;
  });

  const families = [...new Set(boards.map((board) => board.familyId))].sort((a, b) => a.localeCompare(b, "en"));
  return {
    valid: blockers.length === 0 && boards.length > 0,
    generatedAt: new Date().toISOString(),
    threshold: args.threshold,
    iterations: args.iterations,
    outputDir: repoRelative(args.outputDir),
    manifestPath: repoRelative(args.manifestPath),
    counts: { families: families.length, boards: boards.length, blockers: blockers.length },
    families,
    boards: boards.map((board) => ({
      familyId: board.familyId,
      boardId: board.boardId,
      exploitabilityBefore: round(board.exploitability),
      sourcePath: repoRelative(board.sourcePath),
      fileName: board.fileName,
    })),
    blockers,
    nextCommands: nextCommands(args),
  };
}

function readOverTargetBoards(args: CliArgs): OverTargetBoard[] {
  if (!existsSync(args.accuracyRoot)) throw new Error(`Accuracy root is missing: ${args.accuracyRoot}`);
  const result: OverTargetBoard[] = [];
  for (const entry of readdirSync(args.accuracyRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const accuracyPath = join(args.accuracyRoot, entry.name, "accuracy-report.json");
    if (!existsSync(accuracyPath)) continue;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(readFileSync(accuracyPath, "utf8")) as Record<string, unknown>; } catch { continue; }
    const coverage = isRecord(parsed.solverLogCoverage) ? parsed.solverLogCoverage : {};
    const evidence = Array.isArray(coverage.evidence) ? coverage.evidence : [];
    for (const item of evidence) {
      if (!isRecord(item)) continue;
      const rawFileName = typeof item.rawFileName === "string" ? item.rawFileName : "";
      const exploitability = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
      if (rawFileName.length === 0 || exploitability === null || exploitability <= args.threshold) continue;
      result.push({
        familyId: entry.name,
        boardId: boardIdFromRawName(rawFileName),
        exploitability,
        sourcePath: "",
        fileName: "",
      });
    }
  }
  return result;
}

function buildAuthoritativeParamIndex(paramRoot: string): Map<string, string> {
  const index = new Map<string, string>();
  if (!existsSync(paramRoot)) throw new Error(`Parameter root is missing: ${paramRoot}`);
  for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    if (set.name.includes("low_memory") || set.name === basename(DEFAULT_OUTPUT_DIR)) continue;
    const setDir = join(paramRoot, set.name);
    for (const file of readdirSync(setDir).filter((name) => name.endsWith(".txt"))) {
      const filePath = join(setDir, file);
      const key = dumpKeyFromContent(readFileSync(filePath, "utf8"));
      if (key === null) continue;
      const existing = index.get(key);
      if (existing === undefined || set.name === PREFERRED_SET) index.set(key, filePath);
    }
  }
  return index;
}

function dumpKeyFromContent(content: string): string | null {
  const match = /dump_result\s+pkrtrainer_(.+)_([AKQJT98765432]{3}(?:r|tt|mono))\.json\s*$/im.exec(content);
  return match === null ? null : dumpKey(match[1], match[2]);
}

function dumpKey(familyId: string, boardId: string): string {
  return `${familyId}::${boardId}`;
}

function boardIdFromRawName(rawFileName: string): string {
  const match = /_([AKQJT98765432]{3}(?:r|tt|mono))\.(?:json|log)$/i.exec(rawFileName);
  return match?.[1] ?? rawFileName;
}

function writeBatch(args: CliArgs, boards: ReturnType<typeof build>["boards"]): void {
  mkdirSync(args.outputDir, { recursive: true });
  mkdirSync(dirname(args.manifestPath), { recursive: true });
  for (const board of boards) {
    const source = readFileSync(resolve(board.sourcePath), "utf8");
    writeFileSync(join(args.outputDir, board.fileName), raiseIterations(source, args.iterations), "utf8");
  }
  const scenarios = [...new Set(boards.map((board) => board.familyId))]
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((familyId) => ({
      familyId,
      boards: boards.filter((board) => board.familyId === familyId).map((board) => board.boardId),
      purpose: "Re-solve under-converged boards at a raised iteration budget until exploitability meets target.",
      coverageTags: ["ACCURACY_RESOLVE", "OVER_TARGET_EXPLOITABILITY"],
    }));
  writeFileSync(args.manifestPath, `${JSON.stringify({
    packId: "pkrtrainer-mtt-texas-solver-accuracy-resolve-v1",
    generatedAt: new Date().toISOString().slice(0, 10),
    parameterDir: repoRelative(args.outputDir),
    outputBase: DEFAULT_ACCURACY_ROOT,
    exploitabilityTarget: args.threshold,
    raisedIterations: args.iterations,
    scenarios,
    files: boards.map((board) => ({
      familyId: board.familyId,
      boardId: board.boardId,
      fileName: board.fileName,
      exploitabilityBefore: board.exploitabilityBefore,
      authoritativeSource: board.sourcePath,
      written: true,
    })),
    notes: [
      "Re-solve batch for boards above the solver accuracy target.",
      "Parameters are copied verbatim from the authoritative full-tree source; only set_max_iteration is raised.",
      "Requires enough free RAM for full-tree solving; run through the standard queue worker.",
      "After a completed re-solve, re-run mtt:texas-solver-mechanical-acceptance to re-grade the families.",
    ],
    commands: nextCommands(args),
  }, null, 2)}\n`, "utf8");
}

function raiseIterations(content: string, iterations: number): string {
  if (/^set_max_iteration\s+\d+\s*$/im.test(content)) {
    return content.replace(/^set_max_iteration\s+\d+\s*$/im, `set_max_iteration ${iterations}`);
  }
  throw new Error("Authoritative parameter file has no set_max_iteration line to raise.");
}

function nextCommands(args: CliArgs): string[] {
  const parameterRoot = repoPowerShell(args.outputDir);
  const manifest = repoPowerShell(args.manifestPath);
  return [
    "npm run mtt:texas-solver-accuracy-resolve-batch -- --write --summary",
    `.\\Agents\\solver-input\\texas-solver\\mtt-safe-flops-v1\\run-console-selected.ps1 -ParameterRoot "${parameterRoot}" -Limit 999 -ListOnly`,
    `npm run mtt:texas-solver-coverage-status -- --manifest "${manifest}" --summary`,
    "npm run mtt:texas-solver-mechanical-acceptance -- --summary",
  ];
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function repoPowerShell(path: string): string {
  return `.\\${relative(process.cwd(), path).replaceAll("/", "\\")}`;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function render(report: ReturnType<typeof build>, args: CliArgs): string {
  const lines = [
    "TexasSolver accuracy re-solve batch",
    `valid: ${report.valid}`,
    `mode: ${args.write ? "WRITE" : "DRY_RUN"}`,
    `exploitability target: ${report.threshold}`,
    `raised iterations: ${report.iterations}`,
    `families: ${report.counts.families}`,
    `boards: ${report.counts.boards}`,
    `blockers: ${report.counts.blockers}`,
    `output dir: ${report.outputDir}`,
    `manifest: ${report.manifestPath}`,
  ];
  if (!args.summary) {
    for (const board of report.boards) {
      lines.push(`  ${board.familyId} ${board.boardId}: before=${board.exploitabilityBefore} <- ${board.sourcePath}`);
    }
  }
  for (const blocker of report.blockers) lines.push(`blocker: ${blocker}`);
  return lines.join("\n");
}
