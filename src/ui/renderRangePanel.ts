import type { TrainingSpot } from "../domain/spot";
import {
  getSpotStat,
  getSuccessRate,
  type TrainingStatistics,
} from "../domain/statistics";
import { getActionLabel } from "./actionLabels";
import { renderRangeMatrix } from "./renderRangeMatrix";

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

export function renderRangePanel(
  spot: TrainingSpot,
  statistics: TrainingStatistics,
): string {
  const stat = getSpotStat(statistics, spot.id);
  const successRate = getSuccessRate(stat);

  return `
    <section class="range-panel" aria-label="Range a vysvětlení">
      <div class="mini-stat">
        <span>Úspěšnost spotu</span>
        <strong>${successRate === null ? "Nový" : `${Math.round(successRate * 100)} %`}</strong>
        <small>${stat.attempts} odpovědí</small>
      </div>
      <h2>${spot.range.title}</h2>
      <p>${spot.range.summary}</p>
      ${
        spot.phase === "PREFLOP"
          ? renderRangeMatrix(spot.range.cells)
          : `<div class="range-grid">${renderRange(spot)}</div>`
      }
      <h3>Vysvětlení</h3>
      <p>${spot.explanation}</p>
    </section>
  `;
}
