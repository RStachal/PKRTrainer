import type { ActionId, TrainingSpot } from "../domain/spot";
import { getActionLabel } from "./actionLabels";

function renderActionButtons(
  spot: TrainingSpot,
  selectedAction: ActionId | null,
): string {
  return spot.answerOptions
    .map((action) => {
      const isSelected = selectedAction === action;
      const isCorrect = action === spot.correctAction;
      const resultClass =
        selectedAction === null
          ? ""
          : isCorrect
            ? "is-correct"
            : isSelected
              ? "is-wrong"
              : "";

      return `
        <button class="action-button ${resultClass}" data-action="${action}" type="button" ${selectedAction === null ? "" : "disabled"}>
          ${getActionLabel(action)}
        </button>
      `;
    })
    .join("");
}

function renderFeedback(spot: TrainingSpot, selectedAction: ActionId | null): string {
  if (selectedAction === null) {
    return `<p class="feedback is-neutral">Vyber výchozí akci pro daný spot.</p>`;
  }

  const isCorrect = selectedAction === spot.correctAction;

  return `
    <p class="feedback ${isCorrect ? "is-correct" : "is-wrong"}">
      ${isCorrect ? "Správně." : `Špatně. Správná akce je ${getActionLabel(spot.correctAction)}.`}
    </p>
  `;
}

export function renderDecisionPanel(
  spot: TrainingSpot,
  selectedAction: ActionId | null,
): string {
  return `
    <section class="decision-panel" aria-label="Tréninková otázka">
      <div class="spot-heading">
        <p>${spot.category} · ${spot.effectiveStack}</p>
        <h2>${spot.title}</h2>
      </div>
      <p class="prompt">${spot.prompt}</p>
      <div class="action-grid">${renderActionButtons(spot, selectedAction)}</div>
      ${renderFeedback(spot, selectedAction)}
      <button class="next-button" data-next type="button">Další spot</button>
    </section>
  `;
}
