import { describe, expect, it } from "vitest";
import { TRAINING_SPOTS } from "../src/content/spots";
import { EMPTY_STATISTICS } from "../src/domain/statistics";
import type { TrainingSpot } from "../src/domain/spot";
import { renderRangePanel } from "../src/ui/renderRangePanel";

describe("range panel", () => {
  it("zobrazi Reviewed badge pro profile oznacene jako reviewed", () => {
    const reviewedSpot = TRAINING_SPOTS.find(
      (spot): spot is TrainingSpot =>
        "rangeProfileId" in spot &&
        spot.rangeProfileId === "mtt-21-25-bb-defend-btn-2-5x",
    );
    if (!reviewedSpot) throw new Error("Missing reviewed spot");

    const markup = renderRangePanel(reviewedSpot, EMPTY_STATISTICS);

    expect(markup).toContain('class="range-badge is-reviewed"');
    expect(markup).toContain(">Reviewed<");
  });

  it("fallbackuje na Draft badge pri neznamem range profile", () => {
    const baseSpot = TRAINING_SPOTS.find(
      (spot): spot is TrainingSpot => spot.format === "MTT_15_25BB",
    );
    if (!baseSpot) throw new Error("Missing MTT spot");

    const draftFallbackSpot: TrainingSpot = {
      ...baseSpot,
      rangeProfileId: "unknown-profile-id",
    };

    const markup = renderRangePanel(draftFallbackSpot, EMPTY_STATISTICS);

    expect(markup).toContain('class="range-badge is-draft"');
    expect(markup).toContain(">Draft<");
  });
});
