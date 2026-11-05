import { DEFERRED_UNTIL_RESOLVE_100BB, turnEvStaleness } from "./lib/turnEvStaleness.mts";

/**
 * Které turnové tabulky EV přestaly sedět na svůj pack.
 *
 *   npm run mtt:turn-ev-stale
 *
 * ## Proč to je vlastní příkaz, a ne funkce volaná uvnitř cyklu
 *
 * Protože **volaná uvnitř cyklu lhala**, a je to doložené z riverové obdoby:
 * `mtt:after-night` packy přegeneruje a hned poté se ptal na zastaralost
 * v témže procesu. Vstupní bod se balí esbuildem, takže obsah packů je do
 * balíčku vložený při startu procesu - tedy ve stavu **před** přegenerováním,
 * které ten proces sám právě udělal. Kontrola porovnávala staré packy se starou
 * EV, všechno sedělo a cyklus ohlásil „žádná tabulka nezastarala".
 *
 * Změřeno 27. 8. 2026 na riveru: uvnitř cyklu 0 zastaralých, ve svěžím procesu
 * ve stejnou chvíli 44 ze 48. Vlastní proces to řeší tím, že si obsah načte až
 * on sám.
 *
 * ## Co na standardní výstup patří a co ne
 *
 * Na `stdout` jdou **jen rodiny k přestavbě**, protože ten výstup čte cyklus a
 * dělá z něj práci (`runDailyOrchestrator`, `runAfterNight`). Rodiny odložené na
 * přesolvení 100 bb (rozhodnutí vlastníka 3b) jdou na `stderr` jmenovitě: jsou
 * zastaralé, ale čekat nemají, a zmizet taky nesmí - jinak by po přesolvení nikdo
 * nevěděl, že se jejich tabulka má postavit znovu.
 */
const { stale, deferred } = await turnEvStaleness();
for (const family of stale) console.log(family);
console.error(`zastaralých turnových tabulek EV: ${stale.length}`);
if (deferred.length > 0) {
  console.error(
    `odloženo na přesolvení 100 bb (rozhodnutí 3b): ${deferred.length}`
    + ` z ${DEFERRED_UNTIL_RESOLVE_100BB.length} označených`,
  );
  for (const family of deferred) console.error(`  ${family}`);
  console.error(
    "  Checkpointy jsou z července, z doby ručně psaných ranží. Dopočítat z nich EV"
    + " je noc za data, která přesolvení zahodí; rozdíl ranží změří mtt:solver-range-drift.",
  );
}
