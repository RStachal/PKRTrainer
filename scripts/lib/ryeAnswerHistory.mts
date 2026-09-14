import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DraftRecord } from "./ryeDraftImpact.mts";

/**
 * Co už majitel u draftu ranží odpověděl, přečtené zpátky.
 *
 * ## Proč to musí vzniknout
 *
 * Čtení 114 mřížek je jediné úzké hrdlo tohohle obsahu a majitel ho udělal
 * 9. 9. 2026. Hned nato se ukázalo, že se **74 z nich kreslí jinak** (bod 224:
 * ruka hraná zčásti se malovala jako jistota) a dvě z draftu vypadly úplně
 * (bod 225). Kdyby stránka o dřívějších odpovědích nevěděla, znamenalo by to
 * přečíst všech 112 znovu - přitom 38 z nich se nezměnilo ani o pixel.
 *
 * Stránka proto řekne u každé mřížky, jestli na ni odpověď **platí dál**, nebo
 * jestli se od té odpovědi změnilo právě to, co se posuzovalo.
 *
 * ## Proč to nerozhoduje otisk
 *
 * Otisk by byl přesnější, jenže odpovědi z 9. 9. se překládaly z pozice na
 * identitu **až po** opravě vah, takže otisk uložený u nich patří obsahu, který
 * majitel neviděl. Vydávat ho za doklad shody by bylo přesně to tvrzení
 * „přečteno" o něčem jiném, proti kterému stojí `flopPilotContentHash`. Rozhoduje
 * proto vlastnost, která se dá z dat spočítat a je pravdivá: **nese ta mřížka
 * buňku s částečnou váhou?** Ty a jen ty se od přečtení kreslí jinak.
 */

export interface RecordedAnswer {
  sourceFile: string;
  verdict: string;
  flags: string[];
  /** Datum čtení, ze kterého tahle odpověď je. Různé mřížky se čtou různě dlouho. */
  readAt: string;
  /** Otisk mřížky v době odpovědi. Chybí u čtení z 9. 9. 2026, viz `isStale`. */
  contentHash?: string;
  /**
   * Barvy legendy, které stránka v době odpovědi **nekreslila**.
   *
   * Do 9. 9. 2026 barva, kterou kontext neuměl přeložit, tiše spadla do foldu.
   * Stalo se to na dvou stránkách (`All in | Call` čtené jako čelení all-inu):
   * majitel je 9. 9. posoudil bez 29 a 74 tříd jamu a vytkl jim „moc těsné".
   * Zapsáno u té odpovědi, protože je to vlastnost čtení, ne mřížky - a bez
   * toho by po návratu těch stránek (bod 249) odhad podle částečných vah tvrdil
   * „beze změny" o mřížce, která má o třetinu tříd víc.
   */
  readWithoutActions?: string[];
}

/**
 * Otisk toho, co čtenář na mřížce vidí.
 *
 * Skládá se z akcí a poměrů, ne z celého záznamu: jméno souboru, poznámky ani
 * pořadí klíčů nemají odpověď shodit. Změní ho jen to, co mění obrázek - které
 * ruce co hrají a jak často. Táž konstrukce jako `flopPilotContentHash`, aby se
 * obě cesty chovaly stejně.
 */
