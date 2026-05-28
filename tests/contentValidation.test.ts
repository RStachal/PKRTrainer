import { describe, expect, it } from "vitest";
import { RANGE_PROFILES, getRangeProfile } from "../src/content/ranges/rangeProfileRegistry";
import {
  getRangeReviewSummary,
  hasValidReviewMetadata,
} from "../src/content/ranges/rangeReview";
import { TRAINING_SPOTS } from "../src/content/spots";
import { CATEGORY_VALUES } from "../src/domain/constants";
import { questionFromSpot } from "../src/domain/questionFromSpot";
import type { TrainingSpot } from "../src/domain/spot";

const SUPPORTED_CONTENT_CATEGORIES = [
  "OPEN_HJ_CO_BTN",
  "ISO_LIMP",
  "BB_DEFEND",
  "BB_DEFEND_2X",
  "REJAM",
  "SB_OPEN",
  "FLOP_CBET_HU_DRY_PFR",
] as const;

const RANK_ORDER = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
function categoryToProfileType(category: TrainingSpot["category"]): string | null {
  if (category === "OPEN") return "OPEN";
  if (category === "SB_OPEN") return "SB_OPEN";
  if (category === "DEFEND") return "BB_DEFEND";
  if (category === "DEFEND_2X") return "BB_DEFEND_2X";
  if (category === "ISO") return "ISO";
  if (category === "REJAM") return "REJAM";
  return null;
}

function parseBbValue(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*BB/i);
  if (!match) return null;
  return Number(match[1]);
}

function stackBandContains(stackBand: string, effectiveStack: string): boolean {
  const stack = parseBbValue(effectiveStack);
  if (stack === null) return false;

  const rangeMatch = stackBand.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*BB/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return stack >= min && stack <= max;
  }

  const exact = parseBbValue(stackBand);
  return exact === stack;
}

function splitProfilePositions(value: string): readonly string[] {
  return value.split("/").map((item) => item.trim()).filter(Boolean);
}

function toPreflopHand(cards: TrainingSpot["heroHand"]): string {
  const [first, second] = cards;
  const firstRank = first[0];
  const secondRank = second[0];

  if (firstRank === secondRank) return `${firstRank}${secondRank}`;

  const [high, low] =
    RANK_ORDER.indexOf(firstRank) < RANK_ORDER.indexOf(secondRank)
      ? [firstRank, secondRank]
      : [secondRank, firstRank];
  const suitedness = first[1] === second[1] ? "s" : "o";

  return `${high}${low}${suitedness}`;
}

type IdTokenRule = {
  readonly required: readonly string[];
  readonly forbidden: readonly string[];
};

const CATEGORY_ID_TOKENS: Record<TrainingSpot["category"], IdTokenRule> = {
  OPEN: { required: ["-open-"], forbidden: ["-open-sb-"] },
  SB_OPEN: { required: ["-open-sb-"], forbidden: [] },
  DEFEND: { required: ["-bb-defend-"], forbidden: ["-bb-defend-2x-"] },
  DEFEND_2X: { required: ["-bb-defend-2x-"], forbidden: [] },
  ISO: { required: ["-iso-"], forbidden: [] },
  REJAM: { required: ["-rejam-"], forbidden: [] },
  CBET: { required: ["-cbet-"], forbidden: [] },
  BARREL: { required: ["-barrel-"], forbidden: [] },
  BLUFFCATCH: { required: ["-bluffcatch-"], forbidden: [] },
  VALUE: { required: ["-value-"], forbidden: [] },
};

