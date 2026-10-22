import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pořadí desek v turnové fázi noci rozkladu (od 22. 10. 2026, deník 325).
 *
 * Rodiny 25 bb přesolvené na nové range dodávaly flop z nového řešení a turn
 * s riverem ze zářijového, protože rozklad bere desky od nejhlubších a mělké
 * nechává na konec. Vlastník souhlasil, aby desky dodávaných packů bez
 * rozkladu šly hned po rozdělaných. Test spouští skutečný Python runneru.
 */
const RUNNER = "Agents/solver-input/decomposition/run_night_decomposition.py";

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
    "import importlib.util, json, sys",
    `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
    "m = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(m)",
    ...lines,
  ].join("\n");
  const result = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe("board_priority", () => {
  it("rozdělané, pak desky dodávaných packů bez rozkladu, pak od nejhlubších", () => {
    const out = run([
      "shipped = {'MTT9_25BB_UTG_LJ_SRP__742r', 'MTT9_25BB_UTG_LJ_SRP__883r'}",
      "boards = [",
      "  (('MTT9_50BB_UTG_CO_SRP', 'A72r'), 0.0, 50),",   // nerozložená hluboká
      "  (('MTT9_25BB_UTG_LJ_SRP', '883r'), 0.0, 25),",   // dodávaný pack, bez rozkladu
      "  (('MTT9_40BB_HJ_BB_SRP', 'K98tt'), 0.4, 40),",   // rozdělaná
      "  (('MTT9_25BB_UTG_LJ_SRP', '742r'), 1.0, 25),",   // dodávaný pack, už rozložená
      "  (('MTT9_25BB_UTG_LJ_SRP', '742r'), 0.0, 25),",   // dodávaný pack, bez rozkladu
      "  (('MTT9_80BB_BTN_BB_SRP', '883r'), 0.0, 80),",   // nerozložená nejhlubší
      "]",
      "ordered = sorted(boards, key=lambda b: m.board_priority(b[0], b[1], b[2], shipped))",
      "print(json.dumps([[b[0][0], b[0][1], b[1]] for b in ordered]))",
    ]);
    if (out === "") return;
    expect(JSON.parse(out)).toEqual([
      ["MTT9_40BB_HJ_BB_SRP", "K98tt", 0.4],
      ["MTT9_25BB_UTG_LJ_SRP", "742r", 0.0],
      ["MTT9_25BB_UTG_LJ_SRP", "883r", 0.0],
      ["MTT9_80BB_BTN_BB_SRP", "883r", 0.0],
      ["MTT9_50BB_UTG_CO_SRP", "A72r", 0.0],
      ["MTT9_25BB_UTG_LJ_SRP", "742r", 1.0],
    ]);
  });
});

describe("shipped_pack_boards", () => {
  it("bere desky z pravidel dodávaných turnových packů a nečitelný soubor přeskočí", () => {
    const dir = mkdtempSync(join(tmpdir(), "turn-packs-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "mtt9-25bb-utg-lj-srp.generated.json"), JSON.stringify({
      rules: [
        { sourceDirectory: "MTT9_25BB_UTG_LJ_SRP__742r" },
        { sourceDirectory: "MTT9_25BB_UTG_LJ_SRP__742r" },
        { sourceDirectory: "MTT9_25BB_UTG_LJ_SRP__883r" },
        null,
      ],
    }), "utf8");
    writeFileSync(join(dir, "rozbity.generated.json"), "{nejde", "utf8");
    writeFileSync(join(dir, "manifest.ts"), "export {}", "utf8");
    const out = run([`print(json.dumps(sorted(m.shipped_pack_boards(${JSON.stringify(dir)}))))`]);
    if (out === "") return;
    expect(JSON.parse(out)).toEqual(["MTT9_25BB_UTG_LJ_SRP__742r", "MTT9_25BB_UTG_LJ_SRP__883r"]);
  });
});
