import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Žádné dodávané pravidlo nesmí nést strategii, kterou solver nespočítal.
 *
 * Nevyřešená vrstva solveru (viz `SolverStrategy` v `riverActionEv.ts`) má
 * uzly `null` a ostatní na výchozích 1/n. Výčet rozhodnutí ji od 15. 10. 2026
 * odmítá celou, ale tohle je kontrola na výstupu, ne na jedné cestě: hráč by
 * rovnoměrnou strategii viděl jako odpověď solveru, ať by do packu přišla
 * odkudkoli. Změřeno téhož dne: 0 takových pravidel z 26 529 v 96 souborech.
 *
 * Rovnoměrná je strategie, u které je **každá** skupina rukou se dvěma a více
 * akcemi rozdělená přesně stejně (na zaokrouhlení packu). Ve vyřešených
 * vrstvách se takový uzel nenašel ani jeden z 218 344.
 */

const PACK_DIRECTORIES = ["src/data/ranges/turn", "src/data/ranges/river"];

interface PackRule {
  sourceDirectory?: string;
  board?: string;
  spot?: { priorLine?: string[]; turnCards?: string[] };
  buckets?: { mix?: { action: string; frequency: number }[] }[];
}

function isStartingState(rule: PackRule): boolean {
  const mixes = (rule.buckets ?? [])
    .map((bucket) => bucket.mix ?? [])
    .filter((mix) => mix.length > 1);
  return mixes.length > 0 && mixes.every((mix) => (
    mix.every((entry) => Math.abs(entry.frequency - 1 / mix.length) < 0.002)
  ));
}

describe("dodávané turnové a riverové packy", () => {
  it("nenesou strategii, kterou solver nespočítal", () => {
    const found: string[] = [];
    let rules = 0;
    for (const directory of PACK_DIRECTORIES) {
      for (const name of readdirSync(directory).filter((file) => file.endsWith(".json"))) {
        const pack = JSON.parse(readFileSync(join(directory, name), "utf8")) as { rules?: PackRule[] };
        for (const rule of pack.rules ?? []) {
          rules += 1;
          if (isStartingState(rule)) {
            found.push(`${name}: ${rule.sourceDirectory ?? rule.board ?? "?"} ${(rule.spot?.priorLine ?? []).join(" ")}`);
          }
        }
      }
    }
    // Kontrola, že se vůbec něco četlo: prázdný seznam by prošel vždycky.
    expect(rules).toBeGreaterThan(10_000);
    expect(found).toEqual([]);
  });

  it("rovnoměrnou strategii pozná (dvojče)", () => {
    expect(isStartingState({
      buckets: [{ mix: [{ action: "CHECK", frequency: 0.25 }, { action: "BET 1", frequency: 0.25 },
        { action: "BET 2", frequency: 0.25 }, { action: "ALLIN", frequency: 0.25 }] }],
    })).toBe(true);
    expect(isStartingState({
      buckets: [{ mix: [{ action: "CHECK", frequency: 0.723 }, { action: "BET 1", frequency: 0.277 }] }],
    })).toBe(false);
  });
});
