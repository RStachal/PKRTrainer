import { describe, expect, it } from "vitest";
import {
  getPresetAvailableQuestions,
  SESSION_PRESETS,
} from "../src/domain/sessionPresets";
import { renderSessionControls } from "../src/ui/renderSessionControls";

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

  it("renderuje na preset tlacitku pocet dostupnych spotu", () => {
    const markup = renderSessionControls({
      blockSize: 10,
      seed: 1,
      mode: "MIXED",
      strict: "LENIENT",
      stackBand: "ALL",
    });

    for (const preset of SESSION_PRESETS) {
      const availableCount = getPresetAvailableQuestions(preset.id).length;

      expect(markup, preset.id).toContain(
        `data-session-preset="${preset.id}"`,
      );
      expect(markup, preset.id).toContain(
        `data-preset-available="${availableCount}"`,
      );
      expect(markup, preset.id).toContain(`· ${availableCount} spotů`);
    }
  });

  it("oznacuje thin presety (available < blockSize) css modifikatorem", () => {
    const markup = renderSessionControls({
      blockSize: 10,
      seed: 1,
      mode: "MIXED",
      strict: "LENIENT",
      stackBand: "ALL",
    });

    for (const preset of SESSION_PRESETS) {
      const availableCount = getPresetAvailableQuestions(preset.id).length;
      const isThin = availableCount < preset.config.blockSize;
      const buttonMatch = markup.match(
        new RegExp(
          `<button class="([^"]+)"[^>]*data-session-preset="${preset.id}"`,
        ),
      );

      if (!buttonMatch) throw new Error(`Missing button for ${preset.id}`);
      const hasThinClass = buttonMatch[1].includes(
        "session-preset-button--thin",
      );

      expect(hasThinClass, preset.id).toBe(isThin);
    }
  });
});
