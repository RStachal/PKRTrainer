import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadAllSolvedTurnPacks, turnSolvedStrategyPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { turnEvManifest } from "../../src/data/ranges/turnEvManifest.generated";
import { loadTurnEvPack, readyTurnEvPack } from "../../src/data/ranges/turnEvRuntime";

/**
 * Rodiny, jejichž turnová tabulka EV přestala sedět na svůj pack.
 *
 * ## Proč to musí umět zjistit stroj
 *
 * EV se váže na `contentHash` packu a `loadTurnEvPack` neshodu **spolkne** -
 * vrátí `undefined`, což z resolveru vypadá stejně jako „tabulka ještě
 * nedorazila". Noční cyklus přitom packy přegeneruje, takže otisk se změní a
 * spočítaná EV se tiše zahodí.
 *
 * Na riveru to stálo dvě noci a doručení spadlo z 31,7 % na 5,8 % rozdaných
 * spotů, než někdo přišel na to, proč. Turnová EV stojí navíc **hodiny** na
 * rodinu, takže tichá ztráta je tu ještě dražší.
 */
const DECOMPOSITION_ROOT = "artifacts/decomposition";
const TURN_EV_DIR = "src/data/ranges/turn-ev";

/**
 * Přibyla pod rodinou riverová vrstva od chvíle, kdy se její tabulka psala?
 *
 * ## Proč otisk packu nestačí
 *
 * Změřeno 14. 9. 2026: dvě noci cílených vrstev (bod 238) nezměnily otisk
 * jediného turnového packu - vrstva mění **hodnoty** EV, ne strategii - takže
 * podle otisku nebyla zastaralá žádná tabulka, a přitom po přestavbě dvou
 * rodin kleslo prázdno z 47,9 na 36,5 % a z 32,5 na 23,2 %. Noc tedy dodávala
 * na disk a k hráči by se z toho nedostalo nic, dokud by tabulku někdo
 * nepřestavěl rukou.
 *
 * Porovnává se čas změny: tabulka je stará, když je pod kteroukoli deskou
 * rodiny riverová vrstva (adresář `river/<podhra>`) novější než ona. Je to
 * hrubší než přesné mapování pravidel na podhry, ale bezpečné oběma směry -
 * navíc přestavěná tabulka je jen strojový čas, chybějící je ztráta doručení.
 */
function layersNewerThanTable(family: string): boolean {
  const slug = family.toLowerCase().replace(/_/g, "-");
  const table = join(TURN_EV_DIR, `${slug}.generated.json`);
  if (!existsSync(table)) return false;
  const written = statSync(table).mtimeMs;
  if (!existsSync(DECOMPOSITION_ROOT)) return false;
  for (const board of readdirSync(DECOMPOSITION_ROOT)) {
    if (!board.startsWith(`${family}__`)) continue;
    const river = join(DECOMPOSITION_ROOT, board, "river");
    if (!existsSync(river)) continue;
    for (const layer of readdirSync(river)) {
      // Kompletní vrstva se pozná podle plánu; jeho adresář se dotkne při
      // každém zapsaném souboru podhry, takže mtime adresáře stačí.
      const dir = join(river, layer);
      if (statSync(dir).mtimeMs > written && existsSync(join(dir, "plan.json"))) return true;
    }
  }
  return false;
}

/**
 * Rodiny, které na přestavbu tabulky **čekat nemají** - rozhodnutí vlastníka 3b.
 *
 * ## Proč tenhle seznam vznikl
 *
 * Od 7. 10. 2026 se fáze turnové EV nepouštěla vůbec, protože jediná zastaralá
 * rodina vyčerpala tři pokusy žebříku. Otázka byla, co s ní: dát jí vlastní noc,
 * nebo nechat tabulku zastaralou. Vlastník rozhodl **nechat** (3b) a dodal důvod,
 * který v otázce chyběl:
 *
 * „Ta rodina stojí na starém základu. Všech 32 checkpointů
 * MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR je z 8.-27. 7., tedy z doby, kdy se ranže
 * do solvu psaly rukou podle šablon dávek, a dávno před RYE ranžemi z 22.-24. 9.
 * Dopočítat turnovou EV z takových checkpointů je noc za doladění dat, která se
 * zahodí, až přijde na řadu přesolvení 100 bb na dnešních ranžích."
 *
 * A vyžádal si, ať nesvítí jako zastaralé: „označit tu rodinu v detektoru jako
 * ‚čeká na přesolvení 100 bb', ať nesvítí jako zastaralá, a totéž u dalších dvou
 * stobblindových rodin z července."
 *
 * ## Proč se **nevyřazují**, jen neřadí jako práce
 *
 * Mizet nemají: tabulka doopravdy zastaralá je a hráč z té rodiny dostává EV
 * z července. Kdyby se tahle věta ztratila, nikdo by po přesolvení nevěděl, že se
 * má tabulka postavit znovu. Vrací se proto zvlášť - `deferred` - a hlásí se
 * jmenovitě i s důvodem.
 *
 * Kolik se jejich ranže liší od dnešních, změří `npm run mtt:solver-range-drift`.
 * Samotné přesolvení 100 bb (přes 2,5 h na desku) je podle vlastníka samostatné
 * rozpočtové rozhodnutí, až dojede 50 bb.
 */
export const DEFERRED_UNTIL_RESOLVE_100BB: readonly string[] = [
  "MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR",
  "MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR",
  "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
];

export interface TurnEvStaleness {
  /** Rodiny, kde přestavba tabulky je práce, která se má udělat. */
  stale: readonly string[];
  /** Rodiny odložené na přesolvení 100 bb - zastaralé jsou, ale čekat nemají. */
  deferred: readonly string[];
}

/**
 * Zastaralé tabulky rozdělené na „udělat" a „odloženo" (rozhodnutí 3b).
 *
 * Odložená rodina se do `stale` nedostane, i když zastaralá je: `stale` je
 * seznam práce a noc podle něj rozhoduje, co spustit.
 */
export async function turnEvStaleness(): Promise<TurnEvStaleness> {
  const all = await staleTurnEvFamilies();
  const deferredSet = new Set(DEFERRED_UNTIL_RESOLVE_100BB);
  return {
    stale: all.filter((family) => !deferredSet.has(family)),
    deferred: all.filter((family) => deferredSet.has(family)),
  };
}

export async function staleTurnEvFamilies(): Promise<string[]> {
  await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  const familyOfPack = new Map(turnEvManifest.map((entry) => [entry.packId, entry.familyId]));
  const stale: { family: string; rules: number }[] = [];
  for (const pack of turnSolvedStrategyPacks as readonly { id: string; rules?: readonly unknown[] }[]) {
    const family = familyOfPack.get(pack.id);
    // Rodina bez záznamu v manifestu tabulku nikdy neměla. To není zastarání,
    // je to chybějící obsah - a dopočítat ho je rozhodnutí o rozpočtu a
    // strojovém čase (body 211 a 214), ne úklid po noci.
    if (family === undefined) continue;
    await loadTurnEvPack(pack as never);
    if (readyTurnEvPack(pack.id) === undefined || layersNewerThanTable(family)) {
      stale.push({ family, rules: pack.rules?.length ?? 0 });
    }
  }
  // Nejdřív rodiny s nejvíc pravidly: když se oprava nedostane na konec, ať
  // zbudou ty, které odpovídají na nejmíň spotů.
  stale.sort((left, right) => right.rules - left.rules);
  return stale.map((entry) => entry.family);
}
