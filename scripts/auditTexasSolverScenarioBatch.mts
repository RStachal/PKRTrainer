import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { classifyBoard, type BoardTexture } from "../src/core/postflopGenerator.ts";
import type { Card, Rank, Suit } from "../src/core/types.ts";

const DEFAULT_MANIFEST =
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/coverage-v2-manifest.json";
const DEFAULT_OUTPUT =
  "artifacts/texas-solver-scenario-audit/report.json";

type SprBand = "LOW" | "MID" | "HIGH";
type PotType = "SINGLE_RAISED" | "THREE_BET_POT";
type ActionNode = "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET" | "FLOP_FACING_BET";

interface CliArgs {
  json: boolean;
  manifestPath: string;
  outputPath: string | null;
  summary: boolean;
}

interface CoverageManifest {
  packId: string;
  generatedAt: string;
  parameterDir: string;
  outputBase: string;
  scenarios: Array<{
    familyId: string;
    boards: string[];
    purpose: string;
    coverageTags: string[];
  }>;
  files: Array<{
    fileName: string;
    path: string;
    familyId: string;
    boardId: string;
    written: boolean;
  }>;
}

interface ScenarioAuditRow {
  familyId: string;
  boardId: string;
  parameterPath: string;
  present: boolean;
  valid: boolean;
  expected: {
    potType: PotType | null;
    actionNode: ActionNode | null;
    positionPattern: string | null;
    sprBand: SprBand | null;
  };
  actual: {
    pot: number | null;
    effectiveStack: number | null;
    spr: number | null;
    sprBand: SprBand | null;
    board: string | null;
    boardTextures: readonly BoardTexture[];
    dumpResult: string | null;
    dumpRounds: number | null;
    hasIpRange: boolean;
    hasOopRange: boolean;
    hasBuildTree: boolean;
    hasStartSolve: boolean;
    hasUseIsomorphism: boolean;
    unsupportedConsoleDirectives: readonly string[];
    flopIpBetSizes: readonly number[];
    flopOopBetSizes: readonly number[];
    flopIpRaiseSizes: readonly number[];
    flopOopRaiseSizes: readonly number[];
  };
  errors: readonly string[];
  warnings: readonly string[];
}

