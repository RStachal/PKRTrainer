import { createHash } from "node:crypto";
import type { RangePack } from "./rangePack";
import {
  buildMttPreflopImportReadinessReport,
  normalizeMttPreflopRangePackImport,
  recordProvenanceSources,
  type MttPreflopRangePackImportInput,
} from "./mttPreflopRangePackImport";
import {
  buildFlopProductionCoverageReport,
  type FlopProductionStrategyPack,
} from "./flopProductionStrategyPack";
import {
  buildTurnProductionCoverageReport,
  type TurnProductionStrategyPack,
} from "./turnProductionStrategyPack";
import {
  buildRiverProductionCoverageReport,
  type RiverProductionStrategyPack,
} from "./riverProductionStrategyPack";
import {
  buildProductionPermissionManifestReport,
  type ProductionPermissionManifest,
  type ProductionPermissionManifestReport,
} from "./productionPermissionManifest";
import {
  buildMttPostflopImportSlotValidationReport,
  buildMttPreflopImportSlotValidationReport,
  type MttImportSlotSummary,
} from "./mttImportSlotValidation";
import {
  type MttPostflopProductionPack,
} from "./mttPostflopImportSlots";
import { validateProductionStrategySemantics } from "./productionStrategySemanticValidation";
import {
  buildProductionStrategyRuntimeSmokeReport,
  type ProductionStrategyRuntimeSmokeReport,
} from "./productionStrategyRuntimeSmoke";

export type RangeModuleBuildKind = "mtt-preflop" | "flop-production" | "turn-production" | "river-production";

export type RangeModuleMatchedImportSlot = MttImportSlotSummary;

export interface RangeModuleBuildInput {
  kind: RangeModuleBuildKind;
  input:
    | MttPreflopRangePackImportInput
    | FlopProductionStrategyPack
    | TurnProductionStrategyPack
    | RiverProductionStrategyPack;
  permissionManifest: ProductionPermissionManifest | null;
  exportName?: string;
}

export interface RangeModuleBuildResult {
  kind: RangeModuleBuildKind;
  packId: string;
  exportName: string;
  productionReady: boolean;
  permissionReady: boolean;
  writeReady: boolean;
  matchedImportSlots: readonly RangeModuleMatchedImportSlot[];
  blockers: readonly string[];
  permissionReport: ProductionPermissionManifestReport;
  runtimeSmokeReport: ProductionStrategyRuntimeSmokeReport | null;
  moduleText: string | null;
}

export function buildRangeModule(input: RangeModuleBuildInput): RangeModuleBuildResult {
  if (input.kind === "mtt-preflop") {
    return buildMttPreflopRangeModule(
      input.input as MttPreflopRangePackImportInput,
      input.permissionManifest,
      input.exportName,
    );
  }

  if (input.kind === "flop-production") {
    return buildFlopProductionRangeModule(
      input.input as FlopProductionStrategyPack,
      input.permissionManifest,
      input.exportName,
    );
  }

  if (input.kind === "turn-production") {
    return buildTurnProductionRangeModule(
      input.input as TurnProductionStrategyPack,
      input.permissionManifest,
      input.exportName,
    );
  }

  return buildRiverProductionRangeModule(
    input.input as RiverProductionStrategyPack,
    input.permissionManifest,
    input.exportName,
  );
}

export function renderRangeModuleBuildReport(result: RangeModuleBuildResult): string {
  const lines = [
    `Range module build: ${result.packId}`,
    `kind: ${result.kind}`,
    `exportName: ${result.exportName}`,
    `productionReady: ${result.productionReady}`,
    `permissionReady: ${result.permissionReady}`,
    `writeReady: ${result.writeReady}`,
    `matched import slots: ${result.matchedImportSlots.length}`,
    `runtime smoke samples: ${result.runtimeSmokeReport?.sampleCount ?? 0}`,
  ];

  for (const slot of result.matchedImportSlots) {
    lines.push(
      `- ${slot.slotId}: ${slot.packId} ` +
      `input=${slot.normalizedInputPath} permission=${slot.permissionManifestPath}`,
    );
  }

  if (result.blockers.length > 0) {
    lines.push("blockers:");
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }

  return lines.join("\n");
}

