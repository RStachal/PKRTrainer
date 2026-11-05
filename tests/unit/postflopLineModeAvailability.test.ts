// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderPostflopView } from "../../src/ui/postflopView";
import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import { PostflopStrategyUnavailableError } from "../../src/core/postflopGenerator";
import { grantsForTier } from "../../src/core/paymentEntitlements";
import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import type { TrainingProfile } from "../../src/core/trainingProfile";

// A hand line walks flop, turn and river. The scoped pilots are flop-only and a
// paying subscriber's runtime refuses the heuristic, so the line could never be
// generated for them: it threw and the player saw a bare "unavailable", while a
// free preview user got a working line from the heuristic model. The paying
// customer got strictly less, from an option offered with no hint it could not run.

const pilotProfile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

function lineOption(root: HTMLElement): HTMLOptionElement | null {
  return root.querySelector<HTMLOptionElement>('.postflop-mode option[value="line"]');
}

describe("hand line availability", () => {
  it("a flop-only paid runtime genuinely cannot produce a line", () => {
    // The fact the option must respect. Asserted rather than assumed, so if the
    // pilots ever gain turn and river this test says so by failing.
    const runtime = buildMttPostflopTrainingRuntime({
      profile: pilotProfile,
      grants: grantsForTier("PRO_PLUS", { startsAt: "2026-07-08T00:00:00.000Z" }),
      now: "2026-07-08T12:00:00.000Z",
    });
    expect(runtime.mode).toBe("SCOPED_PILOT");
    expect(runtime.allowFallback).toBe(false);

    expect(() => generatePostflopLine({
      seed: 7,
      potType: "SINGLE_RAISED",
      potBB: 6,
      effectiveStackBB: 40,
      positionContext: {
        heroPosition: "SB",
        villainPosition: "BB",
        aggressorPosition: "SB",
        callerPosition: "BB",
        inPosition: false,
        callerType: "BIG_BLIND",
        positionPattern: "SB_VS_BB",
      },
      strategyResolver: (input) => runtime.resolver?.(input) ?? null,
      allowFallback: runtime.allowFallback,
    })).toThrow(PostflopStrategyUnavailableError);
  });

  it("does not offer the line as usable when it cannot run", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { lineModeAvailable: false });

    const option = lineOption(root);
    expect(option).not.toBeNull();
    expect(option?.disabled).toBe(true);
    // Disabled without a reason would just look broken. The app renders Czech by
    // default, so the reason is asserted in the locale a player actually sees.
    expect(option?.textContent).toContain("turnu a riveru");
  });

  it("leaves the line offered where the heuristic covers every street", () => {
    // Preview mode allows the fallback, so all three streets resolve.
    const root = document.createElement("div");
    renderPostflopView(root, {});

    const option = lineOption(root);
    expect(option?.disabled).toBe(false);
    expect(option?.textContent).not.toContain("turnu a riveru");
  });
});
