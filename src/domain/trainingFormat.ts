export type TrainingFormatId =
  | "MTT_15_25BB"
  | "MTT_25_40BB"
  | "CASH_100BB"
  | "SPIN_SHORT";

export type TrainingFormat = {
  readonly id: TrainingFormatId;
  readonly label: string;
  readonly description: string;
};

export const TRAINING_FORMATS = [
  {
    id: "MTT_15_25BB",
    label: "MTT 15-25 BB",
    description: "Turnajové spoty pro kratší a střední stacky.",
  },
  {
    id: "MTT_25_40BB",
    label: "MTT 25-40 BB",
    description: "Turnajové spoty pro hlubší střední stack.",
  },
  {
    id: "CASH_100BB",
    label: "Cash game 100 BB",
    description: "Standardní cash game spoty se 100 BB.",
  },
  {
    id: "SPIN_SHORT",
    label: "Spin short stack",
    description: "Krátkostackové HU a 3-way spoty.",
  },
] as const satisfies readonly TrainingFormat[];

export const DEFAULT_TRAINING_FORMAT: TrainingFormatId = "MTT_15_25BB";
