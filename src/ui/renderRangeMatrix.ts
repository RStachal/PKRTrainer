import {
  PREFLOP_HAND_MATRIX,
  PREFLOP_RANKS,
} from "../domain/preflopMatrix";
import type { RangeCell } from "../domain/spot";
import { getActionLabel } from "./actionLabels";

function indexRangeCells(cells: readonly RangeCell[]): Map<string, RangeCell> {
  return new Map(cells.map((cell) => [cell.hand, cell]));
}

export function renderRangeMatrix(cells: readonly RangeCell[]): string {
  const byHand = indexRangeCells(cells);

  return `
    <div class="range-matrix" role="grid" aria-label="Preflop range matice">
      <div class="matrix-corner" aria-hidden="true"></div>
      ${PREFLOP_RANKS.map((rank) => `<div class="matrix-head">${rank}</div>`).join("")}
      ${PREFLOP_HAND_MATRIX.map((row, rowIndex) => {
        const rank = PREFLOP_RANKS[rowIndex];

        return `
          <div class="matrix-head">${rank}</div>
          ${row
            .map((hand) => {
              const cell = byHand.get(hand);
              const weight = cell?.weight ?? "none";
              const label = cell ? getActionLabel(cell.action) : "Fold";

              return `
                <div class="matrix-cell weight-${weight}" role="gridcell" aria-label="${hand}: ${label}">
                  <strong>${hand}</strong>
                  <span>${label}</span>
                </div>
              `;
            })
            .join("")}
        `;
      }).join("")}
    </div>
  `;
}
