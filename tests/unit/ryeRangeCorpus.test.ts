import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readRyeGrid } from "../../scripts/lib/ryeRangeCorpus.mts";

/**
 * Čtení mřížky z HTML stránky zdroje.
 *
 * Stránka si nese vlastní legendu s počty kombinací a mřížka se proti ní
 * ověřuje; když se ty dvě věci rozejdou, soubor se nevydá. Právě proto musí
 * být čtení legendy přesné - tichá nula v počtu kombinací neznamená „nula
 * kombinací", ale „celá stránka neprojde", a nikdo se nedozví proč.
 *
 * Fixtury si test píše sám: zdrojové stránky jsou koupený materiál a do
 * repozitáře nesmí.
 */

const dir = mkdtempSync(join(tmpdir(), "rye-corpus-"));

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** Stránka se 169 buňkami a legendou, kterou si volající určí. */
function writePage(
  name: string,
  legend: { color: string; title: string; combos: string }[],
  colorOfCell: (row: number, col: number) => string,
): string {
  const cells: string[] = [];
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const hand = row === col
        ? `${RANKS[row]}${RANKS[row]}`
        : row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`;
      cells.push(`<td id="cid_${hand}" class="mdl-color--${colorOfCell(row, col)}">${hand}</td>`);
    }
  }
  const items = legend.map((entry) => (
    `<li class="mdl-list__item mdl-color--${entry.color}">`
    + `<span class="title">${entry.title}</span><span>12.34% (${entry.combos} combos)</span></li>`
  ));
  const path = join(dir, name);
  writeFileSync(path, `<!doctype html><html><body><table>${cells.join("")}</table>`
    + `<ul>${items.join("")}</ul></body></html>`, "utf8");
  return path;
}

describe("čtení mřížky ze stránky zdroje", () => {
  it("přečte počty kombinací i s desetinnou tečkou", () => {
    // Zdroj píše počty dvěma způsoby: `48 combos` i `48.00 combos`. Vzor jen
    // z číslic z druhého tvaru přečetl „00", tedy nulu - a protože se mřížka
    // proti legendě ověřuje, stránka pak neprošla. Naměřeno 24. 9. 2026: tahle
    // jediná tečka stála 117 neshod na 141 odmítnutých stránkách korpusu.
    const path = writePage(
      "desetinne.html",
      [
        { color: "green", title: "flatcall", combos: "48.00" },
        { color: "amber", title: "3B / Fold", combos: "121.00" },
      ],
      (row, col) => (row === 0 && col < 12 ? "green" : "amber"),
    );
    const grid = readRyeGrid(path);
    expect(grid).toBeDefined();
    expect(grid!.legend.map((entry) => entry.combos)).toEqual([48, 121]);
  });

  it("celé počty čte dál stejně", () => {
    const path = writePage(
      "cele.html",
      [
        { color: "green", title: "flatcall", combos: "48" },
        { color: "amber", title: "3B / Fold", combos: "121" },
      ],
      (row, col) => (row === 0 && col < 12 ? "green" : "amber"),
    );
    expect(readRyeGrid(path)!.legend.map((entry) => entry.combos)).toEqual([48, 121]);
  });

  it("mřížka, která nesedí na legendu, se pozná", () => {
    const path = writePage(
      "nesedi.html",
      [
        { color: "green", title: "flatcall", combos: "4.00" },
        { color: "amber", title: "3B / Fold", combos: "165.00" },
      ],
      (row, col) => (row === 0 && col < 12 ? "green" : "amber"),
    );
    const grid = readRyeGrid(path);
    expect(grid!.mismatches.length).toBeGreaterThan(0);
    expect(grid!.mismatches.join(" ")).toContain("green");
  });
});
