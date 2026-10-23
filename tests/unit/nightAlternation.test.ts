import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  alternateNight,
  nightKey,
  undecomposedBoards,
} from "../../scripts/lib/nightAlternation.mts";

/**
 * Střídání nocí mezi šířkou a prvním rozkladem (od 19. 10. 2026).
 *
 * Do té doby rozklad ustupoval expanzi celý, kdykoli byla nastagovaná práce -
 * a 19. 10. čekalo na první rozklad 349 desek (hlášeno 523 i s deskami jen pro
 * flop), zatímco fronta expanze měla kolem sedmnácti nocí. EV pro nové rodiny
 * by po celou tu dobu nepřibylo.
 */
describe("nightKey", () => {
  it("noc přes půlnoc je jedna noc - klíčem je večer, kterým začala", () => {
    expect(nightKey(new Date(2026, 9, 19, 21, 5))).toBe("2026-10-19");
    expect(nightKey(new Date(2026, 9, 20, 3, 0))).toBe("2026-10-19");
    expect(nightKey(new Date(2026, 9, 20, 14, 0))).toBe("2026-10-20");
  });
});

describe("alternateNight", () => {
  const base = { night: "2026-10-19", undecomposedBoards: 523 };

  it("po noci šířky přijde noc rozkladu", () => {
    const decision = alternateNight({
      ...base, wanted: "NEW_FAMILIES", previous: { priority: "NEW_FAMILIES", night: "2026-10-18" },
    });
    expect(decision.priority).toBe("DECOMPOSITION");
    expect(decision.alternated).toBe(true);
    expect(decision.reason).toContain("523");
  });

  it("po noci rozkladu přijde zase šířka", () => {
    expect(alternateNight({
      ...base, wanted: "NEW_FAMILIES", previous: { priority: "DECOMPOSITION", night: "2026-10-18" },
    }).priority).toBe("NEW_FAMILIES");
  });

  it("v téže noci se nestřídá podruhé", () => {
    expect(alternateNight({
      ...base, wanted: "NEW_FAMILIES", previous: { priority: "DECOMPOSITION", night: "2026-10-19" },
    }).priority).toBe("DECOMPOSITION");
    expect(alternateNight({
      ...base, wanted: "NEW_FAMILIES", previous: { priority: "NEW_FAMILIES", night: "2026-10-19" },
    }).priority).toBe("NEW_FAMILIES");
  });

  it("bez desek k rozkladu se nestřídá - šířka dostane všechny noci", () => {
    expect(alternateNight({
      night: "2026-10-19", undecomposedBoards: 0, wanted: "NEW_FAMILIES",
      previous: { priority: "NEW_FAMILIES", night: "2026-10-18" },
    }).priority).toBe("NEW_FAMILIES");
  });

  it("když orchestrátor sám chce rozklad, platí jeho volba", () => {
    expect(alternateNight({
      ...base, wanted: "DECOMPOSITION", previous: { priority: "DECOMPOSITION", night: "2026-10-18" },
    }).priority).toBe("DECOMPOSITION");
  });

  it("bez minulého rozhodnutí se začne šířkou", () => {
    expect(alternateNight({ ...base, wanted: "NEW_FAMILIES" }).priority).toBe("NEW_FAMILIES");
  });
});

describe("undecomposedBoards", () => {
  it("počítá vyřešené desky bez jediné turnové vrstvy; prázdný checkpoint nepočítá", () => {
    const root = mkdtempSync(join(tmpdir(), "undecomposed-"));
    const checkpoints = join(root, "ck");
    const decomposition = join(root, "dec");
    const family = "MTT9_40BB_CO_BB_SRP";
    mkdirSync(join(checkpoints, family, "raw"), { recursive: true });
    for (const [board, body] of [["742r", "{}"], ["A72r", "{}"], ["883r", "{}"], ["K98tt", ""]] as const) {
      writeFileSync(join(checkpoints, family, "raw", `pkrtrainer_${family}_${board}.json`), body, "utf8");
    }
    // 742r rozložená, A72r má jen plán (bez vrstvy), 883r nemá nic, K98tt je prázdný checkpoint.
    mkdirSync(join(decomposition, `${family}__742r`), { recursive: true });
    writeFileSync(join(decomposition, `${family}__742r`, "plan.json"), "{}", "utf8");
    writeFileSync(join(decomposition, `${family}__742r`, "CHECK_CHECK__2d.json"), "{}", "utf8");
    mkdirSync(join(decomposition, `${family}__A72r`), { recursive: true });
    writeFileSync(join(decomposition, `${family}__A72r`, "plan.json"), "{}", "utf8");
    expect(undecomposedBoards(checkpoints, decomposition)).toBe(2);
    // Deska jen pro flop (růst desek) se nepočítá: rozklad ji nikdy nevezme.
    writeFileSync(join(decomposition, "flop-only-boards.txt"), `${family}__883r\n`, "utf8");
    expect(undecomposedBoards(checkpoints, decomposition)).toBe(1);
  });
});

describe("expanze ustoupí v noci rozkladu (skutečný runner)", () => {
  function python(): string | undefined {
    for (const candidate of ["python3", "python"]) {
      const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (probe.status === 0) return candidate;
    }
    return undefined;
  }

  /** Volá `decomposition_has_the_night` s podvrženou prioritou a čerstvostí. */
  function hasTheNight(priority: string, fresh: boolean): string {
    const interpreter = python();
    if (interpreter === undefined) return "";
    const dir = resolve("Agents/solver-input/decomposition");
    const run = spawnSync(interpreter, ["-c", [
      "import importlib.util, json, os, sys, tempfile",
      `sys.path.insert(0, ${JSON.stringify(dir)})`,
      "import run_night_decomposition as d",
      "path = os.path.join(tempfile.mkdtemp(), 'tonight.json')",
      `open(path, 'w', encoding='utf8').write(json.dumps({'priority': ${JSON.stringify(priority)}}))`,
      "d.NIGHT_PRIORITY = path",
      `d._priority_is_fresh = lambda: ${fresh ? "True" : "False"}`,
      `spec = importlib.util.spec_from_file_location('exp', ${JSON.stringify(join(dir, "run_night_expansion.py"))})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "print(m.decomposition_has_the_night())",
    ].join("\n")], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    return run.stdout.trim();
  }

  it("čerstvá priorita DECOMPOSITION: ustoupí", () => {
    if (python() === undefined) return;
    expect(hasTheNight("DECOMPOSITION", true)).toBe("True");
  });

  it("NEW_FAMILIES, nebo rozhodnutí ze včerejška: jede dál jako dosud", () => {
    if (python() === undefined) return;
    expect(hasTheNight("NEW_FAMILIES", true)).toBe("False");
    expect(hasTheNight("DECOMPOSITION", false)).toBe("False");
  });
});
