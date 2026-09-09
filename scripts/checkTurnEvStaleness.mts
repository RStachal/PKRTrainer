import { staleTurnEvFamilies } from "./lib/turnEvStaleness.mts";

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
 */
const stale = await staleTurnEvFamilies();
for (const family of stale) console.log(family);
console.error(`zastaralých turnových tabulek EV: ${stale.length}`);
