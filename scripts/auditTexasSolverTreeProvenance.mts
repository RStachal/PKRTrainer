import { existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  cachedTreeMarkerVerdict,
  type TreeMarkerCacheEntry,
} from "./lib/texasSolverTreeMarker.mts";

/**
 * Deciding an ambiguous board means reading it whole, so verdicts are cached on
 * size and mtime. A re-solved board changes both and is read again.
 */
const MARKER_CACHE_PATH = "artifacts/texas-solver-tree-provenance/marker-cache.json";
const markerCache = loadMarkerCache();

function loadMarkerCache(): Map<string, TreeMarkerCacheEntry> {
  try {
    const parsed = JSON.parse(readFileSync(MARKER_CACHE_PATH, "utf8")) as Record<string, TreeMarkerCacheEntry>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveMarkerCache(): void {
  try {
    mkdirSync(dirname(MARKER_CACHE_PATH), { recursive: true });
    writeFileSync(MARKER_CACHE_PATH, `${JSON.stringify(Object.fromEntries(markerCache), null, 1)}\n`, "utf8");
  } catch {
    // A cache that cannot be written costs time on the next run, nothing more.
  }
}

/**
 * Tree-profile provenance audit for solved TexasSolver boards.
 *
 * Every family was solved by two different parameter sets over time: an
 * authoritative full tree, and a reduced tree produced by the memory-safe
 * low-memory worker. Both write the same canonical raw checkpoint path, so a
 * family's `raw/` directory can end up holding a mix, and nothing in the raw
 * file records which set produced it.
 *
 * That matters because the content contract treats the reduced tree as
 * review-only: it may be audited and packaged for review but is not meant to be
 * normalized and promoted into runtime content. This audit recovers the missing
 * provenance by comparing each board's root bet sizes against what each
 * parameter set would have produced, and reports how much of the pilot content
 * rests on reduced-tree solves.
 *
 * It reads only the first bytes of each raw file and never writes solver data.
 */

const DEFAULT_OUTPUT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DEFAULT_PARAM_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";
const ROOT_PREFIX_BYTES = 4096;
const SIZE_TOLERANCE = 1;

type TreeProfile = "FULL_TREE" | "REDUCED_TREE" | "AMBIGUOUS" | "UNKNOWN";

interface ParamSetProfile {
  setName: string;
  reviewOnly: boolean;
  pot: number;
  /** Root bet sizes in chips this set would produce; the root actor is OOP. */
  expectedRootBets: number[];
}

interface BoardRow {
  boardId: string;
  rootBetSizes: number[];
  matchedSets: string[];
  profile: TreeProfile;
  /** True when the root test was ambiguous and the turn marker decided it. */
  resolvedByMarker: boolean;
}

interface FamilyRow {
  familyId: string;
  paramSets: Array<{ setName: string; reviewOnly: boolean; pot: number; expectedRootBets: number[] }>;
  boards: number;
  fullTree: number;
  reducedTree: number;
  ambiguous: number;
  unknown: number;
  boardRows: BoardRow[];
}

interface CliArgs {
  outputRoot: string;
  paramRoot: string;
  reportPath: string | null;
  json: boolean;
  summary: boolean;
  family: string | null;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  saveMarkerCache();
  if (args.reportPath !== null) {
    mkdirSync(dirname(args.reportPath), { recursive: true });
    writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report, args.summary));
  process.exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-tree-provenance -- --summary",
    "  npm run mtt:texas-solver-tree-provenance -- --family=MTT9_150BB_CO_BTN_3BP_HIGHSPR",
    "  npm run mtt:texas-solver-tree-provenance -- --output=artifacts/tree-provenance/report.json --json",
    "",
    "Classifies each solved board as a full-tree or reduced-tree solve by comparing",
    "its root bet sizes against the parameter sets that could have produced it.",
    "Read-only: it never writes or modifies solver data.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let outputRoot = resolve(DEFAULT_OUTPUT_ROOT);
  let paramRoot = resolve(DEFAULT_PARAM_ROOT);
  let reportPath: string | null = null;
  let json = false;
  let summary = false;
  let family: string | null = null;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item.startsWith("--output-root=")) { outputRoot = resolve(value(item, "--output-root")); continue; }
    if (item.startsWith("--param-root=")) { paramRoot = resolve(value(item, "--param-root")); continue; }
    if (item.startsWith("--output=")) { reportPath = resolve(value(item, "--output")); continue; }
    if (item.startsWith("--family=")) { family = value(item, "--family"); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { outputRoot, paramRoot, reportPath, json, summary, family };
}

function value(item: string, flag: string): string {
  const result = item.slice(`${flag}=`.length).trim();
  if (result.length === 0) throw new Error(`${flag} requires a value.`);
  return result;
}

function buildReport(args: CliArgs) {
  if (!existsSync(args.outputRoot)) throw new Error(`Solver output root is missing: ${args.outputRoot}`);
  const families = readdirSync(args.outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(args.outputRoot, entry.name, "raw")))
    .map((entry) => entry.name)
    .filter((name) => args.family === null || name === args.family)
    .sort((left, right) => left.localeCompare(right, "en"));

  const rows = families.map((familyId) => familyRow(familyId, args));
  const totals = rows.reduce((acc, row) => ({
    boards: acc.boards + row.boards,
    fullTree: acc.fullTree + row.fullTree,
    reducedTree: acc.reducedTree + row.reducedTree,
    ambiguous: acc.ambiguous + row.ambiguous,
    unknown: acc.unknown + row.unknown,
  }), { boards: 0, fullTree: 0, reducedTree: 0, ambiguous: 0, unknown: 0 });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    basis: "ROOT_BET_SIZES_THEN_TURN_MARKER_FOR_AMBIGUOUS",
    counts: {
      families: rows.length,
      ...totals,
      mixedFamilies: rows.filter((row) => row.fullTree > 0 && row.reducedTree > 0).length,
      resolvedByMarker: rows.reduce((sum, row) => sum + row.boardRows.filter((item) => item.resolvedByMarker).length, 0),
      fullyReducedFamilies: rows.filter((row) => row.boards > 0 && row.reducedTree === row.boards).length,
    },
    families: rows,
  };
}

