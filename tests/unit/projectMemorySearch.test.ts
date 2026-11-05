import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { CLI_SPAWN_TIMEOUT_MS } from "../cliSpawnBudget";

/**
 * Brána na vyhledávání v paměti projektu.
 *
 * Měřicí nástroj potřebuje bránu stejně jako produkt - to je poučení z 26. 8.
 * 2026, kdy nekontrolovaný adresář `scripts/` schovával dvě měřidla vracející
 * nesmyslná čísla. Tady je to naléhavější: nejhorší selhání tohohle nástroje
 * není pád, ale **prázdný výsledek**. Ten se čte jako „paměť o tom nic neví",
 * tedy přesně jako svolení měřit znovu - a kvůli tomu nástroj vznikl.
 *
 * Zkouší se proto na faktu, o kterém je jisté, že v repozitáři je: že preflop
 * pack nemá `VS_OPEN` pro UTG+1 a UTG+2. Ten je zapsaný od 27. 8. 2026 v
 * komentáři u `srpSolverInputGap` a jeho přehlédnutí stálo 3. 9. prohledání
 * celého internetu.
 */
function known(query: string): string {
  return execFileSync(
    process.execPath,
    ["scripts/run-cli.mjs", "scripts/searchProjectMemory.mts", query],
    { encoding: "utf8", timeout: CLI_SPAWN_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
  );
}

describe("dotaz do paměti projektu", () => {
  it("najde fakt zapsaný v komentáři kódu, ne jen v deníku", () => {
    const out = known("VS_OPEN UTG+1");
    expect(out, "komentář u srpSolverInputGap je ten, kvůli kterému to vzniklo")
      .toContain("solverInputRanges.ts");
    expect(out).not.toContain("Nic nenalezeno");
  });

  it("hledá bez ohledu na diakritiku", () => {
    // Dotaz se píše z terminálu a často bez háčků. Kdyby to nenašlo nic,
    // vypadá to jako odpověď „nevíme" - a to je ta drahá chyba.
    expect(known("slevat")).toContain("Celkem");
  });

  it("na neznámé téma řekne, že nic neví, místo aby mlčelo", () => {
    const out = known("zcelanesmyslnydotaznaktereynicnenajde");
    expect(out).toContain("Nic nenalezeno");
  });
});
