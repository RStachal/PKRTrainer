import {
  evaluateOfflineLicenseAccess,
  grantsForTier,
  type EntitlementGrant,
  type SignedOfflineLicensePayload,
} from "./paymentEntitlements";

const OFFLINE_LICENSE_STORAGE_KEY = "pkrtrainer.offlineLicense.v1";

export function runtimeEntitlementGrants(
  options: {
    storage?: Pick<Storage, "getItem"> | null;
    now?: string | Date;
  } = {},
): readonly EntitlementGrant[] {
  const storage = options.storage ?? safeLocalStorage();
  if (storage === null) {
    return grantsForTier("FREE", { startsAt: "2026-07-08T00:00:00.000Z" });
  }

  const payload = readOfflineLicensePayload(storage);
  if (payload === null) {
    return grantsForTier("FREE", { startsAt: "2026-07-08T00:00:00.000Z" });
  }

  const access = evaluateOfflineLicenseAccess(payload, [], {
    now: options.now,
    requireSignature: false,
  });
  if (!access.licenseValid) {
    return grantsForTier("FREE", { startsAt: payload.issuedAt });
  }

  return payload.entitlements;
}

export function readOfflineLicensePayload(
  storage: Pick<Storage, "getItem">,
): SignedOfflineLicensePayload | null {
  const raw = storage.getItem(OFFLINE_LICENSE_STORAGE_KEY);
  if (raw === null || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SignedOfflineLicensePayload>;
    if (
      parsed.schema !== "pkrtrainer_offline_license_v1" ||
      typeof parsed.subjectId !== "string" ||
      typeof parsed.issuedAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.graceUntil !== "string" ||
      !Array.isArray(parsed.entitlements)
    ) {
      return null;
    }
    return parsed as SignedOfflineLicensePayload;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
