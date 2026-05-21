import type { CategoryPhase, CategoryValue } from "./domain/constants";
import { TRAINING_SPOTS } from "./content/spots";
import type { TrainingQuestion } from "./domain/question";
import { questionFromSpot } from "./domain/questionFromSpot";
import type { ActionId, TrainingSpot } from "./domain/spot";
import {
  EMPTY_STATISTICS,
  recordSpotAnswer,
  type TrainingStatistics,
} from "./domain/statistics";
import {
  clampBlockSize,
  createTrainingSession,
  EMPTY_TRAINING_PROGRESS,
  getNextQuestion,
  recordQuestionAnswer,
  type TrainingProgress,
  type TrainingSession,
} from "./domain/trainingSession";
import {
  DEFAULT_TRAINING_FORMAT,
  type TrainingFormatId,
} from "./domain/trainingFormat";
import type { StrictMode, TrainingMode } from "./domain/types";
import {
  loadAppState,
  resetAppState,
  saveAppState,
} from "./state/appStorage";
import type { PhaseFilter } from "./ui/phaseFilter";
import { toSelectionPhase } from "./ui/phaseFilter";
import { renderDecisionPanel } from "./ui/renderDecisionPanel";
import { renderEmptyState } from "./ui/renderEmptyState";
import { renderRangePanel } from "./ui/renderRangePanel";
import { renderSessionControls } from "./ui/renderSessionControls";
import { renderStatsStrip } from "./ui/renderStatsStrip";
import { renderTable } from "./ui/renderTable";
import { renderTopBar } from "./ui/renderTopBar";

type SessionConfig = {
  blockSize: number;
  seed: number;
  mode: TrainingMode;
  strict: StrictMode;
};

type AppState = {
  format: TrainingFormatId;
  phase: PhaseFilter;
  category: CategoryValue;
  config: SessionConfig;
  progress: TrainingProgress;
  session: TrainingSession;
  currentQuestion: TrainingQuestion | null;
  currentSpot: TrainingSpot | null;
  selectedAction: ActionId | null;
  statistics: TrainingStatistics;
};

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  blockSize: 10,
  seed: 1,
  mode: "MIXED",
  strict: "LENIENT",
};
const QUESTIONS_BY_SPOT_ID = new Map(
  TRAINING_SPOTS.map((spot) => [spot.id, questionFromSpot(spot)]),
);

function persistState(state: AppState): void {
  if (typeof window === "undefined") return;

  saveAppState(window.localStorage, {
    version: 2,
    statistics: state.statistics,
    progress: state.progress,
    settings: {
      format: state.format,
      phase: state.phase,
      category: state.category,
      blockSize: state.config.blockSize,
      seed: state.config.seed,
      mode: state.config.mode,
      strict: state.config.strict,
    },
  });
}

function getQuestionsForFormat(
  format: TrainingFormatId,
): readonly TrainingQuestion[] {
  return TRAINING_SPOTS.filter((spot) => spot.format === format).map(
    (spot) => QUESTIONS_BY_SPOT_ID.get(spot.id) ?? questionFromSpot(spot),
  );
}

function getQuestionsForSelection(
  format: TrainingFormatId,
  phase: PhaseFilter,
): readonly TrainingQuestion[] {
  const selectedPhase = toSelectionPhase(phase);

  return getQuestionsForFormat(format).filter(
    (question) => !selectedPhase || question.phase === selectedPhase,
  );
}

function getAvailableCategories(
  format: TrainingFormatId,
  phase: PhaseFilter,
): readonly CategoryValue[] {
  return Array.from(
    new Set(getQuestionsForSelection(format, phase).map((question) => question.category)),
  ).sort();
}

function normalizeCategory(
  category: CategoryValue,
  format: TrainingFormatId,
  phase: PhaseFilter,
): CategoryValue {
  if (category === "ALL") return category;
  return getAvailableCategories(format, phase).includes(category) ? category : "ALL";
}

function getSpotByQuestionId(questionId: string | null): TrainingSpot | null {
  if (!questionId) return null;
  return TRAINING_SPOTS.find((spot) => spot.id === questionId) ?? null;
}

function createSession(
  format: TrainingFormatId,
  phase: CategoryPhase | undefined,
  category: CategoryValue,
  config: SessionConfig,
  progress: TrainingProgress,
): Pick<AppState, "session" | "currentQuestion" | "currentSpot"> {
  const questions = getQuestionsForFormat(format);
  const session = createTrainingSession(
    questions,
    {
      blockSize: config.blockSize,
      seed: config.seed,
      mode: config.mode,
      strict: config.strict,
      phase: phase ?? "ALL",
      category,
    },
    progress,
  );
  const next = getNextQuestion(session, questions);

  return {
    session: next.session,
    currentQuestion: next.question,
    currentSpot: getSpotByQuestionId(next.question?.id ?? null),
  };
}

function restartBlock(state: AppState): void {
  state.category = normalizeCategory(state.category, state.format, state.phase);
  Object.assign(
    state,
    createSession(
      state.format,
      toSelectionPhase(state.phase),
      state.category,
      state.config,
      state.progress,
    ),
  );
  state.selectedAction = null;
}

function advanceSession(
  state: AppState,
): Pick<AppState, "session" | "currentQuestion" | "currentSpot"> {
  const next = getNextQuestion(state.session, getQuestionsForFormat(state.format));

  return {
    session: next.session,
    currentQuestion: next.question,
    currentSpot: getSpotByQuestionId(next.question?.id ?? null),
  };
}

