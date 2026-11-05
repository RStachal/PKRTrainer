import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { classMixFile } from "../../src/data/ranges/solvedClassMixBuild";
import { classMixDirectory } from "./manifestEntries.mts";
import { MODULE_BUDGET_BYTES } from "./solvedPackBuilding.mts";

/**
 * Zápis frekvencí po třídách rukou vedle packu (`solvedClassMix.ts`), společný
 * flopovému, turnovému i riverovému generátoru.
 */

type Street = "flop" | "turn" | "river";

/** Soubor s frekvencemi k packu ulice; adresář viz `classMixDirectory`. */
export function classMixPath(street: Street, slug: string): string {
  return join("src/data/ranges", classMixDirectory(street), `${slug}.generated.json`);
}

/**
 * Zapíše frekvence k hotovému packu a vrátí, co zapsal.
 *
 * Soubor je vlastní chunk se stejným stropem jako pack. Když se nevejde,
 * vyprázdní se frekvence od posledního pravidla, dokud se nevejde: u těch
 * pravidel matice ukáže převažující akci jako dosud. Pravidla packu se kvůli
 * frekvencím nikdy neořezávají - obsah, podle kterého se hodnotí, má přednost
 * před obrázkem v matici.
 */
export function writeClassMix(
  street: Street,
  slug: string,
  pack: { id: string; contentHash: string; rules: readonly object[] },
  mixByRule: ReadonlyMap<object, string>,
  write: boolean,
): { path: string; bytes: number; rules: number; blanked: number } {
  const file = classMixFile(pack, mixByRule);
  const rules = [...file.rules];
  let text = JSON.stringify({ ...file, rules });
  let blanked = 0;
  for (let index = rules.length - 1; text.length > MODULE_BUDGET_BYTES && index >= 0; index -= 1) {
    if (rules[index] === "") continue;
    rules[index] = "";
    blanked += 1;
    text = JSON.stringify({ ...file, rules });
  }
  const path = classMixPath(street, slug);
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  return { path, bytes: text.length, rules: rules.filter((rule) => rule !== "").length, blanked };
}

/**
 * Proč se frekvence k dodanému packu zapsat nesmí, nebo `undefined`.
 *
 * Režim `--mix-only` generátorů (4. 11. 2026) dopisuje frekvence k packům, které
 * už leží, a pack sám nepřepisuje. Smí jen tehdy, když přestavba dala tentýž
 * obsah: frekvence k jiným pravidlům by `classMixForRule` stejně odmítl a
 * přepsaný pack by s sebou táhl novou EV i nové posouzení obsahu.
 */
export function mixOnlyRefusal(packPath: string, contentHash: string): string | undefined {
  let shipped: string | undefined;
  try {
    shipped = (JSON.parse(readFileSync(packPath, "utf8")) as { contentHash?: string }).contentHash;
  } catch {
    shipped = undefined;
  }
  if (shipped === contentHash) return undefined;
  return `obsah se od dodaného packu liší (otisk ${contentHash} proti ${shipped ?? "žádnému"}); `
    + "frekvence se nezapíšou, pack se musí přestavět celý";
}
