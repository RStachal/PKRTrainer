/**
 * Potřebuje ta rodina vůbec přegenerovat pack?
 *
 * ## Proč to má vlastní soubor
 *
 * Ranní cyklus měl bránu „ulice jen tehdy, když noc něco dosolvila", a byla
 * správná v záměru i špatná v granularitě: porovnávala **nejnovější checkpoint
 * kdekoli** s **nejnovějším packem té ulice**. Jedna nová deska v jedné rodině
 * tedy přegenerovala všech 54 rodin.
 *
 * Co to stálo, měřeno 7. 10. 2026 z času zápisu souborů:
 *
 * | rodina | čas |
 * |---|---|
 * | `mtt9-100bb-sb-bb-srp-oop-cbet-highspr` | **112,5 min** |
 * | `mtt9-100bb-co-bb-srp-cbet-highspr` | 8,3 min |
 * | `mtt9-25bb-hj-sb-srp` | 5,5 min |
 * | ostatních jedenáct | 0,5 az 3,2 min |
 *
 * Checkpointy té první rodiny jsou z **27. 7. 2026**, tedy 72 dní nezměněné, a
 * je jich 32 po 300 az 400 MB. Vyráběl se z nich bajt za bajt tentýž pack, a to
 * každé ráno - tolik platí a je to důvod, proč tahle brána existuje.
 *
 * ## Těch 112 minut ale **nebyla cena té rodiny**, a mýlil jsem se
 *
 * Ráno 8. 10. 2026 vyrobil cyklus tutéž rodinu z týchž checkpointů za **5,3 min**
 * a celá fáze trvala 45 minut místo 3 h 23. Brána přitom nepřeskočila nic (noc
 * změnila tabulku velikostí sázek, takže se otisk sdílených vstupů změnil a
 * přegenerovalo se všech 58 rodin).
 *
 * Rozdíl byl v **paměti**: 7. 10. měl cyklus volných 8,5 GB a haldu na flop
 * 4 096 MB, 8. 10. volných 16,4 GB a haldu 6 587 MB. Těch 112 minut bylo
 * hladovění po haldě, ne velikost checkpointů - `laneBudget()` haldu škáluje
 * podle volné paměti, takže cizí proces na stroji zdraží ranní cyklus
 * dvacetinásobně.
 *
 * Brána tím neztrácí smysl (viz fáze 3 téhož rána: „generuji 0 z 4 rodin, 4 má
 * pack z týchž vstupů"), jen **nebyla to ona, co ušetřilo ty dvě a půl hodiny**.
 * Skutečná páka je volná paměť v době běhu a to je zatím neměřené.
 *
 * ## Čím se to řídí, a proč ne časem
 *
 * Čas zápisu nestačí: tabulku velikostí sázek cyklus **přepisuje každé ráno**,
 * takže by byla vždycky novější než každý pack a brána by nikdy nic nepřeskočila.
 * Rozhoduje proto obsah - `sha1` sdílených vstupů - plus čas checkpointů té
 * jedné rodiny. Je to táž zásada, jakou projekt zjistil u dodávky packů: počítat
 * se musí **otisk pravidel**, ne jejich počet, protože třináct packů změnilo
 * strategii při nezměněném počtu.
 *
 * ## Na kterou stranu se mýlit
 *
 * Přeskočená rodina, která se změnit měla, znamená **tiše zastaralý obsah u
 * hráče** - nejdražší vada, jakou tenhle projekt zná. Zbytečně přegenerovaná
 * rodina stojí minuty. Proto se při každé nejistotě generuje: chybějící pack,
 * nečitelný soubor, neznámá rodina, cokoli.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Kde leží záznam o tom, z čeho byl pack naposled postavený. Gitignorováno schválně:
 * po čerstvém checkoutu se má vygenerovat všechno, ne věřit cizímu záznamu. */
export const PACK_INPUTS_PATH = "artifacts/pack-inputs.json";

/**
 * Sdílené vstupy, které mění **každý** pack. Hashuje se obsah, ne čas.
 *
 * Tabulka velikostí sázek je data; generátory jsou kód. Obojí se do packu
 * promítá, takže obojí musí být v otisku - jinak by změna generátoru nechala
 * všechny packy ležet.
 */
export const SHARED_INPUTS: readonly string[] = [
  "src/data/ranges/postflopBetSizing.generated.ts",
  "scripts/buildFlopStrategyPacks.mts",
  "scripts/buildTurnStrategyPacks.mts",
  "scripts/buildRiverStrategyPacks.mts",
  // Výběr riverových pravidel do rozpočtu; vytažený z generátoru 20. 10. 2026,
  // a bez téhle řádky by jeho změna žádný pack nepřegenerovala.
  "scripts/lib/riverRuleBudget.mts",
  "scripts/lib/solvedPackBuilding.mts",
  "scripts/lib/postflopBetActionMapping.mts",
];

export function sharedInputsHash(files: readonly string[] = SHARED_INPUTS): string {
  const hash = createHash("sha1");
  for (const file of files) {
    // Chybějící soubor se do otisku zapíše jako chybějící, ne přeskočí: kdyby
    // se přeskočil, vypadalo by jeho smazání jako „nic se nezměnilo".
    hash.update(file);
    hash.update(existsSync(file) ? readFileSync(file) : Buffer.from("CHYBI"));
  }
  return hash.digest("hex");
}

/** Čas nejnovějšího checkpointu té rodiny; 0, když žádný není. */
export function newestCheckpointMs(checkpointRoot: string, family: string): number {
  const raw = join(checkpointRoot, family, "raw");
  if (!existsSync(raw)) return 0;
  let newest = 0;
  for (const name of readdirSync(raw)) {
    if (!name.endsWith(".json")) continue;
    newest = Math.max(newest, statSync(join(raw, name)).mtimeMs);
  }
  return newest;
}

