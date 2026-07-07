import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import {
  buildMttPostflopPilotAccessReport,
  findMttPostflopPilotByScope,
  MTT_POSTFLOP_PILOT_CATALOG,
  readyMttPostflopPilots,
  requiredEntitlementsForMttPostflopPilotScopes,
  validateMttPostflopPilotCatalog,
} from "../../src/data/ranges/mttPostflopPilotCatalog";

describe("MTT postflop pilot catalog", () => {
  it("drzi vsechny READY piloty oddelene od full production", () => {
    expect(validateMttPostflopPilotCatalog()).toEqual([]);
    expect(readyMttPostflopPilots()).toHaveLength(5);
    expect(MTT_POSTFLOP_PILOT_CATALOG.every((entry) => entry.fullProductionReady === false))
      .toBe(true);
  });

  it("mapuje kazdy pilot scope na explicitni placeny entitlement", () => {
    expect(requiredEntitlementsForMttPostflopPilotScopes([
      "BTN_vs_BB_SRP_FLOP_CBET",
      "UTG_vs_BB_SRP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_FACING_BET",
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
    ])).toEqual([
      "mtt.postflop.flop.3bp_btn_co.cbet.pilot",
      "mtt.postflop.flop.3bp_btn_co.facing_bet.pilot",
      "mtt.postflop.flop.srp_btn_bb.cbet.pilot",
      "mtt.postflop.flop.srp_btn_bb.facing_bet.pilot",
      "mtt.postflop.flop.srp_utg_bb.cbet.pilot",
    ]);
  });

  it("povoli PRO_PLUS pristup k BTN vs BB SRP facing-bet pilotu", () => {
    const report = buildMttPostflopPilotAccessReport(
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-07T00:00:00.000Z" },
    );

    expect(report.pilot?.id).toBe("btn-bb-srp-flop-facing-bet-low-mid-high");
    expect(report.access.allowed).toBe(true);
  });

  it("zamkne pilot pro FREE tier a vrati chybejici entitlement", () => {
    const report = buildMttPostflopPilotAccessReport(
      "UTG_vs_BB_SRP_FLOP_CBET",
      grantsForTier("FREE", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-07T00:00:00.000Z" },
    );

    expect(findMttPostflopPilotByScope("UTG_vs_BB_SRP_FLOP_CBET")?.requiredEntitlement)
      .toBe("mtt.postflop.flop.srp_utg_bb.cbet.pilot");
    expect(report.access.allowed).toBe(false);
    expect(report.access.missing).toEqual(["mtt.postflop.flop.srp_utg_bb.cbet.pilot"]);
  });
});
