import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseBoardSolves, type BoardSolve } from "../../scripts/lib/boardCost.mts";
import { TRIAL_MIN_FAMILIES, threadTrialResult } from "../../scripts/lib/threadTrial.mts";

/**
 * Pokus 12 vs. 16 vláken monolitu (od 20. 10. 2026, deník 322).
 *
 * Pokus běží uvnitř noční expanze: polovina desek dostane šestnáct vláken,
 * druhá dvanáct, a vyhodnocuje se párově po rodinách, protože cena desky se
 * mezi rodinami liší víc než dvakrát.
 */
describe("čtení vláken z nočního logu", () => {
  it("vlákna se čtou z čerstvé desky i z desky s přesností a stropem", () => {
    const solves = parseBoardSolves([
      "[21:05:00] solving MTT9_40BB_HJ_SB_SRP 742r (vlákna 16)",
      "[21:40:00]   hotovo za 35.0 min, checkpoint 60 MB",
      "[21:41:00] solving MTT9_50BB_HJ_SB_SRP A72r (přesnost 1.0 %, strop 90 min, vlákna 12)",
      "[22:30:00]   hotovo za 49.0 min, checkpoint 80 MB",
      "[22:31:00] solving MTT9_25BB_CO_BB_SRP 883r",
      "[22:37:00]   hotovo za 6.0 min, checkpoint 20 MB",
    ]);
    expect(solves.map((solve) => solve.threads)).toEqual([16, 12, undefined]);
    // Stupeň a přesnost se čtou dál jako dřív.
    expect(solves.map((solve) => solve.level)).toEqual([0, 0, 0]);
  });
});

function families(count: number, control: number, trial: number): BoardSolve[] {
  const solves: BoardSolve[] = [];
  for (let at = 0; at < count; at += 1) {
    const family = `MTT9_40BB_F${at}_SRP`;
    // Rodiny jsou různě drahé, pokus to nesmí slít do rozdílu.
    const scale = 1 + at * 0.4;
    for (const [threads, minutes] of [[12, control], [12, control * 1.1], [16, trial], [16, trial * 1.1]] as const) {
      solves.push({ family, board: `b${threads}${minutes}`, depthBB: 40, level: 0, threads, minutes: minutes * scale });
    }
  }
  return solves;
}

describe("threadTrialResult", () => {
  it("pod minimem rodin se nerozhoduje", () => {
    const result = threadTrialResult(families(TRIAL_MIN_FAMILIES - 1, 20, 16));
    expect(result.verdict).toMatch(/^ještě měřit/);
    expect(result.families).toBe(TRIAL_MIN_FAMILIES - 1);
  });

  it("o pětinu rychlejší šestnáctka vyjde jako rychlejší, i když jsou rodiny různě drahé", () => {
    const result = threadTrialResult(families(10, 20, 16));
    expect(result.ratio).toBeCloseTo(0.8, 5);
    expect(result.verdict).toMatch(/^16 vláken je rychlejší/);
  });

  it("pomalejší šestnáctka vyjde jako pomalejší", () => {
    expect(threadTrialResult(families(10, 20, 24)).verdict).toMatch(/^16 vláken je pomalejší/);
  });

  it("bez rozdílu se pokus ukončí a zůstane dvanáct", () => {
    expect(threadTrialResult(families(10, 20, 20)).verdict).toMatch(/^rozdíl pod 5 %/);
  });

  it("opakované pokusy a desky mimo pokus se nepočítají", () => {
    const solves = [
      ...families(10, 20, 16),
      { family: "MTT9_40BB_F0_SRP", board: "retry", depthBB: 40, level: 1, threads: 16, minutes: 500 },
      { family: "MTT9_40BB_F0_SRP", board: "old", depthBB: 40, level: 0, minutes: 500 },
    ];
    expect(threadTrialResult(solves).ratio).toBeCloseTo(0.8, 5);
  });
});

describe("přidělení vláken v runneru (skutečný Python)", () => {
  const RUNNER = "Agents/solver-input/decomposition/run_night_expansion.py";

  function python(): string | undefined {
    for (const candidate of ["python3", "python"]) {
      const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (probe.status === 0) return candidate;
    }
    return undefined;
  }

  function run(lines: string[]): string {
    const interpreter = python();
    if (interpreter === undefined || !existsSync(RUNNER)) return "";
    const script = [
      "import importlib.util, json, os, sys",
      `sys.path.insert(0, os.path.dirname(${JSON.stringify(RUNNER)}))`,
      `spec = importlib.util.spec_from_file_location("expansion", ${JSON.stringify(RUNNER)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      ...lines,
    ].join("\n");
    const result = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  it("deska dostane vlákna deterministicky a rodiny se dělí zhruba napůl", () => {
    const out = run([
      "boards = ['742r', 'A72r', '883r', 'K98tt', 'AT4mono', 'T84r', 'J73r', 'Q76mono', '222r', '986tt']",
      "families = ['MTT9_40BB_HJ_SB_SRP', 'MTT9_50BB_CO_BB_SRP', 'MTT9_50BB_UTG_SB_SRP', 'MTT9_25BB_CO_BB_SRP']",
      "first = [m.trial_threads(f, b, 16) for f in families for b in boards]",
      "second = [m.trial_threads(f, b, 16) for f in families for b in boards]",
      "print(json.dumps({'same': first == second, 'values': sorted(set(first)), 'trial': first.count(16), 'all': len(first)}))",
    ]);
    if (out === "") return;
    const parsed = JSON.parse(out) as { same: boolean; values: number[]; trial: number; all: number };
    expect(parsed.same).toBe(true);
    expect(parsed.values).toEqual([12, 16]);
    // Hash, ne přesné střídání: stačí, že žádná skupina není prázdná ani většinová.
    expect(parsed.trial).toBeGreaterThan(parsed.all * 0.25);
    expect(parsed.trial).toBeLessThan(parsed.all * 0.75);
  });

  it("přepis parametrů mění jen vlákna a přesnost", () => {
    const out = run([
      "text = 'set_pot 550\\nset_thread_num 12\\nset_accuracy 0.5\\nset_board Ks,9s,8d\\n'",
      "bare = 'set_pot 550\\nset_accuracy 0.5\\n'",
      "print(json.dumps([m.adjusted_params(text, 0.5, 16), m.adjusted_params(text, 1.0),"
        + " m.adjusted_params(text, 0.5) == text, m.adjusted_params(bare, 0.5, 16)]))",
    ]);
    if (out === "") return;
    const [withThreads, withAccuracy, unchanged, added] = JSON.parse(out) as [string, string, boolean, string];
    expect(withThreads).toBe("set_pot 550\nset_thread_num 16\nset_accuracy 0.5\nset_board Ks,9s,8d\n");
    expect(withAccuracy).toBe("set_pot 550\nset_thread_num 12\nset_accuracy 1.0\nset_board Ks,9s,8d\n");
    expect(unchanged).toBe(true);
    // Parametry bez řádku vláken: pokus ho přidá, jinak by log lhal.
    expect(added).toBe("set_thread_num 16\nset_pot 550\nset_accuracy 0.5\n");
  });
});
