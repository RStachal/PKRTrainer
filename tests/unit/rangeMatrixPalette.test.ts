import { describe, expect, it } from "vitest";

import { RANGE_MATRIX_COLORS } from "../../src/ui/rangeMatrixView";

/**
 * Podoba matice se musí lišit od zdroje, ze kterého část ranží pochází.
 *
 * Vlastník 24. 9. 2026 určil rozsah užití koupených chartů RYE Rangeviewer:
 * *„zde máme RYE zaplaceno a můžeme použít pro náš vývoj, jen grafická -
 * vizuální podoba nemůže být 1:1, ale musíme použít jiné barevné škálování atp,
 * prostě se lehce odlišit, ale ne v rozsahu range.“* Obsah ranží tedy zůstává,
 * jak je; podoba se musí lišit - a to je podmínka, kterou je potřeba umět
 * ověřit, ne si ji pamatovat.
 *
 * Zdroj maluje mřížku paletou **Material Design** (`mdl-color--green` a spol.).
 * Ty hodnoty jsou veřejná designová sada Googlu, ne obsah zdroje, takže smějí
 * být tady napsané; nic z koupeného materiálu do repozitáře nejde.
 *
 * Práh: dvě barvy pod vzdáleností zhruba 40 splývají. Naše musí být aspoň
 * **70** od každé barvy zdroje (s rezervou, ne těsně za čarou) a aspoň **60**
 * od sebe navzájem, jinak by matice přestala být čitelná.
 */

/** Material Design 500 - odstíny, které mřížky zdroje používají. */
const MATERIAL_500: readonly string[] = [
  "#4caf50", "#2196f3", "#ffc107", "#cddc39", "#f44336", "#9e9e9e",
  "#3f51b5", "#795548", "#00bcd4", "#9c27b0", "#009688", "#e91e63",
  "#8bc34a", "#ff9800", "#ff5722", "#673ab7",
];

const MIN_FROM_SOURCE = 70;
const MIN_FROM_EACH_OTHER = 60;

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
}

/**
 * Vzdálenost barev, která odpovídá vnímání líp než rozdíl složek v RGB.
 * (Vážená euklidovská metrika; červená složka váží víc tam, kde je barva teplá.)
 */
function distance(left: string, right: string): number {
  const [r1, g1, b1] = rgb(left);
  const [r2, g2, b2] = rgb(right);
  const rMean = (r1 + r2) / 2;
  const [dr, dg, db] = [r1 - r2, g1 - g2, b1 - b2];
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

describe("paleta matice ranží", () => {
  it("žádná barva nesedí na paletu zdroje", () => {
    const tooClose: string[] = [];
    for (const [action, color] of Object.entries(RANGE_MATRIX_COLORS)) {
      for (const source of MATERIAL_500) {
        const gap = distance(color, source);
        if (gap < MIN_FROM_SOURCE) tooClose.push(`${action} ${color} vs ${source}: ${gap.toFixed(0)}`);
      }
    }
    expect(tooClose).toEqual([]);
  });

  it("barvy zůstávají rozeznatelné mezi sebou", () => {
    const entries = Object.entries(RANGE_MATRIX_COLORS);
    const tooClose: string[] = [];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const gap = distance(entries[i][1], entries[j][1]);
        if (gap < MIN_FROM_EACH_OTHER) {
          tooClose.push(`${entries[i][0]} vs ${entries[j][0]}: ${gap.toFixed(0)}`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it("měřítko samo dává smysl: dva shodné odstíny mají nulu", () => {
    // Bez téhle kontroly by chyba v metrice udělala z obou bran výše kulisu,
    // která projde vždy.
    expect(distance("#f44336", "#f44336")).toBe(0);
    expect(distance("#000000", "#ffffff")).toBeGreaterThan(MIN_FROM_SOURCE);
  });
});
