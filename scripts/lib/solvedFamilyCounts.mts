/**
 * Kolik vyřešených rodin odpovídá na který profil - jedno místo pro všechny,
 * kdo se na stav knihovny ptá.
 *
 * ## Proč to má vlastní soubor
 *
 * Řádek knihovny sleduje `*ProductionStrategyPack`, a ten pro postflop
 * registrovaný není: generovaný manifest produkčního registru nese **jen čtyři
 * preflopové packy**. Vyřešené rodiny se dodávají jinou cestou (`solved*`
 * manifesty), takže bez tohohle počtu vypadá každý postflopový profil jako
 * nepokrytý heuristikou.
 *
 * `mttProductionReadiness` na to od té doby umí odpovědět dvěma větvemi - s
 * vyřešenými rodinami a bez nich - a komentář u nich říká, proč: „Podcenit, co
 * produkt umí, je nepravda stejného druhu jako nadsazení, jen opačným směrem,
 * a rozhoduje se podle ní o tom, co solvit dál."
 *
 * **Jenže ten počet předával jediný skript.** Měřeno 8. 10. 2026:
 * `mtt:playable-beta` ho předával a hlásil pravdu, kdežto `mtt:blockers`,
 * `mtt:next-action` a `mtt:postflop-coverage` ne - a ty tvrdily
 * „Postflop training currently uses public heuristic or generator fallback",
 * zatímco `mtt:post-answer` u téhož obsahu hlásí **0 % nevyřešených spotů** na
 * všech třech ulicích. Tři nástroje, podle kterých se rozhoduje, co dělat dál,
 * tedy popisovaly stav, který neplatí už týdny.
 *
 * Proto je ten výpočet tady, a ne v jednom z nich: kdo se na stav ptá, má brát
 * totéž číslo. Je to tatáž zásada jako u ceny desky a prahu ustoupení.
 */

import { solvedFlopManifest } from "../../src/data/ranges/flopSolvedManifest.generated";
import { solvedRiverManifest } from "../../src/data/ranges/riverSolvedManifest.generated";
import { solvedTurnManifest } from "../../src/data/ranges/turnSolvedManifest.generated";

/**
 * Počty po profilech, klíčem `tableFormat|blindSpeed|evModel|street`.
 *
 * Klíč skládá `solvedFamilyCountForProfile` v `mttProductionReadiness`; tady se
 * jen čte `profileKey`, který si manifesty nesou samy, takže se formát klíče
 * nemá kde rozejít.
 */
export function solvedFamilyCountsByProfile(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const manifest of [solvedFlopManifest, solvedTurnManifest, solvedRiverManifest]) {
    for (const entry of manifest) {
      counts[entry.profileKey] = (counts[entry.profileKey] ?? 0) + 1;
    }
  }
  return counts;
}
