import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

/**
 * Jak se solverový turn obsah dostane z LOW mezi ověřený.
 *
 * Dosud nijak. `confidence` bylo natvrdo `LOW`, LOW všude blokuje produkci, a
 * žádné množství nočního solvení by na tom nezměnilo nic - cesta byla uzavřená
 * konstrukcí, ne rozhodnutím. Review brána umí zkontrolovat tvar solvu
 * (dohledatelnost, úplnost, konvergenci, soudržnost), ale ani jedna z těch věcí
 * neříká, jestli je strategie dobrá. To pozná jen hráč.
 *
 * Tenhle modul je záznam toho, že se hráč podíval - a je stavěný tak, aby se
 * nedal obejít omylem.
 *
 * ## Verdikt je vázaný na obsah, ne na jméno rodiny
 *
 * Kdyby stačilo jméno, přegenerování rodiny z nových solvů by tiše zdědilo
 * požehnání staré verze. To je přesně ten druh chyby, který nejde poznat zvenku:
 * pack by tvrdil MEDIUM, protože někdo kdysi četl něco jiného. Verdikt proto nese
 * otisk obsahu, který byl čten, a jakmile se obsah pohne, spadne rodina zpátky na
 * LOW a musí se přečíst znovu.
 *
 * ## Proč MEDIUM a ne HIGH
 *
 * Jeden čtenář je jeden názor. MEDIUM znamená „člověk to viděl a nenašel v tom
 * nesmysl", což je přesně tolik, kolik jedno čtení unese. HIGH by mělo znamenat
 * něco silnějšího - dva nezávislé čtenáře, nebo srovnání s cizím solverem - a
 * dokud to neexistuje, nemá se ta hodnota rozdávat.
 */

export type TurnReviewOutcome = "ACCEPTED" | "NEEDS_WORK" | "REJECTED";

export interface TurnReviewVerdictRecord {
  /**
   * Ulice, které se verdikt týká.
   *
   * Táž rodina má dnes pack na flopu, turnu i riveru a jsou to tři různé obsahy
   * s vlastními otisky. Verdikt bez ulice by přečtený turn vydával za přečtený
   * flop - tedy přesně za to, co člověk neviděl.
   *
   * Chybí-li, čte se jako `TURN`: v době, kdy vznikl, byla jediná.
   */
  street?: "FLOP" | "TURN" | "RIVER";
  familyId: string;
  /** Otisk obsahu, který byl čten. Změní se obsah, propadne verdikt. */
  contentHash: string;
  outcome: TurnReviewOutcome;
  reviewedAt: string;
  /** Kdo četl. Jméno, ne role - u jednoho čtenáře je to totéž. */
  reviewer: string;
  /**
   * Čím je verdikt podložený.
   *
   * `PLAYER_READ` znamená, že se na strategii podíval člověk. `MECHANICAL`
   * znamená, že prošla baterií měření (`mechanicalReview`) - ta chytá hrubé
   * rozbití, ne kvalitu hry, a **nikde se nesmí vydávat za přečtení člověkem**.
   *
   * Chybí-li, čte se jako `PLAYER_READ`: v době, kdy formát vznikl, jiná cesta
   * neexistovala a všechny tehdejší záznamy měly znamenat člověka.
   */
  basis?: "PLAYER_READ" | "MECHANICAL";
  /** Co si při čtení všiml. Prázdné u čistého přijetí. */
  notes?: string;
}

export interface TurnReviewVerdictFile {
  schemaVersion: "PKRTRAINER_TURN_REVIEW_V1";
  verdicts: readonly TurnReviewVerdictRecord[];
}

/**
 * Otisk toho, co by hráč při čtení viděl.
 *
 * Počítá se ze strategie, ne z celého modulu: formátování, pořadí klíčů v JSONu
 * ani datum vygenerování nemají verdikt shodit. Změní ho jen to, co mění
 * odpověď - board, hloubka, uzel, a které ruce jakou akci hrají.
 *
 * Je to jednoduchý rolující součet, ne kryptografie. Nemá bránit podvrhu, jen
 * poznat, že se obsah pohnul, a na to stačí.
 */
export function turnRuleContentHash(rules: readonly TurnStrategyRule[]): string {
  const parts: string[] = [];
  for (const rule of [...rules].sort((left, right) => (
    left.sourceDirectory.localeCompare(right.sourceDirectory)
  ))) {
    parts.push(rule.sourceDirectory, rule.positionPattern, rule.potType, rule.node);
    parts.push(String(rule.stackBB), rule.actions.join(","));
    for (const bucket of rule.buckets) {
      parts.push(bucket.action, String(bucket.combos), [...bucket.handClasses].sort().join(""));
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
 * Důvěra, kterou si rodina zaslouží podle toho, co o ní víme.
 *
 * Bez verdiktu LOW. S verdiktem na jiný obsah taky LOW, a to je ta půlka, kvůli
 * které tenhle modul existuje: požehnání se nedědí přes přegenerování.
 */
export function confidenceForFamily(
  familyId: string,
  contentHash: string,
  verdicts: readonly TurnReviewVerdictRecord[],
  street: "FLOP" | "TURN" | "RIVER" = "TURN",
): { confidence: "LOW" | "MEDIUM" | "HIGH"; reason: string } {
  const verdict = verdicts.find((item) => (
    item.familyId === familyId && (item.street ?? "TURN") === street
  ));
  if (verdict === undefined) {
    return { confidence: "LOW", reason: "rodinu zatím nikdo nečetl" };
  }
  if (verdict.outcome !== "ACCEPTED") {
    return {
      confidence: "LOW",
      reason: `čtení skončilo verdiktem ${verdict.outcome}${verdict.notes ? `: ${verdict.notes}` : ""}`,
    };
  }
  if (verdict.contentHash !== contentHash) {
    return {
      confidence: "LOW",
      reason: "obsah se od čtení změnil, verdikt propadl a rodina se musí přečíst znovu",
    };
  }
  if ((verdict.basis ?? "PLAYER_READ") === "MECHANICAL") {
    // MEDIUM i tady, a je to vědomé rozhodnutí. Alternativou totiž není přísnější
    // brána, ale obsah, který se k hráči nedostane nikdy: čtení 10 447 rozhodnutí
    // je práce, na kterou v tomhle projektu není člověk. Důvod ale musí říct, co
    // za tou důvěrou stojí, jinak se měření níž v produktu k nerozeznání smíchá
    // s pokerovým úsudkem.
    return {
      confidence: "MEDIUM",
      reason: `mechanicky ověřeno ${verdict.reviewedAt} (${verdict.reviewer}); `
        + "měření chytá hrubé rozbití, ne kvalitu hry - není to přečtení člověkem",
    };
  }
  return {
    confidence: "MEDIUM",
    reason: `přečteno ${verdict.reviewedAt} (${verdict.reviewer}); jeden čtenář unese MEDIUM, ne HIGH`,
  };
}

export function parseTurnReviewVerdicts(raw: string): TurnReviewVerdictRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const file = parsed as Partial<TurnReviewVerdictFile>;
  if (file.schemaVersion !== "PKRTRAINER_TURN_REVIEW_V1") return [];
  if (!Array.isArray(file.verdicts)) return [];
  return file.verdicts.filter((item): item is TurnReviewVerdictRecord => (
    typeof item?.familyId === "string" &&
    typeof item?.contentHash === "string" &&
    typeof item?.reviewedAt === "string" &&
    typeof item?.reviewer === "string" &&
    (item.outcome === "ACCEPTED" || item.outcome === "NEEDS_WORK" || item.outcome === "REJECTED")
  ));
}
