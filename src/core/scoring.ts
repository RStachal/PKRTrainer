/**
 * Scoring_Engine — vyhodnocení odpovědi hrdiny proti datům Spotu.
 *
 * Tento modul je čisté jádro (žádné DOM/localStorage I/O, žádné výjimky). Jeho
 * jediná veřejná funkce `grade` rozhodne, zda zvolený Akční_klíč odpovídá
 * doporučení pro daný režim hodnocení, a vrátí informace k zobrazení
 * (doporučené klíče a příznak dostupnosti zdůvodnění).
 *
 * ## Izolace na záznam daného Spotu (Property 10, Req 4.3)
 *
 * `grade` čte **výhradně** z předaného `spot` (jeho `correctKeys` /
 * `strictCorrect` / `explanation`) a z parametru `chosen`. Nesahá na žádná
 * globální data ani na Range_Store. Sady správných klíčů ve Spotu pocházejí ze
 * záznamu Range_Store pro klíč daného Spotu (Pozice × Hloubkový_koš × kontext ×
 * ante), který tam vložil `Drill_Engine` při generování. Změna záznamů pro
 * jiné kombinace tedy nemůže výsledek tohoto vyhodnocení ovlivnit.
 *
 * ## Členství = správnost (Property 19 / 20, Req 7.2 / 7.3 / 7.7)
 *
 *   - STRICT  ⇒ správně právě tehdy, je-li `chosen ∈ spot.strictCorrect`,
 *   - LENIENT ⇒ správně právě tehdy, je-li `chosen ∈ spot.correctKeys`,
 *   - jinak nesprávně; v obou případech se vrátí doporučené klíče k zobrazení
 *     (Req 7.4 / 7.7).
 *
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_
 */

import type { ActionKey, ScoringMode, Spot } from "./types";
import { evaluateActionEv, type ActionEvEvaluation } from "./actionEv";

/**
 * Výsledek vyhodnocení jedné odpovědi.
 *
 * - `correct` — zda je `chosen` správný klíč pro daný režim (Property 19 / 20).
 * - `acceptable` — LENIENT sada Spotu (`spot.correctKeys`), Req 7.3.
 * - `strict` — STRICT sada Spotu (`spot.strictCorrect`, vč. sizingu), Req 7.2.
 * - `recommended` — doporučené Akční_klíče k zobrazení (Req 7.4); přesné akce
 *   (STRICT) jako primární doporučení, doplněné o přijatelné (LENIENT).
 *   Neprázdné (Property 9 garantuje neprázdné sady ve Spotu).
 * - `explanationAvailable` — true, je-li `spot.explanation` neprázdný řetězec;
 *   samotné selhání zobrazení zdůvodnění se řeší jinde (Req 7.5).
 */
export interface Grade {
  correct: boolean;
  acceptable: ActionKey[]; // LENIENT sada (spot.correctKeys)
  strict: ActionKey[]; // STRICT sada (spot.strictCorrect)
  recommended: ActionKey[]; // z Range_Store, k zobrazení
  explanationAvailable: boolean;
  actionEv?: ActionEvEvaluation<ActionKey>;
}

/**
 * Sestaví doporučené Akční_klíče k zobrazení (Req 7.4).
 *
 * Primárním doporučením jsou přesné akce ze STRICT sady (vč. sizingu); za ně se
 * doplní případné další přijatelné akce z LENIENT sady, které ve STRICT sadě
 * ještě nejsou. Pořadí zachovává „STRICT nejdřív", duplicity se odstraní. Pro
 * vygenerovaný Spot je výsledek neprázdný, protože obě sady jsou neprázdné
 * (Property 9).
 */
function buildRecommended(
  strict: readonly ActionKey[],
  acceptable: readonly ActionKey[],
): ActionKey[] {
  const seen = new Set<ActionKey>();
  const recommended: ActionKey[] = [];
  for (const key of [...strict, ...acceptable]) {
    if (!seen.has(key)) {
      seen.add(key);
      recommended.push(key);
    }
  }
  return recommended;
}

/**
 * Zjistí, zda je pro Spot dostupné zdůvodnění (Req 7.4 / 7.5).
 *
 * Vrací true právě tehdy, je-li `spot.explanation` neprázdný řetězec (po
 * ořezání bílých znaků). Defenzivní kontrola typu zaručuje, že funkce zůstane
 * čistá a nikdy nevyhodí výjimku ani pro neúplně sestavený Spot.
 */
function hasExplanation(explanation: Spot["explanation"]): boolean {
  return typeof explanation === "string" && explanation.trim().length > 0;
}

/**
 * Vyhodnotí zvolený Akční_klíč proti datům Spotu pro daný režim hodnocení.
 *
 * Čistá funkce nad daty Spotu (Property 10): čte pouze ze `spot` a `chosen`,
 * neprovádí žádné I/O a nevyhazuje výjimky.
 *
 *   - STRICT  ⇒ `correct = chosen ∈ spot.strictCorrect` (Property 19, Req 7.2/7.7),
 *   - LENIENT ⇒ `correct = chosen ∈ spot.correctKeys`  (Property 20, Req 7.3/7.7).
 *
 * Vrácené pole `acceptable` / `strict` jsou kopie sad Spotu (aby volající
 * nemohl nechtěně zmutovat Spot); `recommended` je nově sestavené pole
 * doporučených klíčů k zobrazení (Req 7.4).
 *
 * @param spot Vyhodnocovaný Spot (nositel `correctKeys` / `strictCorrect` /
 *   `explanation` ze záznamu Range_Store pro jeho klíč).
 * @param chosen Akční_klíč zvolený hrdinou.
 * @param mode Režim hodnocení (`"LENIENT"` | `"STRICT"`).
 * @returns Výsledek vyhodnocení (`Grade`).
 */
export function grade(spot: Spot, chosen: ActionKey, mode: ScoringMode): Grade {
  const actionEv = spot.actionEvs ? evaluateActionEv(spot.actionEvs, chosen) : null;
  const strict = actionEv ? [...actionEv.bestActions] : spot.strictCorrect;
  const acceptable = actionEv
    ? spot.actionEvs!.values
      .filter((item) => actionEv.bestEvBb - item.evBb <= spot.actionEvs!.acceptableThresholdBb + 1e-9)
      .map((item) => item.action)
    : spot.correctKeys;

  // Členství v příslušné sadě dle režimu (Property 19 / 20).
  const correct =
    mode === "STRICT" ? strict.includes(chosen) : acceptable.includes(chosen);

  return {
    correct,
    acceptable: acceptable.slice(),
    strict: strict.slice(),
    recommended: actionEv ? [...actionEv.bestActions] : buildRecommended(strict, acceptable),
    explanationAvailable: hasExplanation(spot.explanation),
    ...(actionEv ? { actionEv } : {}),
  };
}
