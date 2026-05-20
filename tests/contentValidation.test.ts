import { describe, expect, it } from "vitest";
import { TRAINING_SPOTS } from "../src/content/spots";
import { CATEGORY_VALUES } from "../src/domain/constants";
import { questionFromSpot } from "../src/domain/questionFromSpot";

const SUPPORTED_CONTENT_CATEGORIES = [
  "OPEN_HJ_CO_BTN",
  "ISO_LIMP",
  "BB_DEFEND",
  "BB_DEFEND_2X",
  "REJAM",
  "SB_OPEN",
  "FLOP_CBET_HU_DRY_PFR",
] as const;

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
});
