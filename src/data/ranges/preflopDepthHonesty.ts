import type { AnteMode, Position, StackBucket } from "../../core/types";
import type { RangePack } from "./rangePack";
import { createRangeStoreFromRangePack } from "../rangeStore";

/**
 * Mění hloubka stacku **které ruce** se otevírají, nebo jen za kolik?
 *
 * Produkt nabízí jedenáct stackových kbelíků a tím slibuje, že se podle hloubky
 * dá trénovat. **Změřeno 3. 9. 2026 na runtime packu, tedy na tom, co hráč
 * doopravdy dostane:** sedm sedaček vrací napříč jedenácti kbelíky tři různé
 * selekce, ale **SB jedinou** - otevírá tytéž ruce na patnácti i na sto
 * blindech a mění jen velikost.
 *
 * Nepleť si to s bodem 137: ten měří **produkční** pack (`shippedPreflopPack`),
 * kde je to 1 z 11 na všech osmi sedačkách. To jsou dvě různé knihovny a dvě
 * různá čísla; tahle funkce se ptá na tu, kterou vidí hráč.
 *
 * Brána tu vadu hlásí od 18. 8. a její vlastní věta zní, že **drill nesmí
 * naznačovat studium podle hloubky tam, kde je range identická**. Do 3. 9. 2026
 * to ale hráč nikde nezjistil: modal ranže vypisoval natvrdo „Předpoklady:
 * 9-max MTT chipEV." a předpoklady packu se do UI schválně nedostávají, protože
 * nesou licence a zdroje. Chyběla tedy věta psaná pro hráče, ne pro intake.
 *
 * ## Proč se to počítá za běhu, a ne jednou při generování
 *
 * Aby to samo zmizelo. Až dorazí hloubkově rozlišené charty, přestane funkce
 * vracet `true` a hláška se přestane ukazovat, aniž by si toho někdo musel
 * všimnout. Předpočítaný příznak by přežil data, která ho vyvrátila - a tvrzení,
 * které nikdo nepřeměřuje, tady vydrželo devět nocí (bod 160).
 *
 * ## Co to netvrdí
 *
 * Neříká, že je obsah špatný. Říká, že se na téhle ose nemá co trénovat, a to
 * je jiné tvrzení: range může být správná a přesto nezávislá na hloubce.
 */

/**
 * Ruce, které se z téhle odpovědi otevírají, bez ohledu na velikost.
 *
 * Skládá se jen ze jmen tříd, ne z akcí: dvě hloubky, které otevírají tytéž
 * ruce jinou velikostí, jsou pro hráče **táž range za jinou cenu**, a slíbit mu
 * kvůli tomu „jiný trénink podle hloubky" by bylo slíbit víc, než co se dodává.
 */
function selectionSignature(actions: Readonly<Record<string, readonly string[]>>): string {
  return Object.entries(actions)
    .filter(([, list]) => list.some((action) => action !== "FOLD"))
    .map(([hand]) => hand)
    .sort()
    .join(",");
}

export interface PreflopDepthSelection {
  /** Kolik hloubek pack pro tuhle sedačku nabízí. */
  buckets: number;
  /** Kolik z nich se liší výběrem otevíraných rukou. */
  distinctSelections: number;
}

/** Kolik různých otevíracích selekcí sedačka napříč hloubkami vydá. */
export function preflopDepthSelection(
  pack: RangePack,
  ante: AnteMode,
  seat: Position,
): PreflopDepthSelection {
  const store = createRangeStoreFromRangePack(pack);
  const buckets = [...new Set(
    pack.records
      .filter((record) => record.context === "RFI" && record.position === seat)
      .map((record) => record.bucket),
  )] as StackBucket[];

  const selections = new Set<string>();
  for (const bucket of buckets) {
    const entry = store.lookup({ ante, position: seat, bucket, context: "RFI" });
    if (entry !== undefined) selections.add(selectionSignature(entry.actions));
  }
  return { buckets: buckets.length, distinctSelections: selections.size };
}

/**
 * Nabízí produkt na téhle sedačce hloubky, které nic nemění?
 *
 * Jedna selekce přes víc kbelíků znamená ano. Jediný kbelík znamená ne - tam se
 * nic neslibuje, takže není co přiznávat.
 */
export function depthDoesNotChangeSelection(
  pack: RangePack,
  ante: AnteMode,
  seat: Position,
): boolean {
  const { buckets, distinctSelections } = preflopDepthSelection(pack, ante, seat);
  return buckets > 1 && distinctSelections === 1;
}
