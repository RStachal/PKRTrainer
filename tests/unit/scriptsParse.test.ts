import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * Každý skript ve `scripts/` musí jít přeložit.
 *
 * `npm run build` je nekontroluje: `tsconfig.json` má `include` bez `scripts`,
 * takže 125 souborů projde jen tehdy, když je náhodou naimportuje nějaký test.
 * Chyba v nich se pozná až spuštěním - a to znamená až ve chvíli, kdy ji někdo
 * potřebuje.
 *
 * Stalo se to 19. 8. dvakrát za jedno dopoledne: dvojitá čárka v importu a
 * neuzavřený řetězec. Obojí je syntaxe, obojí by build zachytil za milisekundu,
 * a obojí prošlo do commitu, protože build o těch souborech neví.
 *
 * Tenhle test kontroluje **jen překlad**, ne typy. Plné typování scripts/ dnes
 * hlásí 104 chyb, z nichž velká část je zastaralá `lib` v tsconfigu (skripty
 * běží na Node 24 a používají novější metody, než `ES2020` zná) - to je
 * samostatný úklid s vlastním rizikem. Syntaxe je ta část, která se pokazí
 * náhodou a dá se hlídat zadarmo.
 */
function scriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...scriptFiles(path));
    } else if (entry.endsWith(".mts") || entry.endsWith(".mjs")) {
      found.push(path);
    }
  }
  return found;
}

describe("skripty jdou přeložit", () => {
  it("každý soubor ve scripts/ projde parserem", { timeout: 120000 }, async () => {
    const files = scriptFiles("scripts");
    // Kdyby se adresář přejmenoval, test by mlčky nekontroloval nic.
    expect(files.length).toBeGreaterThan(50);

    const broken: string[] = [];
    for (const file of files) {
      try {
        await transform(readFileSync(file, "utf8"), {
          loader: file.endsWith(".mjs") ? "js" : "ts",
          format: "esm",
        });
      } catch (error) {
        broken.push(`${file}: ${(error as Error).message.split("\n")[0]}`);
      }
    }
    expect(broken, `neparsovatelné skripty:\n${broken.join("\n")}`).toEqual([]);
  });
});
