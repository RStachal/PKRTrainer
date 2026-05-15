import { mulberry32 } from "./domain/random";
import { selectNextSpot } from "./domain/selectNextSpot";
import type { ActionId, TrainingSpot } from "./domain/spot";
import { TRAINING_SPOTS } from "./domain/spot";
import {
  EMPTY_STATISTICS,
  getOverallStatistics,
  getSpotStat,
  getSuccessRate,
  recordSpotAnswer,
  type TrainingStatistics,
} from "./domain/statistics";
import {
  DEFAULT_TRAINING_FORMAT,
  TRAINING_FORMATS,
  type TrainingFormatId,
} from "./domain/trainingFormat";
import {
  loadStatistics,
  resetStatistics,
  saveStatistics,
} from "./state/appStorage";

const ACTION_LABELS: Record<ActionId, string> = {
  FOLD: "Fold",
  CHECK: "Check",
  CALL: "Call",
  BET: "Bet",
  RAISE: "Raise",
  OPEN: "Open",
  JAM: "Jam",
};

type AppState = {
  format: TrainingFormatId;
  spot: TrainingSpot;
  selectedAction: ActionId | null;
  statistics: TrainingStatistics;
};

const rng = mulberry32(1);

function getFirstSpot(format: TrainingFormatId): TrainingSpot {
  return (
    TRAINING_SPOTS.find((spot) => spot.format === format) ?? TRAINING_SPOTS[0]
  );
}

function getActionLabel(action: ActionId): string {
  return ACTION_LABELS[action];
}

function getCardSuitClass(card: string): string {
  if (card.includes("♥") || card.includes("♦")) return "is-red";
  return "is-black";
}

function renderCards(cards: readonly string[] = []): string {
  if (cards.length === 0) return `<span class="empty-board">Před flopem</span>`;

  return cards
    .map(
      (card) =>
        `<span class="card ${getCardSuitClass(card)}" aria-label="${card}">${card}</span>`,
    )
    .join("");
}

function renderSeats(spot: TrainingSpot): string {
  return spot.seats
    .map(
      (seat, index) => `
        <div class="seat seat-${index + 1} ${seat.isHero ? "is-hero" : ""}">
          <span>${seat.position}</span>
          <strong>${seat.label}</strong>
        </div>
      `,
    )
    .join("");
}

function renderFormatOptions(selectedFormat: TrainingFormatId): string {
  return TRAINING_FORMATS.map(
    (format) => `
      <option value="${format.id}" ${format.id === selectedFormat ? "selected" : ""}>
        ${format.label}
      </option>
    `,
  ).join("");
}

function renderActionButtons(state: AppState): string {
  return state.spot.answerOptions
    .map((action) => {
      const isSelected = state.selectedAction === action;
      const isCorrect = action === state.spot.correctAction;
      const resultClass =
        state.selectedAction === null
          ? ""
          : isCorrect
            ? "is-correct"
            : isSelected
              ? "is-wrong"
              : "";

      return `
        <button class="action-button ${resultClass}" data-action="${action}" type="button">
          ${getActionLabel(action)}
        </button>
      `;
    })
    .join("");
}

function renderFeedback(state: AppState): string {
  if (state.selectedAction === null) {
    return `<p class="feedback is-neutral">Vyber výchozí akci pro daný spot.</p>`;
  }

  const isCorrect = state.selectedAction === state.spot.correctAction;

  return `
    <p class="feedback ${isCorrect ? "is-correct" : "is-wrong"}">
      ${isCorrect ? "Správně." : `Špatně. Správná akce je ${getActionLabel(state.spot.correctAction)}.`}
    </p>
  `;
}

function renderRange(spot: TrainingSpot): string {
  return spot.range.cells
    .map(
      (cell) => `
        <div class="range-cell weight-${cell.weight}">
          <strong>${cell.hand}</strong>
          <span>${getActionLabel(cell.action)}</span>
        </div>
      `,
    )
    .join("");
}

