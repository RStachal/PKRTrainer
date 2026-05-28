import type { CategoryPhase, CategoryValue } from "./domain/constants";
import type { TrainingQuestion } from "./domain/question";
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
import type { StackBandFilter } from "./domain/stackBand";
import {
  getPresetAvailableQuestions,
  getSessionPreset,
  SESSION_PRESETS,
  type SessionPresetId,
} from "./domain/sessionPresets";
import {
  getAvailableCategories,
  getQuestionsForFormat,
  getSpotByQuestionId,
  normalizeCategory,
} from "./domain/appSelectors";
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
  stackBand: StackBandFilter;
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
  stackBand: "ALL",
};

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
      stackBand: state.config.stackBand,
    },
  });
}

function createSession(
  format: TrainingFormatId,
  phase: CategoryPhase | undefined,
  category: CategoryValue,
  config: SessionConfig,
  progress: TrainingProgress,
): Pick<AppState, "session" | "currentQuestion" | "currentSpot"> {
  const questions = getQuestionsForFormat(format, config.stackBand);
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
  state.category = normalizeCategory(
    state.category,
    state.format,
    state.phase,
    state.config.stackBand,
  );
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
  const next = getNextQuestion(
    state.session,
    getQuestionsForFormat(state.format, state.config.stackBand),
  );

  return {
    session: next.session,
    currentQuestion: next.question,
    currentSpot: getSpotByQuestionId(next.question?.id ?? null),
  };
}

function applySessionPreset(state: AppState, presetId: SessionPresetId): void {
  const preset = getSessionPreset(presetId);
  const availableCount = getPresetAvailableQuestions(presetId).length;
  const scaledBlockSize = clampBlockSize(
    Math.min(preset.config.blockSize, availableCount),
  );

  state.format = preset.format;
  state.phase = preset.phase;
  state.category = preset.category;
  state.config = { ...preset.config, blockSize: scaledBlockSize };

  restartBlock(state);
}

function renderSessionSummary(session: TrainingSession): string {
  const { answered, correct } = session.progress;
  const successRate =
    answered === 0 ? 0 : Math.round((correct / answered) * 100);
  const stack15 = session.progress.byStackBand.BB_15_20;
  const stack21 = session.progress.byStackBand.BB_21_25;
  const stack15Rate =
    !stack15 || stack15.answered === 0
      ? null
      : Math.round((stack15.correct / stack15.answered) * 100);
  const stack21Rate =
    !stack21 || stack21.answered === 0
      ? null
      : Math.round((stack21.correct / stack21.answered) * 100);

  return `
    <section class="session-summary" aria-label="Shrnuti session">
      <p class="summary-kicker">Session dokoncena</p>
      <h2>${correct} / ${answered} spravne</h2>
      <p>Uspesnost ${successRate} %. Dej si dalsi blok a nech statistiky ukazat, ktere spoty si rikaji o opakovani.</p>
      <div class="stack-summary">
        <div>
          <span>15-20 BB</span>
          <strong>${!stack15 ? "0/0" : `${stack15.correct}/${stack15.answered}`}</strong>
          <small>${stack15Rate === null ? "-" : `${stack15Rate} %`}</small>
        </div>
        <div>
          <span>21-25 BB</span>
          <strong>${!stack21 ? "0/0" : `${stack21.correct}/${stack21.answered}`}</strong>
          <small>${stack21Rate === null ? "-" : `${stack21Rate} %`}</small>
        </div>
      </div>
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
    stackBand: state.config.stackBand,
    byStackBand: state.session.progress.byStackBand,
  };

  return `
    <main class="trainer-shell" aria-labelledby="app-title">
      ${renderTopBar(
        state.format,
        state.phase,
        state.category,
        getAvailableCategories(state.format, state.phase, state.config.stackBand),
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
    persisted.settings?.stackBand ?? DEFAULT_SESSION_CONFIG.stackBand,
  );
  const initialConfig: SessionConfig = {
    blockSize: persisted.settings?.blockSize ?? DEFAULT_SESSION_CONFIG.blockSize,
    seed: persisted.settings?.seed ?? DEFAULT_SESSION_CONFIG.seed,
    mode: persisted.settings?.mode ?? DEFAULT_SESSION_CONFIG.mode,
    strict: persisted.settings?.strict ?? DEFAULT_SESSION_CONFIG.strict,
    stackBand: persisted.settings?.stackBand ?? DEFAULT_SESSION_CONFIG.stackBand,
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
    } else if (target.matches("[data-stack-band]")) {
      state.config = {
        ...state.config,
        stackBand: (target as HTMLSelectElement).value as StackBandFilter,
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

    const sessionPresetButton = target.closest<HTMLButtonElement>(
      "[data-session-preset]",
    );
    if (sessionPresetButton) {
      const presetId = sessionPresetButton.dataset.sessionPreset as
        | SessionPresetId
        | undefined;
      if (presetId && SESSION_PRESETS.some((preset) => preset.id === presetId)) {
        applySessionPreset(state, presetId);
        persistState(state);
        render(root, state);
      }
      return;
    }

    const stackFocusButton = target.closest<HTMLButtonElement>("[data-stack-focus]");
    if (stackFocusButton) {
      const stackFocus = stackFocusButton.dataset.stackFocus;
      if (stackFocus === "BB_15_20" || stackFocus === "BB_21_25") {
        state.config = {
          ...state.config,
          stackBand: stackFocus,
        };
        restartBlock(state);
        persistState(state);
        render(root, state);
      }
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
