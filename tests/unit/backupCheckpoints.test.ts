import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Záloha checkpointů (rozhodnutí D7, 3. 11. 2026): přírůstkově, atomicky, nikdy
 * v okně solveru - a z té zálohy jde checkpoint zase obnovit beze ztráty.
 * Skript se načítá přes `importlib`, takže se nespouští jeho `main()`.
 */
const SCRIPT = "scripts/backup/backup_checkpoints.py";

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

const ready = (): boolean => python() !== undefined && existsSync(SCRIPT);

function evaluate(body: string): unknown {
  const interpreter = python();
  if (interpreter === undefined) throw new Error("python není");
  const run = spawnSync(interpreter, ["-c", [
    "import importlib.util, json, os, tempfile, time",
    "from datetime import datetime",
    `spec = importlib.util.spec_from_file_location("backup", ${JSON.stringify(SCRIPT)})`,
    "m = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(m)",
    "root = tempfile.mkdtemp()",
    "base = os.path.join(root, 'out')",
    "target = os.path.join(root, 'zaloha')",
    "def checkpoint(family, board, text):",
    "    raw = os.path.join(base, family, 'raw')",
    "    os.makedirs(raw, exist_ok=True)",
    "    path = os.path.join(raw, f'pkrtrainer_{family}_{board}.json')",
    "    with open(path, 'w') as handle:",
    "        handle.write(text)",
    "    return path",
    body,
  ].join("\n")], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  expect(run.status, run.stderr).toBe(0);
  const lines = run.stdout.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  return JSON.parse(lines[lines.length - 1] ?? "null");
}

describe("záloha checkpointů", () => {
  it("balí jen nové a změněné, prázdné a cizí soubory vynechá", () => {
    if (!ready()) return;
    const result = evaluate([
      "first = checkpoint('MTT9_50BB_LJ_HJ_SRP', 'A72r', '{\"a\": 1}' * 1000)",
      "checkpoint('MTT9_50BB_LJ_HJ_SRP', '883r', '{\"b\": 2}')",
      "checkpoint('MTT9_40BB_HJ_BB_SRP', 'K98tt', '')",
      "open(os.path.join(base, 'MTT9_50BB_LJ_HJ_SRP', 'raw', 'x.json.failed'), 'w').write('rc=timeout')",
      "one = m.backup(base, target)",
      "two = m.backup(base, target)",
      "later = time.time() + 120",
      "os.utime(first, (later, later))",
      "three = m.backup(base, target)",
      "print(json.dumps([one['packed'], one['current'], two['packed'], two['current'], three['packed'], three['current']]))",
    ].join("\n"));
    expect(result).toEqual([2, 0, 0, 2, 1, 1]);
  });

  it("obnova vrátí bajt po bajtu tentýž checkpoint a existující nepřepíše", () => {
    if (!ready()) return;
    const result = evaluate([
      "text = '{\"strategy\": [0.25, 0.75]}' * 5000",
      "path = checkpoint('MTT9_50BB_HJ_BB_SRP', '986tt', text)",
      "kept = checkpoint('MTT9_50BB_HJ_BB_SRP', 'A72r', 'puvodni')",
      "m.backup(base, target)",
      "os.remove(path)",
      "open(kept, 'w').write('novejsi')",
      "restored = m.restore(base, target)",
      "print(json.dumps([restored, open(path).read() == text, open(kept).read()]))",
    ].join("\n"));
    expect(result).toEqual([1, true, "novejsi"]);
  });

  it("v okně solveru nebalí: po-pá 20-07 a celý víkend", () => {
    if (!ready()) return;
    const result = evaluate([
      // 3. 11. 2026 je úterý, 7. 11. sobota.
      "cases = [(2026, 11, 3, 10), (2026, 11, 3, 19), (2026, 11, 3, 20), (2026, 11, 3, 6), (2026, 11, 7, 12), (2026, 11, 9, 7)]",
      "print(json.dumps([m.solver_window(datetime(y, mo, d, h)) for y, mo, d, h in cases]))",
    ].join("\n"));
    expect(result).toEqual([false, false, true, true, true, false]);
  });
});
