import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Desky, na kterých dodaný pack stojí, ale rozklad je nemá.
 *
 * ## Proč to existuje
 *
 * Turnový a riverový pack se staví z rozkladu (`artifacts/decomposition`), a ten
 * je mimo git. Po ztrátě stroje 30. 10. 2026 (deník 328) se obnovil ze záloh,
 * ale ne celý: změřeno 3. 11. 2026, že dodané packy stojí na deskách, které
 * v něm nejsou - turn na 5 deskách `MTT9_25BB_UTG_2_LJ_SRP` (213 pravidel),
 * river na 8 deskách téže rodiny a `MTT9_25BB_LJ_HJ_SRP` (360 pravidel). Bez
 * monolitických checkpointů se znovu rozložit nedají a staré monolity se
 * nepřesolvují (rozhodnutí D3). Generátor staví z toho, co na disku je, takže
 * by přestavba ta pravidla z produktu tiše vypustila - plný cyklus každou sobotu
 * (rozhodnutí D2) a lehký po každé noci rozkladu.
 *
 * ## Proč desky, a ne podhry
 *
 * Přesolvená rodina dostane nový strom a podhry jiná jména (`CHECK_BET275...`),
 * takže dodaný pack odkazuje na podhry, které už nejsou - a přestavba je přesto
 * správná. Chybějící **deska** správná není nikdy: rozklad desku neruší, jen ji
 * přepisuje.
 */
export function packBoardsMissing(packPath: string, decompositionRoot: string): string[] {
  if (!existsSync(packPath)) return [];
  let rules: unknown;
  try {
    rules = (JSON.parse(readFileSync(packPath, "utf8")) as { rules?: unknown }).rules;
  } catch {
    return [];
  }
  if (!Array.isArray(rules)) return [];
  const missing = new Set<string>();
  for (const rule of rules as { sourceDirectory?: unknown }[]) {
    if (typeof rule?.sourceDirectory !== "string") continue;
    const board = boardDirectoryOf(rule.sourceDirectory);
    if (board !== undefined && !existsSync(join(decompositionRoot, board))) missing.add(board);
  }
  return [...missing].sort();
}

/**
 * Adresář desky (`RODINA__deska`) ze zdroje pravidla.
 *
 * Turn ho nese celý (`MTT9_25BB_UTG_2_LJ_SRP__742r`), river jako část cesty
 * (`artifacts/decomposition/MTT9_..__742r/river/CHECK_BET275_CALL__2d`). Deska je
 * první část s `__`; podhra za ní ho nese taky, ale až později.
 */
export function boardDirectoryOf(sourceDirectory: string): string | undefined {
  return sourceDirectory.split(/[\\/]/).find((segment) => segment.includes("__"));
}

/** Odmítnutí generátoru, stejné pro turn i river; ranní cyklus čte první řádek. */
export function lostBoardsRefusal(family: string, street: "turn" | "river", missing: readonly string[]): string {
  return `${family}: dodaný ${street}ový pack stojí na ${missing.length} deskách, které rozklad nemá `
    + `(${missing.join(", ")}) - přestavba by jejich pravidla vypustila. Pack zůstává; `
    + "vědomé vyřazení desek: --allow-lost-boards.";
}

/** Přepínač, kterým člověk vyřazení desek z packu potvrdí. */
export const ALLOW_LOST_BOARDS = "--allow-lost-boards";
