import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALL_HAND_CLASSES } from "../src/core/poker.ts";
import type { AnteMode } from "../src/core/types.ts";
import type { ActionContext, ActionKey, HandLabel } from "../src/core/types.ts";
import type { BlindSpeed, TableFormat } from "../src/core/trainingProfile.ts";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks.ts";
import type { RangePack } from "../src/data/ranges/rangePack.ts";
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
  mttProductionImportPackId,
  mttProductionImportSlotId,
  mttProductionImportSlotPaths,
} from "../src/data/ranges/mttImportSlotNaming.ts";

interface CliArgs {
  outDir: string;
  json: boolean;
}

interface P1Profile {
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  ante: AnteMode;
}

interface DraftSummaryRow {
  slotId: string;
  packId: string;
  status:
    | "NORMALIZED_CANDIDATE_WRITTEN"
    | "REUSE_CANDIDATE_WRITTEN_NEEDS_POLICY"
    | "NEEDS_REVIEWED_REUSE_OR_DATA"
    | "NEEDS_NORMALIZED_DATA";
  normalizedCandidatePath: string | null;
  permissionReviewRequestPath: string | null;
  rawNormalizedPath: string;
  rawPermissionPath: string;
  sourcePackId: string | null;
  sourceRecordCount: number;
  validation: {
    normalizedReportValid: boolean | null;
    legalImportSlot: boolean | null;
    productionReady: boolean | null;
    expectedBlockingErrors: readonly string[];
    warnings: readonly string[];
  };
  nextReviewStep: string;
}

interface PermissionReviewRequest {
  warning: string;
  packId: string;
  sourcePackId: string;
  targetRawPermissionPath: string;
  targetRawNormalizedPath: string;
  candidateNormalizedPath: string;
  currentLimitation: string;
  requiredReusePolicy?: {
    allowedDimensions: readonly ["BLIND_SPEED"];
    rationale: string;
  };
  requiredPermissionDecision: {
    acceptedLicenseKinds: readonly [
      "OWNED_SOLVER_EXPORT",
      "PUBLIC_CHART_WITH_PERMISSION",
      "EXPLICIT_WRITTEN_PERMISSION",
    ];
    requiredRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE";
    requiredFields: readonly string[];
    externalEvidenceRule: string;
  };
  sourcePackSummary: {
    confidence: RangePack["confidence"];
    createdAt: string;
    verifiedAt: string;
    recordCount: number;
    sourceEvidence: readonly {
      referenceId: string;
      provider: string;
      title: string;
      verifiedAt: string;
      licenseNote: string;
      methodologyNote?: string;
    }[];
  };
}

const P1_PROFILES: readonly P1Profile[] = [
  { tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", ante: "OFF" },
  { tableFormat: "FULL_RING_9", blindSpeed: "REGULAR", ante: "ON" },
  { tableFormat: "FULL_RING_9", blindSpeed: "TURBO", ante: "OFF" },
  { tableFormat: "FULL_RING_9", blindSpeed: "TURBO", ante: "ON" },
  { tableFormat: "SIX_MAX", blindSpeed: "REGULAR", ante: "OFF" },
  { tableFormat: "SIX_MAX", blindSpeed: "REGULAR", ante: "ON" },
  { tableFormat: "SIX_MAX", blindSpeed: "TURBO", ante: "OFF" },
  { tableFormat: "SIX_MAX", blindSpeed: "TURBO", ante: "ON" },
];

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:p1-preflop-drafts",
    "  npm run mtt:p1-preflop-drafts -- --out-dir=artifacts/mtt-p1-preflop-drafts --json",
    "",
    "Writes review-only artifacts. It never writes Agents/range-intake/raw normalized.json or permission.json.",
  ].join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  const summary = writeP1Drafts(args.outDir);
  console.log(args.json ? JSON.stringify(summary, null, 2) : renderSummary(summary));
  process.exitCode = summary.rows.some((row) => row.status === "NORMALIZED_CANDIDATE_WRITTEN")
    ? 0
    : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let outDir = "artifacts/mtt-p1-preflop-drafts";
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--out-dir") {
      const value = argv[index + 1] ?? "";
      if (value.length === 0 || value.startsWith("-")) {
        throw new Error(`--out-dir requires a path.\n\n${usage()}`);
      }
      outDir = value;
      index += 1;
      continue;
    }
    if (item.startsWith("--out-dir=")) {
      const value = item.slice("--out-dir=".length).trim();
      if (value.length === 0) throw new Error(`--out-dir requires a path.\n\n${usage()}`);
      outDir = value;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { outDir: resolve(outDir), json };
}