describe("training content validation", () => {
  it("ma unikatni id pro kazdy spot", () => {
    const ids = TRAINING_SPOTS.map((spot) => spot.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ma id obsahujici token odpovidajici kategorii spotu", () => {
    for (const spot of TRAINING_SPOTS) {
      const rule = CATEGORY_ID_TOKENS[spot.category];
      const id = spot.id;

      for (const token of rule.required) {
        expect(
          id.includes(token),
          `${id} (${spot.category}) must contain "${token}"`,
        ).toBe(true);
      }
      for (const token of rule.forbidden) {
        expect(
          id.includes(token),
          `${id} (${spot.category}) must NOT contain "${token}"`,
        ).toBe(false);
      }
    }
  });

  it("ma correctAction mezi answerOptions", () => {
    for (const spot of TRAINING_SPOTS) {
      expect(spot.answerOptions, spot.id).toContain(spot.correctAction);
    }
  });

  it("ma vsechny range akce validni pro dany spot", () => {
    for (const spot of TRAINING_SPOTS) {
      for (const cell of spot.range.cells) {
        expect(spot.answerOptions, `${spot.id}:${cell.hand}`).toContain(
          cell.action,
        );
      }
    }
  });

  it("ma kazda hero handa presne dve karty", () => {
    for (const spot of TRAINING_SPOTS) {
      expect(spot.heroHand, spot.id).toHaveLength(2);
      expect(spot.heroHand.every((card) => card.length >= 2), spot.id).toBe(
        true,
      );
    }
  });

  it("mapuje kazdy spot pres adapter na validni legacy kategorii", () => {
    for (const spot of TRAINING_SPOTS) {
      const question = questionFromSpot(spot);

      expect(CATEGORY_VALUES, spot.id).toContain(question.category);
      expect(question.id).toBe(spot.id);
      expect(question.correctKeys).toContain(spot.correctAction);
      expect(question.strictCorrect).toContain(spot.correctAction);
    }
  });

  it("ma kazda podporovana kategorie alespon jeden spot", () => {
    const availableCategories = new Set(
      TRAINING_SPOTS.map((spot) => questionFromSpot(spot).category),
    );

    for (const category of SUPPORTED_CONTENT_CATEGORIES) {
      expect(availableCategories, category).toContain(category);
    }
  });

  it("ma validni range profile registry bez duplicit", () => {
    const profileIds = RANGE_PROFILES.map((profile) => profile.id);

    expect(new Set(profileIds).size).toBe(profileIds.length);

    for (const profile of RANGE_PROFILES) {
      const hands = profile.cells.map((cell) => cell.hand);

      expect(profile.cells.length, profile.id).toBeGreaterThanOrEqual(20);
      expect(new Set(hands).size, profile.id).toBe(hands.length);
      expect(hasValidReviewMetadata(profile), profile.id).toBe(true);
    }
  });

  it("vraci smysluplny review summary pro range profile workflow", () => {
    const summary = getRangeReviewSummary(RANGE_PROFILES);

    expect(summary.total).toBe(RANGE_PROFILES.length);
    expect(summary.reviewed).toBeGreaterThan(0);
    expect(summary.draft).toBeGreaterThan(0);
    expect(summary.pendingIds.length).toBe(summary.draft);
    expect(summary.reviewCoverage).toBeGreaterThan(0);
    expect(summary.reviewCoverage).toBeLessThan(1);
  });

  it("pouziva pro MTT BB defend realnejsi siroke range profily", () => {
    const bbDefendSpots = TRAINING_SPOTS.filter(
      (spot) =>
        spot.format === "MTT_15_25BB" &&
        (spot.category === "DEFEND" || spot.category === "DEFEND_2X") &&
        spot.seats.some((seat) => seat.position === "BB" && seat.isHero),
    );

    for (const spot of bbDefendSpots) {
      const heroHand = toPreflopHand(spot.heroHand);

      expect(spot.range.cells.length, spot.id).toBeGreaterThanOrEqual(45);
      expect(
        spot.range.cells.some((cell) => cell.hand === heroHand),
        `${spot.id}:${heroHand}`,
      ).toBe(true);
    }
  });

  it("pouziva pro vsechny MTT preflop spoty sdilenejsi strategicke range", () => {
    const mttPreflopSpots = TRAINING_SPOTS.filter(
      (spot) => spot.format === "MTT_15_25BB" && spot.phase === "PREFLOP",
    );

    for (const spot of mttPreflopSpots) {
      const rangeProfileId =
        "rangeProfileId" in spot ? spot.rangeProfileId : undefined;

      expect(rangeProfileId, spot.id).toBeDefined();

      const profile = getRangeProfile(rangeProfileId ?? "");
      const heroHand = toPreflopHand(spot.heroHand);
      const heroCell = spot.range.cells.find((cell) => cell.hand === heroHand);

      expect(spot.range.title, spot.id).toBe(profile.title);
      expect(spot.range.summary, spot.id).toBe(profile.summary);
      expect(spot.range.cells, spot.id).toBe(profile.cells);
      expect(spot.range.cells.length, spot.id).toBeGreaterThanOrEqual(20);
      expect(heroCell, `${spot.id}:${heroHand}`).toBeDefined();
      expect(heroCell?.action, `${spot.id}:${heroHand}`).toBe(
        spot.correctAction,
      );
    }
  });

  it("ma konzistentni mapovani spotu na range profile metadata", () => {
    const mttPreflopSpots = TRAINING_SPOTS.filter(
      (spot) => spot.format === "MTT_15_25BB" && spot.phase === "PREFLOP",
    );

    for (const spot of mttPreflopSpots) {
      const rangeProfileId =
        "rangeProfileId" in spot ? spot.rangeProfileId : undefined;
      if (!rangeProfileId) {
        throw new Error(`Missing rangeProfileId on spot ${spot.id}`);
      }

      const profile = getRangeProfile(rangeProfileId);
      const expectedType = categoryToProfileType(spot.category);
      const heroSeat = spot.seats.find(
        (seat) => "isHero" in seat && seat.isHero,
      );
      const heroPositions = splitProfilePositions(profile.heroPosition);
      const villainPositions = profile.villainPosition
        ? splitProfilePositions(profile.villainPosition)
        : [];

      expect(profile.format, spot.id).toBe(spot.format);
      expect(expectedType, spot.id).not.toBeNull();
      expect(profile.spotType, spot.id).toBe(expectedType);
      expect(stackBandContains(profile.stackBand, spot.effectiveStack), spot.id).toBe(
        true,
      );

      if (!heroSeat) throw new Error(`Missing hero seat on spot ${spot.id}`);
      expect(heroPositions.includes(heroSeat.position), spot.id).toBe(true);

      if (villainPositions.length > 0) {
        expect(
          spot.seats.some(
            (seat) =>
              !("isHero" in seat && seat.isHero) &&
              villainPositions.includes(seat.position),
          ),
          spot.id,
        ).toBe(true);
      }

      if (profile.openSize) {
        expect(spot.potLabel.includes(profile.openSize), spot.id).toBe(true);
      }
    }
  });

  it("ukazuje BTN minraise defend jako sirsi nez BTN 2.5x defend", () => {
    const btn25 = TRAINING_SPOTS.find(
      (spot) => spot.id === "mtt-15-25-bb-defend-btn-q3o",
    );
    const btn2 = TRAINING_SPOTS.find(
      (spot) => spot.id === "mtt-15-25-bb-defend-2x-btn-q6s",
    );

    if (!btn25 || !btn2) throw new Error("Missing BTN defend fixtures");

    expect(btn2.range.cells.length).toBeGreaterThan(btn25.range.cells.length);
    expect(btn25.range.cells).toContainEqual({
      hand: "Q5s",
      action: "CALL",
      weight: "pure",
    });
    expect(btn25.range.cells).toContainEqual({
      hand: "Q3o",
      action: "FOLD",
      weight: "pure",
    });
  });
});
