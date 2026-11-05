import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Verdikt musí říct, kterou ulici člověk četl.
 *
 * Nezadaná ulice se dřív tiše brala jako TURN. To byla past přesně tam, kde
 * bolí: kdo přečetl celou rodinu - flop, turn i river, což je jeden spot s
 * týmiž hráči a stacky - a zapsal verdikt, zapsal ho jen turnu. Flop a river
 * zůstaly LOW a nic to neřeklo; poznalo by se to až tím, že se obsah nehnul do
 * produkce.
 *
 * Verdikt je záznam o tom, co člověk viděl, takže se radši nezapíše nic, než
 * aby se zapsalo něco jiného.
 */
const VERDICTS = "Agents/turn-review/verdicts.json";

function runCli(args: readonly string[]) {
  return spawnSync("node", ["scripts/run-cli.mjs", "scripts/reviewTurnFamily.mts", ...args], {
    encoding: "utf8",
  });
}

describe("zápis verdiktu", () => {
  it("bez uvedené ulice se nezapíše a řekne proč", { timeout: 120000 }, () => {
    const before = existsSync(VERDICTS) ? readFileSync(VERDICTS, "utf8") : null;

    const run = runCli(["--family=MTT9_20BB_BTN_BB_SRP_LOWSPR", "--accept", "--reviewer=test"]);
    expect(run.status, run.stdout).toBe(2);
    expect(run.stderr).toContain("--street=");
    // A hlavně: nesmí zapsat. Hláška bez tohohle by byla jen ozdoba.
    const after = existsSync(VERDICTS) ? readFileSync(VERDICTS, "utf8") : null;
    expect(after).toBe(before);
  });

  it("neznámou rodinu odmítne, místo aby zapsala prázdno", { timeout: 120000 }, () => {
    const run = runCli(["--family=NENI_TAKOVA_RODINA", "--street=TURN", "--accept"]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("nedodává");
  });
});