function buildMttPreflopRangeModule(
  input: MttPreflopRangePackImportInput,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(input.id, "RangePack"),
): RangeModuleBuildResult {
  const readiness = buildMttPreflopImportReadinessReport(input);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: input.id,
    licenseKind: input.licenseKind,
    blindSpeeds: [input.dimensions.blindSpeed],
    evModels: [input.dimensions.evModel],
    additionalSources: recordProvenanceSources(input.records, input.licenseKind),
  });
  const slotReport = buildMttPreflopImportSlotValidationReport(input);
  const languageBlockers = playerFacingLanguageBlockers(input.contentLanguage);
  const blockers = [
    ...readiness.errors,
    ...readiness.warnings,
    ...slotReport.errors,
    ...permissionReport.errors,
    ...languageBlockers,
  ];
  const writeReady =
    readiness.productionReady &&
    slotReport.valid &&
    permissionReport.valid &&
    languageBlockers.length === 0;
  const pack = normalizeMttPreflopRangePackImport(input);

  return {
    kind: "mtt-preflop",
    packId: input.id,
    exportName,
    productionReady: readiness.productionReady,
    permissionReady: permissionReport.valid,
    writeReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    runtimeSmokeReport: null,
    moduleText: writeReady
      ? renderMttPreflopRangePackModule(pack, exportName, permissionFingerprint(permissionManifest!))
      : null,
  };
}

function buildFlopProductionRangeModule(
  pack: FlopProductionStrategyPack,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(pack.id, "StrategyPack"),
): RangeModuleBuildResult {
  const coverage = buildFlopProductionCoverageReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const slotReport = buildPostflopSlotReport(pack, "Flop");
  const semanticErrors = validateProductionStrategySemantics(pack);
  const runtimeSmokeReport = buildProductionStrategyRuntimeSmokeReport(pack);
  const languageBlockers = playerFacingLanguageBlockers(pack.contentLanguage);
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing board textures", coverage.missingBoardTextures),
    ...coverageBlockers("missing SPR bands", coverage.missingSprBands),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...slotReport.errors,
    ...semanticErrors,
    ...runtimeSmokeReport.errors,
    ...permissionReport.errors,
    ...languageBlockers,
  ];
  const writeReady =
    coverage.productionReady &&
    slotReport.valid &&
    permissionReport.valid &&
    semanticErrors.length === 0 &&
    runtimeSmokeReport.valid;
  const localizedWriteReady = writeReady && languageBlockers.length === 0;

  return {
    kind: "flop-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady: localizedWriteReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    runtimeSmokeReport,
    moduleText: localizedWriteReady
      ? renderFlopProductionStrategyPackModule(pack, exportName, permissionFingerprint(permissionManifest!))
      : null,
  };
}

function buildTurnProductionRangeModule(
  pack: TurnProductionStrategyPack,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(pack.id, "StrategyPack"),
): RangeModuleBuildResult {
  const coverage = buildTurnProductionCoverageReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const slotReport = buildPostflopSlotReport(pack, "Turn");
  const semanticErrors = validateProductionStrategySemantics(pack);
  const runtimeSmokeReport = buildProductionStrategyRuntimeSmokeReport(pack);
  const languageBlockers = playerFacingLanguageBlockers(pack.contentLanguage);
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing prior flop actions", coverage.missingPriorFlopActions),
    ...coverageBlockers("missing turn card classes", coverage.missingTurnCardClasses),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...slotReport.errors,
    ...semanticErrors,
    ...runtimeSmokeReport.errors,
    ...permissionReport.errors,
    ...languageBlockers,
  ];
  const writeReady =
    coverage.productionReady &&
    slotReport.valid &&
    permissionReport.valid &&
    semanticErrors.length === 0 &&
    runtimeSmokeReport.valid;
  const localizedWriteReady = writeReady && languageBlockers.length === 0;

  return {
    kind: "turn-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady: localizedWriteReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    runtimeSmokeReport,
    moduleText: localizedWriteReady
      ? renderTurnProductionStrategyPackModule(pack, exportName, permissionFingerprint(permissionManifest!))
      : null,
  };
}

