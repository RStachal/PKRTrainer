// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { OPPONENT_STYLES } from "../../src/core/opponentStyle";
import type { Filters, Spot } from "../../src/core/types";
import { openSizeAtDepth } from "../../src/core/drillEngine";
import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import { renderDecisionPrice, teachesOpenSizeAtDepth } from "../../src/ui/decisionPricePanel";
import { STACK_BUCKETS } from "../../src/core/types";

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
  context, effStack, startingPot: 1.5, heroPos: "BTN", hand: "A5s", answers: [],
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

  it("prices a re-jam, which used to be a number with no explanation", () => {
    // The EV bubbles showed a figure for this spot while the panel said nothing,
    // so a player saw a number with no statement of what it was priced against.
    const jamSpot = {
      ...spot("VS_OPEN", 20),
      answers: [{ key: "JAM", label: "Jam" }, { key: "FOLD", label: "Fold" }],
    } as unknown as Spot;
    const panel = renderDecisionPrice(document, jamSpot, filters())!;
    expect(panel).not.toBeNull();
    // Risking 20 to win the blinds plus a 2x open - 3.5 - needs 20/23.5, about
    // 85 percent. The open is part of the pot, which is the whole difference
    // from a push/fold shove.
    expect(panel.querySelector(".decision-price__headline")?.textContent).toContain("85");
  });

  it("keeps the panel's open size in step with the engine's", () => {
    // The engine reads the size back from the shipped action keys; the panel has
    // no range store and mirrors the rule. Duplication that cannot be seen is
    // duplication that drifts, so the two are compared at every depth rather
    // than trusted.
    const pack = allMttPreflopRangePacks.find((item) => (
      item.dimensions.tableFormat === "FULL_RING_9" &&
      item.dimensions.ante === "OFF" &&
      item.records.length > 0
    ));
    if (pack === undefined) throw new Error("no full-ring pack");
    const store = createRangeStoreFromRangePack(pack);
    let compared = 0;
    for (const bucket of STACK_BUCKETS) {
      const fromEngine = openSizeAtDepth(bucket, "OFF", store);
      if (fromEngine === undefined) continue;
      compared += 1;
      expect(teachesOpenSizeAtDepth(bucket), `${bucket}BB`).toBe(fromEngine);
    }
    expect(compared).toBeGreaterThan(5);
  });

  it("prices a shove over limpers from the limps the spot records", () => {
    const limpSpot = {
      ...spot("VS_LIMP", 20),
      answers: [{ key: "JAM", label: "Jam" }, { key: "FOLD", label: "Fold" }],
      tableState: { limpsBefore: 2 },
    } as unknown as Spot;
    const panel = renderDecisionPrice(document, limpSpot, filters())!;
    // Blinds 1.5 plus two limps is 3.5, so risking 20 needs 20/23.5 - about 85
    // percent - and the pot needs no assumption at all: the spot counted the
    // limpers.
    const text = panel.querySelector(".decision-price__headline")?.textContent ?? "";
    expect(text).toContain("3,5");
    expect(text).toContain("85");
  });

  it("prices more limpers as a better shove", () => {
    const withLimps = (limpsBefore: number) => {
      const s = {
        ...spot("VS_LIMP", 20),
        answers: [{ key: "JAM", label: "Jam" }, { key: "FOLD", label: "Fold" }],
        tableState: { limpsBefore },
      } as unknown as Spot;
      return renderDecisionPrice(document, s, filters())!
        .querySelector(".decision-price__headline")!.textContent ?? "";
    };
    // Each limper adds dead money, so the shove needs fewer folds. Reading the
    // required percentage back out keeps this a statement about the arithmetic
    // rather than about the wording.
    const folds = (text: string) => Number(/(\d+,\d)\s*%/.exec(text)![1].replace(",", "."));
    expect(folds(withLimps(4))).toBeLessThan(folds(withLimps(1)));
  });

  it("declines to price a spot that does not fix one", () => {
    // Outside the all-in contexts the bet size is not determined by the spot, and
    // a made-up size reads exactly as authoritative as a real one.
    expect(renderDecisionPrice(document, spot("RFI"), filters())).toBeNull();
    // A VS_OPEN spot with no shove on offer has no all-in price to state.
    expect(renderDecisionPrice(document, spot("VS_OPEN"), filters())).toBeNull();
    expect(renderDecisionPrice(document, spot("SQUEEZE"), filters())).toBeNull();
  });
});
