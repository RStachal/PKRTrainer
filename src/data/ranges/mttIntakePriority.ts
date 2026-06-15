import type { EvModel, TrainingStreet } from "../../core/trainingProfile";

export type MttIntakePriorityKey =
  | "P0_READY_FOR_VALIDATION"
  | "P1_PREFLOP_CHIP_EV"
  | "P2_PREFLOP_DOLAR_EV"
  | "P3_FLOP_PRODUCTION"
  | "P4_TURN_PRODUCTION"
  | "P5_RIVER_PRODUCTION";

export const MTT_INTAKE_PRIORITY_KEYS: readonly MttIntakePriorityKey[] = [
  "P0_READY_FOR_VALIDATION",
  "P1_PREFLOP_CHIP_EV",
  "P2_PREFLOP_DOLAR_EV",
  "P3_FLOP_PRODUCTION",
  "P4_TURN_PRODUCTION",
  "P5_RIVER_PRODUCTION",
];

export interface MttIntakePriorityProfile {
  evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  street: TrainingStreet;
}

export function parseMttIntakePriority(
  value: string,
  usage: () => string,
): MttIntakePriorityKey {
  if (MTT_INTAKE_PRIORITY_KEYS.includes(value as MttIntakePriorityKey)) {
    return value as MttIntakePriorityKey;
  }
  throw new Error(`Unsupported --priority value: ${value}\n\n${usage()}`);
}

export function mttIntakePriorityForProfile(
  profile: MttIntakePriorityProfile,
  readyForValidation: boolean,
): MttIntakePriorityKey {
  if (readyForValidation) return "P0_READY_FOR_VALIDATION";
  if (profile.street === "PREFLOP" && profile.evModel === "CHIP_EV") return "P1_PREFLOP_CHIP_EV";
  if (profile.street === "PREFLOP" && profile.evModel === "DOLAR_EV") return "P2_PREFLOP_DOLAR_EV";
  if (profile.street === "FLOP") return "P3_FLOP_PRODUCTION";
  if (profile.street === "TURN") return "P4_TURN_PRODUCTION";
  return "P5_RIVER_PRODUCTION";
}

export function emptyMttIntakePriorityCounts(): Record<MttIntakePriorityKey, number> {
  return Object.fromEntries(MTT_INTAKE_PRIORITY_KEYS.map((priority) => [priority, 0])) as Record<
    MttIntakePriorityKey,
    number
  >;
}

export function mttIntakePriorityRank(priority: MttIntakePriorityKey): number {
  const order: Record<MttIntakePriorityKey, number> = {
    P0_READY_FOR_VALIDATION: 0,
    P1_PREFLOP_CHIP_EV: 1,
    P2_PREFLOP_DOLAR_EV: 2,
    P3_FLOP_PRODUCTION: 3,
    P4_TURN_PRODUCTION: 4,
    P5_RIVER_PRODUCTION: 5,
  };
  return order[priority];
}
