import type { TrainingSpot } from "../domain/spot";
import { TRAINING_FORMATS } from "../domain/trainingFormat";
import { renderCards } from "./renderCards";

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

export function renderTable(spot: TrainingSpot): string {
  const format = TRAINING_FORMATS.find((item) => item.id === spot.format);

  return `
    <section class="phone-client" aria-label="Pokerový spot">
      <div class="client-status">
        <span>${format?.label ?? spot.format}</span>
        <strong>${spot.phase}</strong>
      </div>

      <div class="poker-table">
        <div class="felt-ring"></div>
        <div class="pot">
          <span>Pot</span>
          <strong>${spot.potLabel}</strong>
        </div>
        <div class="board">${renderCards(spot.boardCards)}</div>
        ${renderSeats(spot)}
      </div>

      <div class="hero-hand" aria-label="Hero handa">
        ${renderCards(spot.heroHand)}
      </div>
    </section>
  `;
}