function buildRiverProductionRangeModule(
  pack: RiverProductionStrategyPack,
  permissionManifest: ProductionPermissionManifest | null,
  exportName = defaultExportName(pack.id, "StrategyPack"),
): RangeModuleBuildResult {
  const coverage = buildRiverProductionCoverageReport(pack);
  const permissionReport = buildProductionPermissionManifestReport(permissionManifest, {
    packId: pack.id,
    licenseKind: pack.licenseKind,
    blindSpeeds: pack.dimensions.blindSpeeds,
    evModels: [pack.dimensions.evModel],
  });
  const slotReport = buildPostflopSlotReport(pack, "River");
  const semanticErrors = validateProductionStrategySemantics(pack);
  const runtimeSmokeReport = buildProductionStrategyRuntimeSmokeReport(pack);
  const languageBlockers = playerFacingLanguageBlockers(pack.contentLanguage);
  const blockers = [
    ...coverage.errors,
    ...coverageBlockers("missing pot types", coverage.missingPotTypes),
    ...coverageBlockers("missing position patterns", coverage.missingPositionPatterns),
    ...coverageBlockers("missing prior turn actions", coverage.missingPriorTurnActions),
    ...coverageBlockers("missing river runout classes", coverage.missingRiverRunoutClasses),
    ...coverageBlockers("missing blocker relevance", coverage.missingBlockerRelevance),
    ...coverageBlockers("missing action nodes", coverage.missingActionNodes),
    ...coverageBlockers("missing range lanes", coverage.missingRangeLanes),
    ...slotReport.errors,
    ...semanticErrors,
    ...runtimeSmokeReport.errors,
    ...permissionReport.errors,
    ...languageBlockers,
  ];
  const writeReady =
    coverage.productionReady &&
    slotReport.valid &&
    permissionReport.valid &&
    semanticErrors.length === 0 &&
    runtimeSmokeReport.valid;
  const localizedWriteReady = writeReady && languageBlockers.length === 0;

  return {
    kind: "river-production",
    packId: pack.id,
    exportName,
    productionReady: coverage.productionReady,
    permissionReady: permissionReport.valid,
    writeReady: localizedWriteReady,
    matchedImportSlots: slotReport.matchedSlots,
    blockers,
    permissionReport,
    runtimeSmokeReport,
    moduleText: localizedWriteReady
      ? renderRiverProductionStrategyPackModule(pack, exportName, permissionFingerprint(permissionManifest!))
      : null,
  };
}

function coverageBlockers(label: string, values: readonly string[]): string[] {
  return values.length === 0 ? [] : [`${label}: ${values.join(",")}`];
}

function playerFacingLanguageBlockers(contentLanguage: string | undefined): string[] {
  return contentLanguage === "cs"
    ? []
    : ["player-facing production content must declare contentLanguage=cs"];
}

function buildPostflopSlotReport(
  pack: MttPostflopProductionPack,
  streetLabel: "Flop" | "Turn" | "River",
): ReturnType<typeof buildMttPostflopImportSlotValidationReport> {
  return buildMttPostflopImportSlotValidationReport(pack, {
    gameVariantError: `${streetLabel} production module must target MTT gameVariant.`,
    noSlotError: `${streetLabel} production pack must match at least one legal MTT postflop import slot.`,
    stopAfterGameVariantError: true,
  });
}

