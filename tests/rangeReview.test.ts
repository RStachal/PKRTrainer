import { describe, expect, it } from "vitest";
import {
  getDraftReviewQueue,
  getOrphanRangeProfiles,
  getProfileUsageCounts,
} from "../src/content/ranges/rangeReview";
import { RANGE_PROFILES } from "../src/content/ranges/rangeProfileRegistry";
import { TRAINING_SPOTS } from "../src/content/spots";

function getSpotRangeProfileId(spot: (typeof TRAINING_SPOTS)[number]): string | undefined {
  return "rangeProfileId" in spot ? spot.rangeProfileId : undefined;
}

describe("range review tooling", () => {
  it("getProfileUsageCounts spocita pocet spotu odkazujicich na kazdy profil", () => {
    const counts = getProfileUsageCounts();

    for (const [profileId, count] of counts) {
      const expected = TRAINING_SPOTS.filter(
        (spot) => getSpotRangeProfileId(spot) === profileId,
      ).length;

      expect(count, profileId).toBe(expected);
    }
  });

  it("getOrphanRangeProfiles vraci profily, na ktere neukazuje zadny spot", () => {
    const orphans = getOrphanRangeProfiles();
    const orphanIds = orphans.map((profile) => profile.id);
    const usedIds = new Set(
      TRAINING_SPOTS.map(getSpotRangeProfileId).filter(
        (id): id is string => Boolean(id),
      ),
    );

    for (const id of orphanIds) {
      expect(usedIds.has(id), id).toBe(false);
    }
  });

  it("vsechny range profily jsou pouzite alespon jednim spotem", () => {
    const orphans = getOrphanRangeProfiles();
    const orphanIds = orphans.map((profile) => profile.id);

    expect(orphanIds, `Orphan range profiles: ${orphanIds.join(", ")}`).toEqual(
      [],
    );
  });

  it("getDraftReviewQueue radi draft profily podle pouziti sestupne", () => {
    const queue = getDraftReviewQueue();

    expect(queue.length).toBeGreaterThan(0);
    expect(
      queue.every((candidate) => candidate.profile.sourceQuality === "draft"),
    ).toBe(true);

    for (let i = 1; i < queue.length; i += 1) {
      const prev = queue[i - 1];
      const cur = queue[i];

      if (prev.usageCount === cur.usageCount) {
        expect(prev.profile.id.localeCompare(cur.profile.id)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.usageCount).toBeGreaterThanOrEqual(cur.usageCount);
      }
    }
  });

  it("celkovy pocet draft + reviewed profilu odpovida registru", () => {
    const draft = RANGE_PROFILES.filter(
      (profile) => profile.sourceQuality === "draft",
    ).length;
    const reviewed = RANGE_PROFILES.filter(
      (profile) => profile.sourceQuality === "reviewed",
    ).length;

    expect(draft + reviewed).toBe(RANGE_PROFILES.length);
  });
});
