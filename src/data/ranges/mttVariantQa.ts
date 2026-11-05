import type { PostflopStrategyInput } from "../../core/postflopGenerator";
import { grantsForTier } from "../../core/paymentEntitlements";
import { buildMttLearningPathCatalogReport } from "./mttScenarioCatalog";
import {
  createMttPostflopPilotResolverForInput,
  findMttPostflopPilotRuntimeEntry,
  mttPostflopPilotRuntimeEntries,
  mttPostflopPilotScopeForInput,
} from "./mttPostflopPilotRuntime";
import { buildMttPostflopTrainingRuntime } from "./mttPostflopTrainingRuntime";

/**
 * `SILENT` je třetí stav, protože mlčení má dva různé důvody a brána je nesmí
 * slévat.
 *
 * Pilot, jehož obsah čtenář odmítl (rozhodnutí vlastníka 9a, 22. 9. 2026), nese
 * `LOW` a resolver na něj úmyslně neodpovídá - dokud se nepřesolví a nepřečte.
 * To není rozbitá brána, to je zvolený stav. Pilot, který mlčí z jiného důvodu,
 * rozbitá brána je. A pilot s `LOW`, který **odpoví**, je nejhorší z obojího:
 * obsah, o kterém čtenář řekl „nesedí", by šel k hráči.
 */
export type MttVariantQaStatus = "PASS" | "FAIL" | "SILENT";

export interface MttVariantQaRuntimeSmokeRow {
  catalogId: string;
  scope: string;
  status: MttVariantQaStatus;
  input: PostflopStrategyInput;
  mappedScope: string | null;
  freeLocked: boolean;
  proPlusAllowed: boolean;
  recommendationKind: string | null;
  fullProductionReady: boolean;
  errors: readonly string[];
}

export interface MttVariantQaReport {
  valid: boolean;
  releaseTrain: "mtt-9max-regular-chip-ev-flop-pilots";
  scenarioStatus: string | null;
  counts: {
    runtimeSmokes: number;
    passed: number;
    /** Piloty, které mlčí záměrně (LOW po odmítnutí čtenářem). */
    silent: number;
    failed: number;
    errors: number;
  };
  runtimeSmokes: readonly MttVariantQaRuntimeSmokeRow[];
  trainingRuntime: {
    mode: string;
    allowFallback: boolean;
    proPlusPilotResolver: boolean;
    freeLocked: boolean;
    legacySbInputRecommendationKind: string | null;
  };
  errors: readonly string[];
}

export function buildMttVariantQaReport(): MttVariantQaReport {
  const scenarioReport = buildMttLearningPathCatalogReport();
  const scenario = scenarioReport.rows.find((row) => (
    row.id === "mtt-9max-regular-chip-ev-flop-pilots"
  ));
  const runtimeSmokes = mttPostflopPilotRuntimeEntries().map(buildRuntimeSmokeRow);
  const proPlusTrainingRuntime = buildMttPostflopTrainingRuntime({
    profile: scenario?.profile ?? MTT_FLOP_PILOT_PROFILE,
    grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
    now: "2026-07-08T12:00:00.000Z",
  });
  const freeTrainingRuntime = buildMttPostflopTrainingRuntime({
    profile: scenario?.profile ?? MTT_FLOP_PILOT_PROFILE,
    grants: grantsForTier("FREE", { startsAt: "2026-07-08T00:00:00.000Z" }),
    now: "2026-07-08T12:00:00.000Z",
  });
  // Starší zápis pozice z UI (`SB_VS_BB` místo `SRP_SB_VS_BB`) musí pořád
  // trefit tentýž pilot; tahle kontrola chytá regresi v normalizaci. Od
  // rozhodnutí 9a je ale pilot SB vs BB `LOW` a mlčí, takže se hlídá **mapování**
  // a k tomu, že odpověď sedí na stav packu: ticho u LOW, strategie jinak.
  const legacySbInput = legacySbCbetInput();
  const legacySbInputScope = legacySbInput === null
    ? null
    : mttPostflopPilotScopeForInput(legacySbInput);
  const legacySbPackConfidence = findMttPostflopPilotRuntimeEntry("SB_vs_BB_SRP_OOP_FLOP_CBET")
    ?.packEntry.pack.confidence ?? null;
  const legacySbInputRecommendationKind = legacySbInput === null
    ? null
    : proPlusTrainingRuntime.resolver?.(legacySbInput)?.source?.kind ?? null;
  const errors = [
    ...(scenario === undefined ? ["Missing MTT flop pilot lab scenario row."] : []),
    ...(scenario !== undefined && scenario.status !== "PREVIEW"
      ? [`MTT flop pilot lab scenario must be PREVIEW, got ${scenario.status}.`]
      : []),
    ...runtimeSmokes.flatMap((row) => row.errors.map((error) => `${row.catalogId}: ${error}`)),
    ...(proPlusTrainingRuntime.mode !== "SCOPED_PILOT"
      ? [`Training runtime should expose SCOPED_PILOT mode, got ${proPlusTrainingRuntime.mode}.`]
      : []),
    ...(proPlusTrainingRuntime.allowFallback
      ? ["Scoped pilot training runtime must not allow heuristic fallback."]
      : []),
    ...(proPlusTrainingRuntime.resolver === null
      ? ["Scoped pilot training runtime did not provide a resolver for PRO_PLUS."]
      : []),
    ...(freeTrainingRuntime.mode !== "LOCKED_PILOT"
      ? [`FREE training runtime should be LOCKED_PILOT, got ${freeTrainingRuntime.mode}.`]
      : []),
    ...(legacySbInputScope !== "SB_vs_BB_SRP_OOP_FLOP_CBET"
      ? [`Legacy SB vs BB UI input mapped to ${legacySbInputScope ?? "null"} instead of SB_vs_BB_SRP_OOP_FLOP_CBET.`]
      : []),
    ...(legacySbPackConfidence === "LOW"
      ? (legacySbInputRecommendationKind === null
        ? []
        : [`Legacy SB vs BB UI input returned ${legacySbInputRecommendationKind}; the LOW pilot must stay silent.`])
      : legacySbInputRecommendationKind !== "STRATEGY_PACK"
        ? [`Legacy SB vs BB UI input returned ${legacySbInputRecommendationKind ?? "null"} instead of STRATEGY_PACK.`]
        : []),
  ];

  return {
    valid: errors.length === 0,
    releaseTrain: "mtt-9max-regular-chip-ev-flop-pilots",
    scenarioStatus: scenario?.status ?? null,
    counts: {
      runtimeSmokes: runtimeSmokes.length,
      passed: runtimeSmokes.filter((row) => row.status === "PASS").length,
      silent: runtimeSmokes.filter((row) => row.status === "SILENT").length,
      failed: runtimeSmokes.filter((row) => row.status === "FAIL").length,
      errors: errors.length,
    },
    runtimeSmokes,
    trainingRuntime: {
      mode: proPlusTrainingRuntime.mode,
      allowFallback: proPlusTrainingRuntime.allowFallback,
      proPlusPilotResolver: proPlusTrainingRuntime.resolver !== null,
      freeLocked: freeTrainingRuntime.mode === "LOCKED_PILOT",
      legacySbInputRecommendationKind,
    },
    errors,
  };
}

