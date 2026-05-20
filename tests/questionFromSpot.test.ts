import { describe, expect, it } from "vitest";
import { TRAINING_SPOTS } from "../src/content/spots";
import { questionFromSpot } from "../src/domain/questionFromSpot";

describe("questionFromSpot adapter", () => {
  it("prevede vizualni spot na engine question", () => {
    const question = questionFromSpot(TRAINING_SPOTS[0]);

    expect(question).toMatchObject({
      id: "mtt-15-25-open-btn-a8o",
      format: "MTT_15_25BB",
      phase: "PREFLOP",
      category: "OPEN_HJ_CO_BTN",
      correctKeys: ["OPEN"],
      strictCorrect: ["OPEN"],
    });
    expect(question.answerOptions).toEqual([
      { id: "FOLD", label: "FOLD" },
      { id: "OPEN", label: "OPEN" },
      { id: "JAM", label: "JAM" },
    ]);
    expect(question.context).toMatchObject({
      effectiveStack: "20 BB",
      heroHand: TRAINING_SPOTS[0].heroHand,
    });
  });

  it("mapuje flop cbet spot na legacy kategorii pro engine", () => {
    const spot = TRAINING_SPOTS.find((candidate) => candidate.category === "CBET");
    if (!spot) throw new Error("Missing cbet spot");

    expect(questionFromSpot(spot).category).toBe("FLOP_CBET_HU_DRY_PFR");
  });
});
