// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { appStylesheet } from "../stylesheets";

/**
 * Zvednuto z 30 s na 90 s dne 25. 8. 2026, a je to potřetí ze stejného důvodu:
 * **vyrostl obsah, ne pomalost kódu.**
 *
 * Naměřeno: soubor projde celý za 37 s, ale test, který se k dashboardu dostane
 * první, platí jeho studený překlad a trvá **31,6 s** - proti stropu 30 s. Ten
 * samý test po předehřátí trvá **3,4 s**. Nebyla to tedy pomalá cesta, ale
 * překlad, který s knihovnou roste.
 *
 * Ověřeno, že to není moje regrese: se změnami i bez nich padal stejně
 * (1 failed, 2 passed, 36 s v obou případech).
 *
 * Strop není kontrola správnosti, jen pojistka proti zaseknutí. Rozbitý test
 * spadne na tvrzení, ne na čase.
 */
vi.setConfig({ testTimeout: 90000 });

class MemoryStorage implements Storage {
  protected readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const validHh = [
  "PokerStars Hand #1: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #1 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain2: posts small blind 10",
  "Villain3: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ah Kd]",
  "Hero: folds",
  "*** SUMMARY ***",
].join("\n");

describe("mobile / Android WebView smoke", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("udrzi hlavni workflow pouzitelny na malem viewportu bez URL citaci", async () => {
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 740, configurable: true });

    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    document.body.appendChild(root);

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    expect(root.querySelector(".filters")).not.toBeNull();
    expect(root.querySelector(".filter-start")).not.toBeNull();
    expect(root.querySelector(".profile-selector__note")).not.toBeNull();

    const variant = root.querySelector<HTMLSelectElement>(".profile-variant");
    variant!.value = "CASH";
    variant!.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("Cash rake preview");
    expect(warning?.textContent).not.toContain("https://");
    expect(warning?.textContent?.toLowerCase()).not.toContain("zdroj");
    expect(root.querySelector(".poker-table")).toBeNull();

    variant!.value = "MTT";
    variant!.dispatchEvent(new Event("change"));
    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    format!.value = "FULL_RING_9";
    format!.dispatchEvent(new Event("change"));
    const ante = root.querySelector<HTMLInputElement>(".filter-ante");
    ante!.checked = false;
    ante!.dispatchEvent(new Event("change"));
    const street = root.querySelector<HTMLSelectElement>(".profile-street");
    street!.value = "FLOP";
    street!.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    expect(root.querySelector<HTMLElement>(".app__panel--postflop")?.hidden).toBe(false);
    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelectorAll(".postflop-action").length).toBeGreaterThanOrEqual(3);
    expect(root.querySelector<HTMLElement>(".postflop-result")?.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    expect(root.querySelector<HTMLElement>(".postflop-result")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".postflop-result")?.textContent)
      .not.toContain("https://");

    root.querySelector<HTMLButtonElement>('[data-tab="hh"]')?.click();
    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();
    expect(root.querySelector(".hh-analysis")).not.toBeNull();
    await vi.waitFor(() => {
      expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(169);
    });

    root.querySelector<HTMLButtonElement>('[data-tab="stats"]')?.click();
    await waitForDashboard(root);
    root.querySelector<HTMLButtonElement>(".stats-export")?.click();
    const exported = root.querySelector<HTMLTextAreaElement>(".stats-json-box")?.value;
    expect(exported).toContain("postflopRecords");
    expect(exported).not.toContain("https://");

    const cssText = appStylesheet();
    expect(cssText.match(/prefers-reduced-motion/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(cssText).toContain("transform:none");
  });

  it("projde release mobile viewporty 360x800, 390x844 a 412x915", async () => {
    const viewports = [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
    ];

    for (const viewport of viewports) {
      document.body.innerHTML = "";
      vi.resetModules();
      Object.defineProperty(window, "innerWidth", { value: viewport.width, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: viewport.height, configurable: true });

      const { bootstrap } = await importFreshMain();
      const root = document.createElement("div");
      document.body.appendChild(root);

      bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

      expect(root.querySelector(".filters")).not.toBeNull();
      expect(root.querySelector<HTMLSelectElement>(".profile-street")).not.toBeNull();
      const street = root.querySelector<HTMLSelectElement>(".profile-street");
      street!.value = "FLOP";
      street!.dispatchEvent(new Event("change"));
      root.querySelector<HTMLButtonElement>(".filter-start")?.click();

      expect(root.querySelector(".postflop-table")).not.toBeNull();
      expect(root.querySelectorAll(".postflop-seat").length).toBeGreaterThanOrEqual(2);
      const boardCards = root.querySelectorAll(".postflop-table__board .postflop-card").length;
      expect(boardCards).toBeGreaterThanOrEqual(3);
      expect(boardCards).toBeLessThanOrEqual(5);
      root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
      expect(root.querySelector(".postflop-flopzilla__matrix")).not.toBeNull();
      expect(root.querySelectorAll(".postflop-flopzilla__cell")).toHaveLength(169);
      expect(root.textContent).not.toContain("https://");
    }
  });

  it("udrzi postflop stats po mobile reloadu se stejnym localStorage", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    const storage = new MemoryStorage();

    {
      const { bootstrap } = await importFreshMain();
      const root = document.createElement("div");
      document.body.appendChild(root);
      bootstrap({ root, storage, registerSw: false });

      const street = root.querySelector<HTMLSelectElement>(".profile-street");
      street!.value = "FLOP";
      street!.dispatchEvent(new Event("change"));
      root.querySelector<HTMLButtonElement>(".filter-start")?.click();
      root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
      expect(root.querySelector<HTMLElement>(".postflop-result")?.hidden).toBe(false);
    }

    {
      const { bootstrap } = await importFreshMain();
      const root = document.createElement("div");
      document.body.appendChild(root);
      bootstrap({ root, storage, registerSw: false });

      root.querySelector<HTMLButtonElement>('[data-tab="stats"]')?.click();
      await waitForDashboard(root);
      root.querySelector<HTMLButtonElement>(".stats-export")?.click();
      const exported = root.querySelector<HTMLTextAreaElement>(".stats-json-box")?.value ?? "";
      expect(exported).toContain("postflopRecords");
      expect(exported).toContain("POSTFLOP|FLOP");
      expect(exported).not.toContain("https://");
    }
  });
});

async function waitForDashboard(root: HTMLElement): Promise<void> {
  // Dashboard se načítá dynamickým importem, takže se při prvním otevření musí
  // celý přeložit. V plné sadě ho stihne předehřát jiný soubor a čekání je
  // krátké; při samostatném spuštění jde o studený překlad a výchozí limit
  // `vi.waitFor` na něj nestačí.
  //
  // Test tím procházel jen díky sousedům. To je horší než test, který padá:
  // tvrdí, že mobilní workflow funguje, a přitom se nikdy sám neověřil.
  //
  // Z 15 s na 45 s dne 25. 8. 2026: studený překlad dashboardu je dnes kolem
  // třiceti vteřin, takže patnáct byla mez pod naměřenou skutečností.
  await vi.waitFor(() => {
    expect(root.querySelector(".stats-export")).not.toBeNull();
  }, { timeout: 45000 });
}

async function importFreshMain(): Promise<typeof import("../../src/main")> {
  vi.resetModules();
  return import("../../src/main");
}
