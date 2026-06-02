import type { TrainingProfile } from "../../core/trainingProfile";
import {
  allMttPreflopRangePacks,
  mttPreflopRangePackForProfile,
} from "./mttPreflopRangePacks";
import type { RangePack } from "./rangePack";
import {
  allSngPreflopRangePacks,
  sngPreflopRangePackForProfile,
} from "./sngPreflopRangePacks";

export const allTrainingRangePacks = [
  ...allMttPreflopRangePacks,
  ...allSngPreflopRangePacks,
] as const;

export function rangePackForTrainingProfile(
  profile: TrainingProfile,
): RangePack | undefined {
  switch (profile.gameVariant) {
    case "MTT":
      return mttPreflopRangePackForProfile(profile);
    case "SNG":
      return sngPreflopRangePackForProfile(profile);
    case "CASH":
      return undefined;
    default:
      return assertNever(profile.gameVariant);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected game variant: ${String(value)}`);
}
