import {
  evaluateEntitlementAccess,
  type EntitlementAccessReport,
  type EntitlementGrant,
  type PkrEntitlement,
} from "../../core/paymentEntitlements";
import type { PostflopPositionPattern, PostflopPotType } from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { TrainingProfile } from "../../core/trainingProfile";
import type { MttPostflopPilotScope } from "./mttPostflopPilotGate";

export type MttPostflopPilotStatus = "READY" | "WAITING" | "INVALID";

export interface MttPostflopPilotCatalogEntry {
  id: string;
  label: string;
  scope: MttPostflopPilotScope;
  status: MttPostflopPilotStatus;
  requiredEntitlement: PkrEntitlement;
  street: "FLOP";
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  actionNode: Extract<PostflopActionNode, "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET" | "FLOP_FACING_BET">;
  positionPattern: Extract<PostflopPositionPattern, "SRP_BTN_VS_BB" | "SRP_UTG_VS_BB" | "3BP_BTN_VS_CO">;
  sprBands: readonly ("LOW" | "MID" | "HIGH")[];
  rules: number;
  rangeBuckets: number;
  inputDrafts: number;
  provenanceFingerprint: string;
  fullProductionReady: false;
  limitations: readonly string[];
}

export const MTT_POSTFLOP_PILOT_CATALOG = [
  {
    id: "btn-bb-srp-flop-cbet-low-mid-high",
    label: "BTN vs BB SRP flop c-bet pilot",
    scope: "BTN_vs_BB_SRP_FLOP_CBET",
    status: "READY",
    requiredEntitlement: "mtt.postflop.flop.srp_btn_bb.cbet.pilot",
    street: "FLOP",
    potType: "SINGLE_RAISED",
    actionNode: "SINGLE_RAISED_POT_CBET",
    positionPattern: "SRP_BTN_VS_BB",
    sprBands: ["LOW", "MID", "HIGH"],
    rules: 3,
    rangeBuckets: 134,
    inputDrafts: 3,
    provenanceFingerprint: "3d58cc5f519bd9c739e492615f3d2fb0714deac5312acaf70561e46542064b16",
    fullProductionReady: false,
    limitations: [
      "Scoped to BTN vs BB single-raised flop c-bet decisions.",
      "Not a full flop production pack; other positions and facing-bet branches require their own pilots or production packs.",
    ],
  },
  {
    id: "utg-bb-srp-flop-cbet",
    label: "UTG vs BB SRP flop c-bet pilot",
    scope: "UTG_vs_BB_SRP_FLOP_CBET",
    status: "READY",
    requiredEntitlement: "mtt.postflop.flop.srp_utg_bb.cbet.pilot",
    street: "FLOP",
    potType: "SINGLE_RAISED",
    actionNode: "SINGLE_RAISED_POT_CBET",
    positionPattern: "SRP_UTG_VS_BB",
    sprBands: ["MID"],
    rules: 1,
    rangeBuckets: 36,
    inputDrafts: 1,
    provenanceFingerprint: "46e21a03a585141c0fb9cac7b21cbad932c538c1bdf040e3160628dff9e08eaa",
    fullProductionReady: false,
    limitations: [
      "Scoped to UTG vs BB single-raised flop c-bet decisions.",
      "Single pilot family only; not complete LOW/MID/HIGH production coverage.",
    ],
  },
  {
    id: "btn-co-3bp-flop-cbet-low-mid-high",
    label: "BTN vs CO 3bet-pot flop c-bet pilot",
    scope: "BTN_vs_CO_3BP_FLOP_CBET",
    status: "READY",
    requiredEntitlement: "mtt.postflop.flop.3bp_btn_co.cbet.pilot",
    street: "FLOP",
    potType: "THREE_BET_POT",
    actionNode: "THREE_BET_POT_CBET",
    positionPattern: "3BP_BTN_VS_CO",
    sprBands: ["LOW", "MID", "HIGH"],
    rules: 3,
    rangeBuckets: 102,
    inputDrafts: 3,
    provenanceFingerprint: "06263072191e75230fe69421d5faee286b56fa116f1b6d20ae2870ef727bffb2",
    fullProductionReady: false,
    limitations: [
      "Scoped to BTN vs CO 3bet-pot flop c-bet decisions.",
      "Does not cover other 3bet positions, 4bet pots, multiway pots or later streets.",
    ],
  },
  {
    id: "btn-co-3bp-flop-facing-bet-low-mid-high",
    label: "BTN vs CO 3bet-pot flop facing-bet pilot",
    scope: "BTN_vs_CO_3BP_FLOP_FACING_BET",
    status: "READY",
    requiredEntitlement: "mtt.postflop.flop.3bp_btn_co.facing_bet.pilot",
    street: "FLOP",
    potType: "THREE_BET_POT",
    actionNode: "FLOP_FACING_BET",
    positionPattern: "3BP_BTN_VS_CO",
    sprBands: ["LOW", "MID", "HIGH"],
    rules: 3,
    rangeBuckets: 111,
    inputDrafts: 3,
    provenanceFingerprint: "d365e5181169b389184cce8de829ecaf42c5ae7b82d7cca253ebcffcf75c9c4d",
    fullProductionReady: false,
    limitations: [
      "Scoped to BTN vs CO 3bet-pot flop response after facing a bet.",
      "The pilot supports FOLD/CALL/RAISE decisions only for the reviewed response nodes.",
    ],
  },
  {
    id: "btn-bb-srp-flop-facing-bet-low-mid-high",
    label: "BTN vs BB SRP flop facing-bet pilot",
    scope: "BTN_vs_BB_SRP_FLOP_FACING_BET",
    status: "READY",
    requiredEntitlement: "mtt.postflop.flop.srp_btn_bb.facing_bet.pilot",
    street: "FLOP",
    potType: "SINGLE_RAISED",
    actionNode: "FLOP_FACING_BET",
    positionPattern: "SRP_BTN_VS_BB",
    sprBands: ["LOW", "MID", "HIGH"],
    rules: 3,
    rangeBuckets: 174,
    inputDrafts: 3,
    provenanceFingerprint: "2ef77b69f94c10fdc8e018a2cf0043645e0c0a527887b1fcbd06d66bcfb5298b",
    fullProductionReady: false,
    limitations: [
      "Scoped to BTN vs BB single-raised flop response after facing a bet.",
      "The pilot supports FOLD/CALL/RAISE decisions only for reviewed LOW/MID/HIGH SPR response nodes.",
    ],
  },
] as const satisfies readonly MttPostflopPilotCatalogEntry[];

