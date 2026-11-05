import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Soubor podhry patří ke konkrétní položce plánu, ne k první se stejnou kartou.
 *
 * Tohle mě jednou zmátlo natolik, že jsem na základě špatného párování napsal do
 * fronty tvrzení o „prohozených indexech" a přidal k němu varovný komentář v
 * kódu. Ve skutečnosti `BET17_CALL__2c.json` patří lince bez úvodního checku a
 * `CHECK_BET17_CALL__2c.json` té s ním - obě mají turnovou kartu 2c a obě leží
 * ve stejném adresáři. Kdo je spáruje podle karty, porovná strategii jednoho
 * uzlu s ranži druhého a dostane nesmysl, který vypadá jako nález.
 *
 * Test drží pravidlo na skutečných datech: jméno souboru se odvozuje z celé
 * linky.
 */
const ROOT = "artifacts/decomposition";

function fileNameOf(item: { line?: string[]; turn?: string }): string {
  const parts = (item.line ?? []).map((action) => {
    const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
    if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
    return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
  });
  return `${parts.join("_") || "ROOT"}__${item.turn}.json`;
}

describe("párování podher s položkami plánu", () => {
  it("dvě linky se stejnou turnovou kartou mají různé soubory", () => {
    // Vymyšlený případ, aby test platil i bez artefaktů na disku.
    const withCheck = fileNameOf({ line: ["CHECK", "BET 17.000000", "CALL"], turn: "2c" });
    const withoutCheck = fileNameOf({ line: ["BET 17.000000", "CALL"], turn: "2c" });
    expect(withCheck).toBe("CHECK_BET17_CALL__2c.json");
    expect(withoutCheck).toBe("BET17_CALL__2c.json");
    expect(withCheck).not.toBe(withoutCheck);
  });

  it("odvozené jméno sedí na skutečné soubory na disku", () => {
    if (!existsSync(ROOT)) return;
    const directories = readdirSync(ROOT).filter((name) => name.includes("__")).slice(0, 12);
    let checked = 0;
    let missing = 0;
    for (const directory of directories) {
      const planPath = join(ROOT, directory, "plan.json");
      if (!existsSync(planPath)) continue;
      const plan = JSON.parse(readFileSync(planPath, "utf8")) as {
        items?: { line?: string[]; turn?: string }[];
      };
      for (const item of (plan.items ?? []).slice(0, 6)) {
        checked += 1;
        if (!existsSync(join(ROOT, directory, fileNameOf(item)))) missing += 1;
      }
    }
    if (checked === 0) return;
    // Nevyřešená položka soubor nemá, takže nula být nemusí; většina ale ano, a
    // rozpadlé odvození by se projevilo tím, že nesedí skoro nic.
    expect(missing / checked).toBeLessThan(0.5);
  });
});
