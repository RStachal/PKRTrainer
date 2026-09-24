// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { KEY_EVENTS, KEY_HH_REVIEWS, KEY_POSTFLOP_EVENTS } from "../../src/persistence/keys";
import { APP_LANGUAGE_STORAGE_KEY } from "../../src/ui/cs";

/**
 * Zvednuto z 30 s na 90 s dne 25. 8. 2026, potřetí ze stejného důvodu jako jinde:
 * **vyrostl obsah, ne pomalost kódu.**
 *
 * Naměřeno: soubor sám o sobě projde celý, ale v plné sadě test, který se
 * k dynamicky importovanému panelu dostane první, platí jeho studený překlad a
 * vyprší na třicítce. Transform celé sady je dnes 636 s.
 *
 * Strop není kontrola správnosti, jen pojistka proti zaseknutí: rozbitý test
 * spadne na tvrzení, ne na čase.
 *
 * **Počtvrté 24. 9. 2026, ze stejného důvodu.** Ráno se přegeneroval turn
 * a river čtyř přesolvených rodin a tříd rukou v nich přibylo o třetinu
 * (73 285 → 97 442); dodávaného obsahu je dnes 21 MB riveru, 17 MB turnu
 * a 4,9 MB flopu. Test „MTT preflop gate" startuje aplikaci pro každou
 * kombinaci formátu, rychlosti a ante, takže dotahování packů platí pokaždé
 * znovu - a v plné sadě, kde o stroj soupeří ostatní soubory, vypršel.
 *
 * Naměřeno týž den: **soubor sám projde celý, 16 testů za 532 s**, z toho
 * 185 s je transformace packů. Je to tedy zátěž, ne vada, a strop se zvedá
 * na 240 s. Až tohle přestane stačit, nezvedat ho popáté: to už bude
 * odpověď na příznak, ne na příčinu, a příčina je, že se při startu relace
 * dotahuje celá knihovna.
 */
