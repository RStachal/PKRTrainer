import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  classesByDominantAction,
  handClassOf,
  readTurnSubgame,
} from "../../src/data/ranges/turnSubgameReader";

/**
 * The first piece of a path that does not yet exist.
 *
 * The night window has produced 35,144 solved turn subgames across 261 boards
 * and nothing in the repository reads them. This reader is checked against the
 * real files rather than against a fixture, because the point of it is that the
 * files are usable - a fixture would only prove the reader agrees with whatever
 * I imagined they contained.
 *
 * The suite skips these cases when the artefacts are absent, since they are not
 * in version control and a clone will not have them. Skipping is stated in the
 * assertions rather than silent: a run without artefacts should not look like a
 * run that passed.
 */

const ROOT = "artifacts/decomposition";

function firstSubgamePath(): string | null {
  if (!existsSync(ROOT)) return null;
  for (const family of readdirSync(ROOT)) {
    const dir = join(ROOT, family);
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    const found = files.find((name) => name.endsWith(".json") && name !== "plan.json");
    if (found !== undefined) return join(dir, found);
  }
  return null;
}

describe("turn subgame reader", () => {
  it("groups a concrete holding into the class the rest of the project uses", () => {
    // Same spelling as everywhere else, so a class read here can be looked up
    // without translation. Higher rank leads.
    expect(handClassOf("2h2d")).toBe("22");
    expect(handClassOf("4c3c")).toBe("43s");
    expect(handClassOf("4c3d")).toBe("43o");
    expect(handClassOf("3d4d")).toBe("43s");
    expect(handClassOf("AsKs")).toBe("AKs");
    expect(handClassOf("")).toBeUndefined();
    expect(handClassOf("2h2d2c")).toBeUndefined();
  });

  it("returns undefined for a node with no strategy rather than an empty result", () => {
    // A subgame that cannot be read is a different thing from one that says
    // nothing, and only the first is a problem worth surfacing.
    expect(readTurnSubgame({})).toBeUndefined();
    expect(readTurnSubgame({ actions: [] })).toBeUndefined();
    expect(readTurnSubgame({ actions: ["CHECK"], strategy: { strategy: {} } })).toBeUndefined();
  });

  it("averages frequencies across the combinations of a class", () => {
    const strategy = readTurnSubgame({
      actions: ["CHECK", "BET 75.000000"],
      strategy: {
        strategy: {
          // Two combinations of the same class, disagreeing. The class can only
          // carry one answer, so it carries the average and reports the count.
          "4c3c": [1, 0],
          "4d3d": [0, 1],
          "AsKs": [0.25, 0.75],
        },
      },
    })!;
    expect(strategy.combosRead).toBe(3);
    const suitedFour = strategy.classes.find((entry) => entry.handClass === "43s")!;
    expect(suitedFour.combos).toBe(2);
    expect(suitedFour.mix.map((item) => item.frequency)).toEqual([0.5, 0.5]);
    const ace = strategy.classes.find((entry) => entry.handClass === "AKs")!;
    expect(ace.dominantAction).toBe("BET 75.000000");
  });

  it("reads a real solved subgame if the artefacts are present", () => {
    const path = firstSubgamePath();
    if (path === null) {
      // Not in version control. Said out loud so a run without them cannot be
      // mistaken for one that checked them.
      expect(existsSync(ROOT), `${ROOT} absent - solver artefacts not checked`).toBe(false);
      return;
    }
    const strategy = readTurnSubgame(JSON.parse(readFileSync(path, "utf8")));
    expect(strategy, path).toBeDefined();
    // 1326 combinations at most collapse to 169 classes at most, and a real
    // subgame holds a subset of both.
    expect(strategy!.combosRead).toBeGreaterThan(50);
    expect(strategy!.classes.length).toBeLessThanOrEqual(169);
    expect(strategy!.classes.length).toBeLessThanOrEqual(strategy!.combosRead);
    expect(strategy!.actions.length).toBeGreaterThan(1);

    for (const entry of strategy!.classes) {
      const total = entry.mix.reduce((sum, item) => sum + item.frequency, 0);
      // Every hand does something, exactly once. A class whose frequencies do
      // not sum to one is a misread of the action order.
      expect(total, `${entry.handClass} sums to ${total}`).toBeGreaterThan(0.95);
      expect(total, `${entry.handClass} sums to ${total}`).toBeLessThan(1.05);
      expect(entry.mix.map((item) => item.action)).toEqual([...strategy!.actions]);
    }

    const grouped = classesByDominantAction(strategy!);
    expect(grouped.size).toBeGreaterThan(0);
    const regrouped = [...grouped.values()].reduce((sum, list) => sum + list.length, 0);
    expect(regrouped).toBe(strategy!.classes.length);
  });
});
