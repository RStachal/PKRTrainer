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
    if (readyTurnEvPack(pack.id) === undefined) {
      stale.push({ family, rules: pack.rules?.length ?? 0 });
    }
  }
  // Nejdřív rodiny s nejvíc pravidly: když se oprava nedostane na konec, ať
  // zbudou ty, které odpovídají na nejmíň spotů.
  stale.sort((left, right) => right.rules - left.rules);
  return stale.map((entry) => entry.family);
}
