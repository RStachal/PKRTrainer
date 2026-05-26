import { describe, expect, it } from "vitest";
import { TRAINING_SPOTS } from "../src/content/spots";
import { renderDecisionPanel } from "../src/ui/renderDecisionPanel";

describe("decision panel", () => {
  it("necha akcni tlacitka aktivni pred odpovedi", () => {
    const markup = renderDecisionPanel(TRAINING_SPOTS[0], null);

    expect(markup).toContain('data-action="OPEN"');
    expect(markup).toContain('aria-disabled="false"');
    expect(markup).not.toContain("data-next");
  });

  it("po odpovedi akcni tlacitka oznaci jako neaktivni bez nativniho disabled", () => {
    const markup = renderDecisionPanel(TRAINING_SPOTS[0], "OPEN");

    expect(markup).toContain('data-action="OPEN"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("data-next");
    expect(markup).not.toContain(" disabled");
  });

  it("zobrazi stack band indikator podle range profilu", () => {
    const spot2125 = TRAINING_SPOTS.find((spot) => spot.id === "mtt-15-25-open-co-k9s");
    if (!spot2125) throw new Error("Missing 21-25 fixture");

    const spot1520 = TRAINING_SPOTS.find((spot) => spot.id === "mtt-15-25-open-btn-k5s");
    if (!spot1520) throw new Error("Missing 15-20 fixture");

    const markup2125 = renderDecisionPanel(spot2125, null);
    const markup1520 = renderDecisionPanel(spot1520, null);

    expect(markup2125).toContain("21-25 BB");
    expect(markup1520).toContain("15-20 BB");
    expect(markup2125).toContain("stack-band-badge");
  });
});
