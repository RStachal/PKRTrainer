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
    // přetáhlo. Obě fáze proto musí `solve_plan.py` spouštět přes společný
    // `run_solve_plan`, který deadline nese a okno vynucuje.
    //
    // Dřív se tu počítala dvě doslovná volání. Sjednocení do jedné funkce ten
    // počet srazilo na jedno, aniž by se cokoli zhoršilo - proto se dnes hlídá,
    // že mimo tu funkci žádné volání nezůstalo.
    const source = "Agents/solver-input/decomposition/run_night_decomposition.py";
    if (!existsSync(source)) return;
    const text = readFileSync(source, "utf8");
    const spawns = text.split('os.path.join(HERE, "solve_plan.py")').length - 1;
    const deadlines = text.split("--deadline=").length - 1;
    expect(spawns).toBe(1);
    expect(deadlines).toBe(spawns);
    // Obě fáze plus definice.
    expect(text.split("run_solve_plan(").length - 1).toBeGreaterThanOrEqual(3);
  });

  /**
   * Že se po deadlinu nezačíná, samo okno neudrží.
   *
   * `solve_one` odmítne *začít* po deadlinu, ale co běží, doběhne - a při osmi
   * jádrech je to osm podher, každá až třicet minut po konci okna. Noc z 24. na
   * 25. 8. přetáhla o 66 minut, tedy o dvojnásobek toho stropu, a z logu se
   * příčina zjistit nedala.
   *
   * Meze jsou proto dvě a tenhle blok drží obě: podhra se ukončí sama do
   * `deadline + 4 min`, rodič zabije celou vrstvu na `deadline + 5 min`.
   */
  const positions = [60, 40, 26, 10, 1, 0.1];

  it("podhra skončí nejpozději čtyři minuty za deadlinem", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = run([
      preamble,
      "now = 1000000.0",
      `ends = [(-left + m.item_timeout(now + left * 60, now) / 60) for left in ${JSON.stringify(positions)}]`,
      "print(json.dumps([round(value, 3) for value in ends]))",
    ].join("\n"));
    const ends = JSON.parse(out.trim()) as number[];
    for (const [index, end] of ends.entries()) {
      expect(end, `${positions[index]} min do deadlinu`).toBeLessThanOrEqual(4);
    }
    // A zároveň se nesmí zkrátit tam, kde je okna dost: bez toho by šlo test
    // splnit stropem jedné minuty a noc by nic nespočítala.
    expect(ends[0]).toBe(-30);
  });

  it("bez deadlinu zůstává půlhodinový strop", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = run([preamble, "print(json.dumps(m.item_timeout(None)))"].join("\n"));
    expect(JSON.parse(out.trim())).toBe(1800);
  });

  it("rodič vrstvu ukončí pět minut za deadlinem", () => {
    if (python() === undefined) return;
    const source = "Agents/solver-input/decomposition/run_night_decomposition.py";
    if (!existsSync(source)) return;
    const out = run([
      "import importlib.util, json",
      "from datetime import datetime, timedelta",
      `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(source)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      "now = datetime(2026, 8, 25, 3, 0, 0)",
      `left = ${JSON.stringify(positions)}`,
      "print(json.dumps([round(m.layer_timeout_seconds(now + timedelta(minutes=x), now) / 60 - x, 3) for x in left]))",
    ].join("\n"));
    // Kolik minut za deadlinem rodič zabíjí - vždy pět, ať vrstva začne kdykoli.
    for (const overrun of JSON.parse(out.trim()) as number[]) {
      expect(overrun).toBe(5);
    }
  });
});
