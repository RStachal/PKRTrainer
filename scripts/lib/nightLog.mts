/**
 * Čtení nočního logu (`artifacts/decomposition/night.log`).
 *
 * ## Proč to má vlastní soubor
 *
 * Řádky logu píše `run_night_decomposition.py` a čte je `mtt:daily`. Regulární
 * výraz pro souhrn po rodinách stál od 8. do 14. 9. 2026 přímo v orchestrátoru,
 * **bez zpětných lomítek** (sežral je heredoc) a bez časové značky, kterou
 * runner před každý řádek dává - takže věta z bodu 198 se za šest dní
 * neobjevila ani jednou a nikdo to nepoznal, protože se nikde netestovala.
 * Tady je to funkce s testem na skutečný řádek z logu.
 */

export interface NightFamilyRow {
  /** Kolik riverových vrstev noc dala rodině. */
  layers: number;
  /** Kolik podher se v těch vrstvách vyřešilo. */
  games: number;
  family: string;
}

/**
 * Souhrn noci po rodinách, tak jak ho runner vypisuje na konci riverové fáze:
 *
 *   [06:56:47]      1 vrstev,    140 podher do MTT9_25BB_CO_BTN_SRP
 */
const FAMILY_ROW = /^\[\d{2}:\d{2}:\d{2}\]\s*(\d+) vrstev,\s*(\d+) podher do (\S+)/;

export function nightFamilyRows(lines: readonly string[]): NightFamilyRow[] {
  return lines
    .map((line) => FAMILY_ROW.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    // Log je CRLF; bez ořezu by jméno rodiny neslo `\r` a nikde by nesedlo.
    .map((match) => ({ layers: Number(match[1]), games: Number(match[2]), family: match[3].trim() }));
}

export interface RiverPhaseRate {
  /** Podher vyřešených v riverové fázi (součet řádků po rodinách). */
  games: number;
  /** Minuty od první vrstvy po souhrn; přes půlnoc se počítá správně. */
  minutes: number;
  /** Tvar fáze, pokud ho runner zapsal (od 14. 9. 2026). */
  shape?: string;
}

const STAMP = /^\[(\d{2}):(\d{2}):(\d{2})\]/;
const SHAPE = /^\[\d{2}:\d{2}:\d{2}\]\s*(\d+ procesů x \d+ vláken)/;

function minuteOf(line: string): number | undefined {
  const match = STAMP.exec(line);
  if (match === null) return undefined;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 60;
}

/**
 * Propustnost riverové fáze: podher za minutu.
 *
 * Je to jediné číslo, kterým se dá porovnat noc s nocí, když se změní tvar
 * fáze (procesy x vlákna) - počet vrstev to neumí, protože vrstvy mají 26 až
 * 185 podher. Poprvé potřeba 15. 9. 2026: noc 14./15. jede 16 x 1 místo 8 x 2
 * na základě denního měření (bod 242) a ráno se má vidět, jestli to platí
 * i na celém stroji.
 */
export function riverPhaseRate(lines: readonly string[]): RiverPhaseRate | undefined {
  const first = lines.find((line) => line.includes("solving river "));
  const rows = nightFamilyRows(lines);
  if (first === undefined || rows.length === 0) return undefined;
  const start = minuteOf(first);
  const lastRow = lines.filter((line) => /\d+ vrstev,\s*\d+ podher do /.test(line)).pop();
  const end = lastRow === undefined ? undefined : minuteOf(lastRow);
  if (start === undefined || end === undefined) return undefined;
  const minutes = end >= start ? end - start : end + 24 * 60 - start;
  const shape = lines.map((line) => SHAPE.exec(line)?.[1]).find((match) => match !== undefined);
  return { games: rows.reduce((sum, row) => sum + row.games, 0), minutes, shape };
}
