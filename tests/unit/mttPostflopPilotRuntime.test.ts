import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import {
  createMttPostflopPilotAwareResolver,
  createMttPostflopPilotResolverForInput,
  createMttPostflopPilotResolver,
  findMttPostflopPilotRuntimeEntry,
  mttPostflopPilotScopeForInput,
  mttPostflopPilotRuntimeEntries,
} from "../../src/data/ranges/mttPostflopPilotRuntime";

describe("MTT postflop pilot runtime", () => {
  it("exposes all generated scoped pilot packs without registering them as production", () => {
    const entries = mttPostflopPilotRuntimeEntries();

    expect(entries).toHaveLength(5);
    expect(entries.map((entry) => entry.catalog.fullProductionReady)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(findMttPostflopPilotRuntimeEntry("BTN_vs_BB_SRP_FLOP_FACING_BET")?.catalog.rangeBuckets)
      .toBe(174);
  });

  it("requires paid pilot entitlement before creating a resolver", () => {
    const report = createMttPostflopPilotResolver(
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
      grantsForTier("FREE", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-07T00:00:00.000Z" },
    );

    expect(report.allowed).toBe(false);
    expect(report.resolver).toBeNull();
    expect(report.missingEntitlements).toEqual(["mtt.postflop.flop.srp_btn_bb.facing_bet.pilot"]);
  });

  it("creates a scoped resolver for entitled PRO_PLUS users", () => {
    const report = createMttPostflopPilotResolver(
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-07T00:00:00.000Z" },
    );
    const rule = report.entry?.packEntry.pack.rules[0];

    expect(report.allowed).toBe(true);
    expect(report.resolver).not.toBeNull();
    expect(rule).toBeDefined();
    const recommendation = report.resolver?.({
      street: "FLOP",
      textures: rule!.boardTextures,
      potType: rule!.potType,
      potBB: 50,
      effectiveStackBB: (rule!.sprMin + rule!.sprMax) / 2 * 50,
      positionPattern: rule!.positionPattern,
      actionNode: rule!.actionNode,
    });

    expect(recommendation?.source?.kind).toBe("STRATEGY_PACK");
    if (recommendation?.source?.kind !== "STRATEGY_PACK") {
      throw new Error("Expected strategy-pack pilot recommendation.");
    }
    expect(recommendation.source.ruleId).toBe(rule!.id);
    expect(recommendation.source.rangeBuckets?.length).toBe(rule!.rangeBuckets.length);
  });

  it("maps supported strategy input to scoped pilot resolver", () => {
    const input = {
      street: "FLOP",
      textures: ["ace-high", "dry", "rainbow", "disconnected"],
      potType: "SINGLE_RAISED",
      potBB: 50,
      effectiveStackBB: 125,
      positionPattern: "SRP_BTN_VS_BB",
      actionNode: "FLOP_FACING_BET",
    } as const;
    const report = createMttPostflopPilotResolverForInput(
      input,
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-07T00:00:00.000Z" },
    );

    expect(mttPostflopPilotScopeForInput(input)).toBe("BTN_vs_BB_SRP_FLOP_FACING_BET");
    expect(report.allowed).toBe(true);
    expect(report.entry?.catalog.id).toBe("btn-bb-srp-flop-facing-bet-low-mid-high");
  });

  it("does not fallback when no scoped pilot matches the input", () => {
    const input = {
      street: "FLOP",
      textures: ["dry"],
      potType: "SINGLE_RAISED",
      potBB: 50,
      effectiveStackBB: 125,
      positionPattern: "SRP_HJ_VS_BB",
      actionNode: "SINGLE_RAISED_POT_CBET",
    } as const;
    const report = createMttPostflopPilotResolverForInput(
      input,
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-07T00:00:00.000Z" },
    );

    expect(mttPostflopPilotScopeForInput(input)).toBeNull();
    expect(report.allowed).toBe(false);
    expect(report.resolver).toBeNull();
    expect(report.reason).toContain("No scoped postflop pilot matches");
  });

  it("keeps SB vs BB OOP c-bet candidate out of runtime until explicitly cataloged", () => {
    const input = {
      street: "FLOP",
      textures: ["ace-high", "dry", "rainbow", "disconnected"],
      potType: "SINGLE_RAISED",
      potBB: 50,
      effectiveStackBB: 125,
      positionPattern: "SRP_SB_VS_BB",
      actionNode: "SINGLE_RAISED_POT_CBET",
    } as const;
    const directScopeReport = createMttPostflopPilotResolver(
      "SB_vs_BB_SRP_OOP_FLOP_CBET",
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-08T00:00:00.000Z" },
    );

    expect(mttPostflopPilotScopeForInput(input)).toBeNull();
    expect(createMttPostflopPilotResolverForInput(
      input,
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-08T00:00:00.000Z" },
    ).reason).toContain("No scoped postflop pilot matches");
    expect(directScopeReport.allowed).toBe(false);
    expect(directScopeReport.resolver).toBeNull();
    expect(directScopeReport.reason).toContain("not available in the runtime bundle");
  });

  it("pilot-aware resolver prefers production before entitled pilot", () => {
    const input = supportedFacingBetInput();
    const resolver = createMttPostflopPilotAwareResolver({
      grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      now: "2026-07-07T00:00:00.000Z",
      productionResolver: () => ({
        action: "CALL",
        explanation: "Production has priority.",
      }),
    });

    expect(resolver(input)).toEqual({
      action: "CALL",
      explanation: "Production has priority.",
    });
  });

  it("pilot-aware resolver uses entitled pilot before heuristic fallback", () => {
    const input = supportedFacingBetInput();
    const resolver = createMttPostflopPilotAwareResolver({
      grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      now: "2026-07-07T00:00:00.000Z",
      heuristicFallbackResolver: () => ({
        action: "CHECK",
        explanation: "Fallback should not win over pilot.",
      }),
    });

    const recommendation = resolver(input);
    expect(recommendation?.source?.kind).toBe("STRATEGY_PACK");
    expect(recommendation?.explanation).not.toBe("Fallback should not win over pilot.");
  });

  it("pilot-aware resolver falls back only when entitlement is missing", () => {
    const input = supportedFacingBetInput();
    const resolver = createMttPostflopPilotAwareResolver({
      grants: grantsForTier("FREE", { startsAt: "2026-07-01T00:00:00.000Z" }),
      now: "2026-07-07T00:00:00.000Z",
      heuristicFallbackResolver: () => ({
        action: "CHECK",
        explanation: "Fallback after locked pilot.",
      }),
    });

    expect(resolver(input)).toEqual({
      action: "CHECK",
      explanation: "Fallback after locked pilot.",
    });
  });
});

function supportedFacingBetInput() {
  return {
    street: "FLOP",
    textures: ["ace-high", "dry", "rainbow", "disconnected"],
    potType: "SINGLE_RAISED",
    potBB: 50,
    effectiveStackBB: 125,
    positionPattern: "SRP_BTN_VS_BB",
    actionNode: "FLOP_FACING_BET",
  } as const;
}
