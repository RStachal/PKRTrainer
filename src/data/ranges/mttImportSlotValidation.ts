import type { MttPreflopRangePackImportInput } from "./mttPreflopRangePackImport";
import {
  mttPreflopImportSlotForDimensions,
  type MttPreflopImportSlot,
} from "./mttPreflopImportSlots";
import {
  mttPostflopImportSlotsForPack,
  type MttPostflopImportSlot,
  type MttPostflopProductionPack,
} from "./mttPostflopImportSlots";

export interface MttImportSlotSummary {
  slotId: string;
  packId: string;
  normalizedInputPath: string;
  permissionManifestPath: string;
}

export interface MttImportSlotValidationReport {
  valid: boolean;
  errors: readonly string[];
  matchedSlots: readonly MttImportSlotSummary[];
}

export interface MttPostflopImportSlotValidationOptions {
  gameVariantError?: string;
  noSlotError?: string;
  stopAfterGameVariantError?: boolean;
}

export function buildMttPreflopImportSlotValidationReport(
  input: MttPreflopRangePackImportInput,
): MttImportSlotValidationReport {
  const slot = mttPreflopImportSlotForDimensions(input.dimensions);
  if (slot === undefined) {
    return {
      valid: false,
      errors: ["MTT preflop import must match a legal MTT preflop import slot."],
      matchedSlots: [],
    };
  }

  const errors = input.id === slot.packId
    ? []
    : [`MTT preflop import id must match legal slot packId ${slot.packId}.`];
  return {
    valid: errors.length === 0,
    errors,
    matchedSlots: [slotSummary(slot)],
  };
}

export function buildMttPostflopImportSlotValidationReport(
  pack: MttPostflopProductionPack,
  options: MttPostflopImportSlotValidationOptions = {},
): MttImportSlotValidationReport {
  const errors: string[] = [];
  if (pack.dimensions.gameVariant !== "MTT" && options.gameVariantError) {
    errors.push(options.gameVariantError);
    if (options.stopAfterGameVariantError) {
      return {
        valid: false,
        errors,
        matchedSlots: [],
      };
    }
  }

  const slots = mttPostflopImportSlotsForPack(pack);
  if (slots.length === 0) {
    errors.push(
      options.noSlotError ??
      `${pack.dimensions.street} production import must match at least one legal MTT postflop import slot.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    matchedSlots: slots.map(slotSummary),
  };
}

export function renderMttImportSlotValidationReport(
  report: MttImportSlotValidationReport,
): string {
  const lines = [
    `legal import slot: ${report.valid}`,
    `matched slots: ${report.matchedSlots.length}`,
  ];
  for (const slot of report.matchedSlots) {
    lines.push(
      `- ${slot.slotId}: ${slot.packId} ` +
      `input=${slot.normalizedInputPath} permission=${slot.permissionManifestPath}`,
    );
  }
  if (report.errors.length > 0) {
    lines.push("slot errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }
  return lines.join("\n");
}

function slotSummary(
  slot: MttPreflopImportSlot | MttPostflopImportSlot,
): MttImportSlotSummary {
  return {
    slotId: slot.slotId,
    packId: slot.packId,
    normalizedInputPath: slot.normalizedInputPath,
    permissionManifestPath: slot.permissionManifestPath,
  };
}
