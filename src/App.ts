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
  statistics: TrainingStatistics;
};

const rng = mulberry32(1);

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

function createAppMarkup(state: AppState): string {
  return `
    <main class="trainer-shell" aria-labelledby="app-title">
      ${renderTopBar(state.format, state.phase)}
      ${renderStatsStrip(state.statistics)}
      ${
        state.spot
          ? `
            <section class="client-layout">
              ${renderTable(state.spot)}
              ${renderDecisionPanel(state.spot, state.selectedAction)}
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
    render(root, state);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    if (actionButton && state.spot) {
      const action = actionButton.dataset.action as ActionId;
      state.selectedAction = action;
      state.statistics = recordSpotAnswer(
        state.statistics,
        state.spot.id,
        action === state.spot.correctAction,
      );
      saveStatistics(window.localStorage, state.statistics);
      render(root, state);
      return;
    }

    if (target.closest("[data-next]")) {
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
