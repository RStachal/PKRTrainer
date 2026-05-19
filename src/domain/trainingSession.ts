import type { CategoryOptionPhase, CategoryValue } from "./constants";
import { hashStr, mulberry32 } from "./random";
import type { AnswerKey, TrainingQuestion } from "./question";
import type { StrictMode, TrainingMode } from "./types";

export const MIN_BLOCK_SIZE = 5;
export const MAX_BLOCK_SIZE = 300;
export const DEFAULT_BLOCK_SIZE = 100;

export type QuestionProgress = {
  readonly answered: number;
  readonly correct: number;
};

export type TrainingProgress = {
  readonly answered: number;
  readonly correct: number;
  readonly streak: number;
  readonly seen: Readonly<Record<string, true>>;
  readonly missed: Readonly<Record<string, true>>;
  readonly byCategory: Readonly<Record<string, QuestionProgress>>;
};

export type TrainingSessionConfig = {
  readonly seed?: number;
  readonly blockSize?: number;
  readonly mode?: TrainingMode;
  readonly strict?: StrictMode;
  readonly phase?: CategoryOptionPhase;
  readonly category?: CategoryValue;
};

export type TrainingSession = {
  readonly seed: number;
  readonly blockSize: number;
  readonly mode: TrainingMode;
  readonly strict: StrictMode;
  readonly phase: CategoryOptionPhase;
  readonly category: CategoryValue;
  readonly questionOrder: readonly string[];
  readonly usedQuestionIds: Readonly<Record<string, true>>;
  readonly remaining: number;
  readonly currentQuestionId: string | null;
  readonly progress: TrainingProgress;
};

export type AnswerResult = {
  readonly isCorrect: boolean;
  readonly acceptedKeys: readonly AnswerKey[];
};

export const EMPTY_TRAINING_PROGRESS: TrainingProgress = {
  answered: 0,
  correct: 0,
  streak: 0,
  seen: {},
  missed: {},
  byCategory: {},
};

export function clampBlockSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_BLOCK_SIZE;

  return Math.max(
    MIN_BLOCK_SIZE,
    Math.min(MAX_BLOCK_SIZE, Math.trunc(value as number)),
  );
}

function getSessionSeed(seed: number, phase: CategoryOptionPhase, category: CategoryValue): number {
  return (seed >>> 0) ^ hashStr(`${phase}:${category}`);
}

function matchesFilter(
  question: TrainingQuestion,
  config: Required<Omit<TrainingSessionConfig, "seed" | "blockSize">>,
  progress: TrainingProgress,
): boolean {
  if (config.phase !== "ALL" && question.phase !== config.phase) return false;
  if (config.category !== "ALL" && question.category !== config.category) return false;
  if (config.mode === "MISSED" && !progress.missed[question.id]) return false;

  return true;
}

function shuffleQuestionIds(
  questions: readonly TrainingQuestion[],
  seed: number,
): readonly string[] {
  const ids = questions.map((question) => question.id);
  const random = mulberry32(seed);

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }

  return ids;
}

export function createTrainingSession(
  questions: readonly TrainingQuestion[],
  config: TrainingSessionConfig = {},
  progress: TrainingProgress = EMPTY_TRAINING_PROGRESS,
): TrainingSession {
  const normalized = {
    seed: Number.isFinite(config.seed) ? Math.trunc(config.seed as number) : 1,
    blockSize: clampBlockSize(config.blockSize),
    mode: config.mode ?? "MIXED",
    strict: config.strict ?? "LENIENT",
    phase: config.phase ?? "ALL",
    category: config.category ?? "ALL",
  };
  const matchingQuestions = questions.filter((question) =>
    matchesFilter(question, normalized, progress),
  );
  const questionOrder = shuffleQuestionIds(
    matchingQuestions,
    getSessionSeed(normalized.seed, normalized.phase, normalized.category),
  ).slice(0, normalized.blockSize);

  return {
    ...normalized,
    questionOrder,
    usedQuestionIds: {},
    remaining: questionOrder.length,
    currentQuestionId: null,
    progress,
  };
}

export function getNextQuestion(
  session: TrainingSession,
  questions: readonly TrainingQuestion[],
): { readonly session: TrainingSession; readonly question: TrainingQuestion | null } {
  const nextQuestionId = session.questionOrder.find(
    (questionId) => !session.usedQuestionIds[questionId],
  );

  if (!nextQuestionId || session.remaining <= 0) {
    return {
      session: {
        ...session,
        currentQuestionId: null,
        remaining: 0,
      },
      question: null,
    };
  }

  const question =
    questions.find((candidate) => candidate.id === nextQuestionId) ?? null;

  if (!question) {
    return {
      session: {
        ...session,
        usedQuestionIds: {
          ...session.usedQuestionIds,
          [nextQuestionId]: true,
        },
      },
      question: null,
    };
  }

  return {
    session: {
      ...session,
      usedQuestionIds: {
        ...session.usedQuestionIds,
        [nextQuestionId]: true,
      },
      remaining: Math.max(0, session.remaining - 1),
      currentQuestionId: nextQuestionId,
    },
    question,
  };
}

export function scoreAnswer(
  question: TrainingQuestion,
  chosenKey: AnswerKey,
  strict: StrictMode,
): AnswerResult {
  const acceptedKeys =
    strict === "STRICT" ? question.strictCorrect : question.correctKeys;

  return {
    acceptedKeys,
    isCorrect: acceptedKeys.includes(chosenKey),
  };
}

export function recordQuestionAnswer(
  progress: TrainingProgress,
  question: TrainingQuestion,
  chosenKey: AnswerKey,
  strict: StrictMode,
): { readonly progress: TrainingProgress; readonly result: AnswerResult } {
  const result = scoreAnswer(question, chosenKey, strict);
  const currentCategory = progress.byCategory[question.category] ?? {
    answered: 0,
    correct: 0,
  };

  return {
    result,
    progress: {
      answered: progress.answered + 1,
      correct: progress.correct + (result.isCorrect ? 1 : 0),
      streak: result.isCorrect ? progress.streak + 1 : 0,
      seen: {
        ...progress.seen,
        [question.id]: true,
      },
      missed: result.isCorrect
        ? omitRecordKey(progress.missed, question.id)
        : {
            ...progress.missed,
            [question.id]: true,
          },
      byCategory: {
        ...progress.byCategory,
        [question.category]: {
          answered: currentCategory.answered + 1,
          correct: currentCategory.correct + (result.isCorrect ? 1 : 0),
        },
      },
    },
  };
}

function omitRecordKey<T>(
  record: Readonly<Record<string, T>>,
  keyToOmit: string,
): Record<string, T> {
  const next: Record<string, T> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key !== keyToOmit) next[key] = value;
  }

  return next;
}
