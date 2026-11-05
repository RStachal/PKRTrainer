import type { Position } from "../../core/types";

/**
 * Veřejně uváděné šířky otevíracích rangí pro šest hráčů, jako kontrolní pásmo.
 *
 * Šestistolový pack je odvozený: každý záznam je devítistolový záznam přeznačený
 * na sedačku se stejným počtem soupeřů za sebou. Odvození může být vnitřně
 * konzistentní a přesto mimo — a nic v repozitáři to nedokázalo poznat, protože
 * jediné, s čím se dalo porovnávat, byl zdroj samotného odvození.
 *
 * Tohle je vnější měřítko. Ukládají se **jen procenta**, nikoli obsah chartů:
 * kolik procent kombinací se z dané sedačky otevírá. To je publikovaný souhrn,
 * ne licencovaná tabulka ruka po ruce, a projekt takhle zachází se všemi cizími
 * zdroji — citace a metodika ano, hodnoty opsané z placeného produktu ne.
 *
 * Pásmo je široké schválně. Zdroje se mezi sebou liší o několik bodů, protože
 * každý řeší trochu jiný strom a jinou hloubku, a předstírat shodu na desetinu
 * procenta by z rozptylu udělalo přesnost, kterou nemá.
 */

export interface SixMaxOpenWidthBand {
  position: Position;
  /** Dolní a horní mez publikovaných hodnot, v procentech kombinací. */
  minPct: number;
  maxPct: number;
}

export interface SixMaxOpenWidthReference {
  /** Hloubka, ke které se pásmo vztahuje, v BB. */
  stackBB: number;
  /** Odkud čísla pocházejí. UI je nikdy nezobrazuje. */
  sourceUrls: readonly string[];
  note: string;
  bands: readonly SixMaxOpenWidthBand[];
}

export const SIX_MAX_OPEN_WIDTH_REFERENCES: readonly SixMaxOpenWidthReference[] = [
  {
    stackBB: 40,
    sourceUrls: [
      "https://bbzpoker.com/preflop-strategy-tournament-poker/",
      "https://rangerpro.fr/poker-ranges/btn-opens",
    ],
    note: "Turnajové šestistolové otevírací frekvence kolem 40-60 BB.",
    bands: [
      { position: "UTG", minPct: 11, maxPct: 18 },
      { position: "HJ", minPct: 18, maxPct: 25 },
      { position: "CO", minPct: 25, maxPct: 32 },
      { position: "BTN", minPct: 39, maxPct: 47 },
      // Malý blind je jediná sedačka, kde se publikované hodnoty rozcházejí
      // řádově: část zdrojů uvádí jen raise, část raise i limp dohromady. Pásmo
      // proto pokrývá obojí a nic užšího by nebylo poctivé.
      { position: "SB", minPct: 33, maxPct: 75 },
    ],
  },
  {
    stackBB: 100,
    sourceUrls: [
      "https://gtogecko.com/blog/preflop-charts-opening-ranges",
      "https://upswingpoker.com/6-handed-max-poker-strategy/",
    ],
    note: "Šestistolové otevírací frekvence pro sto blindů.",
    bands: [
      { position: "UTG", minPct: 15, maxPct: 21 },
      { position: "HJ", minPct: 19, maxPct: 26 },
      { position: "CO", minPct: 25, maxPct: 32 },
      { position: "BTN", minPct: 40, maxPct: 50 },
      { position: "SB", minPct: 35, maxPct: 50 },
    ],
  },
];
