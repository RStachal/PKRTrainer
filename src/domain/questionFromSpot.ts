import type { CategoryValue } from "./constants";
import type { TrainingQuestion } from "./question";
import type { ActionId, TrainingSpot } from "./spot";

function actionLabel(action: ActionId): string {
  return action;
}

function toQuestionCategory(spot: TrainingSpot): Exclude<CategoryValue, "ALL"> {
  if (spot.phase === "FLOP" && spot.category === "CBET") {
    return "FLOP_CBET_HU_DRY_PFR";
  }

  if (spot.category === "OPEN") return "OPEN_HJ_CO_BTN";
  if (spot.category === "SB_OPEN") return "SB_OPEN";
  if (spot.category === "ISO") return "ISO_LIMP";
  if (spot.category === "DEFEND") return "BB_DEFEND";
  if (spot.category === "DEFEND_2X") return "BB_DEFEND_2X";
  if (spot.category === "REJAM") return "REJAM";
  if (spot.category === "BARREL") return "TURN_PFR_BARREL_DRY";
  if (spot.category === "BLUFFCATCH") return "RIVER_DEFEND_BLUFCATCH";
  if (spot.category === "VALUE") return "RIVER_PFR_VALUEBET";

  return "OPEN_HJ_CO_BTN";
}

export function questionFromSpot(spot: TrainingSpot): TrainingQuestion {
  return {
    id: spot.id,
    format: spot.format,
    phase: spot.phase,
    category: toQuestionCategory(spot),
    title: spot.title,
    prompt: spot.prompt,
    answerOptions: spot.answerOptions.map((action) => ({
      id: action,
      label: actionLabel(action),
    })),
    correctKeys: [spot.correctAction],
    strictCorrect: [spot.correctAction],
    explanation: spot.explanation,
    context: {
      effectiveStack: spot.effectiveStack,
      board: spot.boardCards,
      heroHand: spot.heroHand,
    },
  };
}
