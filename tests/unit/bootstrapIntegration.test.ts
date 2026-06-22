// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { KEY_EVENTS, KEY_HH_REVIEWS, KEY_POSTFLOP_EVENTS } from "../../src/persistence/keys";

vi.setConfig({ testTimeout: 30000 });

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

class QuotaAfterBootstrapStorage extends MemoryStorage {
  failWrites = false;

  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("quota exceeded");
    super.setItem(key, value);
  }
}

const validFlopHh = [
  "PokerStars Hand #2: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #8 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain9: posts small blind 10",
  "Villain1: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ks Qs]",
  "Hero: raises 40 to 60",
  "Villain1: calls 40",
  "*** FLOP *** [Ah 7d 2c]",
  "Villain1: checks",
  "Hero: bets 40",
  "*** SUMMARY ***",
].join("\n");

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
    expect(root.querySelector("style")?.textContent).toContain("@media (max-width:720px)");
    expect(root.querySelector("style")?.textContent).toContain("profile-selector__note--production");
    expect(root.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
    expect(root.querySelector('[data-tab="postflop"]')).toBeNull();
    expect(Array.from(root.querySelectorAll<HTMLElement>(".app__tab")).map((tab) => tab.textContent))
      .toEqual(["Trénink", "Statistiky", "Import HH"]);
    expect(root.querySelector<HTMLElement>(".app__tabs")?.getAttribute("role")).toBe("tablist");
    expect(root.querySelector<HTMLElement>(".app__tabs")?.getAttribute("aria-label"))
      .toBe("Hlavní sekce");
    expect(root.querySelector<HTMLButtonElement>('[data-tab="training"]')?.getAttribute("role"))
      .toBe("tab");
    expect(root.querySelector<HTMLButtonElement>('[data-tab="training"]')?.getAttribute("aria-controls"))
      .toBe("app-panel-training");
    expect(root.querySelector<HTMLButtonElement>('[data-tab="training"]')?.getAttribute("aria-selected"))
      .toBe("true");
    expect(root.querySelector<HTMLElement>("#app-panel-training")?.getAttribute("role"))
      .toBe("tabpanel");
    expect(root.querySelector<HTMLElement>("#app-panel-training")?.getAttribute("aria-labelledby"))
      .toBe("app-tab-training");
    expect(root.querySelector<HTMLElement>("#app-panel-postflop")?.getAttribute("aria-label"))
      .toBe("Postflop trénink");
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
    const storage = new MemoryStorage();
    document.body.appendChild(root);

    bootstrap({ root, storage, registerSw: false });

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
    expect(root.querySelector<HTMLButtonElement>(".training__change-situation")?.textContent)
      .toBe("Změnit situaci");
    expect(root.querySelector<HTMLElement>(".training__session-title")?.textContent)
      .toMatch(/^Proti 3-betu - (UTG|UTG\+1|UTG\+2|LJ|HJ|CO|BTN|SB|BB) - /);
    expect(root.querySelector<HTMLElement>(".training__session-title")?.textContent)
      .not.toContain("VS_3BET");
    expect(root.querySelector<HTMLElement>(".training__session-meta")?.textContent)
      .toContain("BB - ante ON - seed");
    expect(root.querySelector<HTMLElement>(".training__actions-title")?.textContent)
      .toBe("Vaše akce:");
    const actionLabels = Array.from(root.querySelectorAll<HTMLButtonElement>(".action-btn"))
      .map((button) => button.textContent ?? "");
    expect(actionLabels.join(" ")).not.toMatch(/[×Ă—]|2,5/);
    const firstAction = root.querySelector<HTMLButtonElement>(".action-btn");
    expect(document.activeElement).toBe(firstAction);

    firstAction?.click();
    expect(document.activeElement).toBe(root.querySelector<HTMLButtonElement>(".result__next"));
    expect(root.querySelector<HTMLElement>(".result__recommended")?.textContent)
      .toContain("Doporučení:");
    expect(root.querySelector<HTMLButtonElement>(".result__next")?.textContent)
      .toBe("Další spot");
    const preflopEvents = JSON.parse(storage.getItem(KEY_EVENTS) ?? "[]") as Array<{
      responseMs?: number;
      identity?: {
        scenarioId?: string;
        profileId?: string;
        rangePackId?: string;
        scoringMode?: string;
      };
    }>;
    expect(preflopEvents[0].responseMs).toEqual(expect.any(Number));
    expect(preflopEvents[0].responseMs).toBeGreaterThanOrEqual(0);
    expect(preflopEvents[0].identity).toMatchObject({
      profileId: "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE",
      rangePackId: "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-v1",
      scoringMode: "LENIENT",
    });
    expect(preflopEvents[0].identity?.scenarioId).toContain("preflop_scenario_v1");
    expect(root.querySelector<HTMLElement>(".training__result")?.textContent)
      .toMatch(/(?:Správně|Zatím ne).*Doporučení:.*Další spot/s);

    root.querySelector<HTMLButtonElement>(".training__change-situation")?.click();

    expect(root.querySelector<HTMLElement>(".training__filters")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector<HTMLSelectElement>(".profile-variant"));
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector(".action-btn")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__session-meta")?.textContent).toBe("");
  });

  it("start s FLOP profilem prepne do postflop flow bez rucniho tabovani", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    document.body.appendChild(root);

    bootstrap({ root, storage, registerSw: false });

    const street = root.querySelector<HTMLSelectElement>(".profile-street");
    const seed = root.querySelector<HTMLInputElement>(".filter-seed");
    street!.value = "FLOP";
    street!.dispatchEvent(new Event("change"));
    seed!.value = "123";
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    expect(root.querySelector<HTMLElement>(".app__panel--postflop")?.hidden).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-tab="postflop"]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-tab="training"]')
      ?.classList.contains("app__tab--active")).toBe(false);
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("FLOP");
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(document.activeElement).toBe(root.querySelector<HTMLButtonElement>(".postflop-action"));

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    expect(document.activeElement).toBe(root.querySelector<HTMLElement>(".postflop-result"));

    await waitForDashboard(root);
    expect(root.querySelector<HTMLElement>(".dashboard-session-count")?.dataset.sessionCount)
      .toBe("1");
    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("1");
    const postflopEvents = JSON.parse(storage.getItem(KEY_POSTFLOP_EVENTS) ?? "[]") as Array<{
      responseMs?: number;
    }>;
    expect(postflopEvents[0].responseMs).toEqual(expect.any(Number));
    expect(postflopEvents[0].responseMs).toBeGreaterThanOrEqual(0);
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
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("pri quota selhani preflop ulozeni pokracuje ve flow a zobrazi source-free warning", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    const storage = new QuotaAfterBootstrapStorage();
    document.body.appendChild(root);

    bootstrap({ root, storage, registerSw: false });
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();
    storage.failWrites = true;
    root.querySelector<HTMLButtonElement>(".action-btn")?.click();

    const warning = root.querySelector<HTMLElement>(".result__save-warning");
    expect(root.querySelector<HTMLButtonElement>(".result__next")).not.toBeNull();
    expect(warning?.textContent).toContain("nepodařilo uložit");
    expect(warning?.textContent).not.toMatch(/https?:|www\.|source|zdroj/i);
    await waitForDashboard(root);
    expect(root.querySelector<HTMLElement>(".summary-total")?.dataset.total).toBe("0");
  });

  it("pri quota selhani postflop ulozeni pokracuje ve flow a zobrazi source-free notice", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    const storage = new QuotaAfterBootstrapStorage();
    document.body.appendChild(root);

    bootstrap({ root, storage, registerSw: false });
    const street = root.querySelector<HTMLSelectElement>(".profile-street");
    street!.value = "FLOP";
    street!.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    storage.failWrites = true;
    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    const notice = root.querySelector<HTMLElement>(".app__notice");
    expect(root.querySelector<HTMLElement>(".postflop-result")).not.toBeNull();
    expect(notice?.hidden).toBe(false);
    expect(notice?.textContent).toContain("Postflop odpověď se nepodařilo uložit");
    expect(notice?.textContent).not.toMatch(/https?:|www\.|source|zdroj|RangePack|mtt-/i);
    await waitForDashboard(root);
    expect(root.querySelector<HTMLElement>(".dashboard-session-count")?.dataset.sessionCount)
      .toBe("1");
    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("0");
  });

  it("uklada HH review oddelene od drill statistik", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    document.body.appendChild(root);

    bootstrap({ root, storage, registerSw: false });

    const ante = root.querySelector<HTMLInputElement>(".filter-ante");
    ante!.checked = false;
    ante!.dispatchEvent(new Event("change"));
    const textarea = root.querySelector<HTMLTextAreaElement>(".hh-input");
    textarea!.value = validFlopHh;
    root.querySelector<HTMLButtonElement>(".hh-analyze")?.click();

    const reviewRecords = JSON.parse(storage.getItem(KEY_HH_REVIEWS) ?? "[]") as Array<{
      street: string;
      savedToDrillStats: boolean;
      board?: string[];
    }>;
    const preflopEvents = JSON.parse(storage.getItem(KEY_EVENTS) ?? "[]") as unknown[];
    const postflopEvents = JSON.parse(storage.getItem(KEY_POSTFLOP_EVENTS) ?? "[]") as unknown[];

    expect(reviewRecords).toHaveLength(1);
    expect(reviewRecords[0]).toMatchObject({
      street: "PREFLOP",
      savedToDrillStats: false,
    });
    const unavailable = root.querySelector<HTMLElement>(".hh-postflop-unavailable");
    expect(unavailable?.textContent).toContain(
      "není dostupná produkční postflop strategie",
    );
    expect(unavailable?.textContent).not.toMatch(/https?:|source|RangePack|mtt-/i);
    expect(root.querySelector(".hh-postflop-analysis")).toBeNull();
    expect(preflopEvents).toEqual([]);
    expect(postflopEvents).toEqual([]);
    await waitForDashboard(root);
    expect(root.querySelector<HTMLElement>(".summary-total")?.dataset.total).toBe("0");
    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("0");
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
    expect(meta?.textContent).toContain("bank 18 BB");
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

    await waitForDashboard(firstRoot);
    expect(firstRoot.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total)
      .toBe("1");

    main = await importFreshMain();
    const secondRoot = document.createElement("div");
    main.bootstrap({ root: secondRoot, storage, registerSw: false });

    await waitForDashboard(secondRoot);
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
    expect(warning?.textContent).toContain("kandidátní náhled");
    expect(warning?.textContent).toContain("Produkční trénink je vypnutý");
    expect(warning?.textContent).toContain("MTT 6-max regular preflop chipEV");
    expect(warning?.textContent).toContain("dokončení kontroly pokrytí");
    expect(warning?.textContent).not.toContain("Import preview:");
    expect(warning?.textContent).not.toContain("RangePack");
    expect(warning?.textContent).not.toContain("mtt-");
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
  });

  it("MTT preflop gate respektuje readiness pro vsechny format/speed/ante kombinace", async () => {
    const { bootstrap } = await importFreshMain();
    const cases = [
      {
        format: "FULL_RING_9",
        speed: "REGULAR",
        ante: "ON",
        production: true,
      },
      {
        format: "FULL_RING_9",
        speed: "REGULAR",
        ante: "OFF",
        production: true,
      },
      {
        format: "FULL_RING_9",
        speed: "TURBO",
        ante: "ON",
        production: false,
        warning: "chybí produkční range",
      },
      {
        format: "FULL_RING_9",
        speed: "TURBO",
        ante: "OFF",
        production: false,
        warning: "chybí produkční range",
      },
      {
        format: "SIX_MAX",
        speed: "REGULAR",
        ante: "ON",
        production: false,
        warning: "kandidátní náhled",
      },
      {
        format: "SIX_MAX",
        speed: "REGULAR",
        ante: "OFF",
        production: false,
        warning: "kandidátní náhled",
      },
      {
        format: "SIX_MAX",
        speed: "TURBO",
        ante: "ON",
        production: false,
        warning: "kandidátní náhled",
      },
      {
        format: "SIX_MAX",
        speed: "TURBO",
        ante: "OFF",
        production: false,
        warning: "kandidátní náhled",
      },
    ] as const;

    for (const scenario of cases) {
      const root = document.createElement("div");
      bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

      const format = root.querySelector<HTMLSelectElement>(".profile-format");
      const speed = root.querySelector<HTMLSelectElement>(".profile-speed");
      const ante = root.querySelector<HTMLInputElement>(".filter-ante");
      format!.value = scenario.format;
      format!.dispatchEvent(new Event("change"));
      speed!.value = scenario.speed;
      speed!.dispatchEvent(new Event("change"));
      ante!.checked = scenario.ante === "ON";
      ante!.dispatchEvent(new Event("change"));

      root.querySelector<HTMLButtonElement>(".filter-start")?.click();

      if (scenario.production) {
        expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(false);
        expect(root.querySelector(".poker-table")).not.toBeNull();
        expect(root.querySelector<HTMLElement>(".filter-empty-warning")?.hidden).toBe(true);
      } else {
        const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
        expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
        expect(root.querySelector(".poker-table")).toBeNull();
        expect(warning?.hidden).toBe(false);
        expect(warning?.textContent).toContain(scenario.warning);
      }
    }
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
    expect(warning?.textContent).toContain("kandidátní náhled");
    expect(warning?.textContent).toContain("SNG chipEV náhled");
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
    expect(warning?.textContent).toContain("kandidátní náhled");
    expect(warning?.textContent).toContain("Cash rake náhled");
    expect(warning?.textContent).not.toContain("https://");
    expect(warning?.textContent).not.toContain("RangePack");
    expect(root.querySelector(".poker-table")).toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
  });


  it("pri nekonzistentnim ulozisti zobrazi blokujici chybu a relaci nespusti", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");

    bootstrap({ root, storage: new BrokenWriteStorage(), registerSw: false });

    expect(root.querySelector(".fatal")?.textContent).toContain("Úložiště není konzistentní");
    expect(root.querySelector(".filter-start")).toBeNull();
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("pri nedostupnem Range_Store zobrazi filtry a zablokuje az production preflop start", async () => {
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

    expect(root.querySelector(".fatal")).toBeNull();
    expect(root.querySelector(".filter-start")).not.toBeNull();
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();

    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("Referenční range nejsou dostupné");
    expect(warning?.textContent).not.toContain("https://");
    expect(root.querySelector(".poker-table")).toBeNull();
  });
});

async function importFreshMain(): Promise<typeof import("../../src/main")> {
  document.body.innerHTML = "";
  vi.resetModules();
  return import("../../src/main");
}

async function waitForDashboard(root: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(root.querySelector(".dashboard")).not.toBeNull();
  });
}
