import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CLASS_MIX_ORDER, CLASS_MIX_SCHEMA, type SolvedClassMixFile } from "../../src/data/ranges/solvedClassMix";

/**
 * Dodané frekvence po třídách patří ke svému packu (deník 336).
 *
 * Párují se pořadím pravidla, takže posun o jedno pravidlo by matici obarvil
 * strategií jiného spotu - a jednotkové testy s malým packem by to nepoznaly.
 * Tady se bere každý dodaný soubor a jeho pack: třída, kterou pack dává do
 * kbelíku akce X, musí mít v souboru převažující akci X, a třída mimo kbelíky
 * nesmí mít frekvence vůbec. 4. 11. 2026 na 37 rodinách a 395 181 třídách
 * bez jediného rozporu.
 *
 * V prohlížeči od 4. 11. pruhy ověřuje E2E na turnovém spotu (deník 338); tenhle
 * test hlídá každý dodaný soubor, ne jen ten, který E2E zrovna rozdá.
 */

interface PackRule {
  actions: string[];
  buckets: Array<{ action: string; handClasses: string[] }>;
}

interface Pack {
  id: string;
  contentHash: string;
  rules: PackRule[];
}

/** Rozdíl v procentních bodech, pod kterým je převaha akce jen zaokrouhlení. */
const TIE_POINTS = 2;

const shipped = (["flop", "turn", "river"] as const).flatMap((street) => {
  const directory = join("src/data/ranges", `${street}-mix`);
  return existsSync(directory)
    ? readdirSync(directory)
      .filter((name) => name.endsWith(".generated.json"))
      .map((name) => ({ street, name }))
    : [];
});

describe("dodané frekvence po třídách sedí na svůj pack", () => {
  it("nějaké se dodávají", () => {
    expect(shipped.length).toBeGreaterThan(0);
  });

  it.each(shipped)("$street $name", ({ street, name }) => {
    const mix = JSON.parse(readFileSync(join("src/data/ranges", `${street}-mix`, name), "utf8")) as SolvedClassMixFile;
    const pack = JSON.parse(readFileSync(join("src/data/ranges", street, name), "utf8")) as Pack;
    expect(mix.schemaVersion).toBe(CLASS_MIX_SCHEMA);
    expect(mix.packId).toBe(pack.id);
    expect(mix.contentHash).toBe(pack.contentHash);
    expect(mix.rules).toHaveLength(pack.rules.length);

    const conflicts: string[] = [];
    pack.rules.forEach((rule, index) => {
      const encoded = mix.rules[index];
      if (encoded === "") return;
      const slots = encoded.split(";");
      expect(slots).toHaveLength(CLASS_MIX_ORDER.length);
      const inBuckets = new Set<string>();
      for (const bucket of rule.buckets) {
        const action = rule.actions.indexOf(bucket.action);
        for (const hand of bucket.handClasses) {
          inBuckets.add(hand);
          const slot = slots[CLASS_MIX_ORDER.indexOf(hand as (typeof CLASS_MIX_ORDER)[number])];
          const shares = slot === "" ? [] : slot.split(",").map(Number);
          const top = Math.max(...shares, 0);
          if (slot === "" || (shares[action] ?? 0) < top - TIE_POINTS) {
            conflicts.push(`pravidlo ${index} ${hand}: kbelík ${bucket.action}, frekvence "${slot}"`);
          }
        }
      }
      slots.forEach((slot, at) => {
        if (slot !== "" && !inBuckets.has(CLASS_MIX_ORDER[at])) {
          conflicts.push(`pravidlo ${index} ${CLASS_MIX_ORDER[at]}: frekvence mimo kbelíky`);
        }
      });
    });
    expect(conflicts.slice(0, 5)).toEqual([]);
  });
});
