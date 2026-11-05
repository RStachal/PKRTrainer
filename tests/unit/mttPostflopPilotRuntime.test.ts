import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import {
  createMttPostflopPilotAwareResolver,
  createMttPostflopPilotResolverForInput,
  createMttPostflopPilotResolver,
  findMttPostflopPilotRuntimeEntry,
  mttPostflopPilotScopeForInput,
  mttPostflopPilotRuntimeEntries,
  normalizePilotPositionPattern,
  normalizePilotStrategyInput,
} from "../../src/data/ranges/mttPostflopPilotRuntime";

describe("MTT postflop pilot runtime", () => {
  it("exposes all generated scoped pilot packs without registering them as production", () => {
    const entries = mttPostflopPilotRuntimeEntries();

    expect(entries).toHaveLength(7);
    expect(entries.map((entry) => entry.catalog.fullProductionReady)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(findMttPostflopPilotRuntimeEntry("BTN_vs_BB_SRP_FLOP_FACING_BET")?.catalog.rangeBuckets)
      .toBe(174);
    expect(findMttPostflopPilotRuntimeEntry("CO_vs_BB_SRP_FLOP_CBET")?.catalog.rangeBuckets)
      .toBe(162);
  });

  // Od rozhodnutí vlastníka 9a (22. 9. 2026) nese šest pilotů `LOW`, protože je
  // čtenář 14. 9. odmítl, a resolver na `LOW` pack neodpovídá. Testy níž proto
  // rozlišují dva stavy: pilot, který odpovídá, odpovídá **strategií**, a pilot,
  // který mlčí, mlčí **úplně** - heuristika se pod hlavičku pilota nedostane.
  it("starts every scoped pilot through an entitled resolver: strategy from an accepted pilot, silence from a rejected one", () => {
    const grants = grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" });
    const entries = mttPostflopPilotRuntimeEntries();

    expect(entries).toHaveLength(7);
    let answering = 0;
    let silent = 0;
    for (const entry of entries) {
      const report = createMttPostflopPilotResolver(entry.catalog.scope, grants, {
        now: "2026-07-10T00:00:00.000Z",
      });
      const rule = entry.packEntry.pack.rules[0];
      expect(rule, entry.catalog.scope).toBeDefined();
      expect(report.allowed, entry.catalog.scope).toBe(true);
      expect(report.resolver, entry.catalog.scope).not.toBeNull();

      const recommendation = report.resolver?.({
        street: "FLOP",
        textures: rule.boardTextures,
        potType: rule.potType,
        potBB: 10,
        effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * 10,
        positionPattern: rule.positionPattern,
        actionNode: rule.actionNode,
      });
      if (entry.packEntry.pack.confidence === "LOW") {
        expect(recommendation ?? null, `${entry.catalog.scope} (LOW)`).toBeNull();
        silent += 1;
        continue;
      }
      expect(recommendation?.source?.kind, entry.catalog.scope).toBe("STRATEGY_PACK");
      answering += 1;
    }
    // Stráž na stráži: kdyby přestaly odpovídat všechny, test by prošel prázdný.
    expect(answering).toBeGreaterThan(0);
    expect(answering + silent).toBe(entries.length);
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
    // Přijatý pilot (UTG vs BB): jediný, který po rozhodnutí 9a odpovídá.
    const report = createMttPostflopPilotResolver(
      "UTG_vs_BB_SRP_FLOP_CBET",
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

  it("maps SB vs BB OOP c-bet to explicit paid scoped pilot runtime", () => {
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
    const inputReport = createMttPostflopPilotResolverForInput(
      input,
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-08T00:00:00.000Z" },
    );

    expect(mttPostflopPilotScopeForInput(input)).toBe("SB_vs_BB_SRP_OOP_FLOP_CBET");
    expect(directScopeReport.allowed).toBe(true);
    expect(directScopeReport.entry?.catalog.fullProductionReady).toBe(false);
    expect(inputReport.allowed).toBe(true);
    expect(inputReport.entry?.catalog.id).toBe("sb-bb-srp-oop-flop-cbet-low-mid-high");
  });

  it("maps CO vs BB SRP c-bet to explicit paid scoped pilot runtime", () => {
    const input = {
      street: "FLOP",
      textures: ["ace-high", "dry", "rainbow", "disconnected"],
      potType: "SINGLE_RAISED",
      potBB: 50,
      effectiveStackBB: 125,
      positionPattern: "SRP_CO_VS_BB",
      actionNode: "SINGLE_RAISED_POT_CBET",
    } as const;
    const report = createMttPostflopPilotResolverForInput(
      input,
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-08T00:00:00.000Z" },
    );

    expect(mttPostflopPilotScopeForInput(input)).toBe("CO_vs_BB_SRP_FLOP_CBET");
    expect(report.allowed).toBe(true);
    expect(report.entry?.catalog.id).toBe("co-bb-srp-flop-cbet-low-mid-high");
  });

  it("normalizuje legacy UI position patterny pro BTN/SB SRP scoped piloty", () => {
    const legacySbInput = {
      street: "FLOP",
      textures: ["ace-high", "dry", "rainbow", "disconnected"],
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 25,
      positionPattern: "SB_VS_BB",
      actionNode: "SINGLE_RAISED_POT_CBET",
    } as const;
    const legacyBtnInput = {
      ...legacySbInput,
      positionPattern: "BTN_VS_BB",
    } as const;

    expect(normalizePilotPositionPattern("SB_VS_BB", "SINGLE_RAISED")).toBe("SRP_SB_VS_BB");
    expect(normalizePilotStrategyInput(legacySbInput).positionPattern).toBe("SRP_SB_VS_BB");
    expect(mttPostflopPilotScopeForInput(legacySbInput)).toBe("SB_vs_BB_SRP_OOP_FLOP_CBET");
    expect(mttPostflopPilotScopeForInput(legacyBtnInput)).toBe("BTN_vs_BB_SRP_FLOP_CBET");
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
    // Přijatý pilot: ten odmítnutý (LOW) mlčí a fallback by vyhrál právem, takže
    // by se tu netestovalo pořadí, ale ticho.
    const input = acceptedPilotInput();
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

/**
 * Vstup, který trefí jediný pilot, co po rozhodnutí 9a odpovídá (UTG vs BB).
 *
 * Bere se z prvního pravidla jeho packu, aby test nezkameněl na hodnotách
 * opsaných do testu - přesolvení pilota tím projde, změna rozsahu ne.
 */
function acceptedPilotInput() {
  const rule = findMttPostflopPilotRuntimeEntry("UTG_vs_BB_SRP_FLOP_CBET")?.packEntry.pack.rules[0];
  if (rule === undefined) throw new Error("UTG vs BB pilot pack has no rules.");
  return {
    street: "FLOP",
    textures: rule.boardTextures,
    potType: rule.potType,
    potBB: 50,
    effectiveStackBB: ((rule.sprMin + rule.sprMax) / 2) * 50,
    positionPattern: rule.positionPattern,
    actionNode: rule.actionNode,
  } as const;
}

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
