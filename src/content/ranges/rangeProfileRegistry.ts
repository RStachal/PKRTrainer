import type { RangeProfile } from "../../domain/rangeProfile";
import { MTT_PREFLOP_RANGE_PROFILES } from "./mttPreflopRanges";

export const RANGE_PROFILES = [
  ...MTT_PREFLOP_RANGE_PROFILES,
] as const satisfies readonly RangeProfile[];

const RANGE_PROFILE_BY_ID = new Map(
  RANGE_PROFILES.map((profile) => [profile.id, profile]),
);

export function getRangeProfile(profileId: string): RangeProfile {
  const profile = RANGE_PROFILE_BY_ID.get(profileId);

  if (!profile) {
    throw new Error(`Unknown range profile: ${profileId}`);
  }

  return profile;
}

export function getRangeProfilesByFormat(
  format: RangeProfile["format"],
): readonly RangeProfile[] {
  return RANGE_PROFILES.filter((profile) => profile.format === format);
}
