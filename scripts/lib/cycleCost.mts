/**
 * Cena jedné fáze ranního cyklu, měřená proti vlastní historii.
 *
 * ## Proč to má vlastní soubor
 *
 * U fáze generování packů jsem **dvakrát za dva dny určil příčinu drahoty
 * špatně** a oba závěry pak vyvrátilo měření:
 *
 * 1. „Stojí 112,5 min, protože ta rodina má 32 checkpointů a 6 GB dat."
 * 2. „Stojí 112,5 min, protože měla malou haldu (4 096 MB proti 6 587)."
 *
 * Změřeno 8. 10. 2026 přímo na té rodině: **121 s při haldě 4 096 MB a 125 s
 * při 6 587 MB**. Halda to nevysvětluje a velikost dat taky ne - táž rodina
 * z týchž checkpointů stojí dvě minuty.
 *
 * Co zbývá, je vliv zvenčí, a čísla na to ukazují: fáze 1 stála 34 az 59 sekund
 * na rodinu v devíti ránech a **179 a 226 sekund** ve dvou, kdy jsem na stroji
 * od devíti pouštěl měření a brány. Je to korelace, ne důkaz.
 *
 * **A právě proto tahle knihovna existuje.** Příště se nebude hádat: fáze sama
 * řekne, že je dnes řádově dražší než obvykle, a to je signál „něco mi bere
 * stroj", ne „ta rodina je drahá". Dokud se cena měřila jen jako součet za
 * ulici, vypadal každý takový den jako vlastnost obsahu.
 */

import { readFileSync, writeFileSync } from "node:fs";

/** Měření tohohle stroje, ne obsah projektu - proto `artifacts/`, tedy mimo git. */
export const CYCLE_COST_PATH = "artifacts/cycle-cost.json";

/**
 * Kolikrát nad mediánem je ještě normální.
 *
 * Trojnásobek, a je to volené z naměřeného rozptylu: běžná rána drží 34 az 59
 * sekund na rodinu, tedy do 1,6x mediánu, kdežto oba drahé dny byly 4,8x a 6,1x.
 * Mezi 1,6 a 4,8 je místa dost, takže práh nemusí být přesný - a dvojnásobek by
 * už křičel na ráno, které je jen o půlku pomalejší.
 */
export const COST_ALARM_RATIO = 3;

export interface CycleCostRow {
  /** Kdy se měřilo; `z logu` u řádků nasazených zpětně. */
  at: string;
  /** Jméno fáze (`1/3`, `3/3`) - fáze se srovnávají jen samy se sebou. */
  label: string;
  families: number;
  perFamily: number;
  freeGb: number;
}

export function readCycleCost(path = CYCLE_COST_PATH): CycleCostRow[] {
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as CycleCostRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Dřívější měření **téže fáze**.
 *
 * Filtruje se podle jména fáze, a je to podstatné: fáze 3 generuje pár rodin
 * a její cena na rodinu s fází 1 nesouvisí (naměřeno 5 az 44 s proti 34 az 226).
 * Smíchat je by dalo medián, který neplatí ani pro jednu, a varování by pak
 * křičelo na normální stav.
 */
export function samePhase(rows: readonly CycleCostRow[], label: string): CycleCostRow[] {
  return rows.filter((row) => (
    row.label === label && typeof row.perFamily === "number" && row.families > 0
  ));
}

export interface CostVerdict {
  perFamily: number;
  /** Medián dřívějších měření téže fáze; chybí u prvního. */
  median?: number;
  /** Kolikrát nad mediánem; chybí u prvního měření. */
  ratio?: number;
  /** Je to řádově dražší, než bývá? */
  alarming: boolean;
  /** Věta do logu. */
  line: string;
}

/**
 * Posoudit cenu právě doběhlé fáze proti historii.
 *
 * První měření se neposuzuje: bez historie není proti čemu, a hádat by znamenalo
 * vymyslet si normál. Vrací se tedy `alarming: false` a řekne se, že je to první.
 */
export function judgeCycleCost(options: {
  label: string;
  families: number;
  seconds: number;
  history: readonly CycleCostRow[];
}): CostVerdict {
  const { label, families, seconds, history } = options;
  const perFamily = families === 0 ? 0 : seconds / families;
  const past = samePhase(history, label)
    .map((row) => row.perFamily)
    .sort((left, right) => left - right);
  if (past.length === 0) {
    return { perFamily, alarming: false, line: `${perFamily.toFixed(0)} s na rodinu (první měření)` };
  }
  const median = past[Math.floor(past.length / 2)];
  const ratio = median === 0 ? 0 : perFamily / median;
  const alarming = ratio > COST_ALARM_RATIO;
  return {
    perFamily,
    median,
    ratio,
    alarming,
    line: `${perFamily.toFixed(0)} s na rodinu, medián z ${past.length} dřívějších ${median.toFixed(0)} s`,
  };
}

export function recordCycleCost(row: CycleCostRow, path = CYCLE_COST_PATH): void {
  try {
    // Posledních padesát stačí: medián se z nich spočítá a soubor nenaroste.
    // Zapisuje se **celá** řada, ne jen táž fáze, aby se starší záznamy jiné
    // fáze nezahodily.
    const rows = [...readCycleCost(path), row].slice(-50);
    writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  } catch {
    // Neměřit je lepší než shodit cyklus: tahle řada je pro úsudek, ne pro výsledek.
  }
}