interface ScenarioAuditReport {
  valid: boolean;
  manifestPath: string;
  packId: string;
  generatedAt: string;
  counts: {
    scenarios: number;
    files: number;
    validFiles: number;
    errors: number;
    warnings: number;
  };
  rows: readonly ScenarioAuditRow[];
  errors: readonly string[];
  warnings: readonly string[];
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
  let json = false;
  let manifestPath = resolve(DEFAULT_MANIFEST);
  let outputPath: string | null = null;
  let summary = false;

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
    if (item === "--manifest") {
      manifestPath = resolve(nextArg(argv, index, "--manifest"));
      index += 1;
      continue;
    }
    if (item.startsWith("--manifest=")) {
      manifestPath = resolve(inlineValue(item, "--manifest"));
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(nextArg(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, manifestPath, outputPath, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-scenario-audit",
    "  npm run mtt:texas-solver-scenario-audit -- --summary",
    "  npm run mtt:texas-solver-scenario-audit -- --json",
    "  npm run mtt:texas-solver-scenario-audit -- --output=artifacts/texas-solver-scenario-audit/report.json",
    "",
    "Audits generated TexasSolver scenario parameter files for pot, SPR band, board, ranges, action tree and dump output consistency.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildReport(args: CliArgs): ScenarioAuditReport {
  if (!existsSync(args.manifestPath)) throw new Error(`Missing scenario manifest: ${args.manifestPath}`);
  const manifest = JSON.parse(readFileSync(args.manifestPath, "utf8")) as CoverageManifest;
  const scenarioByFamily = new Map(manifest.scenarios.map((scenario) => [scenario.familyId, scenario]));
  const rows = manifest.files.map((file) => {
    const scenario = scenarioByFamily.get(file.familyId);
    return auditFile(file, scenario?.coverageTags ?? []);
  });
  const errors = rows.flatMap((row) => row.errors.map((error) => `${row.familyId}/${row.boardId}: ${error}`));
  const warnings = rows.flatMap((row) => row.warnings.map((warning) => `${row.familyId}/${row.boardId}: ${warning}`));

  return {
    valid: errors.length === 0 && rows.length > 0,
    manifestPath: args.manifestPath,
    packId: manifest.packId,
    generatedAt: manifest.generatedAt,
    counts: {
      scenarios: manifest.scenarios.length,
      files: rows.length,
      validFiles: rows.filter((row) => row.valid).length,
      errors: errors.length,
      warnings: warnings.length,
    },
    rows,
    errors,
    warnings,
  };
}

function auditFile(
  file: CoverageManifest["files"][number],
  coverageTags: readonly string[],
): ScenarioAuditRow {
  const parameterPath = resolve(file.path);
  const expected = expectedFromTags(coverageTags);
  if (!existsSync(parameterPath)) {
    return emptyRow(file, parameterPath, expected, [`Missing parameter file: ${parameterPath}`]);
  }

  const text = readFileSync(parameterPath, "utf8");
  const actual = parseParameterFile(text);
  const errors = [
    ...(actual.pot === null ? ["Missing set_pot."] : []),
    ...(actual.effectiveStack === null ? ["Missing set_effective_stack."] : []),
    ...(actual.board === null ? ["Missing set_board."] : []),
    ...(actual.hasIpRange ? [] : ["Missing set_range_ip."]),
    ...(actual.hasOopRange ? [] : ["Missing set_range_oop."]),
    ...(actual.hasBuildTree ? [] : ["Missing build_tree."]),
    ...(actual.hasStartSolve ? [] : ["Missing start_solve."]),
    ...(actual.dumpResult === null ? ["Missing dump_result."] : []),
    ...(actual.dumpRounds === null || actual.dumpRounds < 2 ? ["set_dump_rounds must be at least 2 for postflop review export."] : []),
    ...(actual.sprBand !== null && expected.sprBand !== null && actual.sprBand !== expected.sprBand
      ? [`SPR band ${actual.sprBand} does not match expected ${expected.sprBand}.`]
      : []),
    ...(actual.dumpResult !== null && !actual.dumpResult.includes(`${file.familyId}_${file.boardId}`)
      ? [`dump_result ${actual.dumpResult} does not include family/board ${file.familyId}_${file.boardId}.`]
      : []),
    ...actionTreeErrors(expected, actual),
  ];
  const warnings = [
    "TexasSolver console parameters do not declare game mode explicitly; audit infers Texas Hold'em from two-range holdem syntax and 52-card board ranks.",
    ...(actual.hasUseIsomorphism ? [] : ["set_use_isomorphism 1 is recommended for board coverage batches."]),
    ...actual.unsupportedConsoleDirectives.map((directive) => (
      `${directive} is not recognized by the installed TexasSolver v0.2.0 console and will be ignored.`
    )),
  ];

  return {
    familyId: file.familyId,
    boardId: file.boardId,
    parameterPath,
    present: true,
    valid: errors.length === 0,
    expected,
    actual,
    errors,
    warnings,
  };
}

function emptyRow(
  file: CoverageManifest["files"][number],
  parameterPath: string,
  expected: ScenarioAuditRow["expected"],
  errors: readonly string[],
): ScenarioAuditRow {
  return {
    familyId: file.familyId,
    boardId: file.boardId,
    parameterPath,
    present: false,
    valid: false,
    expected,
    actual: {
      pot: null,
      effectiveStack: null,
      spr: null,
      sprBand: null,
      board: null,
      boardTextures: [],
      dumpResult: null,
      dumpRounds: null,
      hasIpRange: false,
      hasOopRange: false,
      hasBuildTree: false,
      hasStartSolve: false,
      hasUseIsomorphism: false,
      unsupportedConsoleDirectives: [],
      flopIpBetSizes: [],
      flopOopBetSizes: [],
      flopIpRaiseSizes: [],
      flopOopRaiseSizes: [],
    },
    errors,
    warnings: [],
  };
}

function expectedFromTags(tags: readonly string[]): ScenarioAuditRow["expected"] {
  const potType: PotType | null = tags.includes("THREE_BET_POT") || tags.includes("THREE_BET_POT_CBET")
    ? "THREE_BET_POT"
    : tags.includes("SINGLE_RAISED") || tags.includes("SINGLE_RAISED_POT_CBET")
      ? "SINGLE_RAISED"
      : null;
  const actionNode: ActionNode | null = tags.includes("FLOP_FACING_BET") || tags.includes("FACING_BET")
    ? "FLOP_FACING_BET"
    : tags.includes("THREE_BET_POT_CBET")
      ? "THREE_BET_POT_CBET"
      : tags.includes("SINGLE_RAISED_POT_CBET")
        ? "SINGLE_RAISED_POT_CBET"
        : null;
  const positionPattern = tags.find((tag) => tag.startsWith("SRP_") || tag.startsWith("3BP_")) ?? null;
  const sprBand: SprBand | null = tags.includes("LOW_SPR")
    ? "LOW"
    : tags.includes("MID_SPR")
      ? "MID"
      : tags.includes("HIGH_SPR")
        ? "HIGH"
        : null;
  return { potType, actionNode, positionPattern, sprBand };
}

function parseParameterFile(text: string): ScenarioAuditRow["actual"] {
  const pot = numberLine(text, "set_pot");
  const effectiveStack = numberLine(text, "set_effective_stack");
  const spr = pot !== null && effectiveStack !== null && pot > 0
    ? Math.round((effectiveStack / pot) * 100) / 100
    : null;
  const board = stringLine(text, "set_board");
  const boardTextures = board === null ? [] : classifyBoard(parseBoard(board));
  return {
    pot,
    effectiveStack,
    spr,
    sprBand: spr === null ? null : sprBandFor(spr),
    board,
    boardTextures,
    dumpResult: stringLine(text, "dump_result"),
    dumpRounds: numberLine(text, "set_dump_rounds"),
    hasIpRange: /^set_range_ip\s+\S+/m.test(text),
    hasOopRange: /^set_range_oop\s+\S+/m.test(text),
    hasBuildTree: /^build_tree\s*$/m.test(text),
    hasStartSolve: /^start_solve\s*$/m.test(text),
    hasUseIsomorphism: /^set_use_isomorphism\s+1\s*$/m.test(text),
    unsupportedConsoleDirectives: unsupportedConsoleDirectives(text),
    flopIpBetSizes: betSizes(text, "ip", "bet"),
    flopOopBetSizes: betSizes(text, "oop", "bet"),
    flopIpRaiseSizes: betSizes(text, "ip", "raise"),
    flopOopRaiseSizes: betSizes(text, "oop", "raise"),
  };
}

function unsupportedConsoleDirectives(text: string): string[] {
  // Confirmed against the bundled v0.2.0 command-line sample and local solver logs.
  return /^set_raise_limit\b/m.test(text) ? ["set_raise_limit"] : [];
}

function numberLine(text: string, command: string): number | null {
  const value = stringLine(text, command);
  if (value === null) return null;
  const parsed = Number(value.split(/\s+/)[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringLine(text: string, command: string): string | null {
  const match = new RegExp(`^${command}\\s+(.+)$`, "m").exec(text);
  return match?.[1]?.trim() ?? null;
}

function betSizes(text: string, player: "ip" | "oop", action: "bet" | "raise"): number[] {
  const match = new RegExp(`^set_bet_sizes\\s+${player},flop,${action},(.+)$`, "m").exec(text);
  if (match === null) return [];
  return match[1]
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function parseBoard(value: string): [Card, Card, Card] {
  const cards = value.split(",").map((item) => item.trim()).filter(Boolean).map(parseCard);
  if (cards.length !== 3) throw new Error(`TexasSolver flop board must contain 3 cards: ${value}`);
  return cards as [Card, Card, Card];
}

function parseCard(value: string): Card {
  const match = /^([AKQJT98765432])([shdc])$/i.exec(value);
  if (match === null) throw new Error(`Invalid TexasSolver card: ${value}`);
  return { rank: match[1].toUpperCase() as Rank, suit: match[2].toLowerCase() as Suit };
}

function sprBandFor(spr: number): SprBand {
  if (spr < 3) return "LOW";
  if (spr < 8) return "MID";
  return "HIGH";
}

function actionTreeErrors(
  expected: ScenarioAuditRow["expected"],
  actual: ScenarioAuditRow["actual"],
): string[] {
  const errors: string[] = [];
  if (expected.actionNode === "SINGLE_RAISED_POT_CBET") {
    if (actual.flopIpBetSizes.length === 0) errors.push("SRP c-bet solve needs IP flop bet sizes.");
    if (actual.flopOopBetSizes.length === 0) errors.push("SRP tree needs OOP flop bet sizes for checked-through/donk branches.");
  }
  if (expected.actionNode === "THREE_BET_POT_CBET") {
    if (actual.flopIpBetSizes.length === 0) errors.push("3BP c-bet solve needs IP flop bet sizes.");
    if (actual.flopIpRaiseSizes.length === 0 || actual.flopOopRaiseSizes.length === 0) {
      errors.push("3BP tree needs flop raise sizes for both players.");
    }
  }
  if (expected.actionNode === "FLOP_FACING_BET") {
    if (actual.flopIpBetSizes.length === 0) errors.push("Facing-bet solve needs IP flop bet sizes.");
    if (actual.flopOopRaiseSizes.length === 0) errors.push("Facing-bet solve needs OOP flop raise sizes.");
  }
  return errors;
}

function renderReport(report: ScenarioAuditReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver scenario audit",
    `valid: ${report.valid}`,
    `scenarios: ${report.counts.scenarios}`,
    `files: ${report.counts.files}`,
    `valid files: ${report.counts.validFiles}`,
    `errors: ${report.counts.errors}`,
    `warnings: ${report.counts.warnings}`,
  ];
  if (!summaryOnly) {
    for (const row of report.rows) {
      lines.push(`${row.valid ? "OK" : "FAIL"} ${row.familyId}/${row.boardId}: SPR ${row.actual.spr ?? "?"} ${row.actual.sprBand ?? "?"}, textures ${row.actual.boardTextures.join(",") || "none"}`);
      for (const error of row.errors) lines.push(`  error: ${error}`);
    }
    if (report.warnings.length > 0) {
      lines.push("warnings:");
      for (const warning of report.warnings.slice(0, 12)) lines.push(`- ${warning}`);
      if (report.warnings.length > 12) lines.push(`- ... ${report.warnings.length - 12} more`);
    }
  }
  return lines.join("\n");
}
