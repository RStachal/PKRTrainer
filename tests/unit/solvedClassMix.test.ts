import { describe, expect, it } from "vitest";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { manifestMixLine, readManifestEntries } from "../../scripts/lib/manifestEntries.mts";
import { mixOnlyRefusal, writeClassMix } from "../../scripts/lib/classMixWriting.mts";
import {
  CLASS_MIX_ORDER,
  CLASS_MIX_SCHEMA,
  classMixForRule,
  decodeClassMix,
  type SolvedClassMixRef,
} from "../../src/data/ranges/solvedClassMix";
import { classMixFile, encodeClassMix } from "../../src/data/ranges/solvedClassMixBuild";
import type { TurnSubgameNode } from "../../src/data/ranges/turnSubgameReader";

/**
 * Frekvence po třídách rukou pro matici range (`solvedClassMix.ts`; majitel
 * 3. 11. 2026: „chci to. Rozšířit"). Pack nese kbelíky podle převažující
 * akce; tohle je strategie každé třídy zvlášť, v souboru vedle packu.
 */

const node = {
  actions: ["BET 33.000000", "BET 75.000000", "CHECK"],
  strategy: {
    strategy: {
      // AKo: dvě kombinace, průměr 60 / 10 / 30.
      AsKd: [0.7, 0.1, 0.2],
      AhKc: [0.5, 0.1, 0.4],
      // 72o: čistý check.
      "7c2d": [0, 0, 1],
      // QQ: čistá malá sázka, nuly na konci se nepíšou.
      QsQh: [1, 0, 0],
    },
  },
} as unknown as TurnSubgameNode;

const slotOf = (hand: string) => CLASS_MIX_ORDER.indexOf(hand as (typeof CLASS_MIX_ORDER)[number]);

