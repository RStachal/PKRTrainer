/**
 * Práh ustoupení noci: minuty, ne desky.
 *
 * Testuje se to proto, že hlídač ani orchestrátor **žádný test nemají** a tahle
 * dvojice si už jednou odporovala s runnerem: zpráva počítala rodiny bez
 * checkpointu, runner desky, a `night.log:12646` hlásí ustoupení při „0 rodin".
 * Práh teď vlastní runner a ostatní ho čtou, takže se rozejít nemohou - a tyhle
 * testy drží to čtení i rozhodovací pravidlo.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shouldYield, yieldThresholds } from "../../scripts/lib/nightYield.mts";

function runner(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "night-yield-")), "run_night_decomposition.py");
  writeFileSync(path, body, "utf8");
  return path;
}

describe("čtení prahu z runneru", () => {
  it("přečte oba literály", () => {
    const path = runner("YIELD_MIN_MINUTES = 30\nYIELD_MIN_BOARDS = 8\n");
    expect(yieldThresholds(path)).toEqual({ minutes: 30, boards: 8, fromRunner: true });
  });

  it("jiná hodnota v runneru se projeví - literál vlastní runner", () => {
    // Tohle je celý smysl toho čtení: změnit práh se má na jednom místě.
    const path = runner("YIELD_MIN_MINUTES = 45\nYIELD_MIN_BOARDS = 12\n");
    expect(yieldThresholds(path)).toMatchObject({ minutes: 45, boards: 12 });
  });

  it("chybějící literál spadne na zálohu a přizná to", () => {
    // `fromRunner: false` je tu proto, aby volající mohl zakřičet. Tichá záloha
    // by znamenala, že se práh v runneru přejmenuje a nikdo si toho nevšimne.
    const path = runner("# bez prahu\n");
    expect(yieldThresholds(path)).toEqual({ minutes: 30, boards: 8, fromRunner: false });
    expect(yieldThresholds("neexistuje.py")).toMatchObject({ fromRunner: false });
  });

  it("nespletlí se s podobným jménem", () => {
    const path = runner("YIELD_MIN_MINUTES_OLD = 99\nYIELD_MIN_MINUTES = 30\nYIELD_MIN_BOARDS = 8\n");
    expect(yieldThresholds(path).minutes).toBe(30);
  });
});

describe("rozhodnutí o ustoupení", () => {
  const limits = { minutes: 30, boards: 8, fromRunner: true };

  it("rozhoduje podle minut, ne podle desek", () => {
    /*
     * Osm desek je podle hloubky 51 minut, nebo 5,3 hodiny. Proto tenhle test:
     * dvě desky na 50 bb (80 min) ustoupení **vyvolají**, kdežto sedm desek na
     * 25 bb (45 min) by po starém pravidle neustoupilo, i když je to víc práce
     * než práh.
     */
    expect(shouldYield({ minutes: 80, boards: 2, priority: "NEW_FAMILIES", thresholds: limits })).toBe(true);
    expect(shouldYield({ minutes: 45, boards: 7, priority: "NEW_FAMILIES", thresholds: limits })).toBe(true);
    expect(shouldYield({ minutes: 20, boards: 20, priority: "NEW_FAMILIES", thresholds: limits })).toBe(false);
  });

  it("bez změřené ceny se rozhoduje po deskách jako dřív", () => {
    // Záloha musí být tatáž jako v runneru, jinak by si orchestrátor a noc
    // odporovaly právě ve chvíli, kdy chybí tabulka.
    expect(shouldYield({ boards: 8, priority: "NEW_FAMILIES", thresholds: limits })).toBe(true);
    expect(shouldYield({ boards: 7, priority: "NEW_FAMILIES", thresholds: limits })).toBe(false);
  });

  it("nula minut není totéž jako chybějící cena", () => {
    // Prázdná fronta neustoupí; fronta bez ceny se posoudí po deskách. Splést to
    // by znamenalo tvrdit, že deska bez ceny je zdarma.
    expect(shouldYield({ minutes: 0, boards: 20, priority: "NEW_FAMILIES", thresholds: limits })).toBe(false);
    expect(shouldYield({ boards: 20, priority: "NEW_FAMILIES", thresholds: limits })).toBe(true);
  });

  it("jiná priorita neustoupí nikdy", () => {
    // Runner ustupuje jedině na `NEW_FAMILIES`; kdyby to orchestrátor tvrdil
    // i jinde, zpráva by zase říkala něco jiného než noc.
    expect(shouldYield({ minutes: 9999, boards: 999, priority: "DECOMPOSITION", thresholds: limits })).toBe(false);
  });
});
