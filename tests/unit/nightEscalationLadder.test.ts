import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Žebřík pokusů: kolik minut a jakou přesnost noc desce dá.
 *
 * ## Proč to má test až teď
 *
 * Žebřík vznikl 6. 10. 2026 a do 9. 10. ho **nekryl ani jeden test**, přitom
 * rozhoduje o tom nejdražším, co noc má - o minutách okna. Dvakrát se v něm
 * přitom našla vada, kterou žádná brána nechytila:
 *
 *  - 7. 10.: jakmile základní strop hloubky dojde na strop stropů, `min(90+30, 90)`
 *    je pořád 90, takže stupeň přestane být stupněm a deska se zkouší znovu
 *    s úplně stejným povolením - devadesát minut okna za nic.
 *  - 9. 10.: po rozhodnutí 2c se přesnost stala funkcí hloubky, ale dvě místa
 *    v runneru ji dál brala z `ESCALATION[level]`, takže by 50 bb běželo na
 *    0,5 % dál a log by u toho tvrdil 1 %.
 *
 * Obojí je tichá vada: nic nespadne, jen se solví dráž nebo zbytečně.
 */
const RUNNER = "Agents/solver-input/decomposition/run_night_expansion.py";

function python(): string | undefined {
  for (const candidate of ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return undefined;
}

/**
 * Pustí úryvek nad načteným runnerem a vrátí **poslední** řádek jeho `stdout`.
 *
 * Runner se načítá přes `importlib`, takže se nespouští jeho `main()`. Dvě věci
 * jsou tu schválně:
 *
 *  - Cena desky se **vnucuje** do `_COST_CACHE['rows']` místo čtení ze souboru.
 *    Test má měřit žebřík, ne to, co zrovna naměřila noc - jinak by se jeho
 *    výsledek měnil pod rukama po každém ránu. Klíč je `rows`, protože ten čte
 *    `board_cost()`; s jiným by si tabulku přečetla ze souboru a vnucení by
 *    tiše nic nedělalo.
 *  - Bere se poslední řádek, protože `board_cost()` o přečtené tabulce **píše
 *    do stdout**. Na témhle už jednou spadl `nightPriorityYield.test.ts`.
 */
function evaluate(script: string): string {
  const interpreter = python();
  if (interpreter === undefined) return "";
  const run = spawnSync(interpreter, ["-c", [
    "import importlib.util, json",
    `spec = importlib.util.spec_from_file_location("night", ${JSON.stringify(RUNNER)})`,
    "m = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(m)",
    // Strop podle hloubky, jak ho tabulka nese 9. 10. 2026.
    "m._COST_CACHE['rows'] = {25: {'capMinutes': 30, 'reserveMinutes': 14},",
    "                         40: {'capMinutes': 80, 'reserveMinutes': 38},",
    "                         50: {'capMinutes': 90, 'reserveMinutes': 79}}",
    script,
  ].join("\n")], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  expect(run.status, run.stderr).toBe(0);
  const lines = run.stdout.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines[lines.length - 1] ?? "";
}

const ready = (): boolean => python() !== undefined && existsSync(RUNNER);

describe("žebřík nočních pokusů", () => {
  it("mělká hloubka přidává minuty po třiceti a nejvýš do stropu stropů", () => {
    if (!ready()) return;
    const out = evaluate(
      "print(json.dumps([m.caps_for('MTT9_25BB_CO_BTN_SRP', i) for i in range(3)]))",
    );
    // 30 → 60 → 90, přesnost 0,5 % a poslední stupeň volnější.
    expect(JSON.parse(out)).toEqual([[30, 0.5], [60, 0.5], [60, 1.0]]);
  });

  it("50 bb se solví na 1 % od prvního pokusu - rozhodnutí vlastníka 2c", () => {
    /*
     * Vlastníkův důvod: „turnStrategyResolver i riverStrategyResolver berou rozdíl
     * EV do 1 % potu jako rovnocennou odpověď", takže 0,5 % platí noci za přesnost,
     * kterou hodnocení zahodí. Cena té volby je asi čtyři noci z osmi.
     */
    if (!ready()) return;
    const out = evaluate(
      "print(json.dumps([m.caps_for('MTT9_50BB_BTN_BB_SRP', i) for i in range(3)]))",
    );
    const levels = JSON.parse(out) as [number, number][];
    for (const [, accuracy] of levels) expect(accuracy).toBe(1.0);
    // Jediný smysluplný stupeň navíc je strop; třetí už nic nepřidá.
    expect(levels[0]).toEqual([90, 1.0]);
    expect(levels[1]).toEqual([150, 1.0]);
    expect(levels[2]).toEqual([150, 1.0]);
  });

  it("stupeň, který nedá nic navíc, se přeskočí", () => {
    /*
     * U 50 bb jsou stupně 1 a 2 shodné `(150, 1.0)`, takže po pádu na stupni 1
     * nemá cenu zkoušet dál. `next_useful_level` musí vrátit za poslední stupeň,
     * ne další index - jinak noc spálí strop na tentýž pokus.
     */
    if (!ready()) return;
    const out = evaluate([
      "print(json.dumps({",
      "  'z0': m.next_useful_level('MTT9_50BB_BTN_BB_SRP', 0),",
      "  'z1': m.next_useful_level('MTT9_50BB_BTN_BB_SRP', 1),",
      "  'mělká': m.next_useful_level('MTT9_25BB_CO_BTN_SRP', 0),",
      "  'stupňů': len(m.ESCALATION),",
      "}))",
    ].join("\n"));
    const got = JSON.parse(out) as Record<string, number>;
    expect(got.z0).toBe(1);
    expect(got.z1).toBe(got["stupňů"]);
    expect(got["mělká"]).toBe(1);
  });

  it("parametry dostanou jinou přesnost i na stupni nula", () => {
    /*
     * Tohle je ta vada z 9. 10.: `param_for_level` se volal jen pro `level > 0`
     * a přesnost bral z `ESCALATION[level][1]`. Čerstvá deska na 50 bb by tedy
     * běžela na 0,5 % - změna by se nikde neprojevila, jen by noc stála víc.
     */
    if (!ready()) return;
    const out = evaluate([
      "import os, tempfile",
      "d = tempfile.mkdtemp()",
      "src = os.path.join(d, 'params.txt')",
      "open(src, 'w', encoding='utf-8').write('set_accuracy 0.5\\nbuild_tree\\n')",
      "cp = os.path.join(d, 'chk')",
      "deep = m.param_for_level(src, 'MTT9_50BB_BTN_BB_SRP', 0, cp)",
      "shallow = m.param_for_level(src, 'MTT9_25BB_CO_BTN_SRP', 0, cp)",
      "print(json.dumps({",
      "  'hluboka_je_kopie': deep != src,",
      "  'hluboka_text': open(deep, encoding='utf-8').read().splitlines()[0],",
      "  'melka_je_original': shallow == src,",
      "}))",
    ].join("\n"));
    const got = JSON.parse(out) as Record<string, unknown>;
    expect(got.hluboka_je_kopie).toBe(true);
    expect(got.hluboka_text).toBe("set_accuracy 1.0");
    // Mělká hloubka chce tutéž přesnost, jakou nesou vygenerované parametry,
    // takže se nekopíruje: kopie v `PARAMS` by se přečetla jako další deska.
    expect(got.melka_je_original).toBe(true);
  });
});
