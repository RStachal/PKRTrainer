import type { CategoryPhase, CategoryValue } from "./constants";
import type { ActionId, TrainingSpot } from "./spot";
import type { TrainingFormatId } from "./trainingFormat";

export type AnswerKey = string;

export type TrainingAnswerOption = {
  readonly id: AnswerKey;
  readonly label: string;
};

export type TrainingQuestionContext = {
  readonly heroPosition?: string;
  readonly villainPosition?: string;
  readonly effectiveStack?: string;
  readonly potType?: string;
  readonly board?: readonly string[];
  readonly heroHand?: readonly string[];
  readonly tags?: readonly string[];
};

export type TrainingQuestion = {
  readonly id: string;
  readonly format: TrainingFormatId;
  readonly phase: CategoryPhase;
  readonly category: Exclude<CategoryValue, "ALL">;
  readonly title: string;
  readonly prompt: string;
  readonly answerOptions: readonly TrainingAnswerOption[];
  readonly correctKeys: readonly AnswerKey[];
  readonly strictCorrect: readonly AnswerKey[];
  readonly explanation?: string;
  readonly hint?: string;
  readonly context?: TrainingQuestionContext;
};

function actionLabel(action: ActionId): string {
  return action;
}

function toQuestionCategory(spot: TrainingSpot): Exclude<CategoryValue, "ALL"> {
  if (spot.phase === "FLOP" && spot.category === "CBET") {
    return "FLOP_CBET_HU_DRY_PFR";
  }

  if (spot.category === "OPEN") return "OPEN_HJ_CO_BTN";
  if (spot.category === "ISO") return "ISO_LIMP";
  if (spot.category === "DEFEND") return "BB_DEFEND";
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
