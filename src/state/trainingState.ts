import type { TrainingState } from "../domain/types";

export function createFreshState(): TrainingState {
  return {
    answered: 0,
    correct: 0,
    streak: 0,
    mode: "MIXED",
    strict: "LENIENT",
    phase: "PREFLOP",
    catFilter: "ALL",
    seen: {},
    missed: {},
    byCat: {},
  };
}