function renderSessionSummary(session: TrainingSession): string {
  const { answered, correct } = session.progress;
  const successRate =
    answered === 0 ? 0 : Math.round((correct / answered) * 100);

  return `
    <section class="session-summary" aria-label="Shrnuti session">
      <p class="summary-kicker">Session dokoncena</p>
      <h2>${correct} / ${answered} spravne</h2>
      <p>Uspesnost ${successRate} %. Dej si dalsi blok a nech statistiky ukazat, ktere spoty si rikaji o opakovani.</p>
      <button class="next-button" data-new-block type="button">Novy blok</button>
    </section>
  `;
}

function createAppMarkup(state: AppState): string {
  const blockSize = state.session.questionOrder.length;
  const isComplete = blockSize > 0 && state.currentSpot === null;
  const sessionProgress = {
    answered: state.session.progress.answered,
    correct: state.session.progress.correct,
    remaining: state.session.remaining,
    streak: state.session.progress.streak,
  };

  return `
    <main class="trainer-shell" aria-labelledby="app-title">
      ${renderTopBar(
        state.format,
        state.phase,
        state.category,
        getAvailableCategories(state.format, state.phase),
      )}
      ${renderSessionControls(state.config)}
      ${renderStatsStrip(state.statistics, sessionProgress)}
      ${
        isComplete
          ? renderSessionSummary(state.session)
          : state.currentSpot
            ? `
              <section class="client-layout">
                ${renderTable(state.currentSpot)}
                ${renderDecisionPanel(
                  state.currentSpot,
                  state.selectedAction,
                  state.session.remaining === 0,
                )}
                ${
                  state.selectedAction === null
                    ? ""
                    : renderRangePanel(state.currentSpot, state.statistics)
                }
              </section>
            `
            : renderEmptyState(state.format, state.phase)
      }
    </main>
  `;
}

function render(root: HTMLElement, state: AppState): void {
  root.innerHTML = createAppMarkup(state);
}

export function renderApp(root: HTMLElement): void {
  const persisted =
    typeof window === "undefined"
      ? {
          statistics: EMPTY_STATISTICS,
          progress: EMPTY_TRAINING_PROGRESS,
          settings: null,
        }
      : loadAppState(window.localStorage);
  const defaultPhase: PhaseFilter = persisted.settings?.phase ?? "ALL";
  const defaultCategory = normalizeCategory(
    persisted.settings?.category ?? "ALL",
    persisted.settings?.format ?? DEFAULT_TRAINING_FORMAT,
    defaultPhase,
  );
  const initialConfig: SessionConfig = {
    blockSize: persisted.settings?.blockSize ?? DEFAULT_SESSION_CONFIG.blockSize,
    seed: persisted.settings?.seed ?? DEFAULT_SESSION_CONFIG.seed,
    mode: persisted.settings?.mode ?? DEFAULT_SESSION_CONFIG.mode,
    strict: persisted.settings?.strict ?? DEFAULT_SESSION_CONFIG.strict,
  };
  const initialSession = createSession(
    persisted.settings?.format ?? DEFAULT_TRAINING_FORMAT,
    toSelectionPhase(defaultPhase),
    defaultCategory,
    initialConfig,
    persisted.progress,
  );
  const state: AppState = {
    format: persisted.settings?.format ?? DEFAULT_TRAINING_FORMAT,
    phase: defaultPhase,
    category: defaultCategory,
    config: initialConfig,
    progress: persisted.progress,
    ...initialSession,
    selectedAction: null,
    statistics: persisted.statistics,
  };

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-format]")) {
      state.format = (target as HTMLSelectElement).value as TrainingFormatId;
      state.category = "ALL";
    } else if (target.matches("[data-phase]")) {
      state.phase = (target as HTMLSelectElement).value as PhaseFilter;
      state.category = "ALL";
    } else if (target.matches("[data-category]")) {
      state.category = (target as HTMLSelectElement).value as CategoryValue;
    } else if (target.matches("[data-mode]")) {
      state.config = {
        ...state.config,
        mode: (target as HTMLSelectElement).value as TrainingMode,
      };
    } else if (target.matches("[data-strict]")) {
      state.config = {
        ...state.config,
        strict: (target as HTMLSelectElement).value as StrictMode,
      };
    } else if (target.matches("[data-block-size]")) {
      state.config = {
        ...state.config,
        blockSize: clampBlockSize(Number((target as HTMLInputElement).value)),
      };
    } else if (target.matches("[data-seed]")) {
      const seed = Number((target as HTMLInputElement).value);
      state.config = {
        ...state.config,
        seed: Number.isFinite(seed) ? Math.trunc(seed) : 1,
      };
    } else {
      return;
    }

    restartBlock(state);
    persistState(state);
    render(root, state);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    if (actionButton && state.currentSpot && state.currentQuestion) {
      if (state.selectedAction !== null) return;

      const action = actionButton.dataset.action as ActionId;
      const answer = recordQuestionAnswer(
        state.session.progress,
        state.currentQuestion,
        action,
        state.session.strict,
      );

      state.selectedAction = action;
      state.progress = answer.progress;
      state.session = {
        ...state.session,
        progress: answer.progress,
      };
      state.statistics = recordSpotAnswer(
        state.statistics,
        state.currentSpot.id,
        answer.result.isCorrect,
      );
      persistState(state);
      render(root, state);
      return;
    }

    if (target.closest("[data-next]")) {
      Object.assign(state, advanceSession(state));
      state.selectedAction = null;
      render(root, state);
      return;
    }

    if (target.closest("[data-new-block]")) {
      restartBlock(state);
      persistState(state);
      render(root, state);
      return;
    }

    if (target.closest("[data-reset-stats]")) {
      resetAppState(window.localStorage);
      state.statistics = EMPTY_STATISTICS;
      state.progress = EMPTY_TRAINING_PROGRESS;
      restartBlock(state);
      persistState(state);
      render(root, state);
    }
  });

  render(root, state);
}
