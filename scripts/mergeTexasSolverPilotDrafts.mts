import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
  type FlopProductionStrategyRule,
} from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  buildMttPostflopPilotGateReport,
  type MttPostflopPilotScope,
} from "../src/data/ranges/mttPostflopPilotGate.ts";
import type {
  ProductionPermissionEvidence,
  ProductionPermissionManifest,
} from "../src/data/ranges/productionPermissionManifest.ts";

const CREATED_AT = "2026-07-02";
const DEFAULT_SCOPE = "BTN_vs_BB_SRP_FLOP_CBET" satisfies MttPostflopPilotScope;

interface MergeProfile {
  scope: MttPostflopPilotScope;
  label: string;
  defaultInputDirs: readonly string[];
  defaultOutputDir: string;
  packVersion: string;
  permissionVersion: string;
  assumptions: readonly string[];
}

const MERGE_PROFILES: Record<MttPostflopPilotScope, MergeProfile> = {
  BTN_vs_BB_SRP_FLOP_CBET: {
    scope: "BTN_vs_BB_SRP_FLOP_CBET",
    label: "BTN vs BB SRP flop c-bet",
    defaultInputDirs: [
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_20BB_BTN_BB_SRP_LOWSPR-CHECK",
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK",
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_80BB_BTN_BB_SRP_HIGHSPR-CHECK",
    ],
    defaultOutputDir:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_CBET_PILOT-CHECK",
    packVersion: "btn-bb-srp-flop-cbet-pilot-merged-draft-v1",
    permissionVersion: "btn-bb-srp-flop-cbet-pilot-permission-merged-draft-v1",
    assumptions: [
      "Merged LOW/MID/HIGH SPR candidates are still scoped to BTN vs BB SRP flop c-bet training only.",
      "This merged draft must stay behind the pilot gate until full postflop production coverage is imported.",
    ],
  },
  UTG_vs_BB_SRP_FLOP_CBET: {
    scope: "UTG_vs_BB_SRP_FLOP_CBET",
    label: "UTG vs BB SRP flop c-bet",
    defaultInputDirs: [
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_40BB_UTG_BB_SRP-CHECK",
    ],
    defaultOutputDir:
      "artifacts/texas-solver-review-integration/normalized-drafts/UTG_BB_SRP_FLOP_CBET_PILOT-CHECK",
    packVersion: "utg-bb-srp-flop-cbet-pilot-merged-draft-v1",
    permissionVersion: "utg-bb-srp-flop-cbet-pilot-permission-merged-draft-v1",
    assumptions: [
      "Merged candidate is scoped to UTG vs BB SRP flop c-bet training only.",
      "This merged draft must stay behind the pilot gate until full postflop production coverage is imported.",
    ],
  },
  BTN_vs_CO_3BP_FLOP_CBET: {
    scope: "BTN_vs_CO_3BP_FLOP_CBET",
    label: "BTN vs CO 3bet-pot flop c-bet",
    defaultInputDirs: [
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_35BB_CO_BTN_3BP_REPAIR-CHECK",
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_80BB_CO_BTN_3BP_MIDSPR-CHECK",
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_150BB_CO_BTN_3BP_HIGHSPR-CHECK",
    ],
    defaultOutputDir:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_CBET_PILOT-CHECK",
    packVersion: "btn-co-3bp-flop-cbet-pilot-merged-draft-v1",
    permissionVersion: "btn-co-3bp-flop-cbet-pilot-permission-merged-draft-v1",
    assumptions: [
      "Merged LOW/MID/HIGH SPR candidates are still scoped to BTN vs CO 3bet-pot flop c-bet training only.",
      "This merged draft must stay behind the pilot gate until full postflop production coverage is imported.",
    ],
  },
};

interface CliArgs {
  inputDirs: string[];
  outputDir: string;
  scope: MttPostflopPilotScope;
  usedDefaultInputs: boolean;
  write: boolean;
  summary: boolean;
  json: boolean;
}