export interface MttPostflopPilotAccessReport {
  pilot: MttPostflopPilotCatalogEntry | null;
  access: EntitlementAccessReport;
}

export function readyMttPostflopPilots(
  catalog: readonly MttPostflopPilotCatalogEntry[] = MTT_POSTFLOP_PILOT_CATALOG,
): readonly MttPostflopPilotCatalogEntry[] {
  return catalog.filter((entry) => entry.status === "READY");
}

export function readyMttPostflopPilotsForProfile(
  profile: TrainingProfile,
  catalog: readonly MttPostflopPilotCatalogEntry[] = MTT_POSTFLOP_PILOT_CATALOG,
): readonly MttPostflopPilotCatalogEntry[] {
  if (
    profile.gameVariant !== "MTT" ||
    profile.tableFormat !== "FULL_RING_9" ||
    profile.blindSpeed !== "REGULAR" ||
    profile.street !== "FLOP" ||
    profile.evModel !== "CHIP_EV" ||
    profile.ante !== "OFF" ||
    profile.rakeMode !== "NONE"
  ) {
    return [];
  }
  return readyMttPostflopPilots(catalog);
}

export function findMttPostflopPilotByScope(
  scope: MttPostflopPilotScope,
  catalog: readonly MttPostflopPilotCatalogEntry[] = MTT_POSTFLOP_PILOT_CATALOG,
): MttPostflopPilotCatalogEntry | null {
  return catalog.find((entry) => entry.scope === scope) ?? null;
}

export function requiredEntitlementsForMttPostflopPilotScopes(
  scopes: readonly MttPostflopPilotScope[],
  catalog: readonly MttPostflopPilotCatalogEntry[] = MTT_POSTFLOP_PILOT_CATALOG,
): readonly PkrEntitlement[] {
  const entitlements = new Set<PkrEntitlement>();
  for (const scope of scopes) {
    const pilot = findMttPostflopPilotByScope(scope, catalog);
    if (pilot) entitlements.add(pilot.requiredEntitlement);
  }
  return [...entitlements].sort();
}

export function buildMttPostflopPilotAccessReport(
  scope: MttPostflopPilotScope,
  grants: readonly EntitlementGrant[],
  options: { now?: string | Date; allowGrace?: boolean } = {},
): MttPostflopPilotAccessReport {
  const pilot = findMttPostflopPilotByScope(scope);
  const required = pilot === null ? [] : [pilot.requiredEntitlement];
  return {
    pilot,
    access: evaluateEntitlementAccess({
      required,
      grants,
      now: options.now,
      allowGrace: options.allowGrace,
    }),
  };
}

export function validateMttPostflopPilotCatalog(
  catalog: readonly MttPostflopPilotCatalogEntry[] = MTT_POSTFLOP_PILOT_CATALOG,
): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const scopes = new Set<MttPostflopPilotScope>();
  for (const entry of catalog) {
    if (ids.has(entry.id)) errors.push(`Duplicate pilot id: ${entry.id}.`);
    ids.add(entry.id);
    if (scopes.has(entry.scope)) errors.push(`Duplicate pilot scope: ${entry.scope}.`);
    scopes.add(entry.scope);
    if (entry.status === "READY" && entry.provenanceFingerprint.trim().length === 0) {
      errors.push(`${entry.id}: READY pilot requires provenanceFingerprint.`);
    }
    if (entry.status === "READY" && (entry.rules <= 0 || entry.rangeBuckets <= 0 || entry.inputDrafts <= 0)) {
      errors.push(`${entry.id}: READY pilot requires positive rules, rangeBuckets and inputDrafts.`);
    }
    if (entry.fullProductionReady !== false) {
      errors.push(`${entry.id}: pilot catalog entries must not be marked fullProductionReady.`);
    }
    if (entry.limitations.length === 0) {
      errors.push(`${entry.id}: pilot limitations are required.`);
    }
  }
  return errors;
}
