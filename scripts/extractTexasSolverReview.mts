import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_FAMILY_ID = "MTT9_50BB_BTN_BB_SRP";
const DEFAULT_TEXAS_SOLVER_OUTPUT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const RANK_ORDER = "AKQJT98765432";

interface CliArgs {
  familyId: string;
  json: boolean;
  outputPath: string | null;
  rawDir: string;
  solverOutputDir: string;
  summary: boolean;
  write: boolean;
}

interface TexasSolverNode {
  actions?: unknown;
  node_type?: unknown;
  player?: unknown;
  strategy?: unknown;
}

interface TexasSolverStrategy {
  actions?: unknown;
  strategy?: unknown;
}

interface ReviewAction {
  raw: string;
  kind: "CHECK" | "CALL" | "FOLD" | "BET" | "RAISE" | "UNKNOWN";
  normalized: string;
  amount: number | null;
}

interface HandClassStrategy {
  comboCount: number;
  averageByAction: Record<string, number>;
  dominantAction: string;
  dominantFrequency: number;
}

interface ReviewFile {
  fileName: string;
  path: string;
  boardId: string;
  nodeType: string;
  player: number | null;
  actions: ReviewAction[];
  comboCount: number;
  invalidCombos: string[];
  handClassCount: number;
  handClasses: Record<string, HandClassStrategy>;
  blockers: string[];
}

