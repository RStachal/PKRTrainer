import type { CategoryPhase, CategoryValue } from "./constants";

export type Phase = CategoryPhase;

export type StrictMode = "LENIENT" | "STRICT";

export type TrainingMode = "MIXED" | "MISSED";

export type AnswerOption = {
  readonly id: string;
  readonly label: string;
};

export type Question = {
  readonly id: string;
  readonly category: Exclude<CategoryValue, "ALL">;
  readonly prompt: string;
  readonly options: readonly AnswerOption[];
};

export type CategoryProgress = {
  readonly answered: number;
  readonly correct: number;
};

export type TrainingState = {
  readonly answered: number;
  readonly correct: number;
  readonly streak: number;
  readonly mode: TrainingMode;
  readonly strict: StrictMode;
  readonly phase: Phase;
  readonly catFilter: CategoryValue;
  readonly seen: Record<string, true>;
  readonly missed: Record<string, true>;
  readonly byCat: Record<string, CategoryProgress>;
};
