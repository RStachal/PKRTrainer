import type { AnteMode } from "../../core/types";
import type { BlindSpeed, EvModel, TableFormat, TrainingStreet } from "../../core/trainingProfile";

export type MttProductionImportStreet = Extract<
  TrainingStreet,
  "PREFLOP" | "FLOP" | "TURN" | "RIVER"
>;

export type MttProductionImportKind =
  | "mtt-preflop"
  | "flop-production"
  | "turn-production"
  | "river-production";

export interface MttProductionImportSlotIdentity {
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  street: MttProductionImportStreet;
  ante: AnteMode;
}

export interface MttProductionImportSlotPaths {
  rawInputFolder: string;
  normalizedInputPath: string;
  permissionManifestPath: string;
}

export function mttProductionImportSlotKind(
  street: MttProductionImportStreet,
): MttProductionImportKind {
  switch (street) {
    case "PREFLOP":
      return "mtt-preflop";
    case "FLOP":
      return "flop-production";
    case "TURN":
      return "turn-production";
    case "RIVER":
      return "river-production";
  }
}

export function mttProductionImportSlotId(
  identity: MttProductionImportSlotIdentity,
): string {
  return [
    identity.tableFormat,
    identity.blindSpeed,
    identity.evModel,
    identity.street,
    identity.ante,
  ].join("|");
}

export function mttProductionImportPackId(
  identity: MttProductionImportSlotIdentity,
): string {
  return [
    "mtt",
    identity.tableFormat === "FULL_RING_9" ? "full-ring-9" : "six-max",
    identity.blindSpeed.toLowerCase(),
    identity.street.toLowerCase(),
    identity.evModel === "CHIP_EV" ? "chip-ev" : "dolar-ev",
    `ante-${identity.ante.toLowerCase()}`,
    "production-v1",
  ].join("-");
}

export function mttProductionImportIdentityFromPackId(
  packId: string,
): MttProductionImportSlotIdentity | null {
  const match = /^mtt-(full-ring-9|six-max)-(regular|turbo)-(preflop|flop|turn|river)-(chip-ev|dolar-ev)-ante-(on|off)-production-v1$/
    .exec(packId);
  if (!match) return null;
  return {
    tableFormat: match[1] === "full-ring-9" ? "FULL_RING_9" : "SIX_MAX",
    blindSpeed: match[2] === "regular" ? "REGULAR" : "TURBO",
    street: match[3].toUpperCase() as MttProductionImportStreet,
    evModel: match[4] === "chip-ev" ? "CHIP_EV" : "DOLAR_EV",
    ante: match[5] === "on" ? "ON" : "OFF",
  };
}

export function mttProductionImportSlotPaths(packId: string): MttProductionImportSlotPaths {
  const rawInputFolder = `Agents/range-intake/raw/${packId}`;
  return {
    rawInputFolder,
    normalizedInputPath: `${rawInputFolder}/normalized.json`,
    permissionManifestPath: `${rawInputFolder}/permission.json`,
  };
}
