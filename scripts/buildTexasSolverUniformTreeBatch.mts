import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Weekend batch that makes every solved family use one authoritative full tree.
 *
 * Two different things make a board need re-solving, and both are selected here:
 * the reduced memory-safe tree, which is a solve of a deliberately restricted
 * game, and a full-tree solve that stopped on the iteration ceiling above the
 * accuracy target. Mixing either into an aggregated rule shifts the answer the
 * player is given, so the goal is one tree and one accuracy standard per family.
 *
 * Selection is recomputed on every run from the current evidence, which makes the
 * batch resumable: a board that has already been upgraded and converged simply
 * stops being selected. Parameters are copied verbatim from the authoritative
 * full-tree source; only thread count and the iteration ceiling are set.
 */

const DEFAULT_ACCURACY_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_PARAM_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";
const DEFAULT_OUTPUT_DIR =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_uniform_tree_weekend_v1";
const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/uniform-tree-weekend-v1-manifest.json";
const AUDIT_SCRIPT = "scripts/auditTexasSolverTreeProvenance.mts";
const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_ITERATIONS = 1200;
const DEFAULT_THREADS = 12;

interface Selected {
  familyId: string;
  boardId: string;
  reason: "REDUCED_TREE" | "OVER_TARGET" | "REDUCED_AND_OVER_TARGET";
  exploitability: number | null;
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
  threads: number;
  write: boolean;
  json: boolean;
  summary: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = build(args);
  if (args.write) writeBatch(args, report.selected);
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report, args));
  process.exitCode = report.blockers.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-uniform-tree-batch -- --summary",
    "  npm run mtt:texas-solver-uniform-tree-batch -- --write --summary",
    "  npm run mtt:texas-solver-uniform-tree-batch -- --write --threads=12 --iterations=1200",
    "",
    "Selects every board that still uses the reduced memory-safe tree or that",
    "stopped above the accuracy target, and stages an authoritative full-tree",
    "re-solve for it. Selection is recomputed each run, so the batch is resumable.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let accuracyRoot = resolve(DEFAULT_ACCURACY_ROOT);
  let paramRoot = resolve(DEFAULT_PARAM_ROOT);
  let outputDir = resolve(DEFAULT_OUTPUT_DIR);
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let threshold = DEFAULT_THRESHOLD;
  let iterations = DEFAULT_ITERATIONS;
  let threads = DEFAULT_THREADS;
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
    if (item.startsWith("--threads=")) { threads = Number(value(item, "--threads")); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error("--threshold must be positive.");
  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error("--iterations must be a positive integer.");
  if (!Number.isInteger(threads) || threads <= 0) throw new Error("--threads must be a positive integer.");
  return { accuracyRoot, paramRoot, outputDir, manifestPath, threshold, iterations, threads, write, json, summary };
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

/**
 * Rough solve cost of a family, used only to order the queue.
 *
 * Stack depth and SPR band are read from the family id because they are the two
 * measured cost drivers and they are known before anything is solved. Existing
 * raw checkpoints were considered and rejected: for a board on the reduced tree
 * the checkpoint describes the small tree, not the full one about to be solved,
 * so it understates the very boards this batch exists to replace.
 */
function familyCost(familyId: string): number {
  const depth = Number(/^MTT9_(\d+)BB_/.exec(familyId)?.[1] ?? 0);
  const band = /HIGHSPR$|MIDHIGH$/.test(familyId) ? 2 : /MIDSPR$/.test(familyId) ? 1 : 0;
  return depth * 10 + band;
}

function build(args: CliArgs) {
  const provenance = runProvenanceAudit(args);
  const exploitability = readExploitability(args.accuracyRoot);
  const blockers: string[] = [];
  const selected: Selected[] = [];

  for (const family of provenance.families) {
    for (const board of family.boardRows) {
      const reduced = board.profile === "REDUCED_TREE";
      const expl = exploitability.get(`${family.familyId}/${board.boardId}`) ?? null;
      const overTarget = expl !== null && expl > args.threshold;
      if (!reduced && !overTarget) continue;

      const sourcePath = authoritativeParam(args.paramRoot, family.familyId, board.boardId);
      if (sourcePath === null) {
        blockers.push(`No authoritative full-tree parameter for ${family.familyId} ${board.boardId}.`);
        continue;
      }
      selected.push({
        familyId: family.familyId,
        boardId: board.boardId,
        reason: reduced && overTarget ? "REDUCED_AND_OVER_TARGET" : reduced ? "REDUCED_TREE" : "OVER_TARGET",
        exploitability: expl,
        sourcePath,
        fileName: "",
      });
    }
  }

  // Solve the cheapest families first so an interrupted weekend still finishes
  // whole families rather than leaving many half-converted.
  //
  // Alphabetical order only looked like it did this, because it happens to keep
  // families contiguous. It actually front-loads the most expensive ones - 100BB,
  // 110BB and 150BB sort before 20BB - and solve cost climbs steeply with stack
  // depth and SPR: measured at 25 s per board around SPR 2 against 572 s around
  // SPR 13. A weekend spent in that order finishes almost nothing.
  const cost = new Map<string, number>();
  for (const item of selected) {
    if (!cost.has(item.familyId)) cost.set(item.familyId, familyCost(item.familyId));
  }
  selected.sort((left, right) => (
    cost.get(left.familyId)! - cost.get(right.familyId)! ||
    left.familyId.localeCompare(right.familyId, "en") ||
    left.boardId.localeCompare(right.boardId, "en")
  ));
  selected.forEach((item, index) => {
    item.fileName = `${String(index + 1).padStart(4, "0")}_${item.familyId}_${item.boardId}.txt`;
  });

  const byFamily = new Map<string, number>();
  for (const item of selected) byFamily.set(item.familyId, (byFamily.get(item.familyId) ?? 0) + 1);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    threshold: args.threshold,
    iterations: args.iterations,
    threads: args.threads,
    outputDir: repoRelative(args.outputDir),
    manifestPath: repoRelative(args.manifestPath),
    counts: {
      selected: selected.length,
      reducedTree: selected.filter((item) => item.reason !== "OVER_TARGET").length,
      overTarget: selected.filter((item) => item.reason !== "REDUCED_TREE").length,
      families: byFamily.size,
      blockers: blockers.length,
    },
    families: [...byFamily.entries()].sort((a, b) => b[1] - a[1]).map(([familyId, boards]) => ({ familyId, boards })),
    selected: selected.map(({ familyId, boardId, reason, exploitability: expl, sourcePath, fileName }) => ({
      familyId, boardId, reason, exploitability: expl, sourcePath: repoRelative(sourcePath), fileName,
    })),
    blockers,
  };
}