function createAppMarkup(state: AppState): string {
  const format = TRAINING_FORMATS.find((item) => item.id === state.format);
  const stat = getSpotStat(state.statistics, state.spot.id);
  const successRate = getSuccessRate(stat);
  const overall = getOverallStatistics(state.statistics);
  const overallSuccessRate = getSuccessRate(overall);

  return `
    <main class="trainer-shell" aria-labelledby="app-title">
      <header class="top-bar">
        <div>
          <p class="app-kicker">Univerzální pokerový trenér</p>
          <h1 id="app-title">PKRTrainer 2.0</h1>
        </div>
        <label class="format-picker">
          <span>Formát</span>
          <select data-format>
            ${renderFormatOptions(state.format)}
          </select>
        </label>
      </header>

      <section class="stats-strip" aria-label="Celkové statistiky">
        <div>
          <span>Celkem odpovědí</span>
          <strong>${overall.attempts}</strong>
        </div>
        <div>
          <span>Celková úspěšnost</span>
          <strong>${overallSuccessRate === null ? "Nový trénink" : `${Math.round(overallSuccessRate * 100)} %`}</strong>
        </div>
        <button class="reset-button" data-reset-stats type="button">Reset statistik</button>
      </section>

      <section class="client-layout">
        <section class="phone-client" aria-label="Pokerový spot">
          <div class="client-status">
            <span>${format?.label ?? state.format}</span>
            <strong>${state.spot.phase}</strong>
          </div>

          <div class="poker-table">
            <div class="felt-ring"></div>
            <div class="pot">
              <span>Pot</span>
              <strong>${state.spot.potLabel}</strong>
            </div>
            <div class="board">${renderCards(state.spot.boardCards)}</div>
            ${renderSeats(state.spot)}
          </div>

          <div class="hero-hand" aria-label="Hero handa">
            ${renderCards(state.spot.heroHand)}
          </div>
        </section>

        <section class="decision-panel" aria-label="Tréninková otázka">
          <div class="spot-heading">
            <p>${state.spot.category} · ${state.spot.effectiveStack}</p>
            <h2>${state.spot.title}</h2>
          </div>
          <p class="prompt">${state.spot.prompt}</p>
          <div class="action-grid">${renderActionButtons(state)}</div>
          ${renderFeedback(state)}
          <button class="next-button" data-next type="button">Další spot</button>
        </section>

        <section class="range-panel" aria-label="Range a vysvětlení">
          <div class="mini-stat">
            <span>Úspěšnost spotu</span>
            <strong>${successRate === null ? "Nový" : `${Math.round(successRate * 100)} %`}</strong>
            <small>${stat.attempts} odpovědí</small>
          </div>
          <h2>${state.spot.range.title}</h2>
          <p>${state.spot.range.summary}</p>
          <div class="range-grid">${renderRange(state.spot)}</div>
          <h3>Vysvětlení</h3>
          <p>${state.spot.explanation}</p>
        </section>
      </section>
    </main>
  `;
}

function render(root: HTMLElement, state: AppState): void {
  root.innerHTML = createAppMarkup(state);
}

export function renderApp(root: HTMLElement): void {
  const state: AppState = {
    format: DEFAULT_TRAINING_FORMAT,
    spot: getFirstSpot(DEFAULT_TRAINING_FORMAT),
    selectedAction: null,
    statistics:
      typeof window === "undefined"
        ? EMPTY_STATISTICS
        : loadStatistics(window.localStorage),
  };

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!target.matches("[data-format]")) return;

    state.format = target.value as TrainingFormatId;
    state.spot = getFirstSpot(state.format);
    state.selectedAction = null;
    render(root, state);
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    if (actionButton) {
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
        selectNextSpot(TRAINING_SPOTS, state.statistics, rng, {
          format: state.format,
        }) ?? getFirstSpot(state.format);
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
