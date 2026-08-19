import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tvrdá mez na konec nočního okna.
 *
 * Noční běh dosud odhadoval délku další vrstvy z těch předchozích a podle toho
 * se rozhodoval, jestli ji začít. 19. 8. to selhalo přesně tak, jak odhad
 * selhat může: vrstva o 333 podhrách začala v 07:13, nejdelší dosavadní trvala
 * 8,8 minuty a zbývalo 47 - a běžela 78 minut, protože pár podher spadlo do
 * třicetiminutového timeoutu a `--passes=4` je zkusilo znovu. Osm jader tím
 * drželo stroj hodinu a půl do pracovního dne.
 *
 * Odhad se nedá spravit lepším odhadem, proto je mez tvrdá: po deadlinu se
 * další podhra nezačne a další průchod se nespustí. Test drží obě poloviny -
 * bez té druhé by `failed > 0` po vypršení znovu rozjelo celý plán.
 */
const RUNNER = "Agents/solver-input/decomposition/solve_plan.py";

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

function run(script: string): string {
  const interpreter = python();
  if (interpreter === undefined) return "";
  const out = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
  expect(out.status, out.stderr).toBe(0);
  return out.stdout;
}

// Vlastní adresář, ne `.`. Suchá větev zapisuje parametrový soubor ještě před
// návratem, takže test s `.` nechal smetí v kořeni repozitáře - a přesně tohle
// se pak commitne, aniž si toho někdo všimne.
const scratch = mkdtempSync(join(tmpdir(), "solve-plan-deadline-"));

const preamble = [
  "import importlib.util, json",
  `spec = importlib.util.spec_from_file_location("sp", ${JSON.stringify(RUNNER)})`,
  "m = importlib.util.module_from_spec(spec)",
  "spec.loader.exec_module(m)",
  'item = {"line": ["BET 38.000000", "CALL"], "river": "2d", "pot": 126.0, "stack": 612.0,'
  + ' "board": ["8s", "2s", "2h", "2c", "2d"], "oop": {"AA": 1.0}, "ip": {"KK": 1.0}}',
  `OUT = ${JSON.stringify(scratch)}`,
].join("\n");

describe("solve_plan: konec okna", () => {
  it("po deadlinu se další podhra nezačne", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    // Deadline hluboko v minulosti. Kdyby se nekontroloval, tohle volání by
    // spustilo skutečný solver - a test by běžel minuty místo milisekund.
    const out = run([
      preamble,
      'name, status, elapsed, expl = m.solve_one(item, OUT, False, 1_000_000_000)',
      'print(json.dumps([status, elapsed]))',
    ].join("\n"));
    const [status, elapsed] = JSON.parse(out.trim()) as [string, number];
    expect(status).toBe("deadline");
    expect(elapsed).toBe(0);
  });

  it("bez deadlinu se chování nemění", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    // `--dry` vrátí "planned" bez spuštění solveru, takže tohle ověří, že
    // deadline je opravdu volitelný a nezablokuje běh, když se nezadá.
    const out = run([
      preamble,
      'name, status, elapsed, expl = m.solve_one(item, OUT, True)',
      'print(json.dumps([status]))',
    ].join("\n"));
    expect(JSON.parse(out.trim())[0]).toBe("planned");
  });

  it("deadline se předává do obou fází nočního běhu", () => {
    // Riverová fáze měla mez jen mezi vrstvami, a právě uvnitř vrstvy se
    // přetáhlo. Obě volání `solve_plan.py` proto musí deadline nést.
    const source = "Agents/solver-input/decomposition/run_night_decomposition.py";
    if (!existsSync(source)) return;
    const text = readFileSync(source, "utf8");
    // Jen skutečná volání, ne zmínka v dokumentaci nahoře: ta popisuje pořadí
    // zabíjení procesů a žádný deadline nepředává.
    const calls = text.split('os.path.join(HERE, "solve_plan.py")').length - 1;
    const deadlines = text.split("--deadline=").length - 1;
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(deadlines).toBe(calls);
  });
});
