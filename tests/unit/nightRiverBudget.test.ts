import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Kdy noční běh pouští riverovou fázi.
 *
 * Tohle rozhodnutí říká, co dělá osm jader mezi 21:00 a 07:00, a dosud ho hlídal
 * jen komentář. Rozpočet byl natvrdo nula, takže riverová fáze od svého opravení
 * ani jednou neběžela — a až turnová fronta dojde, spálila by noc na tom, že
 * nemá co dělat.
 *
 * Pravidlo mělo dvě poloviny: turn si drží přednost (nedokončený turn blokuje
 * rodinu na review bráně, chybějící river neblokuje nic) a vyčerpaná turnová
 * fronta už river nezdržuje. Přibyla třetí, protože „vyčerpaná fronta" přestala
 * být dosažitelná v rozumném čase: turn je na 93 % a zbytek je dlouhý ocas
 * jednotlivých desek ve třech rodinách, z nichž dvě se stejně dodávají. River má
 * proti tomu jednu vrstvu z 2 318. Nad devadesáti procenty proto river startuje
 * i s nedodělaným turnem — po turnové fázi, z toho, co z okna zbude.
 *
 * Test spouští skutečný Python, protože ten runner je Python. Bez interpretu se
 * přeskočí — stejně jako testy, které potřebují artefakty na disku.
 */
const RUNNER = "Agents/solver-input/decomposition/run_night_decomposition.py";

interface Case {
  explicit: number;
  turnExhausted: boolean;
  remaining: number;
  coverage: number;
  expected: number | null;
  label: string;
}

const cases: Case[] = [
  { explicit: 40, turnExhausted: false, remaining: 300, coverage: 0.1, expected: 40, label: "ruční rozpočet přebije i nedokončený turn" },
  { explicit: 40, turnExhausted: true, remaining: 300, coverage: 1, expected: 40, label: "ruční rozpočet platí i po vyčerpané frontě" },
  { explicit: 0, turnExhausted: false, remaining: 300, coverage: 0.81, expected: 0, label: "turn hluboko pod prahem, river se nespouští" },
  { explicit: 0, turnExhausted: false, remaining: 300, coverage: 0.899, expected: 0, label: "těsně pod prahem se ještě čeká" },
  { explicit: 0, turnExhausted: false, remaining: 300, coverage: 0.9, expected: null, label: "přesně na prahu už river startuje" },
  { explicit: 0, turnExhausted: false, remaining: 300, coverage: 0.929, expected: null, label: "dnešní stav turnu river pouští" },
  { explicit: 0, turnExhausted: true, remaining: 300, coverage: 0, expected: null, label: "vyčerpaná fronta river pouští bez ohledu na podíl" },
  { explicit: 0, turnExhausted: true, remaining: 9, coverage: 1, expected: 0, label: "zbytek okna pod floor se nezačíná" },
  { explicit: 0, turnExhausted: false, remaining: 9, coverage: 0.95, expected: 0, label: "práh nepřebije krátký zbytek okna" },
  { explicit: 0, turnExhausted: true, remaining: 10, coverage: 1, expected: null, label: "přesně na floor se ještě začíná" },
];

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

describe("noční běh: kdy pustit riverovou fázi", () => {
  it("drží pořadí turn před riverem, ale prázdnou noc nenechá", () => {
    const interpreter = python();
    if (interpreter === undefined || !existsSync(RUNNER)) return;

    const payload = JSON.stringify(cases.map((item) => (
      [item.explicit, item.turnExhausted, item.remaining, item.coverage]
    )));
    const script = [
      "import importlib.util, json, sys",
      `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      `cases = json.loads(${JSON.stringify(payload)})`,
      "print(json.dumps([m.river_budget_for(a, b, c, d) for a, b, c, d in cases]))",
    ].join("\n");

    const run = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const got = JSON.parse(run.stdout.trim()) as (number | null)[];

    for (const [index, item] of cases.entries()) {
      expect(got[index], item.label).toBe(item.expected);
    }
  });

  it("práh je pod dnešním pokrytím turnu, jinak by nic nezměnil", () => {
    const interpreter = python();
    if (interpreter === undefined || !existsSync(RUNNER)) return;
    // Práh a skutečnost se musí potkat. Kdyby někdo zvedl práh na 0,99, pravidlo
    // by dál vypadalo správně a river by se nepustil ani jednu noc — to je přesně
    // ten druh změny, který se sám nepřizná.
    const script = [
      "import importlib.util, json",
      `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      "print(json.dumps(m.RIVER_TURN_COVERAGE_FLOOR))",
    ].join("\n");
    const run = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const floor = JSON.parse(run.stdout.trim()) as number;
    expect(floor).toBeGreaterThan(0.5);
    expect(floor).toBeLessThanOrEqual(0.929);
  });
});
