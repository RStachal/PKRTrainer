import type { CategoryPhase, CategoryValue } from "./constants";
import type { TrainingFormatId } from "./trainingFormat";

export type AnswerKey = string;

export type TrainingAnswerOption = {
  readonly id: AnswerKey;
  readonly label: string;
};

export type TrainingQuestionContext = {
  readonly heroPosition?: string;
  readonly villainPosition?: string;
  readonly effectiveStack?: string;
  readonly potType?: string;
  readonly board?: readonly string[];
  readonly heroHand?: readonly string[];
  readonly tags?: readonly string[];
};

export type TrainingQuestion = {
  readonly id: string;
  readonly format: TrainingFormatId;
  readonly phase: CategoryPhase;
  readonly category: Exclude<CategoryValue, "ALL">;
  readonly title: string;
  readonly prompt: string;
  readonly answerOptions: readonly TrainingAnswerOption[];
  readonly correctKeys: readonly AnswerKey[];
  readonly strictCorrect: readonly AnswerKey[];
  readonly explanation?: string;
  readonly hint?: string;
  readonly context?: TrainingQuestionContext;
};
