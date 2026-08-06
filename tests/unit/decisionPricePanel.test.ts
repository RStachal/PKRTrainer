// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { OPPONENT_STYLES } from "../../src/core/opponentStyle";
import type { Filters, Spot } from "../../src/core/types";
import { renderDecisionPrice } from "../../src/ui/decisionPricePanel";

// The trainer could always say which action. This says at what price, which is
// the part a player can redo at the table. The numbers are derived from the pot
// and the stack the spot already carries, so there is no spot this cannot price -
// and no pack that has to ship a number for it.

const filters = (opponentStyle?: Filters["opponentStyle"]): Filters => ({
  positions: [],
  buckets: [],
  contexts: [],
  ante: "OFF",
  scoringMode: "STRICT",
  opponentStyle,
});

const spot = (context: string, effStack = 10): Spot => ({
  context, effStack, startingPot: 1.5, heroPos: "BTN", hand: "A5s",
} as unknown as Spot);

describe("decision price panel", () => {
  it("prices a shove by the folds it needs", () => {
    const panel = renderDecisionPrice(document, spot("PUSH_FOLD"), filters())!;
    // Risking 10 to win 1.5 needs 10/11.5 folds - about 87 percent. That is the
    // break-even identity, not a number from a table.
    expect(panel.querySelector(".decision-price__headline")?.textContent).toContain("87");
    // With no opponent named there is no claim about how often anyone folds.
    expect(panel.querySelector(".decision-price__verdict")).toBeNull();
    expect(panel.querySelector(".decision-price__basis")).toBeNull();
  });

  it("prices a call by its pot odds", () => {
    const panel = renderDecisionPrice(document, spot("VS_ALLIN"), filters())!;
    const text = panel.querySelector(".decision-price__headline")?.textContent ?? "";
    // Calling 10 into a pot of 11.5 needs 10/21.5, about 46.5 percent.
    expect(text).toContain("46,5");
  });

  it("says what the named opponent changes, and how well it is known", () => {
    const loose = renderDecisionPrice(document, spot("PUSH_FOLD"), filters("LOOSE_PASSIVE"))!;
    const verdict = loose.querySelector(".decision-price__verdict");
    expect(verdict).not.toBeNull();
    // A fish folds 60 percent where this shove needs 87, so it cannot pay for
    // itself on fold equity - the panel must not claim otherwise.
    expect(verdict!.classList.contains("decision-price__verdict--good")).toBe(false);
    expect(verdict!.textContent).toContain("60");

    // Two of the four styles are anchored to a published calling width and two
    // are interpolated. The panel says which rather than presenting all four as
    // equally known.
    const measured = OPPONENT_STYLES.LOOSE_PASSIVE.basis === "MEASURED";
    expect(measured).toBe(true);
    const rock = renderDecisionPrice(document, spot("PUSH_FOLD"), filters("TIGHT_PASSIVE"))!;
    expect(rock.querySelector(".decision-price__basis")?.textContent)
      .not.toBe(loose.querySelector(".decision-price__basis")?.textContent);
  });

  it("declines to price a spot that does not fix one", () => {
    // Outside the all-in contexts the bet size is not determined by the spot, and
    // a made-up size reads exactly as authoritative as a real one.
    expect(renderDecisionPrice(document, spot("RFI"), filters())).toBeNull();
    expect(renderDecisionPrice(document, spot("VS_OPEN"), filters())).toBeNull();
  });
});
