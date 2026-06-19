import type { Spot } from "./types";
import { profileId, type TrainingProfile } from "./trainingProfile";

export const PREFLOP_SCENARIO_ID_VERSION = "preflop_scenario_v1";

/**
 * Stabilní identita preflop situace oddělená od historického Question_ID.
 *
 * Question_ID zůstává beze změny kvůli determinismu existujících poolů.
 * Scenario ID navíc váže stejný pokerový spot ke konkrétnímu profilu a
 * rozhodujícímu stavu stolu, takže KPI různých MTT profilů nekolidují.
 */
export function preflopScenarioId(
  profile: TrainingProfile,
  spot: Spot,
): string {
  const state = spot.tableState;
  return [
    PREFLOP_SCENARIO_ID_VERSION,
    profileId(profile),
    spot.id,
    `hero=${spot.heroPos}`,
    `stack=${spot.effStack}`,
    `hand=${spot.hand}`,
    `facing=${state.facing}`,
    `limps=${state.limpsBefore}`,
    `calls=${state.callsBefore}`,
    `bvb=${state.isBvB ? 1 : 0}`,
    `pushFold=${state.pushFold ? 1 : 0}`,
    `pot=${spot.startingPot ?? ""}`,
    `actions=${spot.answers.map((answer) => answer.key).sort().join(",")}`,
  ].join("|");
}
