import { CATEGORY_OPTIONS, type CategoryValue } from "../domain/constants";
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

function renderCategoryOptions(
  selectedCategory: CategoryValue,
  selectedPhase: PhaseFilter,
  availableCategories: readonly CategoryValue[],
): string {
  const available = new Set<CategoryValue>(["ALL", ...availableCategories]);

  return CATEGORY_OPTIONS.filter(
    (category) =>
      available.has(category.value as CategoryValue) &&
      (category.phase === "ALL" ||
        selectedPhase === "ALL" ||
        category.phase === selectedPhase),
  )
    .map(
      (category) => `
      <option value="${category.value}" ${category.value === selectedCategory ? "selected" : ""}>
        ${category.label}
      </option>
    `,
    )
    .join("");
}

export function renderTopBar(
  selectedFormat: TrainingFormatId,
  selectedPhase: PhaseFilter,
  selectedCategory: CategoryValue,
  availableCategories: readonly CategoryValue[],
): string {
  return `
    <header class="top-bar">
      <div>
        <p class="app-kicker">Univerzalni pokerovy trener</p>
        <h1 id="app-title">PKRTrainer 2.0</h1>
      </div>
      <div class="top-controls">
        <label class="filter-picker">
          <span>Format</span>
          <select data-format>
            ${renderFormatOptions(selectedFormat)}
          </select>
        </label>
        <label class="filter-picker">
          <span>Faze</span>
          <select data-phase>
            ${renderPhaseOptions(selectedPhase)}
          </select>
        </label>
        <label class="filter-picker category-picker">
          <span>Kategorie</span>
          <select data-category>
            ${renderCategoryOptions(
              selectedCategory,
              selectedPhase,
              availableCategories,
            )}
          </select>
        </label>
      </div>
    </header>
  `;
}
