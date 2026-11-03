import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { depthCostsFrom, familyCostsFrom, parseBoardSolves } from "../../scripts/lib/boardCost.mts";

/**
 * Pokus D6: dva monolity souběžně (rozhodnutí majitele 3. 11. 2026).
 *
 * Jeden monolit drží 5,3-7 logických procesorů z 16 (2. 11. 2026) a víc vláken
 * to nezmění - pokus 12/16 dal poměr času 1,17 s intervalem přes jedničku.
 * Stroj zaplní jen druhá deska vedle. Testy hlídají tři věci, které se se
 * souběhem mohou tiše rozbít:
 *
 *  - runner opravdu pustí dvě desky naráz, a jen když je volná paměť;
 *  - každý řádek výsledku nese, které desky se týká - páry `solving`/`hotovo`
 *    se v souběhu prolínají, a cena desky se z nich počítá (`boardCost.mts`);
 *  - minuty souběžné desky nejdou do modelu ceny jedné desky, jinak by stropy
 *    vzrostly dvakrát: jednou z modelu a podruhé souběžným násobkem v runneru.
 *
 * Solver se nespouští: runner se načte přes `importlib` (bez `main()`) a
 * `run_solver` se nahradí funkcí, která počká a zapíše checkpoint.
 */
const RUNNER = "Agents/solver-input/decomposition/run_night_expansion.py";

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

const ready = (): boolean => python() !== undefined && existsSync(RUNNER);

interface QueueRun {
  stats: { done: number; failed: number };
  maxInFlight: number;
  checkpoints: number;
  lines: string[];
}

