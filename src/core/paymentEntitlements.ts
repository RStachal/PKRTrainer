export const PKR_ENTITLEMENTS = [
  "app.free",
  "mtt.preflop.9max.regular.chip_ev",
  "mtt.preflop.9max.turbo.chip_ev",
  "mtt.postflop.flop.srp_btn_bb.cbet.pilot",
  "mtt.postflop.flop.srp_btn_bb.facing_bet.pilot",
  "mtt.postflop.flop.3bp_btn_co.cbet.pilot",
  "mtt.postflop.flop.3bp_btn_co.facing_bet.pilot",
  "analytics.advanced",
  "export.cross_check",
  "coach.team",
] as const;

export type PkrEntitlement = (typeof PKR_ENTITLEMENTS)[number];

export type PkrCommercialTier =
  | "FREE"
  | "PRO"
  | "PRO_PLUS"
  | "TEAM_COACH";

export interface EntitlementGrant {
  entitlement: PkrEntitlement;
  startsAt: string;
  endsAt?: string | null;
  status: "ACTIVE" | "TRIALING" | "GRACE" | "EXPIRED" | "REVOKED";
}

export interface SignedOfflineLicensePayload {
  schema: "pkrtrainer_offline_license_v1";
  subjectId: string;
  deviceIdHash?: string;
  issuedAt: string;
  expiresAt: string;
  graceUntil: string;
  entitlements: readonly EntitlementGrant[];
  signature?: string;
  keyId?: string;
}

export interface EntitlementAccessInput {
  required: readonly PkrEntitlement[];
  grants: readonly EntitlementGrant[];
  now?: string | Date;
  allowGrace?: boolean;
}

export interface EntitlementAccessReport {
  allowed: boolean;
  missing: readonly PkrEntitlement[];
  active: readonly PkrEntitlement[];
  expired: readonly PkrEntitlement[];
  revoked: readonly PkrEntitlement[];
}

export const TIER_ENTITLEMENTS: Record<PkrCommercialTier, readonly PkrEntitlement[]> = {
  FREE: ["app.free"],
  PRO: [
    "app.free",
    "mtt.preflop.9max.regular.chip_ev",
    "analytics.advanced",
  ],
  PRO_PLUS: [
    "app.free",
    "mtt.preflop.9max.regular.chip_ev",
    "mtt.preflop.9max.turbo.chip_ev",
    "mtt.postflop.flop.srp_btn_bb.cbet.pilot",
    "mtt.postflop.flop.srp_btn_bb.facing_bet.pilot",
    "mtt.postflop.flop.3bp_btn_co.cbet.pilot",
    "mtt.postflop.flop.3bp_btn_co.facing_bet.pilot",
    "analytics.advanced",
    "export.cross_check",
  ],
  TEAM_COACH: [
    "app.free",
    "mtt.preflop.9max.regular.chip_ev",
    "mtt.preflop.9max.turbo.chip_ev",
    "mtt.postflop.flop.srp_btn_bb.cbet.pilot",
    "mtt.postflop.flop.srp_btn_bb.facing_bet.pilot",
    "mtt.postflop.flop.3bp_btn_co.cbet.pilot",
    "mtt.postflop.flop.3bp_btn_co.facing_bet.pilot",
    "analytics.advanced",
    "export.cross_check",
    "coach.team",
  ],
};

export function grantsForTier(
  tier: PkrCommercialTier,
  options: {
    startsAt: string;
    endsAt?: string | null;
    status?: EntitlementGrant["status"];
  },
): EntitlementGrant[] {
  return TIER_ENTITLEMENTS[tier].map((entitlement) => ({
    entitlement,
    startsAt: options.startsAt,
    endsAt: options.endsAt ?? null,
    status: options.status ?? "ACTIVE",
  }));
}

export function evaluateEntitlementAccess(
  input: EntitlementAccessInput,
): EntitlementAccessReport {
  const now = input.now instanceof Date
    ? input.now
    : new Date(input.now ?? Date.now());
  const allowGrace = input.allowGrace ?? true;
  const active = new Set<PkrEntitlement>();
  const expired = new Set<PkrEntitlement>();
  const revoked = new Set<PkrEntitlement>();

  for (const grant of input.grants) {
    if (grant.status === "REVOKED") {
      revoked.add(grant.entitlement);
      continue;
    }
    if (grant.status === "EXPIRED") {
      expired.add(grant.entitlement);
      continue;
    }
    if (!isStarted(grant, now) || isEnded(grant, now)) {
      expired.add(grant.entitlement);
      continue;
    }
    if (grant.status === "GRACE" && !allowGrace) {
      expired.add(grant.entitlement);
      continue;
    }
    active.add(grant.entitlement);
  }

  const missing = input.required.filter((entitlement) => !active.has(entitlement));
  return {
    allowed: missing.length === 0,
    missing,
    active: [...active].sort(),
    expired: [...expired].sort(),
    revoked: [...revoked].sort(),
  };
}

export function evaluateOfflineLicenseAccess(
  payload: SignedOfflineLicensePayload,
  required: readonly PkrEntitlement[],
  options: { now?: string | Date; requireSignature?: boolean } = {},
): EntitlementAccessReport & {
  licenseValid: boolean;
  licenseExpired: boolean;
  signaturePresent: boolean;
} {
  const now = options.now instanceof Date
    ? options.now
    : new Date(options.now ?? Date.now());
  const signaturePresent = typeof payload.signature === "string" && payload.signature.length > 0;
  const licenseExpired = Date.parse(payload.graceUntil) < now.getTime();
  const licenseValid =
    payload.schema === "pkrtrainer_offline_license_v1" &&
    !licenseExpired &&
    (options.requireSignature !== true || signaturePresent);
  const access = licenseValid
    ? evaluateEntitlementAccess({ required, grants: payload.entitlements, now, allowGrace: true })
    : {
        allowed: false,
        missing: required,
        active: [],
        expired: [],
        revoked: [],
      } satisfies EntitlementAccessReport;
  return {
    ...access,
    licenseValid,
    licenseExpired,
    signaturePresent,
  };
}

function isStarted(grant: EntitlementGrant, now: Date): boolean {
  return Date.parse(grant.startsAt) <= now.getTime();
}

function isEnded(grant: EntitlementGrant, now: Date): boolean {
  return typeof grant.endsAt === "string" && Date.parse(grant.endsAt) < now.getTime();
}
