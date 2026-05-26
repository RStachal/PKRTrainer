import type { RangeProfile } from "../../domain/rangeProfile";
import { RANGE_PROFILES } from "./rangeProfileRegistry";

export type RangeReviewSummary = {
  total: number;
  reviewed: number;
  draft: number;
  reviewCoverage: number;
  pendingIds: readonly string[];
};

export function getPendingRangeProfiles(
  profiles: readonly RangeProfile[] = RANGE_PROFILES,
): readonly RangeProfile[] {
  return profiles.filter((profile) => profile.sourceQuality === "draft");
}

export function getRangeReviewSummary(
  profiles: readonly RangeProfile[] = RANGE_PROFILES,
): RangeReviewSummary {
  const reviewed = profiles.filter(
    (profile) => profile.sourceQuality === "reviewed",
  ).length;
  const total = profiles.length;
  const draft = total - reviewed;
  const pendingIds = getPendingRangeProfiles(profiles).map(
    (profile) => profile.id,
  );

  return {
    total,
    reviewed,
    draft,
    reviewCoverage: total === 0 ? 0 : reviewed / total,
    pendingIds,
  };
}

export function hasValidReviewMetadata(profile: RangeProfile): boolean {
  if (profile.sourceQuality !== "reviewed") {
    return true;
  }

  return Boolean(profile.reviewedAt && profile.reviewedBy);
}