function familyRow(familyId: string, args: CliArgs): FamilyRow {
  const paramSets = paramSetProfiles(args.paramRoot, familyId);
  const rawDir = join(args.outputRoot, familyId, "raw");
  const boardRows: BoardRow[] = [];

  for (const name of readdirSync(rawDir).filter((item) => item.endsWith(".json")).sort()) {
    const boardId = name.replace(new RegExp(`^pkrtrainer_${familyId}_`), "").replace(/\.json$/, "");
    const dumpPath = join(rawDir, name);
    const rootBetSizes = rootBetSizesOf(dumpPath);
    const matched = paramSets.filter((set) => setMatchesBoard(set, rootBetSizes));
    const rootProfile = classify(matched, rootBetSizes);
    // The root test cannot separate the trees, because they are identical at the
    // flop. When it says so, read the board's own turn structure instead of
    // leaving it unknown - an unresolved board is invisible to the mixing guard
    // and is never selected for re-solve, so ambiguity is not a safe resting
    // place.
    const profile = rootProfile === "AMBIGUOUS"
      ? (cachedTreeMarkerVerdict(dumpPath, markerCache) === "REDUCED" ? "REDUCED_TREE" : "FULL_TREE")
      : rootProfile;
    boardRows.push({
      boardId,
      rootBetSizes,
      matchedSets: matched.map((set) => set.setName),
      profile,
      resolvedByMarker: rootProfile === "AMBIGUOUS",
    });
  }

  return {
    familyId,
    paramSets: paramSets.map(({ setName, reviewOnly, pot, expectedRootBets }) => ({
      setName, reviewOnly, pot, expectedRootBets,
    })),
    boards: boardRows.length,
    fullTree: boardRows.filter((row) => row.profile === "FULL_TREE").length,
    reducedTree: boardRows.filter((row) => row.profile === "REDUCED_TREE").length,
    ambiguous: boardRows.filter((row) => row.profile === "AMBIGUOUS").length,
    unknown: boardRows.filter((row) => row.profile === "UNKNOWN").length,
    boardRows,
  };
}

/**
 * The root action set is the first object in the dump, so a small prefix read is
 * enough and a 25-90 MB file never has to be loaded.
 */
