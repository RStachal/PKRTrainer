import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildMttPreflopImportReadinessReport,
  renderMttPreflopImportReadinessReport,
  type MttPreflopRangePackImportInput,
} from "../src/data/ranges/mttPreflopRangePackImport.ts";
import {
  buildMttPreflopImportSlotValidationReport,
  renderMttImportSlotValidationReport,
} from "../src/data/ranges/mttImportSlotValidation.ts";
import {
  buildProductionPermissionManifestReport,
  renderProductionPermissionManifestReport,
  type ProductionPermissionManifest,
} from "../src/data/ranges/productionPermissionManifest.ts";

interface CliArgs {
  packId: string;
  draftDir: string;
  permissionPath: string;
  rawRoot: string;
  write: boolean;
  confirm: string | null;
  json: boolean;
}

interface DraftSummary {
  rows: readonly {
    packId: string;
    status: string;
  }[];
}

const CONFIRM_TOKEN = "STAGE_REVIEWED_MTT_P1_PREFLOP";

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:p1-stage-reviewed-preflop -- --pack-id <packId> --permission <reviewed-permission.json>",
    `  npm run mtt:p1-stage-reviewed-preflop -- --pack-id <packId> --permission <reviewed-permission.json> --write --confirm=${CONFIRM_TOKEN}`,
    "",
    "Inputs:",
    "  --draft-dir=artifacts/mtt-p1-preflop-drafts",
    "  --raw-root=Agents/range-intake/raw",
    "",
    "The command finalizes a review-only normalized.candidate.json only after a real permission manifest validates.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = stageReviewedIntake(args);
  console.log(args.json ? JSON.stringify(result, null, 2) : renderResult(result));
  process.exitCode = result.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let packId = "";
  let draftDir = "artifacts/mtt-p1-preflop-drafts";
  let permissionPath = "";
  let rawRoot = "Agents/range-intake/raw";
  let write = false;
  let confirm: string | null = null;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--pack-id") {
      packId = requiredValue(argv, index, "--pack-id");
      index += 1;
      continue;
    }
    if (item.startsWith("--pack-id=")) {
      packId = inlineValue(item, "--pack-id");
      continue;
    }
    if (item === "--permission") {
      permissionPath = requiredValue(argv, index, "--permission");
      index += 1;
      continue;
    }
    if (item.startsWith("--permission=")) {
      permissionPath = inlineValue(item, "--permission");
      continue;
    }
    if (item === "--draft-dir") {
      draftDir = requiredValue(argv, index, "--draft-dir");
      index += 1;
      continue;
    }
    if (item.startsWith("--draft-dir=")) {
      draftDir = inlineValue(item, "--draft-dir");
      continue;
    }
    if (item === "--raw-root") {
      rawRoot = requiredValue(argv, index, "--raw-root");
      index += 1;
      continue;
    }
    if (item.startsWith("--raw-root=")) {
      rawRoot = inlineValue(item, "--raw-root");
      continue;
    }
    if (item === "--confirm") {
      confirm = requiredValue(argv, index, "--confirm");
      index += 1;
      continue;
    }
    if (item.startsWith("--confirm=")) {
      confirm = inlineValue(item, "--confirm");
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (packId.length === 0) throw new Error(`--pack-id is required.\n\n${usage()}`);
  if (permissionPath.length === 0) throw new Error(`--permission is required.\n\n${usage()}`);
  if (write && confirm !== CONFIRM_TOKEN) {
    throw new Error(`--write requires --confirm=${CONFIRM_TOKEN}.\n\n${usage()}`);
  }

  return {
    packId,
    draftDir: resolve(draftDir),
    permissionPath: resolve(permissionPath),
    rawRoot: resolve(rawRoot),
    write,
    confirm,
    json,
  };
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1] ?? "";
  if (value.length === 0 || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.\n\n${usage()}`);
  }
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function stageReviewedIntake(args: CliArgs) {
  const candidatePath = join(args.draftDir, args.packId, "normalized.candidate.json");
  const summaryPath = join(args.draftDir, "summary.json");
  const errors: string[] = [];

  if (!existsSync(candidatePath)) errors.push(`Candidate normalized file is missing: ${candidatePath}`);
  if (!existsSync(args.permissionPath)) errors.push(`Permission manifest is missing: ${args.permissionPath}`);
  if (errors.length > 0) {
    return invalidResult(args, candidatePath, errors);
  }

  const candidate = readJson<MttPreflopRangePackImportInput>(candidatePath);
  const permission = readJson<ProductionPermissionManifest>(args.permissionPath);
  const summary = existsSync(summaryPath) ? readJson<DraftSummary>(summaryPath) : null;
  const reuseCandidate = summary?.rows.some((row) => (
    row.packId === args.packId && row.status === "REUSE_CANDIDATE_WRITTEN_NEEDS_POLICY"
  )) ?? false;
  const finalized = finalizedInput(candidate, permission);
  const report = buildMttPreflopImportReadinessReport(finalized);
  const slotReport = buildMttPreflopImportSlotValidationReport(finalized);
  const permissionReport = buildProductionPermissionManifestReport(permission, {
    packId: finalized.id,
    licenseKind: finalized.licenseKind,
    blindSpeeds: reuseCandidate ? ["REGULAR", finalized.dimensions.blindSpeed] : [finalized.dimensions.blindSpeed],
    evModels: [finalized.dimensions.evModel],
  });
  const reuseErrors = reuseCandidate && !permission.reusePolicy?.allowedDimensions.includes("BLIND_SPEED")
    ? ["Turbo reuse candidate requires permission.reusePolicy.allowedDimensions to include BLIND_SPEED."]
    : [];

  const rawFolder = join(args.rawRoot, args.packId);
  const rawNormalizedPath = join(rawFolder, "normalized.json");
  const rawPermissionPath = join(rawFolder, "permission.json");
  const valid = report.productionReady &&
    slotReport.valid &&
    permissionReport.valid &&
    reuseErrors.length === 0;
  const writePerformed = valid && args.write;

  if (writePerformed) {
    mkdirSync(dirname(rawNormalizedPath), { recursive: true });
    writeFileSync(rawNormalizedPath, `${JSON.stringify(finalized, null, 2)}\n`, "utf8");
    writeFileSync(rawPermissionPath, `${JSON.stringify(permission, null, 2)}\n`, "utf8");
  }

  return {
    valid,
    writeRequested: args.write,
    writePerformed,
    packId: args.packId,
    candidatePath,
    permissionPath: args.permissionPath,
    rawNormalizedPath,
    rawPermissionPath,
    reuseCandidate,
    errors: [
      ...report.errors,
      ...slotReport.errors,
      ...permissionReport.errors,
      ...reuseErrors,
    ],
    warnings: [
      ...report.warnings,
      ...permissionReport.warnings,
    ],
    report,
    slotReport,
    permissionReport,
  };
}

function invalidResult(args: CliArgs, candidatePath: string, errors: readonly string[]) {
  const rawFolder = join(args.rawRoot, args.packId);
  return {
    valid: false,
    writeRequested: args.write,
    writePerformed: false,
    packId: args.packId,
    candidatePath,
    permissionPath: args.permissionPath,
    rawNormalizedPath: join(rawFolder, "normalized.json"),
    rawPermissionPath: join(rawFolder, "permission.json"),
    reuseCandidate: false,
    errors,
    warnings: [],
    report: null,
    slotReport: null,
    permissionReport: null,
  };
}

function finalizedInput(
  candidate: MttPreflopRangePackImportInput,
  permission: ProductionPermissionManifest,
): MttPreflopRangePackImportInput {
  const reuseAssumption = permission.reusePolicy === undefined
    ? []
    : [
      `Explicit reviewed reuse policy for ${permission.reusePolicy.allowedDimensions.join(", ")}: ` +
      permission.reusePolicy.rationale,
    ];
  return {
    ...candidate,
    contentLanguage: "cs",
    licenseKind: permission.licenseKind,
    licenseNote: [
      `Permission manifest ${permission.version} reviewed by ${permission.reviewer} at ${permission.reviewedAt}.`,
      `Rights owner: ${permission.rightsOwner}.`,
      `Redistribution scope: ${permission.allowedRedistributionScope}.`,
    ].join(" "),
    assumptions: [...candidate.assumptions, ...reuseAssumption],
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as T;
}

function renderResult(result: ReturnType<typeof stageReviewedIntake>): string {
  const lines = [
    "MTT P1 reviewed preflop staging",
    `valid: ${result.valid}`,
    `write requested: ${result.writeRequested}`,
    `write performed: ${result.writePerformed}`,
    `pack: ${result.packId}`,
    `candidate: ${result.candidatePath}`,
    `permission: ${result.permissionPath}`,
    `raw normalized: ${result.rawNormalizedPath}`,
    `raw permission: ${result.rawPermissionPath}`,
    `reuse candidate: ${result.reuseCandidate}`,
  ];
  if (result.errors.length > 0) {
    lines.push("errors:");
    for (const error of result.errors) lines.push(`- ${error}`);
  }
  if (result.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  if (result.report !== null && result.slotReport !== null && result.permissionReport !== null) {
    lines.push(
      "",
      renderMttPreflopImportReadinessReport(result.report),
      "",
      renderMttImportSlotValidationReport(result.slotReport),
      "",
      renderProductionPermissionManifestReport(result.permissionReport),
    );
  }
  return lines.join("\n");
}
