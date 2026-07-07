import { describe, expect, it } from "vitest";

import {
  evaluateEntitlementAccess,
  evaluateOfflineLicenseAccess,
  grantsForTier,
  type SignedOfflineLicensePayload,
} from "../../src/core/paymentEntitlements";

describe("payment entitlements", () => {
  it("povoli obsah, pokud tier obsahuje pozadovany entitlement", () => {
    const grants = grantsForTier("PRO_PLUS", {
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-01T00:00:00.000Z",
    });

    const report = evaluateEntitlementAccess({
      required: ["mtt.postflop.flop.srp_btn_bb.facing_bet.pilot", "export.cross_check"],
      grants,
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(report.allowed).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("zamkne placeny obsah pro free tier", () => {
    const report = evaluateEntitlementAccess({
      required: ["mtt.preflop.9max.regular.chip_ev"],
      grants: grantsForTier("FREE", { startsAt: "2026-07-01T00:00:00.000Z" }),
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(report.allowed).toBe(false);
    expect(report.missing).toEqual(["mtt.preflop.9max.regular.chip_ev"]);
  });

  it("rozlisi expired a revoked granty", () => {
    const report = evaluateEntitlementAccess({
      required: ["analytics.advanced", "coach.team"],
      grants: [
        {
          entitlement: "analytics.advanced",
          startsAt: "2026-06-01T00:00:00.000Z",
          endsAt: "2026-06-30T00:00:00.000Z",
          status: "ACTIVE",
        },
        {
          entitlement: "coach.team",
          startsAt: "2026-07-01T00:00:00.000Z",
          status: "REVOKED",
        },
      ],
      now: "2026-07-07T00:00:00.000Z",
    });

    expect(report.allowed).toBe(false);
    expect(report.expired).toEqual(["analytics.advanced"]);
    expect(report.revoked).toEqual(["coach.team"]);
  });

  it("povoli podepsanou offline licenci v grace okne", () => {
    const payload: SignedOfflineLicensePayload = {
      schema: "pkrtrainer_offline_license_v1",
      subjectId: "user_123",
      issuedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-31T00:00:00.000Z",
      graceUntil: "2026-08-07T00:00:00.000Z",
      signature: "test-signature",
      keyId: "test-key",
      entitlements: grantsForTier("PRO", {
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-07-31T00:00:00.000Z",
      }),
    };

    const report = evaluateOfflineLicenseAccess(
      payload,
      ["mtt.preflop.9max.regular.chip_ev"],
      { now: "2026-07-07T00:00:00.000Z", requireSignature: true },
    );

    expect(report.licenseValid).toBe(true);
    expect(report.signaturePresent).toBe(true);
    expect(report.allowed).toBe(true);
  });

  it("zamkne offline licenci po graceUntil", () => {
    const payload: SignedOfflineLicensePayload = {
      schema: "pkrtrainer_offline_license_v1",
      subjectId: "user_123",
      issuedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-31T00:00:00.000Z",
      graceUntil: "2026-08-07T00:00:00.000Z",
      entitlements: grantsForTier("PRO", {
        startsAt: "2026-07-01T00:00:00.000Z",
      }),
    };

    const report = evaluateOfflineLicenseAccess(
      payload,
      ["mtt.preflop.9max.regular.chip_ev"],
      { now: "2026-08-08T00:00:00.000Z" },
    );

    expect(report.licenseValid).toBe(false);
    expect(report.licenseExpired).toBe(true);
    expect(report.allowed).toBe(false);
  });
});
