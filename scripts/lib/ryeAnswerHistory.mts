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
 * Nejnovější zapsané odpovědi z `Agents/range-intake`.
 *
 * Bere se poslední podle jména (jsou datovaná), ne slučují se. Sloučení dvou
 * čtení by tiše vyrobilo verdikt, který nikdo nevydal.
 */
export function loadAnswerHistory(directory = "Agents/range-intake"): AnswerHistory {
  if (!existsSync(directory)) return EMPTY;
  const files = readdirSync(directory)
    .filter((name) => /^answers-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
  const newest = files[files.length - 1];
  if (newest === undefined) return EMPTY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(directory, newest), "utf8"));
  } catch {
    return EMPTY;
  }
  const file = parsed as { answers?: unknown };
  if (!Array.isArray(file.answers)) return EMPTY;

  const bySourceFile = new Map<string, RecordedAnswer>();
  for (const row of file.answers) {
    const answer = row as Partial<RecordedAnswer>;
    if (typeof answer.sourceFile !== "string" || typeof answer.verdict !== "string") continue;
    bySourceFile.set(answer.sourceFile, {
      sourceFile: answer.sourceFile,
      verdict: answer.verdict,
      flags: Array.isArray(answer.flags) ? answer.flags.map(String) : [],
    });
  }
  return {
    origin: join(directory, newest),
    readAt: newest.slice("answers-".length, "answers-".length + 10),
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