export function gridContentHash(record: DraftRecord): string {
  const parts: string[] = [];
  for (const hand of Object.keys(record.lenient).sort()) {
    parts.push(hand, (record.lenient[hand] ?? []).join(","));
    const mix = record.mix?.[hand];
    if (mix !== undefined) {
      parts.push(Object.entries(mix).sort().map(([action, share]) => `${action}${share}`).join(""));
    }
  }
  let hash = 5381;
  const text = parts.join("|");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}-${text.length.toString(16)}`;
}

/**
 * Změnila se mřížka od chvíle, kdy na ni majitel odpověděl?
 *
 * **S otiskem** je to přesné: liší se, tedy se změnilo právě to, co se
 * posuzovalo. **Bez otisku** (čtení z 9. 9. 2026, které se na identitu
 * překládalo až po opravě vah) se musí odhadovat, a jediná pravdivá věc, která
 * se o té verzi stránky ví, je že kreslila ruku hranou zčásti jako jistotu -
 * takže se za změněné berou právě mřížky s částečnou váhou.
 *
 * První verze používala tenhle odhad na **všechny** odpovědi, a bylo to špatně:
 * po druhém čtení 10. 9., které už proběhlo nad opravenou stránkou, hlásila
 * stránka pořád 29 mřížek k přečtení znovu. Odhad platí jen tam, kde se nedá
 * měřit.
 */
export function isStale(record: DraftRecord, answer: RecordedAnswer): boolean {
  if (answer.contentHash !== undefined) return answer.contentHash !== gridContentHash(record);
  // Čtenář neviděl celou legendu - mřížka se od té doby kreslí jinak jistě.
  if ((answer.readWithoutActions ?? []).length > 0) return true;
  return partialWeightCells(record) > 0;
}

export interface AnswerHistory {
  /** Jméno souboru, ze kterého se to načetlo. Prázdné, když žádný není. */
  origin: string;
  /** Datum, ke kterému odpovědi patří, ze jména souboru. */
  readAt: string;
  bySourceFile: ReadonlyMap<string, RecordedAnswer>;
}

const EMPTY: AnswerHistory = { origin: "", readAt: "", bySourceFile: new Map() };

/**
 * Zapsané odpovědi z `Agents/range-intake`, **poskládané přes sebe**.
 *
 * Čte se od nejstaršího k nejnovějšímu a novější odpověď na tutéž mřížku
 * přebíjí starší. Není to slučování názorů - je to jeden verdikt na mřížku,
 * ten poslední vydaný.
 *
 * ## Proč ne jen ten nejnovější soubor
 *
 * Do 10. 9. 2026 se bral poslední soubor podle jména. To fungovalo, dokud každé
 * čtení pokrývalo celý draft. Ten den ale majitel přečetl **jen chipEV půlku**
 * (67 mřížek ze 112), takže by se tím zahodily odpovědi na 45 ICM mřížek
 * z 9. 9. - stránka by o nich tvrdila „bez odpovědi" a poslala ho číst znovu
 * něco, co už přečetl.
 *
 * Datum se u každé mřížky nese vlastní, protože právě to čtenář potřebuje
 * vědět: která odpověď je odkdy.
 */
export function loadAnswerHistory(directory = "Agents/range-intake"): AnswerHistory {
  if (!existsSync(directory)) return EMPTY;
  const files = readdirSync(directory)
    .filter((name) => /^answers-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
  if (files.length === 0) return EMPTY;

  const bySourceFile = new Map<string, RecordedAnswer>();
  for (const name of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(directory, name), "utf8"));
    } catch {
      continue;
    }
    const file = parsed as { answers?: unknown };
    if (!Array.isArray(file.answers)) continue;
    const readAt = name.slice("answers-".length, "answers-".length + 10);
    for (const row of file.answers) {
      const answer = row as Partial<RecordedAnswer>;
      if (typeof answer.sourceFile !== "string" || typeof answer.verdict !== "string") continue;
      bySourceFile.set(answer.sourceFile, {
        sourceFile: answer.sourceFile,
        verdict: answer.verdict,
        flags: Array.isArray(answer.flags) ? answer.flags.map(String) : [],
        readAt,
        ...(typeof answer.contentHash === "string" ? { contentHash: answer.contentHash } : {}),
        ...(Array.isArray(answer.readWithoutActions)
          ? { readWithoutActions: answer.readWithoutActions.map(String) }
          : {}),
      });
    }
  }
  return {
    origin: files.map((name) => join(directory, name)).join(", "),
    readAt: files[files.length - 1].slice("answers-".length, "answers-".length + 10),
    bySourceFile,
  };
}

/**
 * Kolik buněk té mřížky se kreslí jinak, než když ji majitel četl.
 *
 * Je to počet tříd hraných jen zčásti - do 9. 9. 2026 se malovaly plnou barvou,
 * jako by se ta akce hrála vždycky. Nula znamená, že se na téhle mřížce nezměnilo
 * nic a odpověď na ni platí dál.
 */
export function partialWeightCells(record: DraftRecord): number {
  let count = 0;
  for (const ratio of Object.values(record.mix ?? {})) {
    if (Object.keys(ratio).includes("FOLD")) count += 1;
  }
  return count;
}