interface ReviewReport {
  valid: boolean;
  status: "NEEDS_REVIEW";
  productionReady: false;
  familyId: string;
  rawDir: string;
  solverOutputDir: string;
  counts: {
    rawFiles: number;
    parsedFiles: number;
    blockedFiles: number;
    combos: number;
    handClasses: number;
    plannedWrites: number;
    writtenFiles: number;
  };
  files: ReviewFile[];
  plannedFiles: Array<{ path: string; written: boolean; purpose: string }>;
  blockers: string[];
  nextSteps: string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-review -- --family=MTT9_50BB_BTN_BB_SRP",
    "  npm run mtt:texas-solver-review -- --family=MTT9_50BB_BTN_BB_SRP --summary",
    "  npm run mtt:texas-solver-review -- --family=MTT9_50BB_BTN_BB_SRP --write",
    "  npm run mtt:texas-solver-review -- --raw-dir=<path> --solver-output-dir=<path>",
    "",
    "Extracts source-safe review summaries from raw TexasSolver JSON exports.",
    "It never creates production normalized.json files.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReviewReport(args);
  if (args.write && report.blockers.length === 0) writeReviewFiles(args, report);
  const finalReport = args.write && report.blockers.length === 0 ? buildReviewReport(args) : report;
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
    if (item.startsWith("--family=")) {
      familyId = requiredInlineValue(item, "--family");
      continue;
    }
    if (item === "--family") {
      familyId = nextArgValue(argv, index, "--family");
      index += 1;
      continue;
    }
    if (item.startsWith("--raw-dir=")) {
      rawDir = resolve(requiredInlineValue(item, "--raw-dir"));
      continue;
    }
    if (item === "--raw-dir") {
      rawDir = resolve(nextArgValue(argv, index, "--raw-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--solver-output-dir=")) {
      solverOutputDir = resolve(requiredInlineValue(item, "--solver-output-dir"));
      continue;
    }
    if (item === "--solver-output-dir") {
      solverOutputDir = resolve(nextArgValue(argv, index, "--solver-output-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(requiredInlineValue(item, "--output"));
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArgValue(argv, index, "--output"));
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  const resolvedSolverOutputDir = solverOutputDir ?? resolve(DEFAULT_TEXAS_SOLVER_OUTPUT_ROOT, familyId);
  return {
    familyId,
    json,
    outputPath,
    rawDir: rawDir ?? join(resolvedSolverOutputDir, "raw"),
    solverOutputDir: resolvedSolverOutputDir,
    summary,
    write,
  };
}

function requiredInlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function nextArgValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildReviewReport(args: CliArgs): ReviewReport {
  const files = readReviewFiles(args);
  const plannedFiles = plannedReviewFiles(args);
  const blockers = [
    ...(existsSync(args.rawDir) ? [] : [`Raw TexasSolver export directory is missing: ${args.rawDir}`]),
    ...(files.length === 0 ? [`No raw TexasSolver JSON exports found in: ${args.rawDir}`] : []),
    ...files.flatMap((file) => file.blockers.map((blocker) => `${file.fileName}: ${blocker}`)),
  ];
  const uniqueHandClasses = new Set(files.flatMap((file) => Object.keys(file.handClasses)));
  return {
    valid: blockers.length === 0,
    status: "NEEDS_REVIEW",
    productionReady: false,
    familyId: args.familyId,
    rawDir: args.rawDir,
    solverOutputDir: args.solverOutputDir,
    counts: {
      rawFiles: files.length,
      parsedFiles: files.filter((file) => file.blockers.length === 0).length,
      blockedFiles: files.filter((file) => file.blockers.length > 0).length,
      combos: files.reduce((sum, file) => sum + file.comboCount, 0),
      handClasses: uniqueHandClasses.size,
      plannedWrites: plannedFiles.length,
      writtenFiles: plannedFiles.filter((file) => file.written).length,
    },
    files,
    plannedFiles,
    blockers,
    nextSteps: [
      "Human-review the extracted root strategies and solver assumptions.",
      "Confirm tree sizing, player mapping, board coverage and exploitability evidence.",
      "Only after review, map approved strategy data into canonical normalized.json + permission.json.",
      "Run validate:range-import and build:range-module --dry-run before any production promotion.",
    ],
  };
}

function readReviewFiles(args: CliArgs): ReviewFile[] {
  if (!existsSync(args.rawDir)) return [];
  return readdirSync(args.rawDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((entry) => reviewFile(join(args.rawDir, entry.name), entry.name, args.familyId));
}

function reviewFile(path: string, fileName: string, familyId: string): ReviewFile {
  try {
    const root = JSON.parse(readFileSync(path, "utf8")) as TexasSolverNode;
    const blockers: string[] = [];
    if (root.node_type !== "action_node") blockers.push(`Root node_type must be action_node; got ${String(root.node_type)}.`);
    const rootActions = parseStringArray(root.actions);
    if (rootActions.length === 0) blockers.push("Root actions are missing or empty.");
    const parsedActions = rootActions.map(parseAction);
    const player = typeof root.player === "number" ? root.player : null;
    if (player === null) blockers.push("Root player index is missing.");
    const strategy = parseStrategy(root.strategy);
    if (strategy === null) {
      blockers.push("Root strategy is missing or malformed.");
      return emptyReviewFile(path, fileName, familyId, root, parsedActions, player, blockers);
    }
    if (strategy.actions.length !== rootActions.length) {
      blockers.push(`Strategy action count ${strategy.actions.length} does not match root action count ${rootActions.length}.`);
    }
    const extracted = extractHandClassStrategies(parsedActions, strategy.strategy, blockers);
    return {
      fileName,
      path,
      boardId: boardIdFromFileName(fileName, familyId),
      nodeType: typeof root.node_type === "string" ? root.node_type : "UNKNOWN",
      player,
      actions: parsedActions,
      comboCount: extracted.comboCount,
      invalidCombos: extracted.invalidCombos,
      handClassCount: Object.keys(extracted.handClasses).length,
      handClasses: extracted.handClasses,
      blockers,
    };
  } catch (error) {
    return {
      fileName,
      path,
      boardId: boardIdFromFileName(fileName, familyId),
      nodeType: "UNPARSEABLE",
      player: null,
      actions: [],
      comboCount: 0,
      invalidCombos: [],
      handClassCount: 0,
      handClasses: {},
      blockers: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function emptyReviewFile(
  path: string,
  fileName: string,
  familyId: string,
  root: TexasSolverNode,
  actions: ReviewAction[],
  player: number | null,
  blockers: string[],
): ReviewFile {
  return {
    fileName,
    path,
    boardId: boardIdFromFileName(fileName, familyId),
    nodeType: typeof root.node_type === "string" ? root.node_type : "UNKNOWN",
    player,
    actions,
    comboCount: 0,
    invalidCombos: [],
    handClassCount: 0,
    handClasses: {},
    blockers,
  };
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function parseStrategy(value: unknown): { actions: string[]; strategy: Record<string, number[]> } | null {
  if (value === null || typeof value !== "object") return null;
  const strategy = value as TexasSolverStrategy;
  const actions = parseStringArray(strategy.actions);
  if (actions.length === 0 || strategy.strategy === null || typeof strategy.strategy !== "object" || Array.isArray(strategy.strategy)) {
    return null;
  }
  const rawStrategy = strategy.strategy as Record<string, unknown>;
  const parsed: Record<string, number[]> = {};
  for (const [combo, frequencies] of Object.entries(rawStrategy)) {
    if (!Array.isArray(frequencies) || !frequencies.every((item) => typeof item === "number" && Number.isFinite(item))) {
      return null;
    }
    parsed[combo] = frequencies;
  }
  return { actions, strategy: parsed };
}

function parseAction(raw: string): ReviewAction {
  const [kind, amountText] = raw.trim().split(/\s+/, 2);
  const normalizedKind = kind === "CHECK" || kind === "CALL" || kind === "FOLD" || kind === "BET" || kind === "RAISE"
    ? kind
    : "UNKNOWN";
  const amount = amountText === undefined ? null : Number(amountText);
  const normalized = amount === null || !Number.isFinite(amount)
    ? normalizedKind
    : `${normalizedKind}_${formatAmount(amount)}`;
  return {
    raw,
    kind: normalizedKind,
    normalized,
    amount: amount === null || !Number.isFinite(amount) ? null : amount,
  };
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function extractHandClassStrategies(
  actions: ReviewAction[],
  strategy: Record<string, number[]>,
  blockers: string[],
): { comboCount: number; invalidCombos: string[]; handClasses: Record<string, HandClassStrategy> } {
  const grouped = new Map<string, { comboCount: number; totals: number[] }>();
  const invalidCombos: string[] = [];
  for (const [combo, frequencies] of Object.entries(strategy)) {
    const handClass = handClassFromCombo(combo);
    if (handClass === null) {
      invalidCombos.push(combo);
      continue;
    }
    if (frequencies.length !== actions.length) {
      blockers.push(`Combo ${combo} has ${frequencies.length} frequencies, expected ${actions.length}.`);
      continue;
    }
    const existing = grouped.get(handClass) ?? { comboCount: 0, totals: Array.from({ length: actions.length }, () => 0) };
    existing.comboCount += 1;
    frequencies.forEach((frequency, index) => {
      existing.totals[index] += frequency;
    });
    grouped.set(handClass, existing);
  }

  const handClasses: Record<string, HandClassStrategy> = {};
  for (const [handClass, aggregate] of [...grouped.entries()].sort((a, b) => compareHandClass(a[0], b[0]))) {
    const averages = aggregate.totals.map((total) => total / aggregate.comboCount);
    const dominantIndex = averages.reduce((best, value, index) => value > averages[best] ? index : best, 0);
    handClasses[handClass] = {
      comboCount: aggregate.comboCount,
      averageByAction: Object.fromEntries(actions.map((action, index) => [action.normalized, roundFrequency(averages[index])])),
      dominantAction: actions[dominantIndex]?.normalized ?? "UNKNOWN",
      dominantFrequency: roundFrequency(averages[dominantIndex] ?? 0),
    };
  }
  return {
    comboCount: Object.keys(strategy).length - invalidCombos.length,
    invalidCombos,
    handClasses,
  };
}

function handClassFromCombo(combo: string): string | null {
  if (!/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(combo)) return null;
  const firstRank = combo[0];
  const firstSuit = combo[1];
  const secondRank = combo[2];
  const secondSuit = combo[3];
  if (firstRank === secondRank) return `${firstRank}${secondRank}`;
  const [high, low] = [firstRank, secondRank].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
  return `${high}${low}${firstSuit === secondSuit ? "s" : "o"}`;
}

function compareHandClass(a: string, b: string): number {
  const aRank = RANK_ORDER.indexOf(a[0]);
  const bRank = RANK_ORDER.indexOf(b[0]);
  if (aRank !== bRank) return aRank - bRank;
  const aKicker = RANK_ORDER.indexOf(a[1]);
  const bKicker = RANK_ORDER.indexOf(b[1]);
  if (aKicker !== bKicker) return aKicker - bKicker;
  return a.localeCompare(b, "en");
}

function roundFrequency(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function boardIdFromFileName(fileName: string, familyId: string): string {
  return fileName
    .replace(/\.json$/i, "")
    .replace(/^pkrtrainer_/, "")
    .replace(`${familyId}_`, "");
}

function plannedReviewFiles(args: CliArgs): ReviewReport["plannedFiles"] {
  const path = join(args.solverOutputDir, "strategy-export.review.json");
  return [{
    path,
    written: existsSync(path),
    purpose: "source-safe TexasSolver root strategy review summary",
  }];
}

function writeReviewFiles(args: CliArgs, report: ReviewReport): void {
  mkdirSync(args.solverOutputDir, { recursive: true });
  writeFileSync(join(args.solverOutputDir, "strategy-export.review.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function renderReport(report: ReviewReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver review extraction",
    `valid: ${report.valid}`,
    `status: ${report.status}`,
    `productionReady: ${report.productionReady}`,
    `family: ${report.familyId}`,
    `raw files: ${report.counts.rawFiles}`,
    `parsed files: ${report.counts.parsedFiles}`,
    `blocked files: ${report.counts.blockedFiles}`,
    `combos: ${report.counts.combos}`,
    `hand classes: ${report.counts.handClasses}`,
    `planned writes: ${report.counts.plannedWrites}`,
    `written files: ${report.counts.writtenFiles}`,
  ];
  if (summaryOnly) return lines.join("\n");

  for (const file of report.files) {
    lines.push(`${file.blockers.length === 0 ? "OK" : "BLOCKED"} ${file.fileName}: board=${file.boardId}, player=${file.player ?? "?"}, actions=${file.actions.map((action) => action.normalized).join("/")}, handClasses=${file.handClassCount}`);
  }
  for (const file of report.plannedFiles) {
    lines.push(`${file.written ? "OK" : "PENDING"} ${file.purpose}: ${file.path}`);
  }
  for (const blocker of report.blockers) lines.push(`blocker: ${blocker}`);
  lines.push("next steps:");
  for (const step of report.nextSteps) lines.push(`  - ${step}`);
  return lines.join("\n");
}
