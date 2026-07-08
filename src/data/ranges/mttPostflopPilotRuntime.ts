import type {
  PostflopPositionPattern,
  PostflopStrategyInput,
  PostflopStrategyResolver,
} from "../../core/postflopGenerator";
import {
  evaluateEntitlementAccess,
  type EntitlementGrant,
} from "../../core/paymentEntitlements";
import {
  findMttPostflopPilotByScope,
  type MttPostflopPilotCatalogEntry,
} from "./mttPostflopPilotCatalog";
import type { MttPostflopPilotScope } from "./mttPostflopPilotGate";
import {
  generatedMttPostflopPilotPacks,
  type GeneratedMttPostflopPilotPackEntry,
} from "./mttPostflopPilotPacks.generated";
import { createFlopProductionStrategyResolver } from "./flopProductionStrategyResolver";

export interface MttPostflopPilotRuntimeEntry {
  catalog: MttPostflopPilotCatalogEntry;
  packEntry: GeneratedMttPostflopPilotPackEntry;
}

export interface MttPostflopPilotResolverReport {
  resolver: PostflopStrategyResolver | null;
  entry: MttPostflopPilotRuntimeEntry | null;
  allowed: boolean;
  missingEntitlements: readonly string[];
  reason: string | null;
}

export interface MttPostflopPilotAwareResolverOptions {
  grants: readonly EntitlementGrant[];
  productionResolver?: PostflopStrategyResolver | null;
  heuristicFallbackResolver?: PostflopStrategyResolver | null;
  now?: string | Date;
  allowGrace?: boolean;
}

export function mttPostflopPilotRuntimeEntries(
  packEntries: readonly GeneratedMttPostflopPilotPackEntry[] = generatedMttPostflopPilotPacks,
): readonly MttPostflopPilotRuntimeEntry[] {
  return packEntries.flatMap((packEntry) => {
    const catalog = findMttPostflopPilotByScope(packEntry.scope);
    if (catalog === null || catalog.id !== packEntry.catalogId) return [];
    return [{ catalog, packEntry }];
  });
}

export function findMttPostflopPilotRuntimeEntry(
  scope: MttPostflopPilotScope,
  packEntries: readonly GeneratedMttPostflopPilotPackEntry[] = generatedMttPostflopPilotPacks,
): MttPostflopPilotRuntimeEntry | null {
  return mttPostflopPilotRuntimeEntries(packEntries)
    .find((entry) => entry.catalog.scope === scope) ?? null;
}

export function createMttPostflopPilotResolver(
  scope: MttPostflopPilotScope,
  grants: readonly EntitlementGrant[],
  options: { now?: string | Date; allowGrace?: boolean } = {},
): MttPostflopPilotResolverReport {
  const entry = findMttPostflopPilotRuntimeEntry(scope);
  if (entry === null) {
    return {
      resolver: null,
      entry: null,
      allowed: false,
      missingEntitlements: [],
      reason: "Scoped postflop pilot pack is not available in the runtime bundle.",
    };
  }
  const access = evaluateEntitlementAccess({
    required: [entry.catalog.requiredEntitlement],
    grants,
    now: options.now,
    allowGrace: options.allowGrace,
  });
  if (!access.allowed) {
    return {
      resolver: null,
      entry,
      allowed: false,
      missingEntitlements: access.missing,
      reason: "Required postflop pilot entitlement is missing.",
    };
  }
  return {
    resolver: createFlopProductionStrategyResolver(entry.packEntry.pack),
    entry,
    allowed: true,
    missingEntitlements: [],
    reason: null,
  };
}

export function mttPostflopPilotScopeForInput(
  input: PostflopStrategyInput,
): MttPostflopPilotScope | null {
  if (input.street !== "FLOP") return null;
  const positionPattern = normalizePilotPositionPattern(input.positionPattern, input.potType);
  if (
    input.potType === "SINGLE_RAISED" &&
    positionPattern === "SRP_BTN_VS_BB" &&
    input.actionNode === "SINGLE_RAISED_POT_CBET"
  ) {
    return "BTN_vs_BB_SRP_FLOP_CBET";
  }
  if (
    input.potType === "SINGLE_RAISED" &&
    positionPattern === "SRP_UTG_VS_BB" &&
    input.actionNode === "SINGLE_RAISED_POT_CBET"
  ) {
    return "UTG_vs_BB_SRP_FLOP_CBET";
  }
  if (
    input.potType === "SINGLE_RAISED" &&
    positionPattern === "SRP_SB_VS_BB" &&
    input.actionNode === "SINGLE_RAISED_POT_CBET"
  ) {
    return "SB_vs_BB_SRP_OOP_FLOP_CBET";
  }
  if (
    input.potType === "THREE_BET_POT" &&
    positionPattern === "3BP_BTN_VS_CO" &&
    input.actionNode === "THREE_BET_POT_CBET"
  ) {
    return "BTN_vs_CO_3BP_FLOP_CBET";
  }
  if (
    input.potType === "SINGLE_RAISED" &&
    positionPattern === "SRP_BTN_VS_BB" &&
    input.actionNode === "FLOP_FACING_BET"
  ) {
    return "BTN_vs_BB_SRP_FLOP_FACING_BET";
  }
  if (
    input.potType === "THREE_BET_POT" &&
    positionPattern === "3BP_BTN_VS_CO" &&
    input.actionNode === "FLOP_FACING_BET"
  ) {
    return "BTN_vs_CO_3BP_FLOP_FACING_BET";
  }
  return null;
}

export function normalizePilotPositionPattern(
  positionPattern: PostflopPositionPattern,
  potType: PostflopStrategyInput["potType"],
): PostflopPositionPattern {
  if (potType !== "SINGLE_RAISED") return positionPattern;
  if (positionPattern === "BTN_VS_BB") return "SRP_BTN_VS_BB";
  if (positionPattern === "SB_VS_BB") return "SRP_SB_VS_BB";
  return positionPattern;
}

export function normalizePilotStrategyInput(
  input: PostflopStrategyInput,
): PostflopStrategyInput {
  const positionPattern = normalizePilotPositionPattern(input.positionPattern, input.potType);
  return positionPattern === input.positionPattern
    ? input
    : { ...input, positionPattern };
}

export function createMttPostflopPilotResolverForInput(
  input: PostflopStrategyInput,
  grants: readonly EntitlementGrant[],
  options: { now?: string | Date; allowGrace?: boolean } = {},
): MttPostflopPilotResolverReport {
  const scope = mttPostflopPilotScopeForInput(input);
  if (scope === null) {
    return {
      resolver: null,
      entry: null,
      allowed: false,
      missingEntitlements: [],
      reason: "No scoped postflop pilot matches this strategy input.",
    };
  }
  const report = createMttPostflopPilotResolver(scope, grants, options);
  if (report.resolver === null) return report;
  const resolver = report.resolver;
  return {
    ...report,
    resolver: (nextInput) => resolver(normalizePilotStrategyInput(nextInput)),
  };
}

export function createMttPostflopPilotAwareResolver(
  options: MttPostflopPilotAwareResolverOptions,
): PostflopStrategyResolver {
  return (input) => {
    const production = options.productionResolver?.(input) ?? null;
    if (production !== null) return production;

    const pilotReport = createMttPostflopPilotResolverForInput(input, options.grants, {
      now: options.now,
      allowGrace: options.allowGrace,
    });
    const pilot = pilotReport.resolver?.(input) ?? null;
    if (pilot !== null) return pilot;

    return options.heuristicFallbackResolver?.(input) ?? null;
  };
}
