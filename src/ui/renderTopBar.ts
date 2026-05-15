import { TRAINING_FORMATS, type TrainingFormatId } from "../domain/trainingFormat";
import { PHASE_FILTERS, type PhaseFilter } from "./phaseFilter";

function renderFormatOptions(selectedFormat: TrainingFormatId): string {
  return TRAINING_FORMATS.map(
    (format) => `
      <option value="${format.id}" ${format.id === selectedFormat ? "selected" : ""}>
        ${format.label}
      </option>
    `,
  ).join("");
}

function renderPhaseOptions(selectedPhase: PhaseFilter): string {
  return PHASE_FILTERS.map(
    (phase) => `
      <option value="${phase.value}" ${phase.value === selectedPhase ? "selected" : ""}>
        ${phase.label}
      </option>
    `,
  ).join("");
}

export function renderTopBar(
  selectedFormat: TrainingFormatId,
  selectedPhase: PhaseFilter,
): string {
  return `
    <header class="top-bar">
      <div>
        <p class="app-kicker">Univerzální pokerový trenér</p>
        <h1 id="app-title">PKRTrainer 2.0</h1>
      </div>
      <div class="top-controls">
        <label class="filter-picker">
          <span>Formát</span>
          <select data-format>
            ${renderFormatOptions(selectedFormat)}
          </select>
        </label>
        <label class="filter-picker">
          <span>Fáze</span>
          <select data-phase>
            ${renderPhaseOptions(selectedPhase)}
          </select>
        </label>
      </div>
    </header>
  `;
}
