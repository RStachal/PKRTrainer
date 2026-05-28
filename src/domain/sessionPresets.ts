import { TRAINING_SPOTS } from "../content/spots";
import type { CategoryOptionPhase, CategoryValue } from "./constants";
import { questionFromSpot } from "./questionFromSpot";
import type { TrainingQuestion } from "./question";
import { matchesStackBandFilter, type StackBandFilter } from "./stackBand";
import type { TrainingFormatId } from "./trainingFormat";
import type { StrictMode, TrainingMode } from "./types";

export type SessionPresetId =
  | "REJAM_15_20_STRICT"
  | "BB_DEFEND_21_25_STRICT"
  | "ISO_15_20_STRICT";

export type SessionPresetConfig = {
  readonly blockSize: number;
  readonly seed: number;
  readonly mode: TrainingMode;
  readonly strict: StrictMode;
  readonly stackBand: StackBandFilter;
};

export type SessionPreset = {
  readonly id: SessionPresetId;
  readonly label: string;
  readonly format: TrainingFormatId;
  readonly phase: CategoryOptionPhase;
  readonly category: CategoryValue;
  readonly config: SessionPresetConfig;
  readonly minimumAvailableSpots: number;
};

export const SESSION_PRESETS = [
  {
    id: "REJAM_15_20_STRICT",
    label: "Preset: REJAM 15-20",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "REJAM",
    config: {
      blockSize: 20,
      seed: 1,
      mode: "MIXED",
      strict: "STRICT",
      stackBand: "BB_15_20",
    },
    minimumAvailableSpots: 8,
  },
  {
    id: "BB_DEFEND_21_25_STRICT",
    label: "Preset: BB defend 21-25",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "BB_DEFEND",
    config: {
      blockSize: 20,
      seed: 1,
      mode: "MIXED",
      strict: "STRICT",
      stackBand: "BB_21_25",
    },
    minimumAvailableSpots: 8,
  },
  {
    id: "ISO_15_20_STRICT",
    label: "Preset: ISO 15-20",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "ISO_LIMP",
    config: {
      blockSize: 20,
      seed: 1,
      mode: "MIXED",
      strict: "STRICT",
      stackBand: "BB_15_20",
    },
    minimumAvailableSpots: 8,
  },
] as const satisfies readonly SessionPreset[];

const PRESET_BY_ID = new Map(SESSION_PRESETS.map((preset) => [preset.id, preset]));

export function getSessionPreset(presetId: SessionPresetId): SessionPreset {
  const preset = PRESET_BY_ID.get(presetId);
  if (!preset) throw new Error(`Unknown session preset: ${presetId}`);
  return preset;
}

export function getPresetAvailableQuestions(
  presetId: SessionPresetId,
): readonly TrainingQuestion[] {
  const preset = getSessionPreset(presetId);

  return TRAINING_SPOTS.filter(
    (spot) =>
      spot.format === preset.format &&
      matchesStackBandFilter(spot.effectiveStack, preset.config.stackBand),
  )
    .map((spot) => questionFromSpot(spot))
    .filter(
      (question) =>
        question.phase === preset.phase && question.category === preset.category,
    );
}
