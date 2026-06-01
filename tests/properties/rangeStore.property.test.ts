import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { generateSpot } from "../../src/core/drillEngine";
import { mulberry32 } from "../../src/core/rng";
import type { RangeStore } from "../../src/data/rangeStore";
import { RANGE_INDEX } from "../../src/data/ranges";
import {
  isRaiseActionKey,
  raiseKeyCarriesSizing,
} from "../../src/data/ranges/schema";
import type { ActionContext, AnteMode, Position } from "../../src/core/types";
import {
  arbAnte,
  arbContext,
  arbSeed,
  makeFilters,
  validBucketsFor,
} from "./drillSupport";

function positionFor(context: ActionContext): Position {
  return context === "BVB" ? "SB" : "BTN";
}

function loadedStoreWithEntry(): RangeStore {
  return {
    isLoaded: () => true,
    lookup: () => ({
      actions: { AA: ["FOLD"] },
      strict: { AA: ["FOLD"] },
    }),
  };
}

function loadedStoreWithoutEntry(): RangeStore {
  return {
    isLoaded: () => true,
    lookup: () => undefined,
  };
}

const STRICT_RAISE_KEYS = Array.from(RANGE_INDEX.values()).flatMap((record) =>
  Object.values(record.strict).flatMap((keys) =>
    keys.filter((key) => isRaiseActionKey(key)),
  ),
);

describe("rangeStore - data invariants", () => {
  // Feature: mtt-preflop-trainer, Property 11: Existence sizingu pro raise akce
  // Validates: Requirements 4.5
  it("Property 11: strict raise klice nesou konkretni sizing", () => {
    expect(STRICT_RAISE_KEYS.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...STRICT_RAISE_KEYS), (key) => {
        expect(raiseKeyCarriesSizing(key)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 12: Generovatelnost spotu podle dostupnosti klicu
  // Validates: Requirements 4.7, 4.8
  it("Property 12: generateSpot generuje jen pri dostupnem Range_Store zaznamu", () => {
    fc.assert(
      fc.property(
        arbSeed,
        arbContext,
        arbAnte,
        (seed, context: ActionContext, ante: AnteMode) => {
          const filters = makeFilters({
            positions: [positionFor(context)],
            buckets: [validBucketsFor(context)[0]],
            contexts: [context],
            ante,
          });

          const available = generateSpot(
            mulberry32(seed),
            context,
            filters,
            loadedStoreWithEntry(),
          );
          const missing = generateSpot(
            mulberry32(seed),
            context,
            filters,
            loadedStoreWithoutEntry(),
          );

          expect(available).not.toBeNull();
          expect(missing).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
