import { profileId, type TrainingProfile } from "../../core/trainingProfile";
import type { RangePack } from "./rangePack";

export function rangePackMatchesTrainingProfile(
  profile: TrainingProfile,
  pack: RangePack,
): boolean {
  return rangePackProfileMismatchReasons(profile, pack).length === 0;
}

export function rangePackProfileMismatchReasons(
  profile: TrainingProfile,
  pack: RangePack,
): string[] {
  const mismatches: string[] = [];
  const dimensions = pack.dimensions;

  if (dimensions.gameVariant !== profile.gameVariant) {
    mismatches.push(`gameVariant ${dimensions.gameVariant} != ${profile.gameVariant}`);
  }
  if (dimensions.tableFormat !== profile.tableFormat) {
    mismatches.push(`tableFormat ${dimensions.tableFormat} != ${profile.tableFormat}`);
  }
  if (dimensions.blindSpeed !== profile.blindSpeed) {
    mismatches.push(`blindSpeed ${dimensions.blindSpeed} != ${profile.blindSpeed}`);
  }
  if (dimensions.street !== profile.street) {
    mismatches.push(`street ${dimensions.street} != ${profile.street}`);
  }
  if (dimensions.evModel !== profile.evModel) {
    mismatches.push(`evModel ${dimensions.evModel} != ${profile.evModel}`);
  }
  if (dimensions.ante !== profile.ante) {
    mismatches.push(`ante ${dimensions.ante} != ${profile.ante}`);
  }
  if (dimensions.rakeMode !== profile.rakeMode) {
    mismatches.push(`rakeMode ${dimensions.rakeMode} != ${profile.rakeMode}`);
  }

  return mismatches;
}

export function assertRangePackMatchesTrainingProfile(
  profile: TrainingProfile,
  pack: RangePack,
): void {
  const mismatches = rangePackProfileMismatchReasons(profile, pack);
  if (mismatches.length > 0) {
    throw new Error(
      `RangePack ${pack.id} does not match training profile ${profileId(profile)}: ` +
        mismatches.join(", "),
    );
  }
}
