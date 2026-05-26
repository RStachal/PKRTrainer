import type { TrainingSpot } from "../domain/spot";
import {
  getSpotStat,
  getSuccessRate,
  type TrainingStatistics,
} from "../domain/statistics";
import type { RangeProfileSourceQuality } from "../domain/rangeProfile";
import { getRangeProfile } from "../content/ranges/rangeProfileRegistry";
import { getActionLabel } from "./actionLabels";
import { renderRangeMatrix } from "./renderRangeMatrix";

function renderRangeContext(spot: TrainingSpot): string {
  const heroSeat = spot.seats.find((seat) => seat.isHero);
  const opponentSeats = spot.seats
    .filter((seat) => !seat.isHero)
    .map((seat) => `${seat.position}: ${seat.label}`)
    .join(" / ");

  return `
    <div class="range-context" aria-label="Kontext range">
      <span>${spot.format}</span>
      <span>${spot.effectiveStack}</span>
      <span>${spot.category}</span>
      ${heroSeat ? `<span>Hero ${heroSeat.position}</span>` : ""}
      ${opponentSeats ? `<span>${opponentSeats}</span>` : ""}
    </div>
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

function getRangeSourceQuality(spot: TrainingSpot): RangeProfileSourceQuality {
  if (!spot.rangeProfileId) {
    return "draft";
  }

  try {
    return getRangeProfile(spot.rangeProfileId).sourceQuality;
  } catch {
    return "draft";
  }
}

function renderRangeQualityBadge(quality: RangeProfileSourceQuality): string {
  const isReviewed = quality === "reviewed";

  return `<span class="range-badge ${isReviewed ? "is-reviewed" : "is-draft"}">${isReviewed ? "Reviewed" : "Draft"}</span>`;
}

export function renderRangePanel(
  spot: TrainingSpot,
  statistics: TrainingStatistics,
): string {
  const stat = getSpotStat(statistics, spot.id);
  const successRate = getSuccessRate(stat);
  const quality = getRangeSourceQuality(spot);

  return `
    <section class="range-panel" aria-label="Range a vysvetleni">
      <div class="mini-stat">
        <span>Uspesnost spotu</span>
        <strong>${successRate === null ? "Novy" : `${Math.round(successRate * 100)} %`}</strong>
        <small>${stat.attempts} odpovedi</small>
      </div>
      <div class="range-header">
        <h2>${spot.range.title}</h2>
        ${renderRangeQualityBadge(quality)}
      </div>
      ${renderRangeContext(spot)}
      <p>${spot.range.summary}</p>
      ${
        spot.phase === "PREFLOP"
          ? renderRangeMatrix(spot.range.cells)
          : `<div class="range-grid">${renderRange(spot)}</div>`
      }
      <h3>Vysvetleni spravne odpovedi</h3>
      <p>${spot.explanation}</p>
    </section>
  `;
}
