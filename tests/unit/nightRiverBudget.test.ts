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
 * Pravidlo má dvě poloviny a obě musí platit současně: turn si drží přednost
 * (nedokončený turn blokuje rodinu na review bráně, chybějící river neblokuje
 * nic), ale vyčerpaná turnová fronta už river nezdržuje.
 *
 * Test spouští skutečný Python, protože ten runner je Python. Bez interpretu se
 * přeskočí — stejně jako testy, které potřebují artefakty na disku.
 */
const RUNNER = "Agents/solver-input/decomposition/run_night_decomposition.py";

interface Case {
  explicit: number;
  turnExhausted: boolean;
  remaining: number;
  expected: number | null;
  label: string;
}

const cases: Case[] = [
  { explicit: 40, turnExhausted: false, remaining: 300, expected: 40, label: "ruční rozpočet přebije i nedokončený turn" },
  { explicit: 40, turnExhausted: true, remaining: 300, expected: 40, label: "ruční rozpočet platí i po vyčerpané frontě" },
  { explicit: 0, turnExhausted: false, remaining: 300, expected: 0, label: "turn není hotový, river se nespouští" },
  { explicit: 0, turnExhausted: true, remaining: 300, expected: null, label: "fronta došla a okno je, river dostane zbytek" },
  { explicit: 0, turnExhausted: true, remaining: 9, expected: 0, label: "zbytek okna pod floor se nezačíná" },
  { explicit: 0, turnExhausted: true, remaining: 10, expected: null, label: "přesně na floor se ještě začíná" },
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

    const script = [
      "import importlib.util, json, sys",
      `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      `cases = json.loads(${JSON.stringify(JSON.stringify(cases.map((item) => [item.explicit, item.turnExhausted, item.remaining])))})`,
      "print(json.dumps([m.river_budget_for(a, b, c) for a, b, c in cases]))",
    ].join("\n");

    const run = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const got = JSON.parse(run.stdout.trim()) as (number | null)[];

    for (const [index, item] of cases.entries()) {
      expect(got[index], item.label).toBe(item.expected);
    }
  });
});
