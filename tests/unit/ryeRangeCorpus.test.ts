import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { effectiveStackBB, readRyeGrid } from "../../scripts/lib/ryeRangeCorpus.mts";

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
  legend: { color: string; title: string; combos: string; percent?: string }[],
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
    + `<span class="title">${entry.title}</span>`
    + `<span>${entry.percent ?? "12.34"}% (${entry.combos} combos)</span></li>`
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

  /*
   * Pravopis složeného navýšení. Vlastník našel 1. 10. 2026, že vzor znal jen
   * jeden ze tří tvarů, a ten nejdražší případ propouštěl.
   */
  it("`Squeeze call` bez lomítka je složené navýšení, ne pasivní akce", () => {
    // Tohle je `SQU-40BBMais-BB-vs-EP-MP`: kreslí 5,7 % kombinací a do 1. 10.
    // 2026 bránou prošla, protože „Squeeze call" bez lomítka se počítalo za
    // pasivní call. Jako záznam by BB na 40-75 bb učila skládat 94 % rukou.
    const path = writePage(
      "squeeze-call-bez-lomitka.html",
      [
        { color: "red", title: "Squeeze call", combos: "20.00" },
        { color: "red", title: "Squeeze / Fold", combos: "20.00" },
      ],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("`3bet/call` s delším jménem akce je taky složené navýšení", () => {
    // Vzor chtěl lomítko hned za „3b", takže `3bet/call` nesedlo.
    const path = writePage(
      "3bet-call-dlouhe.html",
      [
        { color: "red", title: "3bet/call to 9bb", combos: "20.00" },
        { color: "red", title: "Bluff Squeeze to 9bb", combos: "20.00" },
      ],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("`Flat` v legendě složené navýšení není, takže stránka projde", () => {
    // `SQU-40BBMais-SB-vs-20BB-CO-OPEN-Mais-BU-Flat`: vlastník ji v T2 výslovně
    // uvádí jako tu, kterou pravidlo pustit **má**.
    const path = writePage(
      "squeeze-s-flatem.html",
      [
        { color: "red", title: "3b/fold", combos: "14.00" },
        { color: "red", title: "rejam or big 3bet to commit", combos: "13.00" },
        { color: "red", title: "flat", combos: "13.00" },
      ],
      fewCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(false);
  });
});

/*
 * Rozhodnutí vlastníka 1a (1. 10. 2026): na krátkém efektivním stacku je
 * jmenovaný jam bez flatu jam-or-fold, takže neobarvené JE fold.
 */
describe("krátký stack: jam bez flatu je jam-or-fold", () => {
  const fewCells = (row: number, col: number): string => (row < 2 && col < 2 ? "red" : "");
  const jamAndThreeBet = [
    { color: "red", title: "3b/call", combos: "14.00" },
    { color: "red", title: "3b/f", combos: "13.00" },
    { color: "red", title: "Jam", combos: "13.00" },
  ];

  it("SB na 18 bb projde: zdroj tam flat nekreslí, protože ho nemá", () => {
    const path = writePage("ICM3-sb18bb-ep30bb.html", jamAndThreeBet, fewCells);
    expect(readRyeGrid(path)!.partial).toBe(false);
  });

  it("hloubka je efektivní stack, tedy menší z obou jmenovaných", () => {
    // Hrdina má 18 bb, otvírač 75. Rozhoduje těch 18 - kdyby se brala hloubka
    // hrdiny podle prvního tokenu, vyšlo by to stejně; kdyby se brala poslední
    // nebo největší, stránka by spadla.
    const path = writePage("ICM3-sb18bb-btn75bb.html", jamAndThreeBet, fewCells);
    expect(readRyeGrid(path)!.partial).toBe(false);
  });

  it("BB je z pravidla venku: tam je prázdno často call nebo check", () => {
    const path = writePage("ICM11-bb18bb-sb30bb.html", jamAndThreeBet, fewCells);
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("nad 20 bb pravidlo neplatí: tam už stránka bez flatu neúplná je", () => {
    const path = writePage("ICM3-sb40bb-ep60bb.html", jamAndThreeBet, fewCells);
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("jméno bez hloubky se za krátký stack počítat nesmí", () => {
    // Nedá se tvrdit „krátký stack" o stránce, která hloubku neuvádí. Tenhle
    // případ drží i původní test z 30. 9. (`3bet-a-jam.html`).
    const path = writePage("MUL-bez-hloubky.html", jamAndThreeBet, fewCells);
    expect(readRyeGrid(path)!.partial).toBe(true);
  });

  it("efektivní stack zahodí nuly z `utg20bb`, aby minimum nespadlo na nulu", () => {
    // `utg20bb` je „UTG na 20 bb", ne „UTG+2 na 0 bb" (naměřeno 1. 9. 2026).
    // Bez téhle pojistky by minimum vyšlo 0 a stránka by krátký stack neměla.
    expect(effectiveStackBB("ICM14-utg20bb-btn8bb.html")).toBe(8);
    expect(effectiveStackBB("ICM3-sb18bb-btn75bb.html")).toBe(18);
    expect(effectiveStackBB("MUL-bez-hloubky.html")).toBe(0);
  });
});

/*
 * Rozhodnutí vlastníka 2a (1. 10. 2026): rozhoduje, **co** je jmenované, ne
 * kolik mřížky zbývá neobarvené.
 */
describe("legenda sečtená na sto nestačí, když stránka jmenuje pasivní akci", () => {
  /** Obarví 77 % mřížky - jako stránky HU, které barví 55 az 87 %. */
  const mostCells = (row: number): string => (row < 10 ? "red" : "");

  it("stránka HU projde: `Call vs 2x raise` účtuje i neobarvené dno range", () => {
    // Do 2. 10. 2026 ji držela první odrůda brány (legenda ~100 %, obarveno
    // < 90 %) bez ohledu na to, že pasivní akci jmenuje. Vlastník přečetl
    // všech 16 HU a 2 BBSTR a rozhodl, že prázdno je u nich fold.
    const path = writePage(
      "HU-25BB-OOP-15-20BB-vs-Raise.html",
      [
        { color: "red", title: "Reshove All in", combos: "40.00", percent: "50.00" },
        { color: "blue", title: "Call vs 2x raise (otherwise fold)", combos: "40.00", percent: "50.00" },
      ],
      mostCells,
    );
    const grid = readRyeGrid(path)!;
    expect(grid.legendPercentSum).toBeCloseTo(100, 1);
    expect(grid.colouredShare).toBeLessThan(0.9);
    expect(grid.partial).toBe(false);
  });

  it("bez pasivní akce ji první odrůda drží dál", () => {
    // Táž čísla, jen legenda jmenuje samé sázky - a to je ten tvar, na který
    // detektor z 24. 9. vznikl.
    const path = writePage(
      "squeeze-sto-procent.html",
      [
        { color: "red", title: "Squeeze / Fold", combos: "40.00", percent: "50.00" },
        { color: "blue", title: "Bluff Squeeze", combos: "40.00", percent: "50.00" },
      ],
      mostCells,
    );
    expect(readRyeGrid(path)!.partial).toBe(true);
  });
});
