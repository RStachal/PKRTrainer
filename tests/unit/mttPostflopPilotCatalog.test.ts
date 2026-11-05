import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(MTT_POSTFLOP_PILOT_CATALOG).toHaveLength(7);
    expect(readyMttPostflopPilots()).toHaveLength(7);
    expect(MTT_POSTFLOP_PILOT_CATALOG.every((entry) => entry.fullProductionReady === false))
      .toBe(true);
  });

  it("mapuje kazdy pilot scope na explicitni placeny entitlement", () => {
    expect(requiredEntitlementsForMttPostflopPilotScopes([
      "BTN_vs_BB_SRP_FLOP_CBET",
      "UTG_vs_BB_SRP_FLOP_CBET",
      "CO_vs_BB_SRP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_CBET",
      "SB_vs_BB_SRP_OOP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_FACING_BET",
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
    ])).toEqual([
      "mtt.postflop.flop.3bp_btn_co.cbet.pilot",
      "mtt.postflop.flop.3bp_btn_co.facing_bet.pilot",
      "mtt.postflop.flop.srp_btn_bb.cbet.pilot",
      "mtt.postflop.flop.srp_btn_bb.facing_bet.pilot",
      "mtt.postflop.flop.srp_co_bb.cbet.pilot",
      "mtt.postflop.flop.srp_sb_bb_oop.cbet.pilot",
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

  it("povoli PRO_PLUS pristup k SB vs BB OOP c-bet scoped pilotu", () => {
    const pilot = findMttPostflopPilotByScope("SB_vs_BB_SRP_OOP_FLOP_CBET");
    const report = buildMttPostflopPilotAccessReport(
      "SB_vs_BB_SRP_OOP_FLOP_CBET",
      grantsForTier("PRO_PLUS", { startsAt: "2026-07-01T00:00:00.000Z" }),
      { now: "2026-07-08T00:00:00.000Z" },
    );

    expect(pilot?.status).toBe("READY");
    expect(pilot?.requiredEntitlement).toBe("mtt.postflop.flop.srp_sb_bb_oop.cbet.pilot");
    expect(readyMttPostflopPilots().map((entry) => entry.scope)).toContain("SB_vs_BB_SRP_OOP_FLOP_CBET");
    expect(report.access.allowed).toBe(true);
    expect(report.access.missing).toEqual([]);
  });

  it("CLI umi zapsat source-free katalog report do artefaktu", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkrtrainer-pilot-catalog-"));
    try {
      const output = join(dir, "report.json");
      const result = spawnSync(process.execPath, [
        "scripts/run-cli.mjs",
        "scripts/checkMttPostflopPilotCatalog.mts",
        "--output",
        "--summary",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("MTT postflop pilot catalog");

      const explicit = spawnSync(process.execPath, [
        "scripts/run-cli.mjs",
        "scripts/checkMttPostflopPilotCatalog.mts",
        `--output=${output}`,
        "--json",
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(explicit.status).toBe(0);
      expect(explicit.stderr).toBe("");
      expect(existsSync(output)).toBe(true);
      const report = JSON.parse(readFileSync(output, "utf8")) as {
        valid: boolean;
        ready: number;
        requiredEntitlements: string[];
      };
      expect(report.valid).toBe(true);
      expect(report.ready).toBe(7);
      expect(report.requiredEntitlements).toContain("mtt.postflop.flop.srp_btn_bb.facing_bet.pilot");
      expect(report.requiredEntitlements).toContain("mtt.postflop.flop.srp_co_bb.cbet.pilot");
      expect(report.requiredEntitlements).toContain("mtt.postflop.flop.srp_sb_bb_oop.cbet.pilot");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
