import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { formatBB } from "../../src/ui/tableRenderer";

describe("tableRenderer - BB formatting", () => {
  // Feature: mtt-preflop-trainer, Property 21: Formatovani hodnot v BB na nejvyse jedno desetinne misto
  // Validates: Requirements 8.5, 8.6
  it("Property 21: formatBB vraci text s nejvyse jednim desetinnym mistem", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -10_000,
          max: 10_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (value) => {
          const formatted = formatBB(value);
          const rounded = Math.round(value * 10) / 10 + 0;
          const expected = Number.isInteger(rounded)
            ? String(rounded)
            : rounded.toFixed(1);

          expect(formatted).toBe(expected);
          expect(formatted).toMatch(/^-?\d+(?:\.\d)?$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});
