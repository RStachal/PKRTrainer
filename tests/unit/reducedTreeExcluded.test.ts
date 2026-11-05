import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Redukovaný strom se nedodává na žádné ulici.
 *
 * Solver má dvě varianty stromu: plnou, autoritativní, a redukovanou pro review,
 * která nemá turnový donk ani pozdější zvýšení. Nejsou to dvě přesnosti téže
 * hry, jsou to dvě různé hry, a agregát z obou v UI nikdo nerozezná.
 *
 * Turnový generátor ten filtr měl od začátku. Flopový a riverový ne, přestože
 * čtou tytéž checkpointy - sdílená funkce existovala a jen ji nikdo nepoužil.
 * Audit hlásil 46 desek na redukovaném stromě ve třech rodinách.
 *
 * Tenhle test hlídá zdroj, ne výstup. Ověřit to na datech by znamenalo znovu
 * klasifikovat každou desku podle struktury stromu, což dělá samostatný audit;
 * co se tu pojistí, je že žádný ze tří generátorů ten filtr nevypustí.
 */
const BUILDERS = [
  "scripts/buildTurnStrategyPacks.mts",
  "scripts/buildFlopStrategyPacks.mts",
  "scripts/buildRiverStrategyPacks.mts",
];

describe("redukovaný strom se nedodává", () => {
  it("každý generátor vyřešeného obsahu filtruje desky přes fullTreeBoardsByFamily", () => {
    for (const path of BUILDERS) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} nefiltruje redukovaný strom`).toContain("fullTreeBoardsByFamily");
    }
  });

  it("filtr se hlásí, ne aby desky mizely tiše", () => {
    // Vynechaná deska je vědomé rozhodnutí, ne chybějící data. Kdyby se to
    // nevypisovalo, vypadalo by to jako neúplný rozklad a hledala by se
    // neexistující chyba jinde.
    for (const path of BUILDERS) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path} vynechání nehlásí`).toContain("vyřešené na redukovaném stromě");
    }
  });

  it("brána už netvrdí, že filtruje jen turn", () => {
    // Tvrzení platilo v den, kdy vzniklo, a pak se tiše rozešlo s obsahem:
    // přibyl vyřešený flop a river, oba z týchž checkpointů a oba bez filtru.
    const source = readFileSync("scripts/lib/mttContentRisks.mts", "utf8");
    expect(source).not.toContain("The turn packs exclude");
    expect(source).toContain("All three solved-street builders");
  });
});
