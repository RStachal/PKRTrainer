import { describe, expect, it } from "vitest";
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

describe("training content validation", () => {
  it("ma unikatni id pro kazdy spot", () => {
    const ids = TRAINING_SPOTS.map((spot) => spot.id);

    expect(new Set(ids).size).toBe(ids.length);
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