function rootBetSizesOf(path: string): number[] {
  const handle = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(ROOT_PREFIX_BYTES);
    const read = readSync(handle, buffer, 0, ROOT_PREFIX_BYTES, 0);
    const prefix = buffer.subarray(0, read).toString("utf8");
    const match = /"actions":\[([^\]]*)\]/.exec(prefix);
    if (match === null) return [];
    return [...match[1].matchAll(/"BET ([0-9]+(?:\.[0-9]+)?)"/g)]
      .map((item) => Math.round(Number(item[1])))
      .filter((item) => Number.isFinite(item))
      .sort((left, right) => left - right);
  } finally {
    closeSync(handle);
  }
}

/**
 * Every parameter set that could have solved this family, each with its own pot.
 * The sets genuinely differ: `safe_flops_v1` uses pot 57 where the review waves
 * use 50, so the same 50 percent bet lands on 29 chips instead of 25. Comparing
 * against a single set would misattribute those boards.
 */
function paramSetProfiles(paramRoot: string, familyId: string): ParamSetProfile[] {
  if (!existsSync(paramRoot)) return [];
  const pattern = new RegExp(`^\\d+_${familyId}_[AKQJT98765432]{3}(?:r|tt|mono)\\.txt$`);
  const profiles: ParamSetProfile[] = [];

  for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    // Repair batches copy another set's tree, so they carry no provenance.
    if (set.name.includes("accuracy_resolve") || set.name.includes("uniform_tree_resolve")) continue;
    const dir = join(paramRoot, set.name);
    const file = readdirSync(dir).find((name) => pattern.test(name));
    if (file === undefined) continue;

    const text = readFileSync(join(dir, file), "utf8");
    const potMatch = /^set_pot\s+([0-9]+)/m.exec(text);
    if (potMatch === null) continue;
    const pot = Number(potMatch[1]);

    // The root actor checks first, so only OOP flop bet sizes reach the root.
    const percents = new Set<number>();
    for (const line of text.split(/\r?\n/)) {
      const bet = /^set_bet_sizes\s+oop,flop,bet,(.+)$/.exec(line.trim());
      if (bet === null) continue;
      for (const part of bet[1].split(",")) {
        const parsed = Number(part.trim());
        if (Number.isFinite(parsed)) percents.add(parsed);
      }
    }
    if (percents.size === 0) continue;

    profiles.push({
      setName: set.name,
      reviewOnly: set.name.includes("low_memory"),
      pot,
      expectedRootBets: [...percents]
        .map((pct) => Math.round((pot * pct) / 100))
        .sort((left, right) => left - right),
    });
  }
  return profiles;
}

/**
 * A set matches when every non-all-in root bet it predicts is present. The root
 * action list also carries the all-in size, which is stack-derived rather than
 * pot-derived, so extra observed sizes never disqualify a set.
 */
function setMatchesBoard(set: ParamSetProfile, rootBetSizes: readonly number[]): boolean {
  if (rootBetSizes.length === 0) return false;
  return set.expectedRootBets.every((expected) => (
    rootBetSizes.some((actual) => Math.abs(actual - expected) <= SIZE_TOLERANCE)
  ));
}

function classify(matched: readonly ParamSetProfile[], rootBetSizes: readonly number[]): TreeProfile {
  if (rootBetSizes.length === 0 || matched.length === 0) return "UNKNOWN";
  const reviewOnly = matched.filter((set) => set.reviewOnly).length;
  if (reviewOnly === matched.length) return "REDUCED_TREE";
  if (reviewOnly === 0) return "FULL_TREE";
  return "AMBIGUOUS";
}

function render(report: ReturnType<typeof buildReport>, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver tree-profile provenance",
    "basis: ROOT_BET_SIZES_THEN_TURN_MARKER_FOR_AMBIGUOUS",
    `families: ${report.counts.families}`,
    `boards: ${report.counts.boards}`,
    `full tree: ${report.counts.fullTree}`,
    `reduced tree (review-only): ${report.counts.reducedTree}`,
    `ambiguous: ${report.counts.ambiguous}`,
    `unknown: ${report.counts.unknown}`,
    `families mixing both: ${report.counts.mixedFamilies}`,
    `ambiguous roots resolved by turn marker: ${report.counts.resolvedByMarker}`,
    `families fully reduced: ${report.counts.fullyReducedFamilies}`,
  ];
  if (summaryOnly) return lines.join("\n");

  for (const family of report.families) {
    lines.push(
      `${family.familyId}: boards=${family.boards} full=${family.fullTree} reduced=${family.reducedTree}` +
      ` ambiguous=${family.ambiguous} unknown=${family.unknown}`,
    );
  }
  return lines.join("\n");
}
