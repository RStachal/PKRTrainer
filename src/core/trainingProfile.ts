import { POSITION_ORDER, type AnteMode, type Position } from "./types";

export type GameVariant = "MTT" | "SNG" | "CASH";
export type TableFormat = "FULL_RING_9" | "SIX_MAX";
export type BlindSpeed = "REGULAR" | "TURBO";
export type TrainingStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER";
export type EvModel = "CHIP_EV" | "ICM";
export type RakeMode = "NONE" | "RAKE" | "NO_RAKE";

export interface TrainingProfile {
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: TrainingStreet;
  evModel: EvModel;
  ante: AnteMode;
  rakeMode: RakeMode;
}

export const SIX_MAX_POSITION_ORDER = [
  "UTG",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
] as const satisfies readonly Position[];

export const DEFAULT_TRAINING_PROFILE: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "PREFLOP",
  evModel: "CHIP_EV",
  ante: "ON",
  rakeMode: "NONE",
};

export function positionsForFormat(format: TableFormat): readonly Position[] {
  switch (format) {
    case "FULL_RING_9":
      return POSITION_ORDER;
    case "SIX_MAX":
      return SIX_MAX_POSITION_ORDER;
    default:
      return assertNever(format);
  }
}

export function isTournamentVariant(variant: GameVariant): boolean {
  return variant === "MTT" || variant === "SNG";
}

export function isPostflopStreet(street: TrainingStreet): boolean {
  return street === "FLOP" || street === "TURN" || street === "RIVER";
}

export function defaultEvModelForVariant(variant: GameVariant): EvModel {
  return variant === "SNG" ? "CHIP_EV" : "CHIP_EV";
}

export function defaultRakeModeForVariant(variant: GameVariant): RakeMode {
  return variant === "CASH" ? "NO_RAKE" : "NONE";
}

export function profileId(profile: TrainingProfile): string {
  return [
    profile.gameVariant,
    profile.tableFormat,
    profile.blindSpeed,
    profile.street,
    profile.evModel,
    profile.ante,
    profile.rakeMode,
  ].join("|");
}

export function profileWith(
  base: TrainingProfile,
  override: Partial<TrainingProfile>,
): TrainingProfile {
  return { ...base, ...override };
}

export function isProfileSupported(profile: TrainingProfile): boolean {
  if (profile.gameVariant === "CASH") {
    return profile.rakeMode === "RAKE" || profile.rakeMode === "NO_RAKE";
  }

  if (profile.gameVariant === "SNG") {
    return profile.evModel === "CHIP_EV" || profile.evModel === "ICM";
  }

  return profile.gameVariant === "MTT";
}

function assertNever(value: never): never {
  throw new Error(`Unexpected table format: ${String(value)}`);
}
