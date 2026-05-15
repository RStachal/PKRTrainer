import type { CategoryPhase } from "../domain/constants";

export type PhaseFilter = "ALL" | CategoryPhase;

export const PHASE_FILTERS = [
  { value: "ALL", label: "Vše" },
  { value: "PREFLOP", label: "Preflop" },
  { value: "FLOP", label: "Flop" },
  { value: "TURN", label: "Turn" },
  { value: "RIVER", label: "River" },
] as const satisfies readonly { value: PhaseFilter; label: string }[];

export function toSelectionPhase(phase: PhaseFilter): CategoryPhase | undefined {
  return phase === "ALL" ? undefined : phase;
}
