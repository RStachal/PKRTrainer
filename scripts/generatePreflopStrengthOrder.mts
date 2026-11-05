import { writeFileSync } from "node:fs";
import { loadPreflopEquity, strengthOrder } from "../src/core/preflopEquity";

/**
 * Zapíše pořadí startovních ruk podle equity proti celému balíčku.
 *
 *   npm run mtt:strength-order
 *
 * Pořadí už v projektu existuje, ale jen za asynchronním načtením 115KB tabulky.
 * Cokoli, co vzniká synchronně při načtení modulu - třeba odvozené range packy -
 * se k němu nedostane a musí si vystačit s náhradou. První taková náhrada řadila
 * ruce podle toho, v kolika rangích se objevují; to je hrubé právě tam, kde na
 * tom záleží, tedy na hranici range.
 *
 * Vygenerovaný soubor tu mezeru zavírá: stejné číslo, spočítané jednou, dostupné
 * bez čekání.
 */
const OUT = "src/data/ranges/preflopStrengthOrder.generated.ts";

const ok = await loadPreflopEquity();
if (!ok) {
  console.error("Equity tabulku se nepodařilo načíst; pořadí nevzniklo.");
  process.exitCode = 1;
} else {
  const order = strengthOrder();
  if (order.length === 0) {
    console.error("Pořadí vyšlo prázdné.");
    process.exitCode = 1;
  } else {
    const module = [
      "// Generováno příkazem `npm run mtt:strength-order`.",
      "// Needitovat ručně.",
      "",
      "import type { HandLabel } from \"../../core/types\";",
      "",
      "/**",
      " * Startovní ruce seřazené podle equity proti celému balíčku, nejsilnější první.",
      " *",
      " * Stejné pořadí, jaké vrací `strengthOrder()`, jen dostupné synchronně.",
      " */",
      `export const PREFLOP_STRENGTH_ORDER: readonly HandLabel[] = ${JSON.stringify(order)};`,
      "",
    ].join("\n");
    writeFileSync(OUT, module, "utf8");
    console.log(`${order.length} tříd zapsáno do ${OUT}`);
    console.log(`nejsilnější: ${order.slice(0, 8).join(", ")}`);
    console.log(`nejslabší:   ${order.slice(-8).join(", ")}`);
  }
}