vi.setConfig({ testTimeout: 240000 });

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
      .toEqual(["Training", "Stats", "HH Import"]);
    expect(root.querySelector<HTMLElement>(".app__tabs")?.getAttribute("role")).toBe("tablist");
    expect(root.querySelector<HTMLElement>(".app__tabs")?.getAttribute("aria-label"))
      .toBe("Primary sections");
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
      .toBe("Postflop training");
    expect(root.querySelector(".postflop-view")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-output")?.hidden).toBe(true);
    expect(root.querySelector(".postflop-meta")).toBeNull();
    expect(root.querySelector(".postflop-card")).toBeNull();
    expect(root.querySelector(".filter-start")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(true);
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("9-max regular chipEV preflop spusti lazy-loaded production pack", async () => {
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

    await waitForPreflopSession(root);

    expect(root.querySelector<HTMLElement>(".training__filters")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(false);
    expect(root.querySelector(".poker-table")).not.toBeNull();
    expect(root.querySelector(".action-btn")).not.toBeNull();
    expect(root.querySelectorAll(".action-btn .action-ev-bubble")).toHaveLength(
      root.querySelectorAll(".action-btn").length,
    );
    expect(root.querySelectorAll(".action-btn .action-ev-bubble:not([hidden])")).toHaveLength(0);
    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(true);
    expect(warning?.textContent).not.toMatch(/https?:|RangePack|mtt-/i);

    root.querySelector<HTMLButtonElement>(".action-btn")?.click();
    const events = JSON.parse(storage.getItem(KEY_EVENTS) ?? "[]") as Array<{
      identity?: {
        profileId?: string;
        rangePackId?: string;
      };
    }>;
    expect(events).toHaveLength(1);
    expect(events[0].identity?.profileId).toBe("MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE");
    expect(events[0].identity?.rangePackId)
      .toBe("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1");
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
    const notice = root.querySelector<HTMLElement>(".postflop-runtime-notice");
    expect(notice?.dataset.kind).toBe("PREVIEW");
    expect(notice?.textContent).toContain("náhledovém režimu");
    expect(notice?.textContent).not.toMatch(/https?:|www\.|source|zdroj|RangePack|StrategyPack|mtt-/i);
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

    // Riverové rozdání od 25. 8. 2026 čeká na tabulku EV, takže se spot
    // nevykreslí ve stejném ticku jako kliknutí. Čeká se na vykreslená
    // metadata, ne na pevný počet ticků - to druhé projde jen náhodou.
    await vi.waitFor(() => {
      expect(root.querySelector(".postflop-meta")).not.toBeNull();
    }, { timeout: 20000 });

    expect(root.querySelector<HTMLElement>(".app__panel--postflop")?.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>(".postflop-seed")?.value).toBe("");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.street).toBe("RIVER");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.dataset.actionNode)
      .toBe("RIVER_PRESSURE");
    expect(root.querySelector(".poker-table")).toBeNull();
  });

  it("9-max regular chipEV production pri quota selhani zobrazi notice bez ulozeni", async () => {
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    const storage = new QuotaAfterBootstrapStorage();
    document.body.appendChild(root);

    bootstrap({ root, storage, registerSw: false });
    storage.failWrites = true;
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();
    await waitForPreflopSession(root);
    root.querySelector<HTMLButtonElement>(".action-btn")?.click();

    const saveWarning = root.querySelector<HTMLElement>(".result__save-warning");
    expect(root.querySelector(".action-btn")).not.toBeNull();
    expect(saveWarning?.textContent).toContain("Výsledek se nepodařilo uložit");
    expect(saveWarning?.textContent).not.toMatch(/https?:|www\.|source|zdroj|RangePack|mtt-/i);
    expect(JSON.parse(storage.getItem(KEY_EVENTS) ?? "[]")).toEqual([]);
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

    await vi.waitFor(() => {
      expect(JSON.parse(storage.getItem(KEY_HH_REVIEWS) ?? "[]")).toHaveLength(1);
    }, { timeout: 25000 });
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
    expect(meta?.dataset.positionPattern).toBe("3BP_HJ_VS_LJ");
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

  it("6-max preflop profil spusti odvozeny nahled a rekne to hraci", async () => {
    // This used to assert six-max was refused, which was right while it had no
    // records. It has derived ones now - nine-handed records re-labelled by
    // seats-behind - so it starts, and what has to hold instead is that the
    // player is told what they are drilling before they drill it.
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    document.body.appendChild(root);

    bootstrap({ root, storage: new MemoryStorage(), registerSw: false });

    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    format!.value = "SIX_MAX";
    format!.dispatchEvent(new Event("change"));

    const note = root.querySelector<HTMLElement>(".profile-selector__note");
    expect(note?.dataset.status).toBe("preview");
    expect(note?.textContent).toContain("6-max");
    // Provenance, not marketing: derived from 9-max, with where it sits against
    // published six-max references stated rather than a single direction claimed.
    expect(note?.textContent).toMatch(/9-max/);
    expect(note?.textContent).toMatch(/6-max/);
    // And no internal identifiers leak into player-facing copy.
    expect(note?.textContent).not.toContain("mtt-six-max");
    expect(note?.textContent).not.toContain("derived-v1");

    root.querySelector<HTMLButtonElement>(".filter-start")?.click();
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(false);
    }, { timeout: 15000 });
    // A dealt table, which is the whole difference: this profile used to reach
    // the start button and stop there.
    expect(root.querySelector(".poker-table")).not.toBeNull();
  });

  it("MTT preflop gate respektuje readiness pro vsechny format/speed/ante kombinace", async () => {
    const { bootstrap } = await importFreshMain();
    const cases = [
      {
        format: "FULL_RING_9",
        speed: "REGULAR",
        ante: "ON",
        playable: true,
        warning: "kandidátní náhled",
      },
      {
        format: "FULL_RING_9",
        speed: "REGULAR",
        ante: "OFF",
        playable: true,
        warning: "kandidátní náhled",
      },
      {
        format: "FULL_RING_9",
        speed: "TURBO",
        ante: "ON",
        playable: true,
        warning: "chybí produkční range",
      },
      {
        format: "FULL_RING_9",
        speed: "TURBO",
        ante: "OFF",
        playable: true,
        warning: "chybí produkční range",
      },
      {
        // Regular six-max plays now, from ranges derived by seats-behind.
        // Turbo below still does not: deriving it would produce this pack under
        // another label, which the speed audit exists to refuse.
        format: "SIX_MAX",
        speed: "REGULAR",
        ante: "ON",
        playable: true,
      },
      {
        // Regular six-max plays now, from ranges derived by seats-behind.
        // Turbo below still does not: deriving it would produce this pack under
        // another label, which the speed audit exists to refuse.
        format: "SIX_MAX",
        speed: "REGULAR",
        ante: "OFF",
        playable: true,
      },
      {
        format: "SIX_MAX",
        speed: "TURBO",
        ante: "ON",
        playable: false,
        warning: "kandidátní náhled",
      },
      {
        format: "SIX_MAX",
        speed: "TURBO",
        ante: "OFF",
        playable: false,
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

      if (scenario.playable) {
        await waitForPreflopSession(root);
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
  }, 180_000);

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
    expect(warning?.textContent).toContain("kandidátní náhled");
    expect(warning?.textContent).toContain("Cash rake preview");
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

  it("globalni error boundary pouzije aktivni EN jazyk", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { bootstrap } = await importFreshMain();
    const root = document.createElement("div");
    const storage = new MemoryStorage();
    storage.setItem(APP_LANGUAGE_STORAGE_KEY, "EN");

    bootstrap({ root, storage, registerSw: false });
    window.dispatchEvent(new ErrorEvent("error", {
      error: new Error("simulated runtime failure"),
      message: "simulated runtime failure",
    }));

    const notice = root.querySelector<HTMLElement>(".app__notice");
    expect(notice?.hidden).toBe(false);
    expect(notice?.textContent).toContain("An unexpected application error occurred");
    expect(notice?.textContent).not.toContain("Došlo k neočekávané chybě");
  });

  it("playable preview stale respektuje nedostupny Range_Store", async () => {
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

    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>(".filter-empty-warning")?.hidden).toBe(false);
    }, { timeout: 25000 });
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
  // Stejná rezerva jako u preflopové relace, a ze stejného důvodu.
  //
  // Start relace teď na pozadí dotahuje deset turn packů. V prohlížeči jsou to
  // paralelní stahování, která nikomu nepřekáží; ve vitestu je z každého
  // transformace zhruba megabajtového modulu, a deset naráz blokuje smyčku na
  // vteřiny. Výchozí limit `vi.waitFor` na to nestačí, takže test padal na tom,
  // že se dashboard nestihl vykreslit - ne na tom, že by se nevykreslil.
  //
  // Zvednuto z 10 s na 25 s dne 24. 8. 2026 ze stejného důvodu, jen o řád dál:
  // dodávaného obsahu je 48 flopových, 32 turnových a 17 riverových rodin plus
  // 6,6 MB tabulek EV, takže celá sada trvá 359 s a v tom soupeření se render
  // přes deset vteřin protáhne. **Samostatně ten soubor projde** - ověřeno,
  // 16 testů - takže je to zátěž, ne vada.
  await vi.waitFor(() => {
    expect(root.querySelector(".dashboard")).not.toBeNull();
  }, { timeout: 25000 });
}

async function waitForPreflopSession(root: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(root.querySelector<HTMLElement>(".training__game")?.hidden).toBe(false);
    expect(root.querySelector(".poker-table")).not.toBeNull();
    // Stejná rezerva jako u dashboardu a ze stejného měřeného důvodu.
  }, { timeout: 25000 });
}
