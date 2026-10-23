import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Kolik kol zapisuje solver, podle toho, kolik karet leží na stole.
 *
 * Tohle je jediné pravidlo v celé dekompozici, jehož porušení nikdo nepozná.
 * Riverová podhra se `set_dump_rounds 1` se odsolvuje, vypíše konvergenci, vrátí
 * nula — a nezapíše nic. Celá noční riverová fáze by proběhla a na disku by
 * nebyl jediný soubor; hlášení by přitom tvrdilo, že solver umřel na stromě.
 *
 * Změřeno na skutečném solveru: čtyřkaretní deska s jedničkou píše turnovou
 * vrstvu, pětikaretní s jedničkou nepíše nic a s dvojkou 29 898 B. Trojka a
 * čtyřka dají bajt po bajtu totéž, protože po riveru už žádná ulice není.
 *
 * Opačný směr je stejně důležitý: turnová podhra s dvojkou by zapsala celou
 * riverovou vrstvu, tedy stovky megabajtů na uzel. Právě proto dekompozice
 * existuje.
 */
const SOLVE_PLAN = "Agents/solver-input/decomposition/solve_plan.py";

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    if (spawnSync(candidate, ["--version"], { encoding: "utf8" }).status === 0) return candidate;
  }
  return undefined;
}

describe("dekompozice: kolik kol se zapisuje", () => {
  it("turn zapisuje jedno kolo, river dvě", () => {
    const interpreter = python();
    if (interpreter === undefined || !existsSync(SOLVE_PLAN)) return;

    const script = [
      "import importlib.util, json",
      `spec = importlib.util.spec_from_file_location("solve_plan", ${JSON.stringify(SOLVE_PLAN)})`,
      "m = importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(m)",
      "boards = [",
      "  ['9s', '9h', '9d', '2c'],",
      "  ['9s', '9h', '9d', '2c', '2d'],",
      "]",
      "print(json.dumps([m.dump_rounds_for(b) for b in boards]))",
    ].join("\n");

    const run = spawnSync(interpreter, ["-c", script], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const [turn, river] = JSON.parse(run.stdout.trim()) as number[];

    expect(turn, "turnová podhra: dvojka by zapsala celou riverovou vrstvu").toBe(1);
    expect(river, "riverová podhra: jednička nezapíše nic a solver to neřekne").toBe(2);
  });
});
