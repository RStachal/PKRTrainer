import type { PostflopStrategyInput, PostflopStrategyResolver } from "../../core/postflopGenerator";
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
  if (
    input.potType === "SINGLE_RAISED" &&
    input.positionPattern === "SRP_BTN_VS_BB" &&
    input.actionNode === "SINGLE_RAISED_POT_CBET"
  ) {
    return "BTN_vs_BB_SRP_FLOP_CBET";
  }
  if (
    input.potType === "SINGLE_RAISED" &&
    input.positionPattern === "SRP_UTG_VS_BB" &&
    input.actionNode === "SINGLE_RAISED_POT_CBET"
  ) {
    return "UTG_vs_BB_SRP_FLOP_CBET";
  }
  if (
    input.potType === "THREE_BET_POT" &&
    input.positionPattern === "3BP_BTN_VS_CO" &&
    input.actionNode === "THREE_BET_POT_CBET"
  ) {
    return "BTN_vs_CO_3BP_FLOP_CBET";
  }
  if (
    input.potType === "SINGLE_RAISED" &&
    input.positionPattern === "SRP_BTN_VS_BB" &&
    input.actionNode === "FLOP_FACING_BET"
  ) {
    return "BTN_vs_BB_SRP_FLOP_FACING_BET";
  }
  if (
    input.potType === "THREE_BET_POT" &&
    input.positionPattern === "3BP_BTN_VS_CO" &&
    input.actionNode === "FLOP_FACING_BET"
  ) {
    return "BTN_vs_CO_3BP_FLOP_FACING_BET";
  }
  return null;
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
  return createMttPostflopPilotResolver(scope, grants, options);
}
