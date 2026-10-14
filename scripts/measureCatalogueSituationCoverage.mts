import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../src/core/postflopGenerator";
import { solvedFlopSpots } from "../src/data/ranges/solvedFlopSpotCatalogue";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";

/**
 * Kolik vybíratelných situací by katalog uměl obsloužit.
 *
 *   npm run mtt:catalogue-situations
 *
 * ## Proč to musí vzniknout
 *
 * Když si hráč vybere situaci, `postflopView` katalog **obejde**
 * (`dealsSolved = options.initialPositionContext == null`) a losuje desku.
 * Změřeno `mtt:picked-situation`: matice se pak barví podle akce v **0 %**
 * spotů, protože chartový pack odpovídá na třídu textury a kbelíky nenese.
 *
 * Katalog přitom u každého vyřešeného spotu **position pattern má**. Otázka
 * tedy je, kolik z nabízených situací by se dalo obsloužit vyřešeným obsahem,
 * kdyby se katalog místo obcházení jen filtroval - a to je rozdíl mezi „čeká
 * to na noci solveru" a „čeká to na jeden filtr".
 */

await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");

function main(): void {
  const spots = solvedFlopSpots();
  const byPattern = new Map<string, number>();
  for (const spot of spots) {
    const pattern = String((spot as { positionPattern?: string }).positionPattern);
    byPattern.set(pattern, (byPattern.get(pattern) ?? 0) + 1);
  }

  const offered = POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS;
  const offeredPatterns = [...new Set(offered.map((ctx) => String(ctx.positionPattern)))].sort();

  console.log("Vyřešený flopový katalog proti nabídce situací\n");
  console.log(`spotů v katalogu:        ${spots.length}`);
  console.log(`patternů v katalogu:     ${byPattern.size}`);
  console.log(`situací nabízených v UI: ${offered.length} (${offeredPatterns.length} patternů)\n`);

  let coveredContexts = 0;
  for (const ctx of offered) {
    if (byPattern.has(String(ctx.positionPattern))) coveredContexts += 1;
  }

  const coveredPatterns = offeredPatterns.filter((p) => byPattern.has(p));
  const missingPatterns = offeredPatterns.filter((p) => !byPattern.has(p));

  console.log(
    `nabízené situace s vyřešeným obsahem: ${coveredContexts} z ${offered.length}`
    + ` = ${((100 * coveredContexts) / offered.length).toFixed(1)} %`,
  );
  console.log(
    `patternů pokrytých: ${coveredPatterns.length} z ${offeredPatterns.length}`
    + ` = ${((100 * coveredPatterns.length) / offeredPatterns.length).toFixed(1)} %\n`,
  );

  console.log("pokryté patterny (spotů v katalogu):");
  for (const pattern of coveredPatterns) {
    console.log(`  ${pattern.padEnd(34)} ${byPattern.get(pattern)}`);
  }
  if (missingPatterns.length > 0) {
    console.log("\nnabízené, ale bez vyřešeného obsahu:");
    for (const pattern of missingPatterns) console.log(`  ${pattern}`);
  }

  const orphan = [...byPattern.keys()].filter((p) => !offeredPatterns.includes(p)).sort();
  if (orphan.length > 0) {
    console.log("\nv katalogu, ale UI je nenabízí (vyřešeno a nedosažitelné):");
    for (const pattern of orphan) console.log(`  ${pattern} (${byPattern.get(pattern)})`);
  }
}

main();
