import type { CategoryPhase } from "./constants";
import type { TrainingFormatId } from "./trainingFormat";

export type ActionId = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "OPEN" | "JAM";

export type SpotCategory =
  | "OPEN"
  | "SB_OPEN"
  | "DEFEND"
  | "DEFEND_2X"
  | "ISO"
  | "REJAM"
  | "CBET"
  | "BARREL"
  | "BLUFFCATCH"
  | "VALUE";

export type RangeCellWeight = "none" | "mix" | "pure";

export type RangeCell = {
  readonly hand: string;
  readonly action: ActionId;
  readonly weight: RangeCellWeight;
};

export type RangeReference = {
  readonly title: string;
  readonly summary: string;
  readonly cells: readonly RangeCell[];
};

export type TableSeat = {
  readonly position: string;
  readonly label: string;
  readonly isHero?: boolean;
};

// Content/UI model for a concrete poker spot. Convert it to TrainingQuestion
// before passing it into the training engine.
export type TrainingSpot = {
  readonly id: string;
  readonly format: TrainingFormatId;
  readonly phase: CategoryPhase;
  readonly category: SpotCategory;
  readonly title: string;
  readonly prompt: string;
  readonly heroHand: readonly string[];
  readonly boardCards?: readonly string[];
  readonly effectiveStack: string;
  readonly potLabel: string;
  readonly seats: readonly TableSeat[];
  readonly answerOptions: readonly ActionId[];
  readonly correctAction: ActionId;
  readonly range: RangeReference;
  readonly explanation: string;
};
