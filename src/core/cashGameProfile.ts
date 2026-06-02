import type { AnteMode, StackBucket } from "./types";
import {
  type RakeMode,
  type TableFormat,
  type TrainingProfile,
} from "./trainingProfile";

export type CashBlindMode = "FIXED";

export interface CashProfile {
  tableFormat: TableFormat;
  blindMode: CashBlindMode;
  defaultStackBB: StackBucket | number;
  ante: AnteMode;
  rakeMode: Extract<RakeMode, "RAKE" | "NO_RAKE">;
}

export const DEFAULT_CASH_PROFILE: CashProfile = {
  tableFormat: "SIX_MAX",
  blindMode: "FIXED",
  defaultStackBB: 100,
  ante: "OFF",
  rakeMode: "RAKE",
};

export const CASH_STACK_BUCKETS = [
  40,
  60,
  75,
  100,
  125,
  150,
  200,
] as const;

export function cashProfileId(profile: CashProfile): string {
  return [
    "CASH",
    profile.tableFormat,
    profile.blindMode,
    profile.defaultStackBB,
    profile.ante,
    profile.rakeMode,
  ].join("|");
}

export function cashProfileWith(
  base: CashProfile,
  override: Partial<CashProfile>,
): CashProfile {
  return { ...base, ...override };
}

export function cashProfileToTrainingProfile(profile: CashProfile): TrainingProfile {
  return {
    gameVariant: "CASH",
    tableFormat: profile.tableFormat,
    blindSpeed: "REGULAR",
    street: "PREFLOP",
    evModel: "CHIP_EV",
    ante: profile.ante,
    rakeMode: profile.rakeMode,
  };
}

export function validateCashProfile(profile: CashProfile): string[] {
  const errors: string[] = [];

  if (profile.blindMode !== "FIXED") errors.push("cash blindMode must be FIXED");
  if (profile.ante !== "OFF") errors.push("cash ante is expected to be OFF for initial profiles");
  if (profile.rakeMode !== "RAKE" && profile.rakeMode !== "NO_RAKE") {
    errors.push("cash rakeMode must be RAKE or NO_RAKE");
  }
  if (!Number.isFinite(profile.defaultStackBB) || profile.defaultStackBB <= 0) {
    errors.push("defaultStackBB must be a positive finite BB value");
  }

  return errors;
}