/** One source of truth for tree provenance: the audited CLI, not a copy of it. */
function runProvenanceAudit(args: CliArgs): {
  families: Array<{ familyId: string; boardRows: Array<{ boardId: string; profile: string }> }>;
} {
  const stdout = execFileSync(process.execPath, [
    "node_modules/vite-node/vite-node.mjs",
    AUDIT_SCRIPT,
    `--output-root=${args.accuracyRoot}`,
    `--param-root=${args.paramRoot}`,
    "--json",
  ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
}

function readExploitability(accuracyRoot: string): Map<string, number> {
  const result = new Map<string, number>();
  if (!existsSync(accuracyRoot)) return result;
  for (const entry of readdirSync(accuracyRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const path = join(accuracyRoot, entry.name, "accuracy-report.json");
    if (!existsSync(path)) continue;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>; } catch { continue; }
    const coverage = parsed.solverLogCoverage;
    if (typeof coverage !== "object" || coverage === null) continue;
    const evidence = (coverage as { evidence?: unknown }).evidence;
    if (!Array.isArray(evidence)) continue;
    for (const item of evidence) {
      if (typeof item !== "object" || item === null) continue;
      const raw = (item as { rawFileName?: unknown }).rawFileName;
      const val = (item as { value?: unknown }).value;
      if (typeof raw !== "string" || typeof val !== "number" || !Number.isFinite(val)) continue;
      const match = /_([AKQJT98765432]{3}(?:r|tt|mono))\.(?:json|log)$/i.exec(raw);
      if (match === null) continue;
      result.set(`${entry.name}/${match[1]}`, val);
    }
  }
  return result;
}

function authoritativeParam(paramRoot: string, familyId: string, boardId: string): string | null {
  if (!existsSync(paramRoot)) return null;
  const name = new RegExp(`^\\d+_${familyId}_${boardId}\\.txt$`);
  const preferred = "pkrtrainer_mtt_safe_flops_v1";
  let fallback: string | null = null;
  for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    if (set.name.includes("low_memory")) continue;
    if (set.name.includes("accuracy_resolve") || set.name.includes("uniform_tree")) continue;
    const dir = join(paramRoot, set.name);
    const match = readdirSync(dir).find((item) => name.test(item));
    if (match === undefined) continue;
    const full = join(dir, match);
    if (set.name === preferred) return full;
    fallback ??= full;
  }
  return fallback;
}

function writeBatch(args: CliArgs, selected: ReturnType<typeof build>["selected"]): void {
  mkdirSync(args.outputDir, { recursive: true });
  mkdirSync(dirname(args.manifestPath), { recursive: true });

  const keep = new Set(selected.map((item) => item.fileName));
  for (const existing of readdirSync(args.outputDir).filter((name) => name.endsWith(".txt"))) {
    if (!keep.has(existing)) unlinkSync(join(args.outputDir, existing));
  }

  for (const item of selected) {
    const source = readFileSync(resolve(item.sourcePath), "utf8");
    writeFileSync(join(args.outputDir, item.fileName), tune(source, args.threads, args.iterations), "utf8");
  }

  writeFileSync(args.manifestPath, `${JSON.stringify({
    packId: "pkrtrainer-mtt-texas-solver-uniform-tree-weekend-v1",
    generatedAt: new Date().toISOString(),
    parameterDir: repoRelative(args.outputDir),
    outputBase: DEFAULT_ACCURACY_ROOT,
    exploitabilityTarget: args.threshold,
    iterations: args.iterations,
    threads: args.threads,
    boards: selected.length,
    files: selected,
    notes: [
      "Every board here uses the reduced memory-safe tree or stopped above the accuracy target.",
      "Parameters are copied verbatim from the authoritative full-tree source; only threads and the iteration ceiling are set.",
      "Selection is recomputed on each run, so the batch is resumable and shrinks as boards converge.",
      "Back up the canonical raw checkpoints before running: the queue runner deletes them before re-solving.",
    ],
  }, null, 2)}\n`, "utf8");
}

function tune(content: string, threads: number, iterations: number): string {
  if (!/^set_thread_num\s+\d+\s*$/im.test(content)) throw new Error("Parameter file has no set_thread_num line.");
  if (!/^set_max_iteration\s+\d+\s*$/im.test(content)) throw new Error("Parameter file has no set_max_iteration line.");
  return content
    .replace(/^set_thread_num\s+\d+\s*$/im, `set_thread_num ${threads}`)
    .replace(/^set_max_iteration\s+\d+\s*$/im, `set_max_iteration ${iterations}`);
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll("\\", "/");
}

function render(report: ReturnType<typeof build>, args: CliArgs): string {
  const lines = [
    "TexasSolver uniform-tree weekend batch",
    `mode: ${args.write ? "WRITE" : "DRY_RUN"}`,
    `exploitability target: ${report.threshold}`,
    `iterations: ${report.iterations}   threads: ${report.threads}`,
    `selected boards: ${report.counts.selected}`,
    `  reduced tree: ${report.counts.reducedTree}`,
    `  over target: ${report.counts.overTarget}`,
    `families: ${report.counts.families}`,
    `blockers: ${report.counts.blockers}`,
    `output dir: ${report.outputDir}`,
    `manifest: ${report.manifestPath}`,
  ];
  if (!args.summary) {
    for (const family of report.families) lines.push(`  ${family.familyId}: ${family.boards}`);
  }
  for (const blocker of report.blockers) lines.push(`blocker: ${blocker}`);
  return lines.join("\n");
}
