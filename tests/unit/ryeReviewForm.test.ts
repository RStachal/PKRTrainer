// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Formulář na stránce s draftem musí **doopravdy ukládat**.
 *
 * ## Proč to má vlastní test
 *
 * Protože se to jednou tiše rozbilo a poznal to až majitel: regulární výraz
 * `/^[vf]\d+$/` je uvnitř šablonového řetězce TypeScriptu, takže se `\d`
 * zkrátilo na `d`, výraz přestal sedět na jméno `v0` a **žádná odpověď se
 * neuložila**. Stránka přitom vypadala v pořádku - průběh se vykreslil, volby
 * šly zaškrtnout, jen se nic nepamatovalo.
 *
 * Vygenerovaná stránka je artefakt, ne zdroj, takže se test spustí jen tehdy,
 * když existuje. Kontroluje dvě věci, které se dají rozbít escapováním: že
 * skript projde parserem a že ten výraz v něm zůstal celý.
 */
const PAGE = "artifacts/rye-import/review.html";

describe("odpovídací formulář draftu", () => {
  it("nese neporušený výraz pro jména polí", () => {
    if (!existsSync(PAGE)) return;
    const html = readFileSync(PAGE, "utf8");
    // Řetězec se skládá po znacích schválně: zapsaný jako literál by ho jedno
    // escapování cestou zkrátilo a test by hlídal něco jiného, než co tvrdí.
    // Přesně tím se ta vada vyrobila.
    const backslash = String.fromCharCode(92);
    expect(html).toContain("/^[vf]" + backslash + "d+$/");
    expect(html).not.toContain("/^[vf]d+$/");
  });

  it("skript projde parserem", () => {
    if (!existsSync(PAGE)) return;
    const html = readFileSync(PAGE, "utf8");
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(script.length).toBeGreaterThan(500);
    // `node --check` přes stdin: syntaktická chyba by jinak byla vidět až
    // v prohlížeči, kde ji nikdo nehlídá.
    expect(() => execFileSync(process.execPath, ["--check", "-"], { input: script })).not.toThrow();
  });

  it("zůstává bez odkazů ven, takže funguje offline i z webu", () => {
    if (!existsSync(PAGE)) return;
    const html = readFileSync(PAGE, "utf8");
    expect(/(?:src|href)=["'](?:https?:)?\/\//.test(html)).toBe(false);
  });
});
