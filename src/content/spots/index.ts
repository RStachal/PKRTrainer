import type { TrainingSpot } from "../../domain/spot";
import { CASH_100BB_SPOTS } from "./cash100bb";
import { MTT_15_25BB_SPOTS } from "./mtt15-25bb";

export const TRAINING_SPOTS = [
  ...MTT_15_25BB_SPOTS,
  ...CASH_100BB_SPOTS,
] as const satisfies readonly TrainingSpot[];
