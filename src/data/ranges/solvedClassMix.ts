import { GRID_SIZE, handLabel } from "../../core/poker";
import type { PostflopAction, PostflopActionFrequency } from "../../core/postflopGenerator";
import type { HandLabel } from "../../core/types";

/**
 * Frekvence vyřešené strategie po třídách rukou, pro matici range.
 *
 * ## Proč zvlášť od packu
 *
 * Strategický pack nese kbelíky: všechny třídy se stejnou převažující akcí
 * a průměr jejich směsi (`classesByDominantAction`). Matice ale potřebuje směs
 * každé třídy, jinak by pruh v buňce ukázal průměr skupiny, jako by patřil té
 * ruce (deník 334). Majitel 3. 11. 2026: „chci to. Rozšířit".
 *
 * Do packu se to nevejde. Pack má strop 528 KB raw a generátor ořezává
 * pravidla na 500 KB (`trimToModuleBudget`), takže frekvence by z packu
 * vytlačily obsah. A pack se stahuje u každého rozdaného spotu, frekvence jen
 * tehdy, když hráč otevře matici. Leží proto v souboru vedle packu
 * (`<rodina>.mix.generated.json`) a stahují se až s maticí.
 *
 * ## Tvar
 *
 * Jeden řetězec na pravidlo, ve stejném pořadí jako `rules` v packu (tatáž
 * vazba jako u tabulek turnové EV, `pack.rules.indexOf(rule)`). Řetězec má
 * 169 míst oddělených středníkem v pořadí mřížky 13×13 (`handLabel(řádek,
 * sloupec)`). Prázdné místo je třída mimo range uzlu. Jinak celá procenta
 * akcí oddělená čárkou, v pořadí akcí pravidla (`rule.actions`), bez nul na
 * konci. Například `100` je čistá první akce a `0,64,36` mix druhé a třetí.
 *
 * Soubor nese `contentHash` packu, ze kterého vznikl. Frekvence k jinému
 * obsahu se nepoužijí, i kdyby pořadí pravidel náhodou sedělo.
 */
export const CLASS_MIX_SCHEMA = "PKRTRAINER_CLASS_MIX_V1";

export interface SolvedClassMixFile {
  schemaVersion: typeof CLASS_MIX_SCHEMA;
  packId: string;
  contentHash: string;
  /** Jeden řetězec na pravidlo packu, viz hlavička. Prázdný = pravidlo bez dat. */
  rules: readonly string[];
}

/**
 * Kde frekvence k vybranému pravidlu leží. Nese ho zdroj odpovědi
 * (`PostflopRecommendationSource.classMix`), matice si podle něj soubor stáhne.
 */
export interface SolvedClassMixRef {
  street: "FLOP" | "TURN" | "RIVER";
  packId: string;
  contentHash: string;
  ruleIndex: number;
  /**
   * Akce produktu v pořadí akcí pravidla. Dvě velikosti sázky se můžou slít do
   * jedné akce produktu, proto se procenta podle tohohle seznamu sčítají.
   */
  actions: readonly PostflopAction[];
}

/** Místo třídy v řetězci: pořadí mřížky, řádek po řádku. */
export const CLASS_MIX_ORDER: readonly HandLabel[] = Array.from(
  { length: GRID_SIZE * GRID_SIZE },
  (_, index) => handLabel(Math.floor(index / GRID_SIZE), index % GRID_SIZE),
);

/**
 * Směs každé třídy v akcích produktu. Prázdná mapa, když pravidlo data nemá
 * nebo řetězec nemá 169 míst.
 */
export function decodeClassMix(
  encoded: string,
  actions: readonly PostflopAction[],
): Map<HandLabel, PostflopActionFrequency[]> {
  const result = new Map<HandLabel, PostflopActionFrequency[]>();
  const slots = encoded.split(";");
  if (slots.length !== CLASS_MIX_ORDER.length) return result;
  slots.forEach((slot, index) => {
    if (slot === "") return;
    const summed = new Map<PostflopAction, number>();
    slot.split(",").forEach((value, position) => {
      const action = actions[position];
      const percent = Number(value);
      if (action === undefined || !Number.isFinite(percent) || percent <= 0) return;
      summed.set(action, (summed.get(action) ?? 0) + percent);
    });
    if (summed.size === 0) return;
    result.set(CLASS_MIX_ORDER[index], [...summed].map(([action, frequencyPct]) => ({
      action,
      frequencyPct,
      // Čísla jsou solverova, jen zaokrouhlená na celá procenta.
      visibility: "EXACT" as const,
    })));
  });
  return result;
}

/**
 * Frekvence pravidla ze souboru, nebo `undefined`, když soubor k packu
 * nepatří (jiné schéma, jiný pack, jiný otisk obsahu) nebo pravidlo chybí.
 */
export function classMixForRule(
  file: SolvedClassMixFile,
  ref: SolvedClassMixRef,
): Map<HandLabel, PostflopActionFrequency[]> | undefined {
  if (file.schemaVersion !== CLASS_MIX_SCHEMA) return undefined;
  if (file.packId !== ref.packId || file.contentHash !== ref.contentHash) return undefined;
  const encoded = file.rules[ref.ruleIndex];
  if (encoded === undefined || encoded === "") return undefined;
  const mix = decodeClassMix(encoded, ref.actions);
  return mix.size > 0 ? mix : undefined;
}
