// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 15000 });

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

class BrokenWriteStorage extends MemoryStorage {
  override setItem(_key: string, _value: string): void {
    throw new Error("write denied");
  }
}

describe("bootstrap - inicializacni tok", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.doUnmock("../../src/data/ranges");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("zobrazi filtry a pred explicitnim startem negeneruje spot", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    expect(root.querySelector(".filters")).not.toBeNull();
    expect(root.querySelector('[data-tab="postflop"]')).not.toBeNull();
    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(root.querySelector(".postflop-meta")).toBeNull();
    expect(root.querySelector(".postflop-card")).toBeNull();
    expect(root.querySelector(".filter-start")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("preflop stul zobrazi az v samostatne otazce po startu", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    expect(root.querySelector<HTMLElement>(".training__filters")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
    expect(root.querySelector(".poker-table")).toBeNull();

    root.querySelector<HTMLInputElement>('.filter-context[data-context="VS_3BET"]')!.checked = true;
    root.querySelector<HTMLInputElement>('.filter-context[data-context="VS_3BET"]')!
      .dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    expect(root.querySelector<HTMLElement>(".training__filters")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(false);
    expect(root.querySelector(".poker-table")).not.toBeNull();
    expect(root.querySelector(".training__change-situation")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".training__session-title")?.textContent)
      .toMatch(/^Proti 3-betu - (UTG|UTG\+1|UTG\+2|LJ|HJ|CO|BTN|SB|BB) - /);
    expect(root.querySelector<HTMLElement>(".training__session-title")?.textContent)
      .not.toContain("VS_3BET");
    expect(root.querySelector<HTMLElement>(".training__session-meta")?.textContent)
      .toContain("BB - ante ON - seed");

    root.querySelector<HTMLButtonElement>(".training__change-situation")?.click();

    expect(root.querySelector<HTMLElement>(".training__filters")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector(".action-btn")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__session-meta")?.textContent).toBe("");
  });

  it("start s FLOP profilem prepne do postflop flow bez rucniho tabovani", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const street = root.querySelector<HTMLSelectElement>(".profile-street");
    const seed = root.querySelector<HTMLInputElement>(".filter-seed");
    street!.value = "FLOP";
    street!.dispatchEvent(new Event("change"));
    seed!.value = "123";
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    expect(root.querySelector<HTMLElement>(".app__panel--postflop")?.hidden).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-tab="postflop"]')
      ?.classList.contains("app__tab--active")).toBe(true);
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("123");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("FLOP");
    expect(root.querySelector(".poker-table")).toBeNull();

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expect(root.querySelector<HTMLElement>(".dashboard-session-count")?.dataset.sessionCount)
      .toBe("1");
    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--street .postflop-breakdown-row[data-group="FLOP"]',
      )?.dataset.total,
    ).toBe("1");
  });

  it("start s RIVER profilem spusti river postflop flow", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const street = root.querySelector<HTMLSelectElement>(".profile-street");
    const seed = root.querySelector<HTMLInputElement>(".filter-seed");
    street!.value = "RIVER";
    street!.dispatchEvent(new Event("change"));
    seed!.value = "321";
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    expect(root.querySelector<HTMLElement>(".app__panel--postflop")?.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("321");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("postflop start respektuje vybrane pozice a kontext z filtru", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const street = root.querySelector<HTMLSelectElement>(".profile-street");
    const seed = root.querySelector<HTMLInputElement>(".filter-seed");
    street!.value = "FLOP";
    street!.dispatchEvent(new Event("change"));
    root.querySelector<HTMLInputElement>('.filter-position[data-position="LJ"]')!.checked = true;
    root.querySelector<HTMLInputElement>('.filter-position[data-position="LJ"]')!
      .dispatchEvent(new Event("change"));
    root.querySelector<HTMLInputElement>('.filter-position[data-position="HJ"]')!.checked = true;
    root.querySelector<HTMLInputElement>('.filter-position[data-position="HJ"]')!
      .dispatchEvent(new Event("change"));
    root.querySelector<HTMLInputElement>('.filter-context[data-context="VS_3BET"]')!.checked = true;
    root.querySelector<HTMLInputElement>('.filter-context[data-context="VS_3BET"]')!
      .dispatchEvent(new Event("change"));
    seed!.value = "1788246284";

    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    const meta = root.querySelector<HTMLElement>(".postflop-meta");
    expect(root.querySelector<HTMLElement>(".app__panel--postflop")?.hidden).toBe(false);
    expect(meta?.dataset.seed).toBe("1788246284");
    expect(meta?.dataset.street).toBe("FLOP");
    expect(meta?.dataset.actionNode).toBe("THREE_BET_POT_CBET");
    expect(meta?.dataset.potType).toBe("THREE_BET_POT");
    expect(meta?.dataset.positionPattern).toBe("OOP_CALLER_VS_IP_3BETTOR");
    expect(meta?.textContent).toContain("3bet pot");
    expect(meta?.textContent).toContain("pot 18 BB");
    expect(meta?.textContent).toContain("LJ vs HJ");
    expect(meta?.textContent).not.toContain("BTN vs BB");
  });

  it("postflop breakdown prezije reload aplikace", async () => {
    const storage = new MemoryStorage();
    let main = await importFreshMain();
    const firstRoot = document.createElement("div");

    main.bootstrap({ root: firstRoot, storage, registerSw: false });

    const street = firstRoot.querySelector<HTMLSelectElement>(".profile-street");
    street!.value = "FLOP";
    street!.dispatchEvent(new Event("change"));
    firstRoot.querySelector<HTMLButtonElement>(".filter-start")?.click();
    firstRoot.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expect(firstRoot.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total)
      .toBe("1");

    main = await importFreshMain();
    const secondRoot = document.createElement("div");
    main.bootstrap({ root: secondRoot, storage, registerSw: false });

    expect(secondRoot.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total)
      .toBe("1");
    expect(
      secondRoot.querySelector<HTMLElement>(
        '.postflop-breakdown--street .postflop-breakdown-row[data-group="FLOP"]',
      )?.dataset.total,
    ).toBe("1");
  });

  it("candidate 6-max preflop profil nespusti legacy 9-max drill", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    format!.value = "SIX_MAX";
    format!.dispatchEvent(new Event("change"));

    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("candidate/preview");
    expect(warning?.textContent).toContain("Produkcni trening se nespusti");
    expect(warning?.textContent).toContain("6-max MTT preflop preview");
    expect(warning?.textContent).not.toContain("Import preview:");
    expect(warning?.textContent).not.toContain("RangePack");
    expect(warning?.textContent).not.toContain("mtt-");
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
  });

  it("SNG chipEV candidate profil zustane preview a nespusti produkcni scoring", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const variant = root.querySelector<HTMLSelectElement>(".profile-variant");
    variant!.value = "SNG";
    variant!.dispatchEvent(new Event("change"));

    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("candidate/preview");
    expect(warning?.textContent).toContain("SNG chipEV preview");
    expect(warning?.textContent).not.toContain("https://");
    expect(warning?.textContent).not.toContain("RangePack");
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
  });

  it("Cash candidate profil zustane preview a nespusti produkcni scoring", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const variant = root.querySelector<HTMLSelectElement>(".profile-variant");
    variant!.value = "CASH";
    variant!.dispatchEvent(new Event("change"));

    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("candidate/preview");
    expect(warning?.textContent).toContain("Cash RAKE preview");
    expect(warning?.textContent).not.toContain("https://");
    expect(warning?.textContent).not.toContain("RangePack");
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
  });


  it("pri nekonzistentnim ulozisti zobrazi blokujici chybu a relaci nespusti", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new BrokenWriteStorage(), registerSw: false });

    expect(root.querySelector(".fatal")?.textContent).toContain("Nekonzistent");
    expect(root.querySelector(".filter-start")).toBeNull();
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("pri nedostupnem Range_Store zobrazi blokujici chybu a relaci nespusti", async () => {
    vi.doMock("../../src/data/ranges", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/data/ranges")>();
      return {
        ...actual,
        getRangeDataErrors: () => ["simulated range load failure"],
        isRangeDataLoaded: () => false,
      };
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    expect(root.querySelector(".fatal")?.textContent).toContain("ranges");
    expect(root.querySelector(".filter-start")).toBeNull();
    expect(root.querySelector(".poker-table")).toBeNull();
  });
});

async function importFreshMain(): Promise<typeof import("../../src/main")> {
  document.body.innerHTML = "";
  vi.resetModules();
  return import("../../src/main");
}
