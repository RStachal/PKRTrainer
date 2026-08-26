import { loadSolvedRiverPacks, riverSolvedStrategyPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import { riverEvManifest } from "../../src/data/ranges/riverEvManifest.generated";
import { loadRiverEvPack, readyRiverEvPack } from "../../src/data/ranges/riverEvRuntime";

/**
 * Rodiny, jejichž tabulka EV přestala sedět na svůj pack.
 *
 * ## Proč to musí umět zjistit stroj
 *
 * EV se váže na `contentHash` packu a `loadRiverEvPack` neshodu **spolkne** -
 * vrátí `undefined`, což z resolveru vypadá stejně jako „tabulka ještě
 * nedorazila". Noční cyklus přitom packy přegeneruje, takže otisk se změní a
 * spočítaná EV se zahodí.
 *
 * Změřeno na dvou nocích po sobě: doručení EV spadlo ze 17 packů (4 906
 * pravidel) na 3 (863), tedy z 31,7 % na 5,8 % rozdaných riverových spotů.
 * **Jedna noc smaže celý předchozí přepočet.**
 *
 * Přepočítat všech 47 rodin stojí hodiny, zastaralých je ale vždycky hrstka.
 * Tenhle seznam je proto ten rozdíl mezi „obnovit EV" a „přepočítat všechno".
 */
export async function staleRiverEvFamilies(): Promise<string[]> {
  await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
  const familyOfPack = new Map(riverEvManifest.map((entry) => [entry.packId, entry.familyId]));
  const stale: string[] = [];
  for (const pack of riverSolvedStrategyPacks as readonly { id: string }[]) {
    const family = familyOfPack.get(pack.id);
    // Rodina bez záznamu v manifestu tabulku nikdy neměla. To není zastarání,
    // je to chybějící obsah - a dopočítat ho je rozhodnutí o rozpočtu, ne úklid
    // po noci.
    if (family === undefined) continue;
    await loadRiverEvPack(pack as never);
    if (readyRiverEvPack(pack.id) === undefined) stale.push(family);
  }
  return stale;
}