interface DraftInput {
  inputDir: string;
  normalizedPath: string;
  permissionPath: string;
  pack: FlopProductionStrategyPack;
  permission: ProductionPermissionManifest;
}

interface MergeReport {
  valid: boolean;
  written: boolean;
  outputDir: string;
  normalizedPath: string;
  permissionPath: string;
  reportPath: string;
  inputs: readonly string[];
  packId: string;
  version: string;
  pilotScope: MttPostflopPilotScope;
  provenanceFingerprint: string;
  rules: number;
  rangeBuckets: number;
  sprBands: readonly string[];
  boardTextures: readonly string[];
  pilotGate: ReturnType<typeof buildMttPostflopPilotGateReport>;
  productionReady: boolean;
  missingProductionCoverage: {
    potTypes: readonly string[];
    positionPatterns: readonly string[];
    boardTextures: readonly string[];
    sprBands: readonly string[];
    actionNodes: readonly string[];
    rangeLanes: readonly string[];
  };
  errors: readonly string[];
  warnings: readonly string[];
  skippedDefaultInputs: readonly string[];
  plannedFiles: readonly Array<{ path: string; written: boolean }>;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = mergeDrafts(args);
  console.log(args.json ? JSON.stringify(result.report, null, 2) : renderReport(result.report, args.summary));
  process.exitCode = result.report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const inputDirs: string[] = [];
  let outputDir: string | null = null;
  let scope = DEFAULT_SCOPE;
  let write = false;
  let summary = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--scope") {
      scope = parseScope(nextArg(argv, index, "--scope"));
      index += 1;
      continue;
    }
    if (item.startsWith("--scope=")) {
      scope = parseScope(requiredInlineValue(item, "--scope"));
      continue;
    }
    if (item === "--input-dir") {
      inputDirs.push(resolve(nextArg(argv, index, "--input-dir")));
      index += 1;
      continue;
    }
    if (item.startsWith("--input-dir=")) {
      inputDirs.push(resolve(requiredInlineValue(item, "--input-dir")));
      continue;
    }
    if (item === "--output-dir") {
      outputDir = resolve(nextArg(argv, index, "--output-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output-dir=")) {
      outputDir = resolve(requiredInlineValue(item, "--output-dir"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  const profile = MERGE_PROFILES[scope];
  const usedDefaultInputs = inputDirs.length === 0;
  return {
    inputDirs: usedDefaultInputs ? profile.defaultInputDirs.map((dir) => resolve(dir)) : inputDirs,
    outputDir: outputDir ?? resolve(profile.defaultOutputDir),
    scope,
    usedDefaultInputs,
    write,
    summary,
    json,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-merge-pilot-drafts",
    "  npm run mtt:texas-solver-merge-pilot-drafts -- --write --summary",
    "  npm run mtt:texas-solver-merge-pilot-drafts -- --scope=BTN_vs_CO_3BP_FLOP_CBET --write --summary",
    "  npm run mtt:texas-solver-merge-pilot-drafts -- --input-dir artifacts/.../LOWSPR --input-dir artifacts/.../MIDSPR --output-dir artifacts/.../PILOT --write",
    "",
    `Supported scopes: ${Object.keys(MERGE_PROFILES).join(", ")}`,
    "Merges reviewed TexasSolver normalized draft candidates into one narrow MTT FLOP c-bet pilot pack.",
    "The merged output remains an artifacts/ candidate and is still intentionally not full FLOP production coverage.",
  ].join("\n");
}

function parseScope(value: string): MttPostflopPilotScope {
  if (value in MERGE_PROFILES) return value as MttPostflopPilotScope;
  throw new Error(`Unsupported scope: ${value}\n\n${usage()}`);
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function requiredInlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function mergeDrafts(args: CliArgs): { report: MergeReport; pack: FlopProductionStrategyPack; permission: ProductionPermissionManifest } {
  const profile = MERGE_PROFILES[args.scope];
  const skippedDefaultInputs = args.usedDefaultInputs
    ? args.inputDirs.filter((inputDir) => !draftFilesExist(inputDir))
    : [];
  const candidateInputDirs = args.usedDefaultInputs
    ? args.inputDirs.filter((inputDir) => draftFilesExist(inputDir))
    : args.inputDirs;
  const inputs = candidateInputDirs.map(readDraftInput);
  const inputErrors = inputs.flatMap((input) => inputErrorsFor(input));
  const compatibilityErrors = compatibleInputErrors(inputs);
  const errors = [...inputErrors, ...compatibilityErrors];
  const firstPack = inputs[0]?.pack;
  const firstPermission = inputs[0]?.permission;
  if (firstPack === undefined || firstPermission === undefined) {
    throw new Error("At least one input draft is required.");
  }

  const pack = buildMergedPack(inputs, firstPack, profile);
  const permission = buildMergedPermission(inputs, firstPermission, pack.id, profile);
  const pilotGate = buildMttPostflopPilotGateReport(pack, permission, args.scope);
  const coverage = buildFlopProductionCoverageReport(pack);
  const normalizedPath = resolve(args.outputDir, "normalized.candidate.json");
  const permissionPath = resolve(args.outputDir, "permission.candidate.json");
  const reportPath = resolve(args.outputDir, "merge-report.json");
  const provenanceFingerprint = fingerprint({
    inputs: inputs.map((input) => ({
      inputDir: input.inputDir,
      normalizedPath: input.normalizedPath,
      permissionPath: input.permissionPath,
    })),
    pack,
    permission,
  });
  const report: MergeReport = {
    valid: errors.length === 0 && pilotGate.valid,
    written: args.write,
    outputDir: args.outputDir,
    normalizedPath,
    permissionPath,
    reportPath,
    inputs: inputs.map((input) => input.inputDir),
    packId: pack.id,
    version: pack.version,
    pilotScope: args.scope,
    provenanceFingerprint,
    rules: pack.rules.length,
    rangeBuckets: pack.rules.reduce((count, rule) => count + rule.rangeBuckets.length, 0),
    sprBands: coverage.sprBands,
    boardTextures: coverage.boardTextures,
    pilotGate,
    productionReady: coverage.productionReady,
    missingProductionCoverage: {
      potTypes: coverage.missingPotTypes,
      positionPatterns: coverage.missingPositionPatterns,
      boardTextures: coverage.missingBoardTextures,
      sprBands: coverage.missingSprBands,
      actionNodes: coverage.missingActionNodes,
      rangeLanes: coverage.missingRangeLanes,
    },
    errors: [...errors, ...pilotGate.errors],
    warnings: [
      `Merged ${profile.label} pilot pack is a scoped training candidate, not a full FLOP production pack.`,
      "Promotion still requires poker review of every included solver family and node.",
      ...skippedDefaultInputs.map((inputDir) => `Default input skipped because candidate files are not available yet: ${inputDir}`),
      ...pilotGate.warnings,
    ],
    skippedDefaultInputs,
    plannedFiles: [
      { path: normalizedPath, written: args.write },
      { path: permissionPath, written: args.write },
      { path: reportPath, written: args.write },
    ],
  };

  if (args.write) {
    mkdirSync(args.outputDir, { recursive: true });
    writeJson(normalizedPath, pack);
    writeJson(permissionPath, permission);
    writeJson(reportPath, report);
  }

  return { report, pack, permission };
}

function draftFilesExist(inputDir: string): boolean {
  return existsSync(resolve(inputDir, "normalized.candidate.json")) &&
    existsSync(resolve(inputDir, "permission.candidate.json"));
}

function readDraftInput(inputDir: string): DraftInput {
  const normalizedPath = resolve(inputDir, "normalized.candidate.json");
  const permissionPath = resolve(inputDir, "permission.candidate.json");
  const pack = existsSync(normalizedPath)
    ? readJson<FlopProductionStrategyPack>(normalizedPath)
    : missingPack(inputDir);
  const permission = existsSync(permissionPath)
    ? readJson<ProductionPermissionManifest>(permissionPath)
    : missingPermission(inputDir);
  return { inputDir, normalizedPath, permissionPath, pack, permission };
}

function inputErrorsFor(input: DraftInput): string[] {
  return [
    ...(existsSync(input.normalizedPath) ? [] : [`Missing normalized candidate: ${input.normalizedPath}`]),
    ...(existsSync(input.permissionPath) ? [] : [`Missing permission candidate: ${input.permissionPath}`]),
  ];
}

function compatibleInputErrors(inputs: readonly DraftInput[]): string[] {
  const errors: string[] = [];
  if (inputs.length < 2) errors.push("Merge needs at least two input drafts to be useful.");
  const packId = inputs[0]?.pack.id;
  const dimensions = JSON.stringify(inputs[0]?.pack.dimensions ?? {});
  const permissionPackId = inputs[0]?.permission.packId;
  for (const input of inputs) {
    if (input.pack.id !== packId) errors.push(`${input.inputDir}: pack id ${input.pack.id} does not match ${packId}.`);
    if (JSON.stringify(input.pack.dimensions) !== dimensions) {
      errors.push(`${input.inputDir}: dimensions differ from the first input.`);
    }
    if (input.permission.packId !== permissionPackId) {
      errors.push(`${input.inputDir}: permission pack id ${input.permission.packId} does not match ${permissionPackId}.`);
    }
    if (input.permission.licenseKind !== input.pack.licenseKind) {
      errors.push(`${input.inputDir}: permission licenseKind does not match normalized candidate.`);
    }
  }
  return errors;
}

function buildMergedPack(
  inputs: readonly DraftInput[],
  firstPack: FlopProductionStrategyPack,
  profile: MergeProfile,
): FlopProductionStrategyPack {
  const rules = normalizeAdjacentSprRules(uniqueRules(inputs.flatMap((input) => [...input.pack.rules])));
  return {
    ...firstPack,
    version: profile.packVersion,
    createdAt: CREATED_AT,
    verifiedAt: CREATED_AT,
    sourceEvidence: uniqueBy(
      inputs.flatMap((input) => [...input.pack.sourceEvidence]),
      (item) => `${item.url}|${item.methodology}`,
    ),
    assumptions: uniqueStrings([
      ...inputs.flatMap((input) => [...input.pack.assumptions]),
      ...profile.assumptions,
    ]),
    rules,
  };
}

function buildMergedPermission(
  inputs: readonly DraftInput[],
  firstPermission: ProductionPermissionManifest,
  packId: string,
  profile: MergeProfile,
): ProductionPermissionManifest {
  const evidence = uniqueBy(
    inputs.flatMap((input) => [...input.permission.evidence]),
    (item) => item.referenceId,
  );
  return {
    ...firstPermission,
    packId,
    version: profile.permissionVersion,
    reviewedAt: CREATED_AT,
    sourceMaterialLocation: inputs.map((input) => input.normalizedPath).join("; "),
    evidence,
    notes: uniqueStrings([
      ...inputs.flatMap((input) => [...input.permission.notes]),
      `Merged permission manifest for a scoped ${profile.label} TexasSolver pilot candidate.`,
      "Do not promote beyond pilot scope until poker review and full production coverage pass.",
    ]),
  };
}

function uniqueRules(rules: readonly FlopProductionStrategyRule[]): FlopProductionStrategyRule[] {
  const seen = new Map<string, FlopProductionStrategyRule>();
  for (const rule of rules) {
    const existing = seen.get(rule.id);
    if (existing === undefined) {
      seen.set(rule.id, rule);
      continue;
    }
    seen.set(rule.id, {
      ...rule,
      id: `${rule.id}-${seen.size + 1}`,
    });
  }
  return [...seen.values()].sort((left, right) => left.sprMin - right.sprMin || left.id.localeCompare(right.id));
}

function normalizeAdjacentSprRules(rules: readonly FlopProductionStrategyRule[]): FlopProductionStrategyRule[] {
  return rules.map((rule, index) => {
    const next = rules[index + 1];
    if (
      next !== undefined &&
      rule.actionNode === next.actionNode &&
      rule.potType === next.potType &&
      rule.positionPattern === next.positionPattern &&
      rangesTouch(rule.sprMin, rule.sprMax, next.sprMin, next.sprMax)
    ) {
      return {
        ...rule,
        sprMax: roundSpr(next.sprMin - 0.01),
        explanation: `${rule.explanation} Adjacent SPR window normalized by merge tooling to avoid selector overlap at ${next.sprMin}.`,
      };
    }
    return rule;
  });
}

function rangesTouch(
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
): boolean {
  return firstMin < secondMin && secondMin === firstMax && secondMax > secondMin;
}

function roundSpr(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function uniqueStrings(items: readonly string[]): string[] {
  return uniqueBy(items.filter((item) => item.trim().length > 0), (item) => item);
}

function missingPack(inputDir: string): FlopProductionStrategyPack {
  return {
    id: "",
    version: "",
    createdAt: "",
    verifiedAt: "",
    confidence: "LOW",
    licenseKind: "UNKNOWN",
    licenseNote: "",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: [],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: [],
    },
    sourceEvidence: [],
    assumptions: [`Missing draft in ${inputDir}`],
    rules: [],
  };
}

function missingPermission(inputDir: string): ProductionPermissionManifest {
  return {
    packId: "",
    version: "",
    reviewedAt: "",
    reviewer: "",
    rightsOwner: "",
    licenseKind: "OWNED_SOLVER_EXPORT",
    allowedRedistributionScope: "NO_REDISTRIBUTION",
    sourceMaterialLocation: inputDir,
    evidence: [] satisfies ProductionPermissionEvidence[],
    notes: [`Missing permission in ${inputDir}`],
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function renderReport(report: MergeReport, summaryOnly: boolean): string {
  const lines = [
    "TexasSolver merged postflop pilot draft",
    `valid: ${report.valid}`,
    `written: ${report.written}`,
    `packId: ${report.packId}`,
    `version: ${report.version}`,
    `pilotScope: ${report.pilotScope}`,
    `provenance: ${report.provenanceFingerprint}`,
    `rules: ${report.rules}`,
    `range buckets: ${report.rangeBuckets}`,
    `SPR bands: ${report.sprBands.join(",") || "none"}`,
    `board textures: ${report.boardTextures.join(",") || "none"}`,
    `pilotGate.valid: ${report.pilotGate.valid}`,
    `fullProductionReady: ${report.productionReady}`,
    `outputDir: ${report.outputDir}`,
  ];
  if (!summaryOnly) {
    lines.push(`inputs: ${report.inputs.join(" | ")}`);
    if (report.skippedDefaultInputs.length > 0) {
      lines.push(`skipped default inputs: ${report.skippedDefaultInputs.join(" | ")}`);
    }
    lines.push(`missing SPR bands: ${report.missingProductionCoverage.sprBands.join(",") || "none"}`);
    lines.push(`missing pot types: ${report.missingProductionCoverage.potTypes.join(",") || "none"}`);
    lines.push(`missing action nodes: ${report.missingProductionCoverage.actionNodes.join(",") || "none"}`);
    if (report.errors.length > 0) {
      lines.push("errors:");
      for (const error of report.errors) lines.push(`- ${error}`);
    }
    if (report.warnings.length > 0) {
      lines.push("warnings:");
      for (const warning of report.warnings) lines.push(`- ${warning}`);
    }
    lines.push("planned files:");
    for (const file of report.plannedFiles) lines.push(`- ${file.written ? "wrote" : "would write"} ${file.path}`);
  }
  return lines.join("\n");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  )).join(",")}}`;
}
