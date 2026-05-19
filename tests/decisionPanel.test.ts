import { describe, expect, it } from "vitest";
import { TRAINING_SPOTS } from "../src/content/spots";
import { renderDecisionPanel } from "../src/ui/renderDecisionPanel";

describe("decision panel", () => {
  it("nechá akční tlačítka aktivní před odpovědí", () => {
    const markup = renderDecisionPanel(TRAINING_SPOTS[0], null);

    expect(markup).toContain('data-action="OPEN"');
    expect(markup).toContain('aria-disabled="false"');
  });

  it("po odpovědi akční tlačítka označí jako neaktivní bez nativního disabled", () => {
    const markup = renderDecisionPanel(TRAINING_SPOTS[0], "OPEN");

    expect(markup).toContain('data-action="OPEN"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain(" disabled");
  });
});
