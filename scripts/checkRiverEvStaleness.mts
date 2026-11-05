import { staleRiverEvFamilies } from "./lib/riverEvStaleness.mts";

/**
 * Které riverové tabulky EV přestaly sedět na svůj pack.
 *
 *   npm run mtt:river-ev-stale
 *
 * ## Proč to je vlastní příkaz, a ne funkce volaná uvnitř cyklu
 *
 * Protože **volaná uvnitř cyklu lhala**. `mtt:after-night` packy přegeneruje a
 * hned poté se ptal `staleRiverEvFamilies()` v témže procesu. Jenže vstupní bod
 * se balí esbuildem, takže obsah packů je do balíčku vložený při startu procesu -
 * tedy ve stavu **před** přegenerováním, které ten proces sám právě udělal.
 * Kontrola pak porovnávala staré packy se starou EV, všechno sedělo a cyklus
 * ohlásil „žádná tabulka nezastarala".
 *
 * Změřeno 27. 8. 2026: uvnitř cyklu **0 zastaralých**, ve svěžím procesu ve
 * stejnou chvíli **44 ze 48**, a sada to potvrdila 94 spadlými testy. Je to ta
 * nejhorší třída vady - brána, která uklidňuje přesně v okamžiku, kdy se hodnota
 * ztrácí, a přitom je to brána postavená právě proti téhle ztrátě.
 *
 * Vlastní proces to řeší tím, že si obsah načte až on sám.
 */
const stale = await staleRiverEvFamilies();
for (const family of stale) console.log(family);
console.error(`zastaralých tabulek EV: ${stale.length}`);
