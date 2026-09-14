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