describe("kódování směsi tříd", () => {
  it("dá 169 míst v pořadí mřížky, celá procenta v pořadí akcí, bez nul na konci", () => {
    const slots = encodeClassMix(node).split(";");
    expect(slots).toHaveLength(169);
    expect(CLASS_MIX_ORDER[0]).toBe("AA");
    expect(CLASS_MIX_ORDER[1]).toBe("AKs");
    expect(CLASS_MIX_ORDER[13]).toBe("AKo");
    expect(slots[slotOf("AKo")]).toBe("60,10,30");
    expect(slots[slotOf("72o")]).toBe("0,0,100");
    expect(slots[slotOf("QQ")]).toBe("100");
    // Třída mimo range uzlu zůstane prázdná, ne nulová.
    expect(slots[slotOf("AA")]).toBe("");
    expect(slots.filter((slot) => slot !== "")).toHaveLength(3);
  });

  it("uzel bez strategie dá prázdný řetězec", () => {
    expect(encodeClassMix({ actions: ["CHECK"] } as unknown as TurnSubgameNode)).toBe("");
  });

  it("dekóduje do akcí produktu a slité velikosti sečte", () => {
    // Obě sázky se v produktu slily do BET_SMALL (překlad akcí pravidla).
    const mix = decodeClassMix(encodeClassMix(node), ["BET_SMALL", "BET_SMALL", "CHECK"]);
    expect(mix.get("AKo")).toEqual([
      { action: "BET_SMALL", frequencyPct: 70, visibility: "EXACT" },
      { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
    ]);
    expect(mix.get("QQ")).toEqual([{ action: "BET_SMALL", frequencyPct: 100, visibility: "EXACT" }]);
    expect(mix.has("AA")).toBe(false);
    expect(decodeClassMix("100;100", ["CHECK"]).size).toBe(0);
  });
});

describe("soubor s frekvencemi a vazba na pack", () => {
  const rules = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const pack = { id: "pack-v1", contentHash: "abc-1", rules };
  const mixByRule = new Map<object, string>([[rules[0], encodeClassMix(node)], [rules[2], encodeClassMix(node)]]);
  const ref: SolvedClassMixRef = {
    street: "TURN",
    packId: "pack-v1",
    contentHash: "abc-1",
    ruleIndex: 2,
    actions: ["BET_SMALL", "BET_BIG", "CHECK"],
  };

  it("páruje podle pravidla v pořadí packu, pravidlo bez dat je prázdné", () => {
    const file = classMixFile(pack, mixByRule);
    expect(file.schemaVersion).toBe(CLASS_MIX_SCHEMA);
    expect(file.rules).toHaveLength(3);
    expect(file.rules[1]).toBe("");
    expect(classMixForRule(file, ref)?.get("AKo")).toEqual([
      { action: "BET_SMALL", frequencyPct: 60, visibility: "EXACT" },
      { action: "BET_BIG", frequencyPct: 10, visibility: "EXACT" },
      { action: "CHECK", frequencyPct: 30, visibility: "EXACT" },
    ]);
    expect(classMixForRule(file, { ...ref, ruleIndex: 1 })).toBeUndefined();
  });

  it("frekvence k jinému obsahu se nepoužijí", () => {
    const file = classMixFile(pack, mixByRule);
    expect(classMixForRule(file, { ...ref, contentHash: "jiny-1" })).toBeUndefined();
    expect(classMixForRule(file, { ...ref, packId: "jiny-pack" })).toBeUndefined();
    expect(classMixForRule({ ...file, schemaVersion: "X" as typeof CLASS_MIX_SCHEMA }, ref)).toBeUndefined();
  });

  it("soubor nad rozpočet vyprázdní frekvence od konce, pravidla packu nechá", () => {
    const many = Array.from({ length: 300 }, (_, index) => ({ index }));
    const big = new Map<object, string>(many.map((rule) => [rule, "x".repeat(3000)]));
    const result = writeClassMix("turn", "test-family", { id: "p", contentHash: "h", rules: many }, big, false);
    expect(result.bytes).toBeLessThanOrEqual(500 * 1024);
    expect(result.blanked).toBeGreaterThan(0);
    expect(result.rules + result.blanked).toBe(300);
    expect(result.path.replace(/\\/g, "/")).toBe("src/data/ranges/turn-mix/test-family.generated.json");
  });

  it("`--mix-only` dopíše frekvence jen k packu se stejným obsahem", () => {
    const packPath = join(mkdtempSync(join(tmpdir(), "class-mix-")), "pack.generated.json");
    writeFileSync(packPath, JSON.stringify({ id: "pack-v1", contentHash: "abc-1", rules: [] }), "utf8");
    expect(mixOnlyRefusal(packPath, "abc-1")).toBeUndefined();
    expect(mixOnlyRefusal(packPath, "jiny-1")).toContain("otisk jiny-1 proti abc-1");
    expect(mixOnlyRefusal(`${packPath}.chybi`, "abc-1")).toContain("proti žádnému");
  });
});

describe("manifest s frekvencemi", () => {
  it("řádek `loadMix` stojí za `load` a čtečka manifestu z něj nevyrobí rodinu", () => {
    const manifest = `export const solvedTurnManifest = [
  {
    familyId: "MTT9_A",
    packId: "pack-a",
    profileKey: "K",
    load: () => import("./turn/mtt9-a.generated.json?raw").then((module) => JSON.parse(module.default) as T),${
  manifestMixLine("turn", "mtt9-a", true)}
  },
  {
    familyId: "MTT9_B",
    packId: "pack-b",
    profileKey: "K",
    load: () => import("./turn/mtt9-b.generated.json?raw").then((module) => JSON.parse(module.default) as T),${
  manifestMixLine("turn", "mtt9-b", false)}
  },
];`;
    expect(manifest).toContain('loadMix: () => import("./turn-mix/mtt9-a.generated.json?raw")');
    expect(manifest.match(/loadMix/g)).toHaveLength(1);
    expect(readManifestEntries(manifest, "turn")).toEqual([
      { familyId: "MTT9_A", packId: "pack-a", slug: "mtt9-a" },
      { familyId: "MTT9_B", packId: "pack-b", slug: "mtt9-b" },
    ]);
  });
});
