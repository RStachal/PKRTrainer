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
});
