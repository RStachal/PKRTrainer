import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Kdy noční rozklad ustoupí monolitickému solvingu.
 *
 * Noc umí dvě práce a nemůže obě naráz, protože každá si vezme celý stroj:
 * rozložit existující checkpointy, nebo odsolvit nové rodiny. Runner to
 * rozhodoval sám podle pravidla ve svém kódu - „turn napřed, pak river" - a to
 * bylo správné, dokud turn chyběl. Po jeho dokončení dvě noci prohluboval pět
 * dvojic sedaček, zatímco trenažér se ptá na dvaatřicet vzorů.
 *
 * Rozhodnutí proto přichází z denního měření. Tenhle test hlídá tu část, kde se
 * dá udělat nejdražší chyba: **ustoupit do prázdna**. Priorita říká, která práce
 * je cennější, ne že se má stroj v noci vypnout - když není čím tu cennější
 * spustit, rozklad pokračuje.
 */
const RUNNER = "Agents/solver-input/decomposition/run_night_decomposition.py";

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

function evaluate(script: string): string {
  const interpreter = python();
  if (interpreter === undefined) return "";
  const run = spawnSync(interpreter, ["-c", [
    "import importlib.util, json",
    `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
    "m = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(m)",
    script,
  ].join("\n")], { encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  return run.stdout.trim();
}

describe("noční priorita", () => {
  it("neustoupí, když priorita chybí", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.NIGHT_PRIORITY = 'nonexistent-file.json'",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    expect(JSON.parse(out)).toBeNull();
  });

  it("neustoupí do prázdna, když nástupce není nainstalovaný", () => {
    // Tohle je ta nejdražší chyba: rozklad by se vypnul, monolitický solve by
    // nenaběhl a noc by neodvedla vůbec nic.
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.should_yield_to_new_families.__globals__['monolithic_runner_installed'] = lambda: False",
      "m.should_yield_to_new_families.__globals__['staged_families_without_checkpoint'] = lambda: {'X'}",
      "import json, tempfile, os",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      "open(path, 'w', encoding='utf8').write(json.dumps({'priority': 'NEW_FAMILIES', 'reason': 'test'}))",
      "m.should_yield_to_new_families.__globals__['NIGHT_PRIORITY'] = path",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    expect(JSON.parse(out)).toBeNull();
  });

  it("neustoupí, když není nastagovaná práce", () => {
    // Priorita bez čekající práce znamená, že se má rozkládat dál. Práce jsou
    // desky bez checkpointu (od 14. 9. 2026), ne rodiny bez jediného.
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.should_yield_to_new_families.__globals__['monolithic_runner_installed'] = lambda: True",
      "m.should_yield_to_new_families.__globals__['staged_families_without_checkpoint'] = lambda: set()",
      "m.should_yield_to_new_families.__globals__['staged_boards_without_checkpoint'] = lambda: 0",
      "import json, tempfile, os",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      "open(path, 'w', encoding='utf8').write(json.dumps({'priority': 'NEW_FAMILIES', 'reason': 'test'}))",
      "m.should_yield_to_new_families.__globals__['NIGHT_PRIORITY'] = path",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    expect(JSON.parse(out)).toBeNull();
  });

  it("neustoupí kvůli hrstce desek: uvolnit noc kvůli hodině práce je horší", () => {
    // Pod prahem se ustoupit nevyplatí. Expanze by frontu vyprázdnila za chvíli
    // a zbytek okna by stál - proto se rozkládá dál.
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.should_yield_to_new_families.__globals__['monolithic_runner_installed'] = lambda: True",
      "m.should_yield_to_new_families.__globals__['staged_families_without_checkpoint'] = lambda: {'A', 'B'}",
      "m.should_yield_to_new_families.__globals__['staged_boards_without_checkpoint'] = lambda: 3",
      "import json, tempfile, os",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      "open(path, 'w', encoding='utf8').write(json.dumps({'priority': 'NEW_FAMILIES', 'reason': 'test'}))",
      "m.should_yield_to_new_families.__globals__['NIGHT_PRIORITY'] = path",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    expect(JSON.parse(out)).toBeNull();
  });

  it("ustoupí, jen když je priorita i nástupce i práce", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.should_yield_to_new_families.__globals__['monolithic_runner_installed'] = lambda: True",
      "m.should_yield_to_new_families.__globals__['staged_families_without_checkpoint'] = lambda: {'A', 'B'}",
      // Počet desek se podstrkuje taky. Bez toho četl test skutečný disk a
      // procházel jen proto, že tam zrovna čekalo dost práce - takže měřil
      // prostředí, ne kód. Když se všechny nastagované desky odsolvily, spadl.
      "m.should_yield_to_new_families.__globals__['staged_boards_without_checkpoint'] = lambda: 24",
      "import json, tempfile, os",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      "open(path, 'w', encoding='utf8').write(json.dumps({'priority': 'NEW_FAMILIES', 'reason': 'malo vzoru'}))",
      "m.should_yield_to_new_families.__globals__['NIGHT_PRIORITY'] = path",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    const message = JSON.parse(out) as string | null;
    expect(message).not.toBeNull();
    // Hláška musí nést důvod: kdo ráno čte log, se musí dozvědět, proč se
    // nerozkládalo, aniž by dohledával, co bylo v prioritě.
    expect(message).toContain("malo vzoru");
    expect(message).toContain("2 rodin");
  });

  it("ustoupí kvůli deskám i tam, kde každá rodina už nějaký checkpoint má", () => {
    // Dosolvení dalších desek existujícím rodinám (`mtt:board-growth`): žádná
    // rodina není „bez jediného checkpointu", a přesto čeká 174 desek. Do
    // 14. 9. 2026 by se tu neustoupilo a oba runnery by jely naráz.
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.should_yield_to_new_families.__globals__['monolithic_runner_installed'] = lambda: True",
      "m.should_yield_to_new_families.__globals__['staged_families_without_checkpoint'] = lambda: set()",
      "m.should_yield_to_new_families.__globals__['staged_boards_without_checkpoint'] = lambda: 174",
      "import json, tempfile, os",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      "open(path, 'w', encoding='utf8').write(json.dumps({'priority': 'NEW_FAMILIES', 'reason': 'river nasycený'}))",
      "m.should_yield_to_new_families.__globals__['NIGHT_PRIORITY'] = path",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    const message = JSON.parse(out) as string | null;
    expect(message).not.toBeNull();
    expect(message).toContain("174 desek");
    expect(message).toContain("0 rodin bez jediného");
  });

  it("priorita DECOMPOSITION nechá rozklad běžet", () => {
    if (python() === undefined || !existsSync(RUNNER)) return;
    const out = evaluate([
      "m.should_yield_to_new_families.__globals__['monolithic_runner_installed'] = lambda: True",
      "m.should_yield_to_new_families.__globals__['staged_families_without_checkpoint'] = lambda: {'A'}",
      "import json, tempfile, os",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      "open(path, 'w', encoding='utf8').write(json.dumps({'priority': 'DECOMPOSITION', 'reason': 'test'}))",
      "m.should_yield_to_new_families.__globals__['NIGHT_PRIORITY'] = path",
      "print(json.dumps(m.should_yield_to_new_families()))",
    ].join("\n"));
    expect(JSON.parse(out)).toBeNull();
  });
});