/**
 * Čas nejnovější turnové vrstvy rodiny; 0, když žádná není.
 *
 * Turnový pack se staví z vrstev rozkladu, ne z checkpointu. Do 15. 10. 2026
 * se mezi vstupy nepočítaly, takže noc, která rodinu rozložila znovu (po
 * přesolvení na nové range), se do turnového packu nepropsala: 7 ze 48 packů
 * bylo starších než jejich vrstvy, a hráč dostával flop z nového solvu a turn
 * ze starého.
 */
export function newestTurnLayerMs(decompositionRoot: string, family: string): number {
  if (!existsSync(decompositionRoot)) return 0;
  let newest = 0;
  for (const board of readdirSync(decompositionRoot)) {
    if (!board.startsWith(`${family}__`)) continue;
    const directory = join(decompositionRoot, board);
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".json") || name === "plan.json") continue;
      newest = Math.max(newest, statSync(join(directory, name)).mtimeMs);
    }
  }
  return newest;
}

/**
 * Čas nejnovější riverové vrstvy rodiny; 0, když žádná není.
 *
 * Čte se z adresářů podher, ne ze souborů: riverových vrstev je přes 660 tisíc
 * a runner vrstvu nikdy nepřepisuje na místě - novou zapíše jako nový soubor,
 * a tím posune čas adresáře. Přesolvená rodina se rozkládá načisto, takže se
 * pohne i ten. Kdyby runner začal vrstvy přepisovat, musí se číst soubory.
 */
export function newestRiverLayerMs(decompositionRoot: string, family: string): number {
  if (!existsSync(decompositionRoot)) return 0;
  let newest = 0;
  for (const board of readdirSync(decompositionRoot)) {
    if (!board.startsWith(`${family}__`)) continue;
    const river = join(decompositionRoot, board, "river");
    if (!existsSync(river)) continue;
    newest = Math.max(newest, statSync(river).mtimeMs);
    for (const subgame of readdirSync(river)) {
      newest = Math.max(newest, statSync(join(river, subgame)).mtimeMs);
    }
  }
  return newest;
}

/** `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` → `mtt9-100bb-sb-bb-srp-oop-cbet-highspr`. */
export function packSlug(family: string): string {
  return family.toLowerCase().replace(/_/g, "-");
}

export interface PackInputsRecord {
  /** Otisk sdílených vstupů, se kterým byl pack naposled postavený. */
  shared: string;
  /** Čas nejnovějšího checkpointu rodiny v té chvíli. */
  checkpointMs: number;
  /**
   * Čas nejnovější vrstvy rozkladu, ze které ulice staví (turn: turnové vrstvy,
   * river: riverové). U flopu chybí - flop se staví z checkpointů.
   */
  layersMs?: number;
  /** Verdikt kontroly pro (ulici, rodinu) v době generování; pack z něj bere důvěru. */
  verdict?: string;
}

export interface SkipDecision {
  generate: readonly string[];
  skipped: readonly string[];
  /** Proč se negenerovalo nic nebo naopak všechno - do logu, ať se to nemusí hádat. */
  reason: string;
}

/**
 * Které rodiny té ulice se mají generovat.
 *
 * `record` je obsah `PACK_INPUTS_PATH` (klíč `<ulice>:<rodina>`); prázdný záznam
 * znamená „nevím", a tedy generovat všechno.
 */
export function familiesToGenerate(options: {
  street: string;
  families: readonly string[];
  checkpointRoot: string;
  packDir: string;
  shared: string;
  record: Readonly<Record<string, PackInputsRecord>>;
  /** Čas nejnovější vrstvy, ze které ulice staví; u flopu se nepředává. */
  layersMs?: (family: string) => number;
  /**
   * Verdikt (ulice, rodina) teď. Pack z něj bere důvěru, takže je to vstup jako
   * každý jiný. Do 15. 10. 2026 nebyl, a druhý průchod ranního cyklu - ten, co
   * po kontrole přegeneruje rodiny se změněným verdiktem - proto nepřegeneroval
   * nic: první průchod těmže rodinám právě zapsal tytéž vstupy. Nová rodina tak
   * zůstala s důvěrou LOW pod produkční branou, dokud se jí nezměnily desky.
   */
  verdictFor?: (family: string) => string;
}): SkipDecision {
  const { street, families, checkpointRoot, packDir, shared, record } = options;
  const generate: string[] = [];
  const skipped: string[] = [];
  for (const family of families) {
    const previous = record[`${street}:${family}`];
    const pack = join(packDir, `${packSlug(family)}.generated.json`);
    const checkpointMs = newestCheckpointMs(checkpointRoot, family);
    const layersMs = options.layersMs?.(family);
    const verdict = options.verdictFor?.(family);
    // Záznam bez nového pole (psaný před 15. 10. 2026) neví, a tedy se generuje.
    const unchanged = previous !== undefined
      && previous.shared === shared
      && previous.checkpointMs === checkpointMs
      && checkpointMs > 0
      && (layersMs === undefined || previous.layersMs === layersMs)
      && (verdict === undefined || (previous.verdict ?? "") === verdict)
      && existsSync(pack);
    if (unchanged) skipped.push(family);
    else generate.push(family);
  }
  const reason = skipped.length === 0
    ? "nic nejde přeskočit (chybí záznam, změnily se sdílené vstupy, přišly desky, vrstvy nebo verdikt)"
    : `${skipped.length} rodin má pack ze týchž vstupů`;
  return { generate, skipped, reason };
}
