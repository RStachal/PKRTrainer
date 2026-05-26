import { describe, expect, it } from "vitest";
import {
  getPresetAvailableQuestions,
  SESSION_PRESETS,
} from "../src/domain/sessionPresets";

describe("session preset coverage", () => {
  it("ma pro kazdy focused preset dostatek spotu podle minimalniho coverage prahu", () => {
    for (const preset of SESSION_PRESETS) {
      const availableQuestions = getPresetAvailableQuestions(preset.id);

      expect(
        availableQuestions.length,
        `${preset.id} has only ${availableQuestions.length} spots`,
      ).toBeGreaterThanOrEqual(preset.minimumAvailableSpots);
    }
  });

  it("ma kazdy focused preset aspon jeden dostupny spot", () => {
    for (const preset of SESSION_PRESETS) {
      const availableQuestions = getPresetAvailableQuestions(preset.id);

      expect(availableQuestions.length, preset.id).toBeGreaterThan(0);
    }
  });
});
