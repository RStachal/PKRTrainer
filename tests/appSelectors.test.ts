import { describe, expect, it } from "vitest";
import {
  getAvailableCategories,
  getQuestionsForFormat,
  getQuestionsForSelection,
  getSpotByQuestionId,
  normalizeCategory,
} from "../src/domain/appSelectors";
import { TRAINING_SPOTS } from "../src/content/spots";

describe("appSelectors", () => {
  describe("getQuestionsForFormat", () => {
    it("vraci jen otazky daneho formatu", () => {
      const questions = getQuestionsForFormat("MTT_15_25BB", "ALL");

      expect(questions.length).toBeGreaterThan(0);
      expect(questions.every((q) => q.format === "MTT_15_25BB")).toBe(true);
    });

    it("filtruje podle stack bandu", () => {
      const all = getQuestionsForFormat("MTT_15_25BB", "ALL");
      const shallow = getQuestionsForFormat("MTT_15_25BB", "BB_15_20");
      const deep = getQuestionsForFormat("MTT_15_25BB", "BB_21_25");

      expect(shallow.length).toBeGreaterThan(0);
      expect(deep.length).toBeGreaterThan(0);
      expect(shallow.length + deep.length).toBe(all.length);
    });
  });

  describe("getQuestionsForSelection", () => {
    it("vraci jen otazky dane faze", () => {
      const preflop = getQuestionsForSelection(
        "MTT_15_25BB",
        "PREFLOP",
        "ALL",
      );

      expect(preflop.length).toBeGreaterThan(0);
      expect(preflop.every((q) => q.phase === "PREFLOP")).toBe(true);
    });

    it("pri ALL fazi nefiltruje", () => {
      const all = getQuestionsForSelection("MTT_15_25BB", "ALL", "ALL");
      const formatAll = getQuestionsForFormat("MTT_15_25BB", "ALL");

      expect(all.length).toBe(formatAll.length);
    });
  });

  describe("getAvailableCategories", () => {
    it("vraci pouze kategorie, ktere maji aspon jeden spot v dane faze", () => {
      const categories = getAvailableCategories(
        "MTT_15_25BB",
        "PREFLOP",
        "ALL",
      );

      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain("REJAM");
      expect(categories).toContain("BB_DEFEND");
      expect(categories).toContain("ISO_LIMP");
    });

    it("nevraci duplicity a je serazene", () => {
      const categories = getAvailableCategories(
        "MTT_15_25BB",
        "PREFLOP",
        "ALL",
      );

      const unique = Array.from(new Set(categories));
      const sorted = [...categories].sort();

      expect(categories.length).toBe(unique.length);
      expect(categories).toEqual(sorted);
    });
  });

  describe("normalizeCategory", () => {
    it("ALL vraci vzdy ALL", () => {
      const result = normalizeCategory("ALL", "MTT_15_25BB", "PREFLOP", "ALL");

      expect(result).toBe("ALL");
    });

    it("vraci puvodni kategorii pokud je dostupna", () => {
      const result = normalizeCategory(
        "REJAM",
        "MTT_15_25BB",
        "PREFLOP",
        "ALL",
      );

      expect(result).toBe("REJAM");
    });

    it("padne na ALL pokud kategorie neni v dane faze dostupna", () => {
      const result = normalizeCategory(
        "FLOP_CBET_HU_DRY_PFR",
        "MTT_15_25BB",
        "PREFLOP",
        "ALL",
      );

      expect(result).toBe("ALL");
    });
  });

  describe("getSpotByQuestionId", () => {
    it("najde spot podle id", () => {
      const firstSpot = TRAINING_SPOTS[0];
      const found = getSpotByQuestionId(firstSpot.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(firstSpot.id);
    });

    it("vraci null pro neznameho id", () => {
      const result = getSpotByQuestionId("nonexistent-id");

      expect(result).toBeNull();
    });

    it("vraci null pro null vstup", () => {
      const result = getSpotByQuestionId(null);

      expect(result).toBeNull();
    });
  });
});
