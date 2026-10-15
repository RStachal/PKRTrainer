import { describe, expect, it } from "vitest";

import { manifestLoadExpression, readManifestEntries } from "../../scripts/lib/manifestEntries.mts";

/**
 * Generátor manifest při každém zápisu skládá z toho, co z něj přečetl - vzor,
 * který nesedí, tedy položky tiše zahodí. Jednou už to smazalo deset rodin
 * z jedenácti (přechod `.generated` -> `.generated.json`). Přechod na `?raw`
 * (15. 10. 2026, kvůli 6 GB typecheckeru) by bez tohohle smazal všechny.
 */

const entry = (dir: string, slug: string, load: string) => `  {
    familyId: "MTT9_${slug.toUpperCase()}",
    packId: "pack-${slug}",
    load: () => import("./${dir}/${slug}.${load}").then((module) => module.default as unknown as X),
  },`;

describe("položky manifestu", () => {
  it("přečte všechny tři tvary přípony - starý, dnešní i nový", () => {
    const source = [
      entry("turn", "a", "generated"),
      entry("turn", "b", "generated.json"),
      entry("turn", "c", "generated.json?raw"),
    ].join("\n");
    expect(readManifestEntries(source, "turn").map((item) => item.slug)).toEqual(["a", "b", "c"]);
  });

  it("do jména nepustí `?raw`", () => {
    const [read] = readManifestEntries(entry("turn-ev", "mtt9-40bb-hj-bb-srp", "generated.json?raw"), "turn-ev");
    expect(read).toEqual({
      familyId: "MTT9_MTT9-40BB-HJ-BB-SRP",
      packId: "pack-mtt9-40bb-hj-bb-srp",
      slug: "mtt9-40bb-hj-bb-srp",
    });
  });

  it("`river` nechytí `river-ev` ani `turn` nechytí `turn-ev`", () => {
    // Za adresářem musí přijít lomítko. Bez toho by riverový generátor načetl
    // i EV položky a zapsal je jako strategie.
    const source = [
      entry("river", "a", "generated.json?raw"),
      entry("river-ev", "b", "generated.json?raw"),
      entry("turn", "c", "generated.json?raw"),
      entry("turn-ev", "d", "generated.json?raw"),
    ].join("\n");
    expect(readManifestEntries(source, "river").map((item) => item.slug)).toEqual(["a"]);
    expect(readManifestEntries(source, "river-ev").map((item) => item.slug)).toEqual(["b"]);
    expect(readManifestEntries(source, "turn").map((item) => item.slug)).toEqual(["c"]);
    expect(readManifestEntries(source, "turn-ev").map((item) => item.slug)).toEqual(["d"]);
  });

  it("co se zapíše, to se zase přečte - jinak by druhý ranní cyklus rodiny zahodil", () => {
    const written = `  {
    familyId: "MTT9_40BB_HJ_BB_SRP",
    packId: "mtt-full-ring-9-turn-ev-mtt9-40bb-hj-bb-srp-v1",
    load: ${manifestLoadExpression("turn-ev", "mtt9-40bb-hj-bb-srp", "TurnEvPack")},
  },`;
    expect(readManifestEntries(written, "turn-ev")).toEqual([{
      familyId: "MTT9_40BB_HJ_BB_SRP",
      packId: "mtt-full-ring-9-turn-ev-mtt9-40bb-hj-bb-srp-v1",
      slug: "mtt9-40bb-hj-bb-srp",
    }]);
  });

  it("načítá přes `?raw` a `JSON.parse`, aby TypeScript data nečetl", () => {
    const expression = manifestLoadExpression("flop", "x", "FlopSolvedStrategyPack");
    expect(expression).toContain('import("./flop/x.generated.json?raw")');
    expect(expression).toContain("JSON.parse(module.default) as FlopSolvedStrategyPack");
    expect(expression).not.toContain("as unknown as");
  });
});
