import {
  validatePayoutStructure,
  validateStackDistribution,
  type IcmSpotType,
  type PayoutStructure,
  type StackDistribution,
} from "../../core/icmModel";
import type { AnteMode } from "../../core/types";
import type { BlindSpeed, TableFormat } from "../../core/trainingProfile";
import type { RangePack } from "./rangePack";

export interface SngIcmSimulationInput {
  rangePackId: string;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  ante: AnteMode;
  payoutStructure: PayoutStructure;
  remainingPlayers: number;
  stackDistribution: StackDistribution;
  bubbleFactor: number;
  spotType: IcmSpotType;
  supportedSpotTypes: readonly IcmSpotType[];
  sourceUrls: readonly string[];
  assumptions: readonly string[];
}

export function buildSngIcmSimulationInput(pack: RangePack): SngIcmSimulationInput {
  if (pack.dimensions.gameVariant !== "SNG" || pack.dimensions.evModel !== "ICM") {
    throw new Error("SNG ICM simulation input requires an SNG ICM RangePack.");
  }
  if (!pack.icmContext) {
    throw new Error("SNG ICM RangePack must include icmContext.");
  }

  return {
    rangePackId: pack.id,
    tableFormat: pack.dimensions.tableFormat,
    blindSpeed: pack.dimensions.blindSpeed,
    ante: pack.dimensions.ante,
    payoutStructure: pack.icmContext.payoutStructure,
    remainingPlayers: pack.icmContext.stackDistribution.remainingPlayers,
    stackDistribution: pack.icmContext.stackDistribution,
    bubbleFactor: pack.icmContext.bubbleFactor,
    spotType: pack.icmContext.spotType,
    supportedSpotTypes: pack.icmSpotTypes ?? [pack.icmContext.spotType],
    sourceUrls: pack.sourceEvidence.map((source) => source.url),
    assumptions: pack.assumptions,
  };
}

export function validateSngIcmSimulationInput(
  input: SngIcmSimulationInput,
): string[] {
  const errors: string[] = [];

  if (input.rangePackId.trim().length === 0) errors.push("rangePackId is required.");
  if (!Number.isFinite(input.bubbleFactor) || input.bubbleFactor <= 0) {
    errors.push("bubbleFactor must be a positive finite number.");
  }
  if (input.remainingPlayers !== input.stackDistribution.remainingPlayers) {
    errors.push("remainingPlayers must match stackDistribution.remainingPlayers.");
  }
  if (!input.supportedSpotTypes.includes(input.spotType)) {
    errors.push("spotType must be included in supportedSpotTypes.");
  }
  if (input.sourceUrls.length < 2) {
    errors.push("At least 2 source URLs are required for ICM import review.");
  }
  if (input.assumptions.length === 0) {
    errors.push("ICM simulation input must carry assumptions.");
  }

  return errors.concat(
    validatePayoutStructure(input.payoutStructure),
    validateStackDistribution(input.stackDistribution),
  );
}
