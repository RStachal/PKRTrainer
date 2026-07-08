import { describe, expect, it } from "vitest";

import { grantsForTier } from "../../src/core/paymentEntitlements";
import { readOfflineLicensePayload, runtimeEntitlementGrants } from "../../src/core/runtimeEntitlements";

describe("runtime entitlements", () => {
  it("bez offline licence vraci pouze FREE grant", () => {
    const grants = runtimeEntitlementGrants({
      storage: { getItem: () => null },
      now: "2026-07-08T12:00:00.000Z",
    });

    expect(grants.map((grant) => grant.entitlement)).toEqual(["app.free"]);
  });

  it("nacte validni offline licenci bez ukladani citlivych dat do UI", () => {
    const payload = {
      schema: "pkrtrainer_offline_license_v1",
      subjectId: "operator-preview",
      issuedAt: "2026-07-08T00:00:00.000Z",
      expiresAt: "2026-08-08T00:00:00.000Z",
      graceUntil: "2026-08-15T00:00:00.000Z",
      entitlements: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
    } as const;
    const storage = {
      getItem: (key: string) => key === "pkrtrainer.offlineLicense.v1"
        ? JSON.stringify(payload)
        : null,
    };

    expect(readOfflineLicensePayload(storage)?.subjectId).toBe("operator-preview");
    expect(runtimeEntitlementGrants({ storage, now: "2026-07-08T12:00:00.000Z" })
      .map((grant) => grant.entitlement))
      .toContain("mtt.postflop.flop.srp_sb_bb_oop.cbet.pilot");
  });
});
