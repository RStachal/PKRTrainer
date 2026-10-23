import { existsSync } from "node:fs";
import { it } from "vitest";

/**
 * Testy, které tvrdí něco o solverových vstupech - a ty v repozitáři nejsou.
 *
 * ## Proč to existuje
 *
 * Výstup solveru je gigabajty a leží mimo git (`.gitignore` řádky 19-20 a dál),
 * stejně jako `artifacts/`. Pět testů proti němu ale tvrdilo, jako by tam byl,
 * takže na CI **nemohly projít nikdy**: hlásily "Solver output root is
 * missing", ENOENT, nebo - a to je horší - vypadaly jako věcná neshoda. Test
 * `postflopBetSizing` na CI vypsal 49 rodin jako "neodpovídají parametrům",
 * přitom ty parametry na runneru prostě nejsou.
 *
 * Zjištěno 2. 9. 2026: CI bylo červené od 31. 8. a nikdo se nedíval, protože
 * lokálně je zelené. Pád na haldě to navíc přebíjel, takže se ta pětice ukázala
 * až po jeho opravě.
 *
 * ## Proč přeskočit, a ne opravit tvrzení
 *
 * Chybějící vstup není neshoda. Test, který o nedodaném vstupu tvrdí "obsah
 * nesedí", **lže oběma směry**: na CI hlásí vadu, která není, a kdyby vstup
 * jednou zmizel i lokálně, ohlásí to jako obsahový problém a pošle hledat
 * někam jinam.
 *
 * Přeskakuje se proto **jen když kořen chybí celý**. Když existuje a obsah
 * nesedí, test padá dál jako dřív - o to tu jde.
 */

/** Kořen výstupů solveru; mimo git schválně, je to řádově gigabajty. */
export const SOLVER_OUTPUT_ROOT =
  "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

export function hasSolverOutput(): boolean {
  return existsSync(SOLVER_OUTPUT_ROOT);
}

/**
 * `it`, které se spustí jen tam, kde solverové výstupy jsou.
 *
 * Přeskočení je vidět v součtu vitestu, takže se nedá ztratit tichem - a to je
 * podmínka, za které se smí přeskakovat vůbec.
 */
export const itWithSolverOutput = hasSolverOutput() ? it : it.skip;

/** Totéž pro `artifacts/`, které vzniká až během a v gitu taky není. */
export function hasArtifact(path: string): boolean {
  return existsSync(path);
}

// Navratovy typ se nepise: `it` a `it.skip` maji ve vitestu ruzne siroke typy
// a vynutit na nich `typeof it` neprojde. Odvozeny sjednoceny typ se vola stejne.
export function itWithArtifact(path: string) {
  return hasArtifact(path) ? it : it.skip;
}
