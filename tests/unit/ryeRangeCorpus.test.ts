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
  rewriteCell?: (hand: string) => { id?: string; label?: string },
): string {
  const cells: string[] = [];
  for (let row = 0; row < 13; row += 1) {
    for (let col = 0; col < 13; col += 1) {
      const hand = row === col
        ? `${RANKS[row]}${RANKS[row]}`
        : row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`;
      const rewritten = rewriteCell?.(hand) ?? {};
      const id = rewritten.id ?? hand;
      const label = rewritten.label ?? hand;
      // Prázdná barva znamená **neobarvenou** buňku, tedy žádnou třídu
      // `mdl-color--`: čtečka pozná obarvenou jen podle ní, takže `grey` by
      // se počítalo za akci a podíl obarvených by vyšel 100 %.
      const color = colorOfCell(row, col);
      const klass = color === "" ? "" : ` class="mdl-color--${color}"`;
      cells.push(`<td id="cid_${id}"${klass}>${label}</td>`);
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

  it("ruku určuje poloha v mřížce, ne id buňky", () => {
    // Šest stránek korpusu má `id="cid_A4s"` na víc buňkách a `cid_KTs` vůbec.
    // Čtení podle `id` tam zapsalo A4s dvakrát a KTs nikdy - jinou ranži, než
    // zdroj tvrdí, a beze stopy v počtu kombinací, protože obě třídy mají
    // shodně čtyři. Popisek buňky přitom sedí na polohu u všech 536 mřížek.
    const path = writePage(
      "zdvojene-id.html",
      [{ color: "green", title: "flatcall", combos: "676.00" }],
      () => "green",
      (hand) => (hand === "KTs" ? { id: "A4s" } : {}),
    );
    const grid = readRyeGrid(path);
    expect(grid).toBeDefined();
    const read = grid!.hands.map((entry) => entry.hand);
    expect(read).toContain("KTs");
    expect(read.filter((hand) => hand === "A4s")).toHaveLength(1);
  });

  it("když se popisek rozejde s polohou, stránka se nevydá", () => {
    const path = writePage(
      "prehozeny-popisek.html",
      [{ color: "green", title: "flatcall", combos: "676.00" }],
      () => "green",
      (hand) => (hand === "KTs" ? { label: "A4s" } : {}),
    );
    const grid = readRyeGrid(path);
    expect(grid!.mismatches.join(" ")).toContain("poloha říká KTs");
  });
});

describe("stránka, která kreslí jen jednu větev strategie", () => {
  /**
   * Obarví jen několik buněk v levém horním koutu - tedy malý podíl mřížky,
   * jako squeeze chart nebo jam range.
   */
  const fewCells = (row: number, col: number): string => (row < 2 && col < 2 ? "red" : "");

  it("jen all-in se za jednu větev nepočítá: fold je jediná zbylá možnost", () => {
    // Na krátkých stackách se nedorovnává, takže neobarvená ruka **je** fold.
    // Naměřeno 30. 9. 2026: takových stránek je v korpusu 19 (PU, MUL, ICM)
    // a všechny by se bez téhle výjimky odmítly.
    const path = writePage("jen-jam.html", [{ color: "red", title: "All in", combos: "40.00" }], fewCells);
    expect(readRyeGrid(path)!.partial).toBe(false);
  });

  it("jen sázky s velikostí jednou větví jsou: stránka neříká, jestli se zbytek dorovnává", () => {
    const path = writePage(
      "jen-3bet.html",
      [
        { color: "red", title: "3B / Broke", combos: "20.00" },
        { color: "red", title: "3B / Fold", combos: "20.00" },
      ],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("sázka i all-in vedle sebe je pořád jedna větev", () => {
    // Tohle je ten tvar, který do 30. 9. 2026 propadal: `3b/call | 3b/f | Jam`
    // bez pasivní akce. Třináct stránek ICM, obarveno 20 az 22 %.
    const path = writePage(
      "3bet-a-jam.html",
      [
        { color: "red", title: "3b/call", combos: "14.00" },
        { color: "red", title: "3b/f", combos: "13.00" },
        { color: "red", title: "Jam", combos: "13.00" },
      ],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("`flatcall` jedním slovem se musí poznat jako pasivní akce", () => {
    // `\bcall\b` na `flatcall` nesedí. První měření kvůli tomu zařadilo tři
    // stránky ICM3 mezi propadající, přestože pasivní akci mají.
    const path = writePage(
      "flatcall.html",
      [
        { color: "red", title: "flatcall", combos: "20.00" },
        { color: "red", title: "3b/f", combos: "20.00" },
      ],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(false);
  });

  it("`Defend` je taky pasivní akce", () => {
    const path = writePage(
      "defend.html",
      [{ color: "red", title: "Defend ( Create your own Ranges )", combos: "40.00" }],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(false);
  });
});
