import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { classesByDominantAction, readTurnSubgame } from "../../src/data/ranges/turnSubgameReader";

/**
 * Riverová podhra má stejný tvar jako turnová, a to je dobrá zpráva.
 *
 * Než se začne stavět riverový most, stojí za to ověřit, kolik z něj je vlastně
 * nový kód. Odpověď: skoro nic. Dump vyřešené riverové podhry je akční uzel se
 * strategií a dětmi, přesně jako turnový - jen po něm nenásleduje další chance
 * uzel, protože ruka končí. Čtečka napsaná pro turn ho přečte beze změny.
 *
 * Vzorek je skutečný, ne vymyšlený: jedna podhra vyřešená přes `plan_river.py`
 * a `solve_plan.py` na boardu 9s9h9d2c2d. Právě tenhle běh odhalil, že riverová
 * fáze nočního běhu spadne na `KeyError: 'turn'` - byla zapojená, ale nikdy
 * neprošla celou cestou.
 */
describe("riverová podhra a turnová čtečka", () => {
  const node = JSON.parse(readFileSync("tests/fixtures/riverSubgame.sample.json", "utf8"));

  it("přečte se stejnou čtečkou jako turn", () => {
    const read = readTurnSubgame(node);
    expect(read).toBeDefined();
    if (read === undefined) return;
    expect(read.actions.length).toBeGreaterThan(1);
    expect(read.classes.length).toBeGreaterThan(20);
  });

  it("rozdělí ruce do akcí, takže z toho jde postavit pravidlo", () => {
    const read = readTurnSubgame(node);
    if (read === undefined) throw new Error("čtečka odmítla riverovou podhru");
    const buckets = classesByDominantAction(read);
    expect(buckets.size).toBeGreaterThan(0);
    let combos = 0;
    for (const entries of buckets.values()) {
      for (const entry of entries) combos += entry.combos;
    }
    expect(combos).toBeGreaterThan(0);
  });

  it("po riverovém uzlu už nenásleduje další rozdání", () => {
    // Turnová podhra končí chance uzlem, kde se dává river. Riverová nekončí
    // ničím takovým - ruka dojde do konce. Kdyby tam chance uzel byl, znamenalo
    // by to, že se plánovala špatná ulice.
    const seen: string[] = [];
    const walk = (item: Record<string, unknown>, depth: number): void => {
      if (depth > 6) return;
      seen.push(String(item.node_type));
      const children = item.childrens;
      if (children && typeof children === "object") {
        for (const child of Object.values(children as Record<string, Record<string, unknown>>)) {
          walk(child, depth + 1);
        }
      }
    };
    walk(node, 0);
    expect(seen).not.toContain("chance_node");
  });
});
