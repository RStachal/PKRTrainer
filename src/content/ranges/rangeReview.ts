import type { RangeProfile } from "../../domain/rangeProfile";
import type { TrainingSpot } from "../../domain/spot";
import { TRAINING_SPOTS } from "../spots";
import { RANGE_PROFILES } from "./rangeProfileRegistry";

export type RangeReviewSummary = {
  total: number;
  reviewed: number;
  draft: number;
  reviewCoverage: number;
  pendingIds: readonly string[];
};

export type ProfileReviewCandidate = {
  readonly profile: RangeProfile;
  readonly usageCount: number;
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

export function getProfileUsageCounts(
  spots: readonly TrainingSpot[] = TRAINING_SPOTS,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const spot of spots) {
    if (!spot.rangeProfileId) continue;
    counts.set(spot.rangeProfileId, (counts.get(spot.rangeProfileId) ?? 0) + 1);
  }

  return counts;
}

export function getOrphanRangeProfiles(
  spots: readonly TrainingSpot[] = TRAINING_SPOTS,
  profiles: readonly RangeProfile[] = RANGE_PROFILES,
): readonly RangeProfile[] {
  const usage = getProfileUsageCounts(spots);

  return profiles.filter((profile) => (usage.get(profile.id) ?? 0) === 0);
}

export function getDraftReviewQueue(
  spots: readonly TrainingSpot[] = TRAINING_SPOTS,
  profiles: readonly RangeProfile[] = RANGE_PROFILES,
): readonly ProfileReviewCandidate[] {
  const usage = getProfileUsageCounts(spots);

  return getPendingRangeProfiles(profiles)
    .map((profile) => ({
      profile,
      usageCount: usage.get(profile.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      return a.profile.id.localeCompare(b.profile.id);
    });
}
