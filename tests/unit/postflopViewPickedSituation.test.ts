// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostflopPositionContext } from "../../src/core/postflopGenerator";

/**
 * Vybraná situace se musí ptát katalogu vyřešených spotů - se svým vzorem a
 * hloubkou.
 *
 * Do 14. 10. 2026 stálo v pohledu `dealsSolved = initialPositionContext == null`:
 * jakmile si hráč situaci vybral, katalog se obešel a deska se losovala. Matice
 * se pak barvila podle akce v 0,0 % spotů a žádná brána to nepoznala, protože
 * `mtt:post-answer` měřil jen cestu bez výběru. `mtt:picked-situation` od
 * 15. 10. hlídá obsah a sdílený modul, ale volání pohledu napodobuje - kdyby
 * pohled modul přestal volat, neviděl by to. Tenhle test se ptá pohledu.
 */

const calls: { name: string; situation: unknown }[] = [];

vi.mock("../../src/data/ranges/solvedSpotDealing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/data/ranges/solvedSpotDealing")>();
  const record = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => (...args: A): R => {
    calls.push({ name, situation: args[2] });
    return fn(...args);
  };
  return {
    ...actual,
    solvedFlopConfigForSeed: record("flop", actual.solvedFlopConfigForSeed),
    solvedTurnConfigForSeed: record("turn", actual.solvedTurnConfigForSeed),
    solvedRiverConfigForSeed: record("river", actual.solvedRiverConfigForSeed),
    primeTurnEvForSeed: record("prime-turn", actual.primeTurnEvForSeed),
    primeRiverEvForSeed: record("prime-river", actual.primeRiverEvForSeed),
  };
});

const { renderPostflopView } = await import("../../src/ui/postflopView");
const { cataloguePatternFor } = await import("../../src/data/ranges/solvedSpotDealing");

const LJ_VS_HJ: PostflopPositionContext = {
  heroPosition: "LJ",
  villainPosition: "HJ",
  aggressorPosition: "LJ",
  callerPosition: "HJ",
  inPosition: false,
  callerType: "IN_POSITION_CALLER",
  positionPattern: "OOP_RAISER_VS_IP_CALLER",
};

async function dealt(street: "FLOP" | "TURN" | "RIVER", context?: PostflopPositionContext) {
  calls.length = 0;
  const root = document.createElement("div");
  renderPostflopView(root, {
    initialSeed: 7,
    initialStreet: street,
    autoGenerate: true,
    initialEffectiveStackBB: 40,
    ...(context === undefined ? {} : { initialPositionContext: context }),
  });
  await vi.waitFor(() => {
    expect(calls.some((call) => call.name === street.toLowerCase())).toBe(true);
  }, { timeout: 20000 });
  return calls;
}

describe("vybraná situace a katalog vyřešených spotů", () => {
  afterEach(() => {
    calls.length = 0;
  });

  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    it(`${street}: pohled se ptá katalogu se vzorem a hloubkou vybrané situace`, { timeout: 30_000 }, async () => {
      const expected = { positionPattern: cataloguePatternFor(LJ_VS_HJ), stackBB: 40 };
      const recorded = await dealt(street, LJ_VS_HJ);
      const dealing = recorded.filter((call) => call.name === street.toLowerCase());
      expect(dealing.length).toBeGreaterThan(0);
      for (const call of dealing) expect(call.situation).toEqual(expected);
      // Tabulka EV se předčítá pro tutéž situaci, jinak by se načetla jiná
      // rodina než ta rozdaná.
      for (const call of recorded.filter((item) => item.name.startsWith("prime-"))) {
        expect(call.situation).toEqual(expected);
      }
    });
  }

  it("bez výběru se katalogu ptá bez omezení (dvojče)", { timeout: 30_000 }, async () => {
    const recorded = await dealt("FLOP");
    const dealing = recorded.filter((call) => call.name === "flop");
    expect(dealing.length).toBeGreaterThan(0);
    for (const call of dealing) expect(call.situation).toBeUndefined();
  });
});