/** Čtyři desky jedné rodiny přes `run_queue` s náhradou solveru. */
function runQueue(parallel: number, freeRamGb: number): QueueRun {
  const interpreter = python();
  if (interpreter === undefined) throw new Error("python není");
  const script = [
    "import importlib.util, json, os, tempfile, threading, time",
    "from datetime import datetime, timedelta",
    `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
    "m = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(m)",
    // Cena vnucená, ne ze souboru: test měří souběh, ne poslední noc.
    "m._COST_CACHE['rows'] = {40: {'capMinutes': 80, 'reserveMinutes': 1}}",
    "root = tempfile.mkdtemp()",
    "m.PARAMS = os.path.join(root, 'params')",
    "m.OUTPUT_BASE = os.path.join(root, 'out')",
    "os.makedirs(m.PARAMS)",
    "family = 'MTT9_40BB_HJ_BB_SRP'",
    "for index, board in enumerate(['A72r', '883r', '986tt', 'AT4mono']):",
    "    checkpoint = os.path.join(m.OUTPUT_BASE, family, 'raw', f'pkrtrainer_{family}_{board}.json')",
    "    with open(os.path.join(m.PARAMS, f'{index + 1:04d}_{family}_{board}.txt'), 'w') as handle:",
    "        handle.write(f'set_thread_num 12\\nset_accuracy 0.5\\ndump_result {checkpoint}\\n')",
    "lock = threading.Lock()",
    "state = {'now': 0, 'max': 0}",
    "def fake_solver(param, timeout_seconds):",
    "    with lock:",
    "        state['now'] += 1",
    "        state['max'] = max(state['max'], state['now'])",
    "    time.sleep(0.4)",
    "    with open(param) as handle:",
    "        text = handle.read()",
    "    checkpoint = [line.split(' ', 1)[1].strip() for line in text.splitlines() if line.startswith('dump_result ')][0]",
    "    with open(checkpoint, 'w') as handle:",
    "        handle.write('{}')",
    "    with lock:",
    "        state['now'] -= 1",
    "    return 0, None",
    "m.run_solver = fake_solver",
    `m.free_ram_gb = lambda: ${freeRamGb}`,
    "m.PARALLEL_STAGGER_SECONDS = 0",
    "m.decomposition_has_the_night = lambda: False",
    "lines = []",
    "m.log = lambda message: lines.append(message)",
    `stats = m.run_queue(m.pending_boards(), datetime.now() + timedelta(hours=1), parallel=${parallel})`,
    "written = sum(1 for _, _, files in os.walk(m.OUTPUT_BASE) for name in files if name.endswith('.json'))",
    "print(json.dumps({'stats': stats, 'maxInFlight': state['max'], 'checkpoints': written, 'lines': lines}))",
  ].join("\n");
  const run = spawnSync(interpreter, ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  expect(run.status, run.stderr).toBe(0);
  const out = run.stdout.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  return JSON.parse(out[out.length - 1] ?? "{}") as QueueRun;
}

describe("souběžné monolity v runneru", () => {
  it("se dvěma místy běží dvě desky naráz a všechny doběhnou", () => {
    if (!ready()) return;
    const run = runQueue(2, 64);
    expect(run.stats.done).toBe(4);
    expect(run.stats.failed).toBe(0);
    expect(run.checkpoints).toBe(4);
    expect(run.maxInFlight).toBe(2);
    const solving = run.lines.filter((line) => line.startsWith("solving "));
    expect(solving).toHaveLength(4);
    for (const line of solving) expect(line).toMatch(/vlákna 8, souběžně 2/);
  });

  it("každý řádek výsledku nese svou desku, i když se páry prolínají", () => {
    if (!ready()) return;
    const run = runQueue(2, 64);
    const results = run.lines.filter((line) => line.trim().startsWith("hotovo za"));
    expect(results).toHaveLength(4);
    for (const line of results) expect(line).toMatch(/\[MTT9_40BB_HJ_BB_SRP (A72r|883r|986tt|AT4mono)\]$/);
  });

  it("bez souběhu jede jako dřív: po jedné desce, bez poznámky o souběhu", () => {
    if (!ready()) return;
    const run = runQueue(1, 64);
    expect(run.stats.done).toBe(4);
    expect(run.maxInFlight).toBe(1);
    for (const line of run.lines.filter((item) => item.startsWith("solving "))) {
      expect(line).not.toMatch(/souběžně/);
    }
  });

  it("druhou desku nepustí, dokud není volná paměť - první jede vždycky", () => {
    if (!ready()) return;
    const run = runQueue(2, 1);
    expect(run.stats.done).toBe(4);
    expect(run.maxInFlight).toBe(1);
    expect(run.lines.some((line) => line.includes("čekám na paměť"))).toBe(true);
  });
});

describe("čtení souběžné noci z logu", () => {
  const interleaved = [
    "[20:00:00] solving MTT9_40BB_HJ_BB_SRP A72r (vlákna 8, souběžně 2)",
    "[20:03:00] solving MTT9_40BB_HJ_BB_SRP 883r (vlákna 8, souběžně 2)",
    "[20:40:00]   hotovo za 37.0 min, checkpoint 130 MB [MTT9_40BB_HJ_BB_SRP 883r]",
    "[20:41:00] solving MTT9_40BB_HJ_BB_SRP 986tt (vlákna 8, souběžně 2)",
    "[20:50:00]   hotovo za 50.0 min, checkpoint 135 MB [MTT9_40BB_HJ_BB_SRP A72r]",
    "[22:56:00]   SELHALO po 135.0 min (rc=timeout); příští noc stupeň 2 - strop 90 min, přesnost 1.0 % [MTT9_40BB_HJ_BB_SRP 986tt]",
  ];

  it("páruje výsledek s deskou podle jména, ne podle pořadí", () => {
    const solves = parseBoardSolves(interleaved);
    expect(solves.map((solve) => [solve.board, solve.minutes, solve.parallel])).toEqual([
      ["883r", 37, 2],
      ["A72r", 50, 2],
    ]);
  });

  it("souběžné minuty nejdou do ceny jedné desky", () => {
    const solves = parseBoardSolves([
      ...interleaved,
      "[23:00:00] solving MTT9_40BB_LJ_BB_SRP K98tt (vlákna 12)",
      "[23:30:00]   hotovo za 30.0 min, checkpoint 120 MB",
    ]);
    expect(depthCostsFrom(solves).find((row) => row.depthBB === 40)?.boards).toBe(1);
    expect(familyCostsFrom(solves).map((row) => row.family)).toEqual(["MTT9_40BB_LJ_BB_SRP"]);
  });
});