/**
 * Modul **preview** packu: tentýž kód jako produkční, bez otisku povolení.
 *
 * Preview pack z podstaty neprojde produkční cestou: `writeReady` chce
 * `productionReady`, a ten chce každou sedačku × hloubku × kontext. Vrstva, co
 * odpovídá jen tam, kde ví (rozhodnutí vlastníka 22. 9. 2026, 4a), to nikdy
 * mít nebude - a přesto má jít k hráči. Tahle cesta je pro ni, a je úmyslně
 * úzká: pack musí být platný a nálepkovaný `LOW`, jinak se modul nevykreslí.
 * Produkci to neotvírá: kde se pack smí hrát, rozhoduje `startableMttPreflopRangePack`
 * proti měřené připravenosti, ne existence modulu.
 */
export function renderPreviewMttPreflopRangePackModule(
  input: MttPreflopRangePackImportInput,
  exportName = defaultExportName(input.id, "RangePack"),
  banner: readonly string[] = [],
): { moduleText: string | null; errors: readonly string[] } {
  const readiness = buildMttPreflopImportReadinessReport(input);
  const errors = [
    ...readiness.errors,
    ...(input.confidence === "LOW" ? [] : [`Preview module needs confidence LOW, not ${input.confidence}.`]),
    ...playerFacingLanguageBlockers(input.contentLanguage),
  ];
  if (errors.length > 0) return { moduleText: null, errors };
  const header = ["// preview module: no production permission fingerprint", ...banner.map((line) => `// ${line}`)];
  return {
    moduleText: renderMttPreflopRangePackModule(
      normalizeMttPreflopRangePackImport(input),
      exportName,
      null,
      header,
    ),
    errors: [],
  };
}

function renderMttPreflopRangePackModule(
  pack: RangePack,
  exportName: string,
  fingerprint: string | null,
  header: readonly string[] = [],
): string {
  const runtimePack = compactMttPreflopRangePack(pack);
  const { records, ...metadata } = runtimePack;
  const encoded = encodeMttPreflopRuntime(records);
  return [
    ...(fingerprint === null ? header : [`// provenance-fingerprint: sha256:${fingerprint}`]),
    'import type { RangePack } from "./rangePack";',
    "",
    "type EncodedHandMap = Array<[actionSet: number, hands: string]>;",
    "type Refinement = Pick<RangePack[\"records\"][number], \"vsSeat\" | \"stackSetupId\" | \"provenance\">;",
    "type EncodedRecord = [position: string, bucket: number, context: string, lenient: number, strict: number, actionEvs?: RangePack[\"records\"][number][\"actionEvs\"] | null, refinement?: Refinement];",
    "",
    `const encodedActions: string[][] = ${jsonForModule(encoded.actionSets)};`,
    `const encodedHandMaps: EncodedHandMap[] = ${jsonForModule(encoded.handMaps)};`,
    `const encodedRecords: EncodedRecord[] = ${jsonForModule(encoded.records)};`,
    "",
    "function decodeHandMap(groups: EncodedHandMap): Record<string, string[]> {",
    "  const decoded: Record<string, string[]> = {};",
    "  for (const [actionSet, hands] of groups) {",
    "    for (const hand of hands.split(\",\")) decoded[hand] = [...encodedActions[actionSet]];",
    "  }",
    "  return decoded;",
    "}",
    "",
    "const decodedHandMaps = encodedHandMaps.map(decodeHandMap);",
    `export const ${exportName} = {`,
    `  ...${jsonForModule(metadata)},`,
    "  records: encodedRecords.map(([position, bucket, context, lenient, strict, actionEvs, refinement]) => ({",
    "    position,",
    "    bucket,",
    "    context,",
    "    ...(refinement ?? {}),",
    "    lenient: decodedHandMaps[lenient],",
    "    strict: decodedHandMaps[strict],",
    "    ...(actionEvs ? { actionEvs } : {}),",
    "  })),",
    "} as RangePack;",
    "",
  ].join("\n");
}

