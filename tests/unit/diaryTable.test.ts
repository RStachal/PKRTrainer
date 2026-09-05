import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Řádek deníku má čtyři buňky, a je to nosná vlastnost, ne úprava.
 *
 * ## Proč to má vlastní test
 *
 * `mtt:agenda` třídí otevřené body podle toho, na kom visí, a čte to ze
 * **čtvrtého sloupce**. Svislítko uvnitř backticků - třeba u jména buňky
 * `VS_OPEN` s pozicí a hloubkou - z jednoho řádku udělá osm buněk, sloupce se
 * posunou a jako stav se přečte útržek textu z prostředka.
 *
 * Změřeno 5. 9. 2026: takhle rozbité byly **čtyři řádky** (69, 140, 141, 172).
 * Půl roku si toho nikdo nevšiml, protože tabulku čte oko a to si ji domyslí -
 * a u bodu 69 se přitom ukázalo, že se tam slepily **dva záznamy** a jeden
 * přišel o číslo i název. Vada, kterou nikdo neuvidí, se sama neopraví.
 */
const DIARY = "Agents/MTT_AUTONOMY.md";

function diaryRows(): { number: number; cells: number; line: string }[] {
  return readFileSync(DIARY, "utf8")
    .split("\n")
    .filter((line) => /^\| \d+ \|/.test(line))
    .map((line) => ({
      number: Number(line.split("|")[1].trim()),
      // Escapované svislítko je text, ne oddělovač.
      cells: line.replace(/\\\|/g, "").split("|").length - 2,
      line,
    }));
}

describe("tabulka deníku", () => {
  it("má na každém řádku čtyři buňky", () => {
    const broken = diaryRows().filter((row) => row.cells !== 4);
    expect(
      broken.map((row) => `bod ${row.number}: ${row.cells} buněk`),
      "svislítko uvnitř backticků rozbíjí sloupce - escapuj jako \\| nebo piš lomítkem",
    ).toEqual([]);
  });

  it("čísluje body jednoznačně", () => {
    const numbers = diaryRows().map((row) => row.number);
    const duplicates = numbers.filter((value, index) => numbers.indexOf(value) !== index);
    expect(duplicates, "dva body s týmž číslem se v odkazech nedají rozlišit").toEqual([]);
  });

  it("dává neškrtnutému bodu stav, ať se pozná, na kom visí", () => {
    // Bez stavu se nepozná, jestli bod čeká na majitele, na stroj, nebo na
    // nikoho - a `mtt:agenda` ho pak vypíše jako nezařazený. Změřeno 5. 9.
    // 2026: takových bylo **24 z 57**. Dvacet z nich byly záznamy hotové práce
    // (dostaly stav `záznam`), zbytek se doplnil, a od té chvíle to má být nula:
    // pravidlo 7 v `Agents/AGENTS.md` říká, že otevřený bod musí říct, na kom visí.
    const open = diaryRows().filter((row) => !/^~~/.test(row.line.split("|")[2].trim()));
    const withoutStatus = open
      .filter((row) => {
        const status = row.line.replace(/\\\|/g, "").split("|")[4]?.trim() ?? "";
        return status === "" || status === "—" || status === "-";
      })
      .map((row) => row.number);
    expect(
      withoutStatus,
      "neškrtnutý bod bez stavu: doplň, na kom visí, nebo mu dej stav `záznam`",
    ).toEqual([]);
  });
});