const MTT_FLOP_PILOT_PROFILE = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
} as const;

function legacySbCbetInput(): PostflopStrategyInput | null {
  const rule = findMttPostflopPilotRuntimeEntry("SB_vs_BB_SRP_OOP_FLOP_CBET")
    ?.packEntry.pack.rules[0];
  if (!rule) return null;
  return {
    street: "FLOP",
    textures: rule.boardTextures,
    potType: rule.potType,
    potBB: 6,
    effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * 6,
    positionPattern: "SB_VS_BB",
    actionNode: rule.actionNode,
  };
}

function buildRuntimeSmokeRow(
  entry: ReturnType<typeof mttPostflopPilotRuntimeEntries>[number],
): MttVariantQaRuntimeSmokeRow {
  const rule = entry.packEntry.pack.rules[0];
  const input: PostflopStrategyInput = {
    street: "FLOP",
    textures: rule.boardTextures,
    potType: rule.potType,
    potBB: 50,
    effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * 50,
    positionPattern: rule.positionPattern,
    actionNode: rule.actionNode,
  };
  const mappedScope = mttPostflopPilotScopeForInput(input);
  const freeReport = createMttPostflopPilotResolverForInput(
    input,
    grantsForTier("FREE", { startsAt: "2026-07-08T00:00:00.000Z" }),
    { now: "2026-07-08T12:00:00.000Z" },
  );
  const proPlusReport = createMttPostflopPilotResolverForInput(
    input,
    grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
    { now: "2026-07-08T12:00:00.000Z" },
  );
  const recommendation = proPlusReport.resolver?.(input) ?? null;
  const recommendationKind = recommendation?.source?.kind ?? null;
  // Pilot odmítnutý čtenářem mlčí záměrně: jeho pack nese LOW a resolver na
  // `LOW` neodpovídá. Od něj se tedy nečeká odpověď, ale ticho - a kdyby
  // odpověděl, je to chyba v tom horším směru.
  const silentByDesign = entry.packEntry.pack.confidence === "LOW";
  const errors = [
    ...(mappedScope !== entry.catalog.scope
      ? [`Runtime input mapped to ${mappedScope ?? "null"} instead of ${entry.catalog.scope}.`]
      : []),
    ...(freeReport.allowed ? ["FREE tier unexpectedly allowed scoped pilot."] : []),
    ...(!proPlusReport.allowed ? ["PRO_PLUS tier did not unlock scoped pilot."] : []),
    ...(silentByDesign
      ? (recommendation !== null
        ? [`LOW pilot answered with ${recommendationKind ?? "unknown"}; content the reader rejected must stay silent.`]
        : [])
      : (recommendationKind !== "STRATEGY_PACK"
        ? [`Resolver returned ${recommendationKind ?? "null"} instead of STRATEGY_PACK.`]
        : [])),
    ...(entry.catalog.fullProductionReady ? ["Scoped pilot must not be marked fullProductionReady."] : []),
  ];

  return {
    catalogId: entry.catalog.id,
    scope: entry.catalog.scope,
    status: errors.length > 0 ? "FAIL" : silentByDesign ? "SILENT" : "PASS",
    input,
    mappedScope,
    freeLocked: !freeReport.allowed,
    proPlusAllowed: proPlusReport.allowed,
    recommendationKind,
    fullProductionReady: entry.catalog.fullProductionReady,
    errors,
  };
}
