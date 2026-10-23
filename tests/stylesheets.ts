import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Text CSS souboru aplikace (cesta relativně k src/ui/styles).
 *
 * Styly starého GUI se do 22. 10. 2026 vkládaly z TypeScriptu jako `<style>`
 * při každém vykreslení a testy je četly z DOM. Teď jsou v souborech, které
 * načítá main.ts (fáze 0b, Agents/ui-redesign-plan.md), a testy je čtou odtud.
 *
 * Cesta je relativní ke kořeni repozitáře, ne `new URL(…, import.meta.url)`:
 * tu konstrukci Vite přepisuje na odkaz na asset a s proměnnou cestou pak
 * vrátí jiný soubor.
 */
export function stylesheet(path: string): string {
  return readFileSync(join("src/ui/styles", path), "utf8");
}

/**
 * Všechno CSS, které aplikace načítá, v pořadí importů v main.ts. Seznam se
 * čte z main.ts, takže test nad ním vidí i to, když import někdo vypustí.
 */
export function appStylesheet(): string {
  const main = readFileSync("src/main.ts", "utf8");
  const paths = [...main.matchAll(/^import "\.\/ui\/styles\/([^"]+\.css)";/gm)].map((match) => match[1]);
  if (paths.length === 0) throw new Error("main.ts nenačítá žádné CSS ze src/ui/styles");
  return paths.map(stylesheet).join("\n");
}
