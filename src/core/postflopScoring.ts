import { evaluateActionEv, type ActionEvEvaluation } from "./actionEv";
import type { PostflopAction } from "./postflopGenerator";
import type { PostflopTrainingSpot } from "./postflopTrainingSpot";

export interface PostflopGrade {
  correct: boolean;
  recommended: readonly PostflopAction[];
  actionEv?: ActionEvEvaluation<PostflopAction>;
}

export function gradePostflopAction(
  spot: Pick<PostflopTrainingSpot, "recommendedAction" | "actionEvs">,
  chosen: PostflopAction,
): PostflopGrade {
  const actionEv = spot.actionEvs ? evaluateActionEv(spot.actionEvs, chosen) : null;
  if (!actionEv) {
    return {
      correct: chosen === spot.recommendedAction,
      recommended: [spot.recommendedAction],
    };
  }

  return {
    correct: actionEv.outcome === "BEST" || actionEv.outcome === "EQUIVALENT",
    recommended: actionEv.bestActions,
    actionEv,
  };
}
