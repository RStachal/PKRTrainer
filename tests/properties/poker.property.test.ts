import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  handLabel,
  buildHandGrid,
  cellType,
  RANKS,
  GRID_SIZE,
  ALL_HAND_CLASSES,
  allHandClasses,
} from "../../src/core/poker";

const arbIndex = fc.integer({ min: 0, max: GRID_SIZE - 1 });

describe("poker — standardní rozložení mřížky 13×13", () => {
  // Feature: mtt-preflop-trainer, Property 22: Standardní rozložení mřížky 13×13
  // Pro libovolnou dvojici indexů (i, j): i=j ⇒ pár (2 znaky, stejné),
  // i<j ⇒ suited (končí 's'), i>j ⇒ offsuit (končí 'o'); vyšší karta první.
  // Validates: Requirements 10.1, 10.4
  it("Property 22: buňka (i, j) má správný tvar labelu a vyšší karta je první", () => {
    fc.assert(
      fc.property(arbIndex, arbIndex, (i, j) => {
        const label = handLabel(i, j);
        const hi = RANKS[Math.min(i, j)]; // RANKS je sestupné ⇒ menší index = vyšší karta
        const lo = RANKS[Math.max(i, j)];

        if (i === j) {
          // pár: 2 znaky, oba stejné
          expect(cellType(i, j)).toBe("pair");
          expect(label.length).toBe(2);
          expect(label[0]).toBe(label[1]);
          expect(label).toBe(RANKS[i] + RANKS[i]);
        } else if (i < j) {
          // suited: končí 's', vyšší karta první
          expect(cellType(i, j)).toBe("suited");
          expect(label.length).toBe(3);
          expect(label.endsWith("s")).toBe(true);
          expect(label).toBe(hi + lo + "s");
        } else {
          // offsuit: končí 'o', vyšší karta první
          expect(cellType(i, j)).toBe("offsuit");
          expect(label.length).toBe(3);
          expect(label.endsWith("o")).toBe(true);
          expect(label).toBe(hi + lo + "o");
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: mtt-preflop-trainer, Property 22: Standardní rozložení mřížky 13×13 (pokrytí 169 tříd)
  // Mřížka pokrývá přesně 169 unikátních tříd bez duplicit; buildHandGrid[i][j]
  // odpovídá handLabel(i, j) a allHandClasses/ALL_HAND_CLASSES mají 169 unikátů.
  // Validates: Requirements 10.1, 10.4
  it("Property 22: mřížka pokrývá přesně 169 unikátních tříd bez duplicit", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const grid = buildHandGrid();
        const labels: string[] = [];
        for (let i = 0; i < GRID_SIZE; i++) {
          for (let j = 0; j < GRID_SIZE; j++) {
            expect(grid[i][j]).toBe(handLabel(i, j));
            labels.push(grid[i][j]);
          }
        }
        expect(labels.length).toBe(169);
        expect(new Set(labels).size).toBe(169);

        const classes = allHandClasses();
        expect(classes.length).toBe(169);
        expect(new Set(classes).size).toBe(169);
        expect(ALL_HAND_CLASSES.length).toBe(169);
        expect(new Set(ALL_HAND_CLASSES).size).toBe(169);
      }),
      { numRuns: 100 },
    );
  });
});