function writeP1Drafts(outDir: string): {
  warning: string;
  outDir: string;
  generatedAt: string;
  rows: DraftSummaryRow[];
} {
  mkdirSync(outDir, { recursive: true });
  const rows = P1_PROFILES.map((profile) => buildRow(profile, outDir));
  const summary = {
    warning:
      "Review-only artifacts. Do not copy candidate files into raw intake until permission review is complete.",
    outDir,
    generatedAt: new Date().toISOString(),
    rows,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "UNBLOCK_MATRIX.md"), renderUnblockMatrix(summary), "utf8");
  writeFileSync(join(outDir, "STAGING_GUIDE.md"), renderStagingGuide(summary), "utf8");
  return summary;
}

function buildRow(profile: P1Profile, outDir: string): DraftSummaryRow {
  const packId = mttProductionImportPackId({
    ...profile,
    street: "PREFLOP",
    evModel: "CHIP_EV",
  });
  const slotId = mttProductionImportSlotId({
    ...profile,
    street: "PREFLOP",
    evModel: "CHIP_EV",
  });
  const paths = mttProductionImportSlotPaths(packId);
  const sourcePack = sourcePackForProfile(profile);

  if (sourcePack !== undefined && isAutoDraftable(profile, sourcePack)) {
    return writeDraftableRow({
      outDir,
      packId,
      paths,
      profile,
      slotId,
      sourcePack,
    });
  }

  const reusableRegularSource = profile.blindSpeed === "TURBO"
    ? sourcePackForProfile({ ...profile, blindSpeed: "REGULAR" })
    : undefined;
  if (
    profile.tableFormat === "FULL_RING_9" &&
    reusableRegularSource !== undefined &&
    reusableRegularSource.records.length > 0 &&
    reusableRegularSource.confidence !== "LOW"
  ) {
    return writeDraftableRow({
      outDir,
      packId,
      paths,
      profile,
      slotId,
      sourcePack: reusableRegularSource,
      reusePolicyRequired: true,
    });
  }

  const hasReusableRegularSource = reusableRegularSource !== undefined &&
    reusableRegularSource.records.length > 0;
  return {
    slotId,
    packId,
    status: hasReusableRegularSource ? "NEEDS_REVIEWED_REUSE_OR_DATA" : "NEEDS_NORMALIZED_DATA",
    normalizedCandidatePath: null,
    permissionReviewRequestPath: null,
    rawNormalizedPath: paths.normalizedInputPath,
    rawPermissionPath: paths.permissionManifestPath,
    sourcePackId: sourcePack?.id ?? null,
    sourceRecordCount: sourcePack?.records.length ?? 0,
    validation: {
      normalizedReportValid: null,
      legalImportSlot: null,
      productionReady: null,
      expectedBlockingErrors: hasReusableRegularSource
        ? [
            "Turbo hand recommendations require dedicated turbo source data or an explicit reviewed BLIND_SPEED reuse policy.",
          ]
        : [
            "No normalized hand-class records are available for this P1 slot.",
          ],
      warnings: [],
    },
    nextReviewStep: hasReusableRegularSource
      ? "Review whether regular-speed chipEV ranges may be reused for turbo blind speed, or provide dedicated turbo source data."
      : "Provide legally usable normalized hand-class records before permission review can start.",
  };
}

