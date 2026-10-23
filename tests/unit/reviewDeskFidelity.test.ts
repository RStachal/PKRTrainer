import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CLI_SPAWN_TIMEOUT_MS } from "../cliSpawnBudget";

/**
 * Brána na čtecí stránky má vlastní bránu.
 *
 * Ze stejného důvodu jako každé jiné měřidlo tady: nejhorší selhání není pád,
 * ale **prázdný výsledek, který se čte jako „nic se neztratilo"**. A není to
 * teoretická obava - první verze `checkReviewDeskFidelity` hledala buňky přes
 * `class="cell"`, jenže buňky mřížky žádnou třídu nemají. Kontrola tedy vracela
 * nulu vždycky a nad úmyslně rozbitou stránkou prošla. Odhalilo to teprve to,
 * že jsem tu stránku rozbil schválně.
 */
function fidelity(desk: string): { out: string; code: number } {
  try {
    const out = execFileSync(
      process.execPath,
      ["scripts/run-cli.mjs", "scripts/checkReviewDeskFidelity.mts", `--desk=${desk}`],
      { encoding: "utf8", timeout: CLI_SPAWN_TIMEOUT_MS },
    );
    return { out, code: 0 };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; status?: number };
    return { out: `${detail.stdout ?? ""}${detail.stderr ?? ""}`, code: detail.status ?? 1 };
  }
}

describe("kontrola věrnosti čtecích stránek", () => {
  it("prázdná stránka pilotů neprojde jako „beze ztráty“", () => {
    const desk = mkdtempSync(join(tmpdir(), "desk-"));
    // Stránka bez jediné buňky je nejtvrdší případ prázdného výsledku: kdyby
    // výrazy přestaly sedět, vypadá to stejně jako dokonalá shoda.
    writeFileSync(join(desk, "piloty.html"), "<html><body>nic</body></html>", "utf8");
    const result = fidelity(desk);
    expect(result.code, "fail-closed, ne tiché nic").toBe(1);
    expect(result.out).toContain("Stránka kreslí míň");
  });

  it("chybějící věta o sedačce spadne sama o sobě", () => {
    // Bod 223: bez „čí strategii vidíš" četl majitel range v přesvědčení, že
    // patří jiné sedačce, a vydal blokující nález. Ta věta je součást obsahu,
    // ne dekorace, takže její ztráta musí být měřitelná.
    const desk = mkdtempSync(join(tmpdir(), "desk-"));
    writeFileSync(join(desk, "piloty.html"), "<html><body>nic</body></html>", "utf8");
    const result = fidelity(desk);
    expect(result.out).toContain("čí strategii vidíš");
  });
});
