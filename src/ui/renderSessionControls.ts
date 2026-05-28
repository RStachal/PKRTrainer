import {
  MAX_BLOCK_SIZE,
  MIN_BLOCK_SIZE,
} from "../domain/trainingSession";
import type { StackBandFilter } from "../domain/stackBand";
import {
  getPresetAvailableQuestions,
  SESSION_PRESETS,
} from "../domain/sessionPresets";
import type { StrictMode, TrainingMode } from "../domain/types";

type SessionControlsState = {
  readonly blockSize: number;
  readonly seed: number;
  readonly mode: TrainingMode;
  readonly strict: StrictMode;
  readonly stackBand: StackBandFilter;
};

function renderModeOption(
  value: TrainingMode,
  label: string,
  selectedMode: TrainingMode,
): string {
  return `<option value="${value}" ${value === selectedMode ? "selected" : ""}>${label}</option>`;
}

function renderStrictOption(
  value: StrictMode,
  label: string,
  selectedStrict: StrictMode,
): string {
  return `<option value="${value}" ${value === selectedStrict ? "selected" : ""}>${label}</option>`;
}

function renderPresetButtons(): string {
  return SESSION_PRESETS.map((preset) => {
    const availableCount = getPresetAvailableQuestions(preset.id).length;
    const isThin = availableCount < preset.config.blockSize;
    const className = isThin
      ? "session-preset-button session-preset-button--thin"
      : "session-preset-button";

    return `<button class="${className}" data-session-preset="${preset.id}" type="button" data-preset-available="${availableCount}">${preset.label} <span class="session-preset-count">· ${availableCount} spotů</span></button>`;
  }).join("");
}

export function renderSessionControls(state: SessionControlsState): string {
  return `
    <section class="session-controls" aria-label="Nastaveni bloku">
      <label class="filter-picker">
        <span>Pocet otazek</span>
        <input data-block-size type="number" min="${MIN_BLOCK_SIZE}" max="${MAX_BLOCK_SIZE}" step="1" value="${state.blockSize}" />
      </label>
      <label class="filter-picker">
        <span>Seed</span>
        <input data-seed type="number" step="1" value="${state.seed}" />
      </label>
      <label class="filter-picker">
        <span>Rezim</span>
        <select data-mode>
          ${renderModeOption("MIXED", "Mixed", state.mode)}
          ${renderModeOption("MISSED", "Missed-only", state.mode)}
        </select>
      </label>
      <label class="filter-picker">
        <span>Stack band</span>
        <select data-stack-band>
          <option value="ALL" ${state.stackBand === "ALL" ? "selected" : ""}>All</option>
          <option value="BB_15_20" ${state.stackBand === "BB_15_20" ? "selected" : ""}>15-20 BB</option>
          <option value="BB_21_25" ${state.stackBand === "BB_21_25" ? "selected" : ""}>21-25 BB</option>
        </select>
      </label>
      <label class="filter-picker">
        <span>Scoring</span>
        <select data-strict>
          ${renderStrictOption("LENIENT", "Lenient", state.strict)}
          ${renderStrictOption("STRICT", "Strict", state.strict)}
        </select>
      </label>
      <button class="new-block-button" data-new-block type="button">Novy blok</button>
      <div class="session-presets" aria-label="Focused block presety">
        ${renderPresetButtons()}
      </div>
    </section>
  `;
}
