import { TRAINING_SPOTS } from "../content/spots";
import type { CategoryValue } from "./constants";
import { questionFromSpot } from "./questionFromSpot";
import type { TrainingQuestion } from "./question";
import type { TrainingSpot } from "./spot";
import { matchesStackBandFilter, type StackBandFilter } from "./stackBand";
import type { TrainingFormatId } from "./trainingFormat";
import { toSelectionPhase, type PhaseFilter } from "../ui/phaseFilter";

const QUESTIONS_BY_SPOT_ID = new Map(
  TRAINING_SPOTS.map((spot) => [spot.id, questionFromSpot(spot)]),
);

export function getQuestionsForFormat(
  format: TrainingFormatId,
  stackBand: StackBandFilter,
): readonly TrainingQuestion[] {
  return TRAINING_SPOTS.filter(
    (spot) =>
      spot.format === format &&
      matchesStackBandFilter(spot.effectiveStack, stackBand),
  ).map((spot) => QUESTIONS_BY_SPOT_ID.get(spot.id) ?? questionFromSpot(spot));
}

export function getQuestionsForSelection(
  format: TrainingFormatId,
  phase: PhaseFilter,
  stackBand: StackBandFilter,
): readonly TrainingQuestion[] {
  const selectedPhase = toSelectionPhase(phase);

  return getQuestionsForFormat(format, stackBand).filter(
    (question) => !selectedPhase || question.phase === selectedPhase,
  );
}

export function getAvailableCategories(
  format: TrainingFormatId,
  phase: PhaseFilter,
  stackBand: StackBandFilter,
): readonly CategoryValue[] {
  return Array.from(
    new Set(
      getQuestionsForSelection(format, phase, stackBand).map(
        (question) => question.category,
      ),
    ),
  ).sort();
}

export function normalizeCategory(
  category: CategoryValue,
  format: TrainingFormatId,
  phase: PhaseFilter,
  stackBand: StackBandFilter,
): CategoryValue {
  if (category === "ALL") return category;
  return getAvailableCategories(format, phase, stackBand).includes(category)
    ? category
    : "ALL";
}

export function getSpotByQuestionId(
  questionId: string | null,
): TrainingSpot | null {
  if (!questionId) return null;
  return TRAINING_SPOTS.find((spot) => spot.id === questionId) ?? null;
}
