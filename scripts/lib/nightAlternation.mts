/**
 * Komu patří noc: šířce (monolitická expanze), nebo prvnímu rozkladu?
 *
 * ## Proč se noci střídají (od 19. 10. 2026)
 *
 * Priorita `NEW_FAMILIES` vznikla v září, když rozklad prohluboval pět stejných
 * dvojic sedaček, „kde už odpověď je" - a byla správná. Rozklad jí ustoupí celý,
 * kdykoli je nastagovaná práce. Jenže 19. 10. 2026 čekalo na **první** rozklad
 * 349 vyřešených desek: mají jen flop, žádný turn, river ani EV. (Ten den se
 * psalo 523 - počítadlo bralo i 174 desek ze seznamu `flop-only-boards.txt`,
 * které rozklad nikdy nevezme; opraveno 20. 10., viz `undecomposedBoards`.)
 * Fronta expanze přitom měla 186 desek, tedy při skutečných ~55 min na desku
 * kolem sedmnácti nocí - a celou tu dobu by rozklad stál, takže by EV pro nové
 * rodiny nepřibylo vůbec.
 *
 * Obě fronty jsou co do hodin srovnatelné (expanze ~155 h; noc rozkladu má
 * ~85 h turnové fáze - 349 desek po ~15 min, změřeno v noci na 20. 10. - a k
 * tomu riverovou fázi, ze které je turnová EV, viz `--turn-share` v runneru),
 * takže se noci střídají 1:1: po noci šířky noc rozkladu a naopak. Dokud jedna z front práci nemá, druhá dostane všechny
 * noci - o tom rozhoduje orchestrátor už teď (bez nastagované práce rozklad
 * neustoupí, bez desek k rozkladu se nestřídá).
 *
 * ## Jak se pozná „minulá noc"
 *
 * Podle času zápisu rozhodnutí, ne podle data: noc přechází přes půlnoc.
 * Klíčem noci je datum večera, kterým začala - zápis před polednem patří
 * předchozímu večeru. Porada běží jednou za noc (`_priority_is_fresh` v runneru
 * rozkladu), takže dvojí střídání v jedné noci nenastane; když se přece zapíše
 * znovu (ruční běh), drží se rozhodnutí téže noci.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type NightPriority = "DECOMPOSITION" | "NEW_FAMILIES";

/** Datum večera, kterým noc začala (`YYYY-MM-DD`, místní čas). */
export function nightKey(at: Date): string {
  const evening = new Date(at.getTime());
  if (evening.getHours() < 12) evening.setDate(evening.getDate() - 1);
  const month = String(evening.getMonth() + 1).padStart(2, "0");
  const day = String(evening.getDate()).padStart(2, "0");
  return `${evening.getFullYear()}-${month}-${day}`;
}

export interface AlternationInput {
  /** Co by orchestrátor zvolil bez střídání. */
  wanted: NightPriority;
  /** Minulé rozhodnutí z `tonight.json` a klíč noci, ve které padlo. */
  previous?: { priority: string; night: string };
  /** Klíč noci, pro kterou se rozhoduje. */
  night: string;
  /** Vyřešené desky bez rozkladu - práce pro noc rozkladu. */
  undecomposedBoards: number;
}

export interface AlternationDecision {
  priority: NightPriority;
  /** Liší se od `wanted`? */
  alternated: boolean;
  reason?: string;
}

export function alternateNight(input: AlternationInput): AlternationDecision {
  // Střídá se jen šířka za první rozklad. Když orchestrátor sám chce rozklad,
  // nebo rozkládat není co, platí jeho volba.
  if (input.wanted !== "NEW_FAMILIES" || input.undecomposedBoards <= 0) {
    return { priority: input.wanted, alternated: false };
  }
  if (input.previous?.night === input.night) {
    const kept: NightPriority = input.previous.priority === "DECOMPOSITION" ? "DECOMPOSITION" : "NEW_FAMILIES";
    return {
      priority: kept,
      alternated: kept !== input.wanted,
      ...(kept === "DECOMPOSITION" ? { reason: "o téhle noci už porada rozhodla pro rozklad" } : {}),
    };
  }
  if (input.previous?.priority === "NEW_FAMILIES") {
    return {
      priority: "DECOMPOSITION",
      alternated: true,
      reason: `střídání nocí: minulá patřila šířce, tahle prvnímu rozkladu `
        + `(${input.undecomposedBoards} vyřešených desek bez rozkladu)`,
    };
  }
  return { priority: "NEW_FAMILIES", alternated: false };
}

/**
 * Vyřešené desky (neprázdný checkpoint), které nemají ani jednu turnovou vrstvu
 * a rozklad je doopravdy vezme.
 *
 * Tatáž otázka jako „rozklad monolitu" v runneru rozkladu: deska bez vrstev je
 * práce, kterou noc rozkladu vezme jako první (nejhlubší napřed). Desky ze
 * seznamu `flop-only-boards.txt` se nepočítají - růst desek je tam zapisuje
 * schválně jen pro flop a runner je přeskočí. Do 20. 10. 2026 se počítaly, a
 * „523 desek k rozkladu" tak obsahovalo 174 desek, které rozklad nikdy dělat
 * nebude.
 */
export function undecomposedBoards(checkpointRoot: string, decompositionRoot: string): number {
  if (!existsSync(checkpointRoot)) return 0;
  const decomposed = existsSync(decompositionRoot) ? new Set(readdirSync(decompositionRoot)) : new Set<string>();
  const flopOnlyPath = join(decompositionRoot, "flop-only-boards.txt");
  const flopOnly = new Set(existsSync(flopOnlyPath)
    ? readFileSync(flopOnlyPath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : []);
  let count = 0;
  for (const family of readdirSync(checkpointRoot)) {
    const raw = join(checkpointRoot, family, "raw");
    if (!existsSync(raw)) continue;
    for (const name of readdirSync(raw)) {
      const match = /^pkrtrainer_(.+)_([^_]+)\.json$/.exec(name);
      if (match === null) continue;
      let size = 0;
      try {
        size = statSync(join(raw, name)).size;
      } catch {
        continue;
      }
      if (size === 0) continue;
      const directory = `${match[1]}__${match[2]}`;
      if (flopOnly.has(directory)) continue;
      const hasLayers = decomposed.has(directory)
        && readdirSync(join(decompositionRoot, directory))
          .some((file) => file.endsWith(".json") && file !== "plan.json");
      if (!hasLayers) count += 1;
    }
  }
  return count;
}

/** Minulé rozhodnutí z `tonight.json`: priorita a noc, ve které padlo. */
export function previousDecision(path: string): { priority: string; night: string } | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { priority?: unknown };
    if (typeof parsed.priority !== "string") return undefined;
    return { priority: parsed.priority, night: nightKey(statSync(path).mtime) };
  } catch {
    return undefined;
  }
}
