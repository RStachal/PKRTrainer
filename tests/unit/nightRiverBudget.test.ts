import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
 * Čtvrtá polovina od 20. 10. 2026: růst desek a nové rodiny stáhly rozložené
 * desky z 87-88 % na 68 %, takže práh přestal být dosažitelný a river zase
 * neběžel vůbec. Turnová EV přitom vzniká jen z riverových vrstev. Noc proto
 * dělí okno podílem (`--turn-share`): po turnové fázi river dostane zbytek, ať
 * je turn rozložený jakkoli.
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
  /** Turnová fáze skončila podle podílu okna (`--turn-share`). */
  split?: boolean;
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
  { explicit: 0, turnExhausted: false, remaining: 300, coverage: 0.68, split: true, expected: null, label: "podíl okna pustí river i hluboko pod prahem" },
  { explicit: 0, turnExhausted: false, remaining: 9, coverage: 0.68, split: true, expected: 0, label: "podíl okna nepřebije krátký zbytek okna" },
  { explicit: 40, turnExhausted: false, remaining: 300, coverage: 0.68, split: true, expected: 40, label: "ruční rozpočet platí i po podílu okna" },
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
      [item.explicit, item.turnExhausted, item.remaining, item.coverage, item.split ?? false]
    )));
    const script = [
      "import importlib.util, json, sys",
      `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      `cases = json.loads(${JSON.stringify(payload)})`,
      "print(json.dumps([m.river_budget_for(a, b, c, d, e) for a, b, c, d, e in cases]))",
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

  it("podíl okna dělí čas od startu runneru do konce okna", () => {
    const interpreter = python();
    if (interpreter === undefined || !existsSync(RUNNER)) return;
    // Noc 21:00-07:00: polovina je 02:00. Podíl mimo 0..1 se ořízne, aby
    // překlep v plánované úloze nepustil turn za konec okna ani nevzal turnu
    // celou noc.
    const script = [
      "import importlib.util, json",
      "from datetime import datetime",
      `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      "start = datetime(2026, 10, 20, 21, 0)",
      "end = datetime(2026, 10, 21, 7, 0)",
      "print(json.dumps([m.turn_phase_end(start, end, share).strftime('%d %H:%M') for share in (0.5, 1, 0, 1.5, -1)]))",
    ].join("\n");
    const run = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout.trim())).toEqual(["21 02:00", "21 07:00", "20 21:00", "21 07:00", "20 21:00"]);
  });

  it("plánované noční úlohy okno opravdu dělí a expanze dělení předá rozkladu", () => {
    // Bez parametru runner jede postaru (podíl 1). Kdyby se z wrapperu ztratil,
    // nic by nespadlo - jen by se river zase nepustil ani jednu noc.
    for (const wrapper of ["scripts/scheduled/night-decomposition.ps1", "scripts/scheduled/night-expansion.ps1"]) {
      expect(readFileSync(wrapper, "utf8"), wrapper).toMatch(/--turn-share=0\.\d+/);
    }
    expect(readFileSync("Agents/solver-input/decomposition/run_night_expansion.py", "utf8"))
      .toMatch(/forwarded = \[[^\]]*"--turn-share="/);
  });
});
