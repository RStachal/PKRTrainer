// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(warning?.textContent).toContain("Cash s rakem preview");
    expect(warning?.textContent).not.toContain("https://");
    expect(warning?.textContent?.toLowerCase()).not.toContain("zdroj");
    expect(root.querySelector(".poker-table")).toBeNull();

    variant!.value = "MTT";
    variant!.dispatchEvent(new Event("change"));
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
    expect(root.querySelectorAll(".hh-analysis .matrix-cell")).toHaveLength(169);

    root.querySelector<HTMLButtonElement>('[data-tab="stats"]')?.click();
    root.querySelector<HTMLButtonElement>(".stats-export")?.click();
    const exported = root.querySelector<HTMLTextAreaElement>(".stats-json-box")?.value;
    expect(exported).toContain("postflopRecords");
    expect(exported).not.toContain("https://");
  });
});

async function importFreshMain(): Promise<typeof import("../../src/main")> {
  vi.resetModules();
  return import("../../src/main");
}
