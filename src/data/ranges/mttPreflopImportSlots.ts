import type { AnteMode } from "../../core/types";
import type { BlindSpeed, EvModel, TableFormat } from "../../core/trainingProfile";
import type { RangePackDimensions } from "./rangePack";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionReadinessReport,
  type MttCompletionReadinessStatus,
} from "./mttProductionReadiness";
import {
  mttProductionImportPackId,
  mttProductionImportSlotId,
  mttProductionImportSlotPaths,
} from "./mttImportSlotNaming";

export interface MttPreflopImportSlot {
  slotId: string;
  packId: string;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
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

export function buildMttPreflopImportSlots(
  report: MttCompletionReadinessReport = buildMttCompletionReadinessReport(),
): MttPreflopImportSlot[] {
  return report.rows
    .filter((row) => row.street === "PREFLOP" && row.status !== "PRODUCTION")
    .map((row) => {
      const packId = mttProductionImportPackId({ ...row, street: "PREFLOP" });
      const paths = mttProductionImportSlotPaths(packId);
      return {
        slotId: mttProductionImportSlotId({ ...row, street: "PREFLOP" }),
        packId,
        tableFormat: row.tableFormat,
        blindSpeed: row.blindSpeed,
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

export function renderMttPreflopImportSlots(
  slots: readonly MttPreflopImportSlot[] = buildMttPreflopImportSlots(),
): string {
  const lines = [
    "MTT preflop legal import slots",
    `slots: ${slots.length}`,
  ];
  for (const slot of slots) {
    lines.push(
      `- ${slot.slotId}: ${slot.packId} ` +
      `input=${slot.normalizedInputPath} permission=${slot.permissionManifestPath}`,
    );
  }
  return lines.join("\n");
}

export function mttPreflopImportSlotForDimensions(
  dimensions: RangePackDimensions,
  slots: readonly MttPreflopImportSlot[] = buildMttPreflopImportSlots(),
): MttPreflopImportSlot | undefined {
  if (
    dimensions.gameVariant !== "MTT" ||
    dimensions.street !== "PREFLOP" ||
    dimensions.rakeMode !== "NONE" ||
    (dimensions.evModel !== "CHIP_EV" && dimensions.evModel !== "DOLAR_EV")
  ) {
    return undefined;
  }

  return slots.find((slot) => (
    slot.tableFormat === dimensions.tableFormat &&
    slot.blindSpeed === dimensions.blindSpeed &&
    slot.evModel === dimensions.evModel &&
    slot.ante === dimensions.ante
  ));
}
