import type { CategoryPhase } from "./domain/constants";
import { TRAINING_SPOTS } from "./content/spots";
import { mulberry32 } from "./domain/random";
import { selectNextSpot } from "./domain/selectNextSpot";
import type { ActionId, TrainingSpot } from "./domain/spot";
import {
  EMPTY_STATISTICS,
  recordSpotAnswer,
  type TrainingStatistics,
} from "./domain/statistics";
import {
  DEFAULT_TRAINING_FORMAT,
  type TrainingFormatId,
} from "./domain/trainingFormat";
import {
  loadStatistics,
  resetStatistics,
  saveStatistics,
} from "./state/appStorage";
import type { PhaseFilter } from "./ui/phaseFilter";
import { toSelectionPhase } from "./ui/phaseFilter";
import { renderDecisionPanel } from "./ui/renderDecisionPanel";
import { renderEmptyState } from "./ui/renderEmptyState";
import { renderRangePanel } from "./ui/renderRangePanel";
import { renderStatsStrip } from "./ui/renderStatsStrip";
import { renderTable } from "./ui/renderTable";
import { renderTopBar } from "./ui/renderTopBar";

type AppState = {
  format: TrainingFormatId;
  phase: PhaseFilter;
  spot: TrainingSpot | null;
  selectedAction: ActionId | null;
  session: SessionState;
  statistics: TrainingStatistics;
};

type SessionState = {
  answered: number;
  correct: number;
  isComplete: boolean;
};

const SESSION_GOAL = 10;
const rng = mulberry32(1);

function createEmptySession(): SessionState {
  return {
    answered: 0,
    correct: 0,
    isComplete: false,
  };
}

function getFirstSpot(
  format: TrainingFormatId,
  phase: CategoryPhase | undefined,
): TrainingSpot | null {
  return (
    TRAINING_SPOTS.find((spot) => {
      if (spot.format !== format) return false;
      if (phase && spot.phase !== phase) return false;
      return true;
    }) ?? null
  );
}

function selectSpot(state: AppState): TrainingSpot | null {
  return selectNextSpot(TRAINING_SPOTS, state.statistics, rng, {
    format: state.format,
    phase: toSelectionPhase(state.phase),
  });
}

function renderSessionSummary(session: SessionState): string {
  const successRate =
    session.answered === 0
      ? 0
      : Math.round((session.correct / session.answered) * 100);

  return `
    <section class="session-summary" aria-label="Shrnutí session">
      <p class="summary-kicker">Session dokončena</p>
      <h2>${session.correct} / ${session.answered} správně</h2>
      <p>Úspěšnost ${successRate} %. Dej si další kolo a nech statistiky ukázat, které spoty si říkají o opakování.</p>
      <button class="next-button" data-new-session type="button">Nová session</button>
    </section>
  `;
}

function createAppMarkup(state: AppState): string {
  const sessionProgress = {
    answered: state.session.answered,
    correct: state.session.correct,
    goal: SESSION_GOAL,
  };

  return `
    <main class="trainer-shell" aria-labelledby="app-title">
      ${renderTopBar(state.format, state.phase)}
      ${renderStatsStrip(state.statistics, sessionProgress)}
      ${
        state.session.isComplete
          ? renderSessionSummary(state.session)
          : state.spot
            ? `
              <section class="client-layout">
                ${renderTable(state.spot)}
                ${renderDecisionPanel(
                  state.spot,
                  state.selectedAction,
                  state.session.answered >= SESSION_GOAL,
                )}
                ${renderRangePanel(state.spot, state.statistics)}
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
  const statistics =
    typeof window === "undefined"
      ? EMPTY_STATISTICS
      : loadStatistics(window.localStorage);
  const defaultPhase: PhaseFilter = "ALL";
  const state: AppState = {
    format: DEFAULT_TRAINING_FORMAT,
    phase: defaultPhase,
    spot: getFirstSpot(DEFAULT_TRAINING_FORMAT, toSelectionPhase(defaultPhase)),
    selectedAction: null,
    session: createEmptySession(),
    statistics,
  };

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    if (target.matches("[data-format]")) {
      state.format = target.value as TrainingFormatId;
    } else if (target.matches("[data-phase]")) {
      state.phase = target.value as PhaseFilter;
    } else {
      return;
    }

    state.spot = getFirstSpot(state.format, toSelectionPhase(state.phase));
    state.selectedAction = null;
    state.session = createEmptySession();
    render(root, state);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    if (actionButton && state.spot) {
      if (state.selectedAction !== null) return;

      const action = actionButton.dataset.action as ActionId;
      const wasCorrect = action === state.spot.correctAction;
      state.selectedAction = action;
      state.session = {
        answered: state.session.answered + 1,
        correct: state.session.correct + (wasCorrect ? 1 : 0),
        isComplete: false,
      };
      state.statistics = recordSpotAnswer(
        state.statistics,
        state.spot.id,
        wasCorrect,
      );
      saveStatistics(window.localStorage, state.statistics);
      render(root, state);
      return;
    }

    if (target.closest("[data-next]")) {
      if (state.session.answered >= SESSION_GOAL) {
        state.session = {
          ...state.session,
          isComplete: true,
        };
        render(root, state);
        return;
      }

      state.spot =
        selectSpot(state) ??
        getFirstSpot(state.format, toSelectionPhase(state.phase));
      state.selectedAction = null;
      render(root, state);
      return;
    }

    if (target.closest("[data-new-session]")) {
      state.session = createEmptySession();
      state.spot =
        selectSpot(state) ??
        getFirstSpot(state.format, toSelectionPhase(state.phase));
      state.selectedAction = null;
      render(root, state);
      return;
    }

    if (target.closest("[data-reset-stats]")) {
      resetStatistics(window.localStorage);
      state.statistics = EMPTY_STATISTICS;
      state.selectedAction = null;
      render(root, state);
    }
  });

  render(root, state);
}