type MttPreflopRecord = RangePack["records"][number];
type EncodedMttPreflopHandMap = Array<[actionSet: number, hands: string]>;
type EncodedMttPreflopRecord = [
  position: MttPreflopRecord["position"],
  bucket: MttPreflopRecord["bucket"],
  context: MttPreflopRecord["context"],
  lenient: number,
  strict: number,
  /** `null` drží místo, když záznam EV nemá, ale nese zpřesnění za ním. */
  actionEvs?: MttPreflopRecord["actionEvs"] | null,
  refinement?: Pick<MttPreflopRecord, "vsSeat" | "stackSetupId" | "provenance">,
];

function encodeMttPreflopRuntime(records: readonly MttPreflopRecord[]): {
  actionSets: string[][];
  handMaps: EncodedMttPreflopHandMap[];
  records: EncodedMttPreflopRecord[];
} {
  const serializedActionSets = new Set<string>();
  for (const record of records) {
    for (const handMap of [record.lenient, record.strict]) {
      for (const actions of Object.values(handMap)) {
        if (actions !== undefined) serializedActionSets.add(JSON.stringify(actions));
      }
    }
  }
  const actionSetKeys = [...serializedActionSets].sort();
  const actionSets = actionSetKeys.map((key) => JSON.parse(key) as string[]);
  const actionSetIndex = new Map(actionSetKeys.map((key, index) => [key, index]));
  const handMaps: EncodedMttPreflopHandMap[] = [];
  const handMapIndexes = new Map<string, number>();

  const indexHandMap = (handMap: MttPreflopRecord["strict"]): number => {
    const encoded = encodeMttPreflopHandMap(handMap, actionSetIndex);
    const key = JSON.stringify(encoded);
    const existing = handMapIndexes.get(key);
    if (existing !== undefined) return existing;
    const index = handMaps.length;
    handMaps.push(encoded);
    handMapIndexes.set(key, index);
    return index;
  };

  return {
    actionSets,
    handMaps,
    records: records.map((record) => {
      const encoded: EncodedMttPreflopRecord = [
        record.position,
        record.bucket,
        record.context,
        indexHandMap(record.lenient),
        indexHandMap(record.strict),
      ];
      // Zpřesnění (osa otvírače) a původ záznamu musí přežít i kompaktní
      // zápis: do 16. 9. 2026 je tahle cesta tiše zahodila, takže by pack
      // s uznaným zdrojem vyšel z modulu jako pack bez něj (bod 234).
      const refinement = {
        ...(record.vsSeat ? { vsSeat: record.vsSeat } : {}),
        ...(record.stackSetupId ? { stackSetupId: record.stackSetupId } : {}),
        ...(record.provenance ? { provenance: record.provenance } : {}),
      };
      const refined = Object.keys(refinement).length > 0;
      if (record.actionEvs) encoded.push(record.actionEvs);
      else if (refined) encoded.push(null);
      if (refined) encoded.push(refinement);
      return encoded;
    }),
  };
}

function encodeMttPreflopHandMap(
  handMap: MttPreflopRecord["strict"],
  actionSetIndex: ReadonlyMap<string, number>,
): EncodedMttPreflopHandMap {
  const handsByActionSet = new Map<number, string[]>();
  for (const [hand, actions] of Object.entries(handMap)) {
    if (actions === undefined) continue;
    const index = actionSetIndex.get(JSON.stringify(actions));
    if (index === undefined) throw new Error(`Missing encoded action set for ${hand}.`);
    const hands = handsByActionSet.get(index) ?? [];
    hands.push(hand);
    handsByActionSet.set(index, hands);
  }
  return [...handsByActionSet.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, hands]) => [index, hands.sort().join(",")]);
}

