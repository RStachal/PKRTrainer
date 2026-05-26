import { getRangeProfile } from "../content/ranges/rangeProfileRegistry";
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
        <button class="action-button ${resultClass}" data-action="${action}" type="button" aria-disabled="${selectedAction === null ? "false" : "true"}">
          ${getActionLabel(action)}
        </button>
      `;
    })
    .join("");
}

function renderFeedback(
  spot: TrainingSpot,
  selectedAction: ActionId | null,
): string {
  if (selectedAction === null) {
    return "";
  }

  const isCorrect = selectedAction === spot.correctAction;

  return `
    <p class="feedback ${isCorrect ? "is-correct" : "is-wrong"}">
      ${isCorrect ? "Spravne." : `Spatne. Spravna akce je ${getActionLabel(spot.correctAction)}.`}
    </p>
  `;
}

function formatStackBand(stackBand: string): string {
  return stackBand.replace("BB", " BB");
}

function getSpotStackBandLabel(spot: TrainingSpot): string | null {
  if (spot.rangeProfileId) {
    try {
      return formatStackBand(getRangeProfile(spot.rangeProfileId).stackBand);
    } catch {
      return null;
    }
  }

  const match = spot.effectiveStack.match(/(\d+(?:\.\d+)?)\s*BB/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (value >= 15 && value <= 20) return "15-20 BB";
  if (value >= 21 && value <= 25) return "21-25 BB";
  return null;
}

export function renderDecisionPanel(
  spot: TrainingSpot,
  selectedAction: ActionId | null,
  isLastQuestion = false,
): string {
  const stackBandLabel = getSpotStackBandLabel(spot);

  return `
    <section class="decision-panel" aria-label="Treninkova otazka">
      <div class="spot-heading">
        <div class="spot-meta">
          <p>${spot.category} · ${spot.effectiveStack}</p>
          ${stackBandLabel ? `<span class="stack-band-badge">${stackBandLabel}</span>` : ""}
        </div>
        <h2>${spot.title}</h2>
      </div>
      <p class="prompt">${spot.prompt}</p>
      <div class="action-grid">${renderActionButtons(spot, selectedAction)}</div>
      ${renderFeedback(spot, selectedAction)}
      ${
        selectedAction === null
          ? ""
          : `<button class="next-button" data-next type="button">${isLastQuestion ? "Zobrazit shrnuti" : "Dalsi spot"}</button>`
      }
    </section>
  `;
}
