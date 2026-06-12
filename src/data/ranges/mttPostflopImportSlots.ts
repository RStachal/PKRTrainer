import type { AnteMode } from "../../core/types";
import type { BlindSpeed, EvModel, TableFormat, TrainingStreet } from "../../core/trainingProfile";
import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionReadinessReport,
  type MttCompletionReadinessStatus,
} from "./mttProductionReadiness";
import {
  mttProductionImportPackId,
  mttProductionImportSlotId,
  mttProductionImportSlotKind,
  mttProductionImportSlotPaths,
} from "./mttImportSlotNaming";
import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";
import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";

export type MttPostflopProductionStreet = Extract<TrainingStreet, "FLOP" | "TURN" | "RIVER">;
export type MttPostflopProductionPack =
  | FlopProductionStrategyPack
  | TurnProductionStrategyPack
  | RiverProductionStrategyPack;

export interface MttPostflopImportSlot {
  slotId: string;
  packId: string;
  kind: "flop-production" | "turn-production" | "river-production";
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: MttPostflopProductionStreet;
  evModel: Extract<EvModel, "CHIP_EV" | "DOLAR_EV">;
  ante: AnteMode;
  status: MttCompletionReadinessStatus;
  rawInputFolder: string;
  normalizedInputPath: string;
  permissionManifestPath: string;
  requiredLicenseKinds: readonly [
    "OWNED_SOLVER_EXPORT",
    "PUBLIC_CHART_WITH_PERMISSION",
    "EXPLICIT_WRITTEN_PERMISSION",
  ];
  missingReasons: readonly string[];
}

const REQUIRED_LICENSE_KINDS = [
  "OWNED_SOLVER_EXPORT",
  "PUBLIC_CHART_WITH_PERMISSION",
  "EXPLICIT_WRITTEN_PERMISSION",
] as const;

export function buildMttPostflopImportSlots(
  report: MttCompletionReadinessReport = buildMttCompletionReadinessReport(),
): MttPostflopImportSlot[] {
  return report.rows
    .filter((row) => row.street !== "PREFLOP" && row.status !== "PRODUCTION")
    .map((row) => {
      const street = row.street as MttPostflopProductionStreet;
      const identity = { ...row, street };
      const packId = mttProductionImportPackId(identity);
      const paths = mttProductionImportSlotPaths(packId);
      return {
        slotId: mttProductionImportSlotId(identity),
        packId,
        kind: mttProductionImportSlotKind(street) as MttPostflopImportSlot["kind"],
        tableFormat: row.tableFormat,
        blindSpeed: row.blindSpeed,
        street,
        evModel: row.evModel,
        ante: row.ante,
        status: row.status,
        rawInputFolder: paths.rawInputFolder,
        normalizedInputPath: paths.normalizedInputPath,
        permissionManifestPath: paths.permissionManifestPath,
        requiredLicenseKinds: REQUIRED_LICENSE_KINDS,
        missingReasons: [...row.missingReasons],
      };
    });
}

export function renderMttPostflopImportSlots(
  slots: readonly MttPostflopImportSlot[] = buildMttPostflopImportSlots(),
): string {
  const lines = [
    "MTT postflop legal import slots",
    `slots: ${slots.length}`,
  ];
  for (const slot of slots) {
    lines.push(
      `- ${slot.slotId}: ${slot.kind} ${slot.packId} ` +
      `input=${slot.normalizedInputPath} permission=${slot.permissionManifestPath}`,
    );
  }
  return lines.join("\n");
}

export function mttPostflopImportSlotsForPack(
  pack: MttPostflopProductionPack,
  slots: readonly MttPostflopImportSlot[] = buildMttPostflopImportSlots(),
): MttPostflopImportSlot[] {
  if (
    pack.dimensions.gameVariant !== "MTT" ||
    (pack.dimensions.evModel !== "CHIP_EV" && pack.dimensions.evModel !== "DOLAR_EV")
  ) {
    return [];
  }

  return slots.filter((slot) => (
    slot.tableFormat === pack.dimensions.tableFormat &&
    slot.street === pack.dimensions.street &&
    slot.evModel === pack.dimensions.evModel &&
    pack.dimensions.blindSpeeds.includes(slot.blindSpeed) &&
    pack.dimensions.antes.includes(slot.ante)
  ));
}
