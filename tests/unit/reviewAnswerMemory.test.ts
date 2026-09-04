// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { CLI_SPAWN_TIMEOUT_MS } from "../cliSpawnBudget";

/**
 * Čtecí stránky si musí odpověď **doopravdy pamatovat** - a pamatovat si ji
 * u té mřížky, u které padla.
 *
 * ## Proč to má vlastní test
 *
 * Dvakrát se to tiše rozešlo. Poprvé escapováním: regulární výraz `/^[vf]\d+$/`
 * byl uvnitř šablonového řetězce, `\d` se zkrátilo na `d`, výraz přestal sedět
 * na jméno pole a **neuložilo se nic**. Stránka přitom vypadala v pořádku -
 * průběh se vykreslil, volby šly zaškrtnout, jen se nic nepamatovalo.
 *
 * Podruhé identitou: ukládal se seznam podle **pozice na stránce**, jenže
 * pořadí se mění s obsahem a půlka `--only=CHIP` má pořadí vlastní. Uložená
 * odpověď by se po přegenerování nebo po přepnutí půlky zaškrtla u cizí mřížky
 * a nepoznalo by se to - čísla by seděla, jen by patřila jinam.
 *
 * Test proto nekontroluje tvar zdroje, ale **chování stránky**: vykreslí se
 * nad malým draftem, skript se spustí v jsdom a odpovědi se zaškrtávají tak,
 * jak by to udělal člověk.
 */

const FIXTURE = {
  createdAt: "2026-09-04",
  confidence: "LOW",
  assumptions: ["Testovací draft."],
  recordCount: 3,
  records: [
    {
      position: "BB",
      bucket: 100,
      context: "VS_OPEN",
      vsSeat: "BTN",
      stackSetupId: "F3B",
      sourceStackBB: 100,
      strict: { AA: ["3BET"], KK: ["3BET"] },
      lenient: { AA: ["3BET"], KK: ["3BET", "CALL"] },
      notes: [],
      sourceFile: "F3B-100BB-BB-vs-BTN.html",
    },
    {
      position: "BB",
      bucket: 100,
      context: "VS_OPEN",
      vsSeat: "CO",
      stackSetupId: "ICM",
      sourceStackBB: 100,
      strict: { AA: ["3BET"] },
      lenient: { AA: ["3BET"] },
      notes: [],
      sourceFile: "ICM-100BB-BB-vs-CO.html",
    },
    {
      position: "BB",
      bucket: 100,
      context: "VS_OPEN",
      vsSeat: "LJ",
      stackSetupId: "F3B",
      sourceStackBB: 100,
      strict: { QQ: ["CALL"] },
      lenient: { QQ: ["CALL"] },
      notes: [],
      sourceFile: "F3B-100BB-BB-vs-LJ.html",
    },
  ],
};

const workDir = mkdtempSync(join(tmpdir(), "review-memory-"));
const draftPath = join(workDir, "draft.json");
writeFileSync(draftPath, JSON.stringify(FIXTURE), "utf8");

function render(script: string, args: readonly string[]): string {
  const outPath = join(workDir, `${args.join("-").replace(/[^a-z0-9]/gi, "") || "page"}.html`);
  execFileSync(
    process.execPath,
    ["scripts/run-cli.mjs", script, ...args, `--out=${outPath}`],
    { encoding: "utf8", timeout: CLI_SPAWN_TIMEOUT_MS },
  );
  return readFileSync(outPath, "utf8");
}

function ryePage(args: readonly string[] = []): string {
  return render("scripts/renderRyeDraftReview.mts", [`--draft=${draftPath}`, ...args]);
}

/** Vloží stránku do jsdom a spustí její skript tak, jako by ji otevřel prohlížeč. */
function open(html: string): void {
  // Adresa se čistí schválně: fragment má u načtení přednost před úložištěm,
  // takže by se jinak testovala paměť adresy místo paměti prohlížeče.
  history.replaceState(null, "", "/");
  const inner = html.replace(/^[\s\S]*?<html[^>]*>/, "").replace(/<\/html>\s*$/, "");
  document.documentElement.innerHTML = inner;
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
  expect(script.length, "stránka bez skriptu si nic nezapamatuje").toBeGreaterThan(500);
  new Function(script)();
}

function click(name: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  expect(input, `pole ${name}=${value} na stránce chybí`).not.toBeNull();
  input!.checked = true;
  input!.dispatchEvent(new Event("change", { bubbles: true }));
}

function stored(key: string): string {
  return localStorage.getItem(key) ?? "";
}

