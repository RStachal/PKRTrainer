import type { PostflopStrategyInput } from "../../core/postflopGenerator";
import { grantsForTier } from "../../core/paymentEntitlements";
import { buildMttLearningPathCatalogReport } from "./mttScenarioCatalog";
import {
  createMttPostflopPilotResolverForInput,
  mttPostflopPilotRuntimeEntries,
  mttPostflopPilotScopeForInput,
} from "./mttPostflopPilotRuntime";

export type MttVariantQaStatus = "PASS" | "FAIL";

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
    failed: number;
    errors: number;
  };
  runtimeSmokes: readonly MttVariantQaRuntimeSmokeRow[];
  errors: readonly string[];
}

export function buildMttVariantQaReport(): MttVariantQaReport {
  const scenarioReport = buildMttLearningPathCatalogReport();
  const scenario = scenarioReport.rows.find((row) => (
    row.id === "mtt-9max-regular-chip-ev-flop-pilots"
  ));
  const runtimeSmokes = mttPostflopPilotRuntimeEntries().map(buildRuntimeSmokeRow);
  const errors = [
    ...(scenario === undefined ? ["Missing MTT flop pilot lab scenario row."] : []),
    ...(scenario !== undefined && scenario.status !== "PREVIEW"
      ? [`MTT flop pilot lab scenario must be PREVIEW, got ${scenario.status}.`]
      : []),
    ...runtimeSmokes.flatMap((row) => row.errors.map((error) => `${row.catalogId}: ${error}`)),
  ];

  return {
    valid: errors.length === 0,
    releaseTrain: "mtt-9max-regular-chip-ev-flop-pilots",
    scenarioStatus: scenario?.status ?? null,
    counts: {
      runtimeSmokes: runtimeSmokes.length,
      passed: runtimeSmokes.filter((row) => row.status === "PASS").length,
      failed: runtimeSmokes.filter((row) => row.status === "FAIL").length,
      errors: errors.length,
    },
    runtimeSmokes,
    errors,
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
  const errors = [
    ...(mappedScope !== entry.catalog.scope
      ? [`Runtime input mapped to ${mappedScope ?? "null"} instead of ${entry.catalog.scope}.`]
      : []),
    ...(freeReport.allowed ? ["FREE tier unexpectedly allowed scoped pilot."] : []),
    ...(!proPlusReport.allowed ? ["PRO_PLUS tier did not unlock scoped pilot."] : []),
    ...(recommendationKind !== "STRATEGY_PACK"
      ? [`Resolver returned ${recommendationKind ?? "null"} instead of STRATEGY_PACK.`]
      : []),
    ...(entry.catalog.fullProductionReady ? ["Scoped pilot must not be marked fullProductionReady."] : []),
  ];

  return {
    catalogId: entry.catalog.id,
    scope: entry.catalog.scope,
    status: errors.length === 0 ? "PASS" : "FAIL",
    input,
    mappedScope,
    freeLocked: !freeReport.allowed,
    proPlusAllowed: proPlusReport.allowed,
    recommendationKind,
    fullProductionReady: entry.catalog.fullProductionReady,
    errors,
  };
}