function compactMttPreflopRangePack(pack: RangePack): RangePack {
  return {
    ...pack,
    records: pack.records.map((record) => {
      const strict = {} as RangePack["records"][number]["strict"];
      const lenient = {} as RangePack["records"][number]["lenient"];
      const hands = new Set([
        ...Object.keys(record.strict),
        ...Object.keys(record.lenient),
        ...Object.keys(record.actionEvs ?? {}),
      ]);
      const actionEvs = {} as NonNullable<RangePack["records"][number]["actionEvs"]>;

      for (const hand of hands) {
        const typedHand = hand as keyof typeof record.strict;
        const strictActions = record.strict[typedHand];
        const lenientActions = record.lenient[typedHand];
        const effectiveStrict = strictActions ?? ["FOLD"];
        const effectiveLenient = lenientActions ?? strictActions ?? ["FOLD"];
        const handActionEvs = record.actionEvs?.[typedHand];
        if (isFoldOnly(effectiveStrict) && isFoldOnly(effectiveLenient) && !handActionEvs) continue;
        if (strictActions !== undefined) strict[typedHand] = [...strictActions];
        if (lenientActions !== undefined) lenient[typedHand] = [...lenientActions];
        if (handActionEvs !== undefined) actionEvs[typedHand] = handActionEvs;
      }

      return {
        ...record,
        strict,
        lenient,
        ...(Object.keys(actionEvs).length > 0 ? { actionEvs } : {}),
      };
    }),
  };
}

function isFoldOnly(actions: readonly string[]): boolean {
  return actions.length === 1 && actions[0] === "FOLD";
}

function renderFlopProductionStrategyPackModule(
  pack: FlopProductionStrategyPack,
  exportName: string,
  fingerprint: string,
): string {
  return [
    `// provenance-fingerprint: sha256:${fingerprint}`,
    'import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies FlopProductionStrategyPack;`,
    "",
  ].join("\n");
}

function renderTurnProductionStrategyPackModule(
  pack: TurnProductionStrategyPack,
  exportName: string,
  fingerprint: string,
): string {
  return [
    `// provenance-fingerprint: sha256:${fingerprint}`,
    'import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies TurnProductionStrategyPack;`,
    "",
  ].join("\n");
}

function renderRiverProductionStrategyPackModule(
  pack: RiverProductionStrategyPack,
  exportName: string,
  fingerprint: string,
): string {
  return [
    `// provenance-fingerprint: sha256:${fingerprint}`,
    'import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";',
    "",
    `export const ${exportName} = ${jsonForModule(pack)} satisfies RiverProductionStrategyPack;`,
    "",
  ].join("\n");
}

function jsonForModule(value: unknown): string {
  return JSON.stringify(value);
}

function permissionFingerprint(manifest: ProductionPermissionManifest): string {
  const auditPayload = {
    packId: manifest.packId,
    version: manifest.version,
    reviewedAt: manifest.reviewedAt,
    reviewer: manifest.reviewer,
    rightsOwner: manifest.rightsOwner,
    licenseKind: manifest.licenseKind,
    allowedRedistributionScope: manifest.allowedRedistributionScope,
    evidence: manifest.evidence.map((item) => ({
      referenceId: item.referenceId,
      reviewer: item.reviewer,
      containsRangeValues: item.containsRangeValues,
    })),
    reusePolicy: manifest.reusePolicy === undefined
      ? null
      : {
        allowedDimensions: [...manifest.reusePolicy.allowedDimensions].sort(),
        reviewedAt: manifest.reusePolicy.reviewedAt,
        reviewer: manifest.reusePolicy.reviewer,
        sourceMaterialReferenceIds: [
          ...manifest.reusePolicy.sourceMaterialReferenceIds,
        ].sort(),
      },
  };
  return createHash("sha256")
    .update(JSON.stringify(auditPayload))
    .digest("hex");
}

function defaultExportName(packId: string, suffix: string): string {
  const words = packId
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word.length > 0);
  const [first = "production", ...rest] = words;
  const name = [
    first.toLowerCase(),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
    suffix,
  ].join("");

  return /^[a-zA-Z_$]/.test(name) ? name : `range${name}`;
}