function writeDraftableRow(input: {
  outDir: string;
  packId: string;
  paths: ReturnType<typeof mttProductionImportSlotPaths>;
  profile: P1Profile;
  reusePolicyRequired?: boolean;
  slotId: string;
  sourcePack: RangePack;
}): DraftSummaryRow {
  const packDir = join(input.outDir, input.packId);
  mkdirSync(packDir, { recursive: true });
  const normalizedPath = join(packDir, "normalized.candidate.json");
  const permissionPath = join(packDir, "permission.review-request.json");
  const normalized = normalizedCandidateFromSourcePack({
    sourcePack: input.sourcePack,
    targetPackId: input.packId,
    targetProfile: input.profile,
    reusePolicyRequired: input.reusePolicyRequired === true,
  });
  const report = buildMttPreflopImportReadinessReport(normalized);
  const slotReport = buildMttPreflopImportSlotValidationReport(normalized);
  const permissionRequest = permissionReviewRequest({
    candidateNormalizedPath: normalizedPath,
    normalizedRawPath: input.paths.normalizedInputPath,
    packId: input.packId,
    permissionRawPath: input.paths.permissionManifestPath,
    sourcePack: input.sourcePack,
    reusePolicyRequired: input.reusePolicyRequired === true,
  });

  writeFileSync(normalizedPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  writeFileSync(permissionPath, `${JSON.stringify(permissionRequest, null, 2)}\n`, "utf8");
  writeFileSync(
    join(packDir, "candidate-readiness.txt"),
    [
      renderMttPreflopImportReadinessReport(report),
      "",
      renderMttImportSlotValidationReport(slotReport),
      "",
      "Permission manifest intentionally not generated.",
      "A human/source review must create Agents/range-intake/raw/<packId>/permission.json.",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    slotId: input.slotId,
    packId: input.packId,
    status: input.reusePolicyRequired === true
      ? "REUSE_CANDIDATE_WRITTEN_NEEDS_POLICY"
      : "NORMALIZED_CANDIDATE_WRITTEN",
    normalizedCandidatePath: normalizedPath,
    permissionReviewRequestPath: permissionPath,
    rawNormalizedPath: input.paths.normalizedInputPath,
    rawPermissionPath: input.paths.permissionManifestPath,
    sourcePackId: input.sourcePack.id,
    sourceRecordCount: input.sourcePack.records.length,
    validation: {
      normalizedReportValid: report.valid,
      legalImportSlot: slotReport.valid,
      productionReady: report.productionReady,
      expectedBlockingErrors: report.errors,
      warnings: report.warnings,
    },
    nextReviewStep:
      input.reusePolicyRequired === true
        ? "Review legal provenance and BLIND_SPEED reuse policy before copying this turbo candidate into raw intake."
        : "Review legal provenance and create a real permission.json before copying any normalized candidate into raw intake.",
  };
}

function sourcePackForProfile(profile: P1Profile): RangePack | undefined {
  return allMttPreflopRangePacks.find((pack) => (
    pack.dimensions.gameVariant === "MTT" &&
    pack.dimensions.tableFormat === profile.tableFormat &&
    pack.dimensions.blindSpeed === profile.blindSpeed &&
    pack.dimensions.street === "PREFLOP" &&
    pack.dimensions.evModel === "CHIP_EV" &&
    pack.dimensions.ante === profile.ante &&
    pack.dimensions.rakeMode === "NONE"
  ));
}

/**
 * Jde z tohohle profilu a packu udělat draft rovnou?
 *
 * **Není to type guard, a schválně.** Dřív se deklaroval jako `pack is
 * RangePack`, jenže testuje i vlastnosti profilu - takže když vrátí `false`,
 * neznamená to, že pack chybí, ale klidně jen že jde o six-max nebo turbo.
 * TypeScript to přesto bral jako důkaz o typu a v další větvi zúžil `sourcePack`
 * na nic, takže hlásil „vlastnost neexistuje na typu `never`" u kódu, který za
 * běhu funguje správně.
 *
 * Type guard, který tvrdí o typu víc, než co ověřuje, je horší než žádný: mýlí
 * se tiše a v tu stranu, kde se to nepozná.
 */
function isAutoDraftable(profile: P1Profile, pack: RangePack): boolean {
  return (
    profile.tableFormat === "FULL_RING_9" &&
    profile.blindSpeed === "REGULAR" &&
    pack.records.length > 0 &&
    pack.confidence !== "LOW"
  );
}

function normalizedCandidateFromSourcePack(input: {
  reusePolicyRequired: boolean;
  sourcePack: RangePack;
  targetPackId: string;
  targetProfile: P1Profile;
}): MttPreflopRangePackImportInput {
  const targetDimensions = {
    ...input.sourcePack.dimensions,
    tableFormat: input.targetProfile.tableFormat,
    blindSpeed: input.targetProfile.blindSpeed,
    ante: input.targetProfile.ante,
  };
  const reuseAssumptions = input.reusePolicyRequired
    ? [
        `Review-only BLIND_SPEED reuse candidate migrated from ${input.sourcePack.id}.`,
        "Turbo production remains blocked until permission.json includes an explicit BLIND_SPEED reuse policy.",
        "No turbo hand recommendation should be promoted from this candidate without reviewer approval.",
      ]
    : [
        `Canonical production import candidate migrated from ${input.sourcePack.id}.`,
      ];
  return {
    contentLanguage: "cs",
    id: input.targetPackId,
    version: "production-candidate-v1",
    createdAt: input.sourcePack.createdAt,
    verifiedAt: input.sourcePack.verifiedAt,
    dimensions: targetDimensions,
    confidence: input.sourcePack.confidence,
    licenseKind: "UNKNOWN",
    licenseNote:
      "Existing PKRTrainer RangePack migration. Production license and runtime redistribution rights are not reviewed yet.",
    assumptions: [
      ...input.sourcePack.assumptions,
      ...reuseAssumptions,
      "Each sourceStackBB value is mapped from the existing PKRTrainer stack bucket.",
      "This candidate is not production-ready until permission.json is reviewed and written in raw intake.",
    ],
    searchQueries: [...input.sourcePack.searchQueries],
    sourceEvidence: input.sourcePack.sourceEvidence.map((source) => ({ ...source })),
    records: input.sourcePack.records.map((record) => ({
      position: record.position,
      sourceStackBB: record.bucket,
      bucket: record.bucket,
      context: record.context,
      strict: withExplicitFoldDefaults(record.context, record.strict),
      lenient: withExplicitFoldDefaults(record.context, record.lenient),
    })),
  };
}

function withExplicitFoldDefaults(
  context: ActionContext,
  map: Partial<Record<HandLabel, readonly ActionKey[]>>,
): Record<HandLabel, ActionKey[]> {
  const out: Record<HandLabel, ActionKey[]> = {};
  for (const hand of ALL_HAND_CLASSES) {
    out[hand] = (map[hand] ?? ["FOLD"]).map((action) => canonicalActionForContext(context, action));
  }
  return out;
}

function canonicalActionForContext(context: ActionContext, action: ActionKey): ActionKey {
  if (context === "VS_LIMP" && action === "LIMP") return "OVERLIMP";
  return action;
}

function permissionReviewRequest(input: {
  candidateNormalizedPath: string;
  normalizedRawPath: string;
  packId: string;
  permissionRawPath: string;
  reusePolicyRequired: boolean;
  sourcePack: RangePack;
}): PermissionReviewRequest {
  return {
    warning:
      "Review request only. Do not rename or copy this file as permission.json.",
    packId: input.packId,
    sourcePackId: input.sourcePack.id,
    targetRawPermissionPath: input.permissionRawPath,
    targetRawNormalizedPath: input.normalizedRawPath,
    candidateNormalizedPath: input.candidateNormalizedPath,
    currentLimitation:
      input.reusePolicyRequired
        ? "The turbo reuse candidate has strategy records, but production remains blocked until permission review explicitly allows BLIND_SPEED reuse."
        : "The normalized candidate has strategy records, but the production permission manifest is still missing.",
    requiredReusePolicy: input.reusePolicyRequired
      ? {
          allowedDimensions: ["BLIND_SPEED"],
          rationale:
            "Reviewer must explicitly decide whether regular-speed chipEV hand recommendations may be reused for turbo at the same stack/ante nodes.",
        }
      : undefined,
    requiredPermissionDecision: {
      acceptedLicenseKinds: [
        "OWNED_SOLVER_EXPORT",
        "PUBLIC_CHART_WITH_PERMISSION",
        "EXPLICIT_WRITTEN_PERMISSION",
      ],
      requiredRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
      requiredFields: [
        "reviewer",
        "rightsOwner",
        "reviewedAt",
        "sourceMaterialLocation",
        "confirmation that range values may be redistributed in the PKRTrainer runtime bundle",
      ],
      externalEvidenceRule:
        "OWNED_SOLVER_EXPORT needs no external evidence reference; third-party/public-permission input requires source-free evidence references.",
    },
    sourcePackSummary: {
      confidence: input.sourcePack.confidence,
      createdAt: input.sourcePack.createdAt,
      verifiedAt: input.sourcePack.verifiedAt,
      recordCount: input.sourcePack.records.length,
      sourceEvidence: input.sourcePack.sourceEvidence.map((source, index) => ({
        referenceId: `${input.sourcePack.id}-source-${index + 1}`,
        provider: source.provider,
        title: source.title,
        verifiedAt: source.verifiedAt,
        licenseNote: source.licenseNote,
        methodologyNote: source.methodologyNote,
      })),
    },
  };
}

function renderSummary(summary: ReturnType<typeof writeP1Drafts>): string {
  return [
    "MTT P1 preflop draft builder",
    summary.warning,
    `outDir: ${summary.outDir}`,
    ...summary.rows.map((row) => (
      [
        `- ${row.slotId}: ${row.status}`,
        `  pack: ${row.packId}`,
        `  source: ${row.sourcePackId ?? "none"} records=${row.sourceRecordCount}`,
        row.normalizedCandidatePath === null
          ? `  normalized candidate: none`
          : `  normalized candidate: ${row.normalizedCandidatePath}`,
        row.permissionReviewRequestPath === null
          ? `  permission review request: none`
          : `  permission review request: ${row.permissionReviewRequestPath}`,
        `  next: ${row.nextReviewStep}`,
      ].join("\n")
    )),
  ].join("\n");
}

function renderUnblockMatrix(summary: ReturnType<typeof writeP1Drafts>): string {
  return [
    "# MTT P1 preflop CHIP_EV unblock matrix",
    "",
    summary.warning,
    "",
    "| Slot | Status | Source records | Candidate | Next review step |",
    "| --- | --- | ---: | --- | --- |",
    ...summary.rows.map((row) => [
      row.slotId,
      row.status,
      String(row.sourceRecordCount),
      row.normalizedCandidatePath === null ? "none" : "written",
      row.nextReviewStep,
    ].map(escapeMarkdownCell).join(" | ")).map((line) => `| ${line} |`),
    "",
    "## Raw intake rule",
    "",
    "Do not write `Agents/range-intake/raw/<packId>/normalized.json` until the candidate has a matching reviewed `permission.json`.",
    "Do not write `permission.json` from this folder; it must be created from explicit reviewer, rights-owner, source ownership, and runtime redistribution decisions.",
    "An owned solver export needs no external evidence reference; third-party/public-permission input still does.",
    "",
  ].join("\n");
}

function renderStagingGuide(summary: ReturnType<typeof writeP1Drafts>): string {
  const candidateRows = summary.rows.filter((row) => row.normalizedCandidatePath !== null);
  return [
    "# MTT P1 reviewed preflop staging guide",
    "",
    "This guide starts after a real reviewed `permission.json` exists outside the draft folder.",
    "Do not use `permission.review-request.json` as the permission manifest.",
    "",
    "## Dry run first",
    "",
    ...candidateRows.flatMap((row) => [
      `### ${row.packId}`,
      "",
      "Dry run:",
      "",
      "```powershell",
      `npm run mtt:p1-stage-reviewed-preflop -- --pack-id ${row.packId} --permission <reviewed-permission.json>`,
      "```",
      "",
      "Write after the dry run is valid:",
      "",
      "```powershell",
      `npm run mtt:p1-stage-reviewed-preflop -- --pack-id ${row.packId} --permission <reviewed-permission.json> --write --confirm=STAGE_REVIEWED_MTT_P1_PREFLOP`,
      "```",
      "",
      row.status === "REUSE_CANDIDATE_WRITTEN_NEEDS_POLICY"
        ? "This turbo candidate additionally requires `permission.reusePolicy.allowedDimensions` to include `BLIND_SPEED`."
        : "This regular candidate requires a production-valid permission manifest for the same pack id.",
      "",
    ]),
    "## After write",
    "",
    "Run:",
    "",
    "```powershell",
    "npm run mtt:validate-ready-intake",
    "npm run mtt:promote-ready -- --dry-run",
    "npm run mtt:registry-integrity",
    "```",
    "",
  ].join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
