import type { TrainingFormatId } from "./trainingFormat";
import type { RangeCell } from "./spot";

export type RangeProfileSourceQuality = "draft" | "reviewed";

export type RangeProfileSpotType =
  | "OPEN"
  | "SB_OPEN"
  | "BB_DEFEND"
  | "BB_DEFEND_2X"
  | "ISO"
  | "REJAM";

export type RangeProfile = {
  readonly id: string;
  readonly format: TrainingFormatId;
  readonly spotType: RangeProfileSpotType;
  readonly title: string;
  readonly summary: string;
  readonly heroPosition: string;
  readonly villainPosition?: string;
  readonly stackBand: string;
  readonly openSize?: string;
  readonly sourceQuality: RangeProfileSourceQuality;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
  readonly reviewNotes?: string;
  readonly cells: readonly RangeCell[];
};
