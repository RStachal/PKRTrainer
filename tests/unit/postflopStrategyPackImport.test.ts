import { describe, expect, it } from "vitest";

import {
  buildPostflopStrategyPackImportReport,
  findPostflopStrategyRuleOverlaps,
  renderPostflopStrategyPackImportReport,
} from "../../src/data/ranges/postflopStrategyPackImport";
import {
  flopSingleRaisedPrototypeStrategyPack,
  type PostflopStrategyPack,
} from "../../src/data/ranges/postflopStrategyPack";

describe("postflopStrategyPackImport", () => {
  it("vytvori import report pro public-heuristic flop StrategyPack", () => {
    const report = buildPostflopStrategyPackImportReport(
      flopSingleRaisedPrototypeStrategyPack,
    );

    expect(report).toMatchObject({
      packId: "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
      valid: true,
      sourceCount: 4,
      ruleCount: 7,
      unsupportedActionCount: 0,
    });
    expect(report.warnings).toEqual(expect.arrayContaining([
      "Postflop StrategyPack confidence is LOW; review before production use.",
      "Postflop StrategyPack has overlapping rules; resolver tie-break must stay tested.",
    ]));
    expect(report.overlapCount).toBeGreaterThan(0);
  });

  it("najde prekryv podle action node, textury a SPR", () => {
    const overlaps = findPostflopStrategyRuleOverlaps(
      flopSingleRaisedPrototypeStrategyPack.rules,
    );

    expect(overlaps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        firstRuleId: "flop-srp-dry-small-cbet",
        secondRuleId: "flop-srp-low-spr-range-advantage-small-cbet",
        sharedTextures: ["dry"],
        sprMin: 2,
        sprMax: 4,
      }),
    ]));
  });

  it("reportuje unsupported preferred action pro budouci raise/call/fold rules", () => {
    const pack: PostflopStrategyPack = {
      ...flopSingleRaisedPrototypeStrategyPack,
      rules: [
        ...flopSingleRaisedPrototypeStrategyPack.rules,
        {
          id: "future-raise-rule",
          actionNode: "SINGLE_RAISED_POT_CBET",
          boardTextures: ["connected"],
          sprMin: 2,
          sprMax: 8,
          positionPattern: "FUTURE_MULTI_ACTION_NODE",
          actions: ["CHECK", "RAISE"],
          preferredAction: "RAISE",
          explanation: "Future rule.",
        },
      ],
    };

    const report = buildPostflopStrategyPackImportReport(pack);

    expect(report.unsupportedActions).toEqual(["RAISE"]);
    expect(report.warnings).toContain(
      "Postflop StrategyPack contains preferred actions unsupported by current resolver.",
    );
  });

  it("renderuje textovy report pro review", () => {
    const text = renderPostflopStrategyPackImportReport(
      buildPostflopStrategyPackImportReport(flopSingleRaisedPrototypeStrategyPack),
    );

    expect(text).toContain(
      "PostflopStrategyPack: mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
    );
    expect(text).toContain("rules: 7");
    expect(text).toContain("overlap details:");
  });
});