describe("paměť odpovědí na čtecích stránkách", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uloží odpověď pod identitou záznamu, ne pod jeho pozicí na stránce", () => {
    const chip = ryePage(["--only=CHIP"]);
    const ids = [...chip.matchAll(/class="verdict" data-id="(\d+)"/g)].map((match) => match[1]);
    // Půlka vykreslí dva záznamy z tří, a nese jejich **indexy v draftu**.
    // Vykreslené pořadí je jiné (řadí se podle dopadu) - a přesně proto se
    // odpověď nesmí vázat na pozici.
    expect([...ids].sort()).toEqual(["0", "2"]);
    expect(ids, "pořadí na stránce není pořadím v draftu").not.toEqual(["0", "2"]);

    open(chip);
    click("v2", "o");
    expect(stored("drillev-rye-answers-v2")).toBe("2o");
  });

  it("odpověď přežije zavření stránky", () => {
    const chip = ryePage(["--only=CHIP"]);
    open(chip);
    click("v2", "x");
    click("f2", "1");

    open(chip);
    const radio = document.querySelector<HTMLInputElement>('input[name="v2"][value="x"]');
    const flag = document.querySelector<HTMLInputElement>('input[name="f2"][value="1"]');
    expect(radio?.checked, "verdikt se po znovuotevření nezaškrtl").toBe(true);
    expect(flag?.checked, "výtka se po znovuotevření nezaškrtla").toBe(true);
  });

  it("druhá půlka draftu nepřepíše odpovědi té první", () => {
    const full = ryePage();
    const chip = ryePage(["--only=CHIP"]);

    // Odpověď na ICM záznam padne v celém draftu; ta půlka ho nevykresluje.
    open(full);
    click("v1", "o");
    expect(stored("drillev-rye-answers-v2")).toBe("1o");

    open(chip);
    click("v0", "x");
    expect(stored("drillev-rye-answers-v2"), "odpověď z druhé půlky se ztratila").toBe("0x 1o");

    // A vrátí se na svém místě, ne o jedno vedle.
    open(full);
    expect(document.querySelector<HTMLInputElement>('input[name="v1"][value="o"]')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="v0"][value="x"]')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="v2"][value="o"]')?.checked).toBe(false);
  });

  it("export nese identifikátory a předponu, kterou čeká zapisovač odpovědí", () => {
    open(ryePage());
    click("v0", "o");
    click("v2", "x");
    document.getElementById("share")?.dispatchEvent(new Event("click", { bubbles: true }));
    const box = document.getElementById("export") as HTMLTextAreaElement | null;
    expect(box?.value).toBe("DRILLEV-REVIEW-V2 0o 2x");
  });

  it("průběh počítá jen to, co je na téhle stránce, a zbytek přizná zvlášť", () => {
    open(ryePage());
    click("v1", "o");
    open(ryePage(["--only=CHIP"]));
    expect(document.getElementById("progress")?.textContent)
      .toBe("hotovo 0 z 2 (+1 jinde v draftu)");
  });

  it("nepřebírá odpovědi uložené k jinému obsahu", () => {
    const pilots = render("scripts/renderFlopPilotReview.mts", []);
    localStorage.setItem("drillev-pilot-answers-v1", "deadbeef 0o");
    open(pilots);
    expect(
      document.querySelector<HTMLInputElement>('input[name="v0"][value="o"]')?.checked,
      "verdikt zapsaný nad jiným obsahem by tvrdil přečteno o něčem, co nikdo neviděl",
    ).toBe(false);
    expect((document.getElementById("stale-warning") as HTMLElement | null)?.hidden).toBe(false);
  });

  it("emitovaný skript neobsahuje zpětné lomítko, kterým se to jednou rozbilo", () => {
    const backslash = String.fromCharCode(92);
    for (const html of [ryePage(), render("scripts/renderFlopPilotReview.mts", [])]) {
      const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
      expect(script).not.toContain(backslash);
    }
  });

  it("zůstává bez odkazů ven, takže funguje offline i z FTP", () => {
    for (const html of [ryePage(), render("scripts/renderFlopPilotReview.mts", [])]) {
      expect(/(?:src|href)=["'](?:https?:)?\/\//.test(html)).toBe(false);
    }
  });
});

/**
 * Vygenerované stránky jsou artefakt, ne zdroj, takže se kontrolují jen když
 * existují. Hlídá se na nich to, co se na fixtuře ověřit nedá: že je na disku
 * skutečně ta verze, která si odpovědi pamatuje podle identity.
 */
describe("stránky ležící v artifacts", () => {
  for (const page of [
    "artifacts/rye-import/review.html",
    "artifacts/pilot-review/review.html",
    "artifacts/review-desk/index.html",
  ]) {
    it(`${page} je bez odkazů ven a se skriptem, který projde parserem`, () => {
      if (!existsSync(page)) return;
      const html = readFileSync(page, "utf8");
      expect(/(?:src|href)=["'](?:https?:)?\/\//.test(html)).toBe(false);
      const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
      expect(script.length).toBeGreaterThan(500);
      // `node --check` přes stdin: syntaktická chyba by jinak byla vidět až
      // v prohlížeči, kde ji nikdo nehlídá.
      expect(() => execFileSync(process.execPath, ["--check", "-"], { input: script })).not.toThrow();
    });
  }

  it("draft ranží drží odpovědi podle indexu v draftu", () => {
    const page = "artifacts/rye-import/review-chip.html";
    if (!existsSync(page)) return;
    const html = readFileSync(page, "utf8");
    const ids = [...html.matchAll(/class="verdict" data-id="(\d+)"/g)].map((match) => Number(match[1]));
    // Půlka nese identifikátory z celého draftu, takže poslední je vyšší než
    // počet vykreslených mřížek. Poziční číslování by tuhle vlastnost nemělo.
    expect(ids.length).toBeGreaterThan(0);
    expect(Math.max(...ids)).toBeGreaterThan(ids.length - 1);
  });
});
