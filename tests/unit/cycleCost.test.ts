/**
 * Cena fáze ranního cyklu proti vlastní historii.
 *
 * Tyhle testy vznikly po dvou **chybně určených příčinách** v jedné fázi:
 * napsal jsem, že stojí 112,5 minuty kvůli velikosti checkpointů, pak kvůli
 * malé haldě, a obojí vyvrátilo měření (táž rodina z týchž dat: 121 s při haldě
 * 4 096 MB, 125 s při 6 587 MB). Skutečné naměřené rozdělení je jiné: fáze 1
 * stála 34 az 59 sekund na rodinu v devíti ránech a 179 a 226 ve dvou, kdy
 * stroj dělal něco vedle.
 *
 * Smysl téhle knihovny je, aby se příště nehádalo. Testy proto hlídají dvě věci:
 * že varování zakřičí na oba ty drahé dny, a že **mlčí** na normální rána -
 * hlídač, který křičí pořád, přestane být čtený.
 */
import { describe, expect, it } from "vitest";

import {
  COST_ALARM_RATIO,
  judgeCycleCost,
  samePhase,
  type CycleCostRow,
} from "../../scripts/lib/cycleCost.mts";

const row = (label: string, families: number, perFamily: number): CycleCostRow => ({
  at: "z logu", label, families, perFamily, freeGb: 0,
});

/** Devět ran fáze 1, jak je log opravdu zaznamenal. */
const BEZNA_RANA = [
  row("1/3", 35, 59.2), row("1/3", 41, 38.8), row("1/3", 46, 36.8),
  row("1/3", 49, 34.1), row("1/3", 58, 46.5),
];

describe("posouzení ceny fáze", () => {
  it("zakřičí na oba naměřené drahé dny", () => {
    // 6. 10.: 8 972 s na 50 rodin = 179,4 s/rodina. 7. 10.: 12 194 s na 54 = 225,8.
    // Medián běžných ran je kolem 38, takže oba jsou 4,7x a 5,9x nad ním.
    for (const [seconds, families] of [[8972, 50], [12194, 54]]) {
      const verdict = judgeCycleCost({ label: "1/3", families, seconds, history: BEZNA_RANA });
      expect(verdict.alarming, `${seconds} s na ${families} rodin`).toBe(true);
      expect(verdict.ratio ?? 0).toBeGreaterThan(COST_ALARM_RATIO);
    }
  });

  it("mlčí na normální ráno, i když je o půlku pomalejší", () => {
    // Dnešní ráno: 2 699 s na 58 rodin = 46,5 s/rodina, tedy 1,25x medián.
    const verdict = judgeCycleCost({ label: "1/3", families: 58, seconds: 2699, history: BEZNA_RANA });
    expect(verdict.alarming).toBe(false);
    expect(verdict.line).toContain("medián z 5 dřívějších");
    // A ani nejpomalejší z běžných ran nesmí křičet - jinak by práh byl k ničemu.
    expect(judgeCycleCost({ label: "1/3", families: 35, seconds: 35 * 59.2, history: BEZNA_RANA }).alarming)
      .toBe(false);
  });

  it("první měření se neposuzuje, místo aby si vymyslelo normál", () => {
    const verdict = judgeCycleCost({ label: "1/3", families: 50, seconds: 99999, history: [] });
    expect(verdict.alarming).toBe(false);
    expect(verdict.median).toBeUndefined();
    expect(verdict.line).toContain("první měření");
  });

  it("fáze se srovnává jen sama se sebou", () => {
    /*
     * Fáze 3 generuje pár rodin a naměřeně stojí 5 az 44 s na rodinu, kdežto
     * fáze 1 od 34 nahoru. Smíchat je by dalo medián, který neplatí ani pro
     * jednu: fáze 3 by pak křičela skoro vždy a fáze 1 skoro nikdy.
     */
    const mix = [...BEZNA_RANA, row("3/3", 12, 43.5), row("3/3", 5, 5.2), row("3/3", 3, 8)];
    expect(samePhase(mix, "1/3")).toHaveLength(BEZNA_RANA.length);
    expect(samePhase(mix, "3/3")).toHaveLength(3);
    // Fáze 3 za 8 s/rodina je normální, i když by proti mediánu fáze 1 byla levná.
    expect(judgeCycleCost({ label: "3/3", families: 4, seconds: 32, history: mix }).alarming).toBe(false);
    // A fáze 3 za 150 s/rodina je drahá, i když by proti fázi 1 prošla.
    expect(judgeCycleCost({ label: "3/3", families: 4, seconds: 600, history: mix }).alarming).toBe(true);
  });

  it("fáze bez rodin cenu na rodinu nedává", () => {
    // Dělení nulou by dalo `Infinity` a varování by zakřičelo na fázi, která
    // nic nedělala - což je přesně ten stav, kdy je všechno v pořádku.
    const verdict = judgeCycleCost({ label: "1/3", families: 0, seconds: 12, history: BEZNA_RANA });
    expect(verdict.perFamily).toBe(0);
    expect(verdict.alarming).toBe(false);
  });

  it("poškozená historie se chová jako žádná", () => {
    // Řada je v `artifacts/`, tedy mimo git, a může zmizet nebo se rozbít.
    // Cyklus kvůli tomu nesmí ani spadnout, ani si vymyslet normál.
    const rotten = [{ label: "1/3" } as CycleCostRow, row("1/3", 0, 0)];
    expect(samePhase(rotten, "1/3")).toEqual([]);
    expect(judgeCycleCost({ label: "1/3", families: 50, seconds: 9999, history: rotten }).alarming)
      .toBe(false);
  });
});
