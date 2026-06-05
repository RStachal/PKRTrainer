// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import type { Filters } from "../../src/core/types";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import type { PostflopStatsV2BridgeRecord } from "../../src/persistence/postflopResultRecord";
import { createStatsStore, type ResultRecord } from "../../src/persistence/statsStore";
import { renderDashboard } from "../../src/ui/dashboard";
import { renderFilters } from "../../src/ui/filters";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

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

const record: ResultRecord = {
  qid: "RFI|BTN|25|AKs|OFF",
  chosen: "OPEN_2X",
  correct: true,
  context: "RFI",
  position: "BTN",
  bucket: 25,
  ts: 1,
};

const postflopRecord: PostflopStatsV2BridgeRecord = {
  schema: "postflop_stats_v2_bridge_v1",
  qid: "POSTFLOP|FLOP|1|As-Kd-Qh",
  correct: true,
  ts: 2,
  profileId: "MTT|FULL_RING_9|REGULAR|FLOP|CHIP_EV|ON|NONE",
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  rakeMode: "NONE",
  actionNode: "SINGLE_RAISED_POT_CBET",
  potType: "SINGLE_RAISED",
  boardTextureKey: "dry|ace-high|disconnected",
  heroPosition: "BTN",
  villainPosition: "BB",
  positionPattern: "BTN_VS_BB",
  chosen: "BET_SMALL",
  recommended: "BET_SMALL",
  strategyPackId: "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
  strategyRuleId: "flop-srp-ace-high-disconnected-small-cbet",
  confidence: "LOW",
};

describe("filters - DOM start gate", () => {
  it("onStart se zavola pouze po kliknuti na Start a seed parsing funguje", () => {
    const root = document.createElement("div");
    const starts: Array<{
      filters: Filters;
      seed: number | null;
      profile: TrainingProfile;
    }> = [];
    const view = renderFilters(root, {
      onStart: (filters, seed, profile) => starts.push({ filters, seed, profile }),
    });

    expect(root.querySelector(".filters")?.textContent).toContain("Training profile");
    expect(root.querySelector(".filters")?.textContent).toContain("Positions");
    expect(root.querySelector(".filters")?.textContent).toContain("Stack depths (BB)");
    expect(root.querySelector(".filters")?.textContent).toContain("Action context");
    expect(root.querySelector(".filters")?.textContent).toContain("Start training");
    expect(root.querySelector(".filters")?.textContent).not.toMatch(/[ĂĹÄŤĹˇĹľ]/);
    expect(root.querySelectorAll(".filter-position")).toHaveLength(9);
    expect(root.querySelectorAll(".filter-bucket")).toHaveLength(13);
    expect(root.querySelectorAll(".filter-context")).toHaveLength(9);
    expect(root.querySelector(".profile-selector")).not.toBeNull();
    expect(view.getProfile()).toMatchObject({
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
    });
    expect(starts).toHaveLength(0);
    expect(view.getSeed()).toBeNull();

    root.querySelector<HTMLInputElement>(".filter-position")?.click();
    root.querySelector<HTMLInputElement>('.filter-bucket[data-bucket="25"]')?.click();
    const speed = root.querySelector<HTMLSelectElement>(".profile-speed");
    expect(speed).not.toBeNull();
    speed!.value = "TURBO";
    speed!.dispatchEvent(new Event("change"));
    expect(starts).toHaveLength(0);

    root.querySelector<HTMLButtonElement>(".filter-start")?.click();
    expect(starts).toHaveLength(1);
    expect(starts[0].seed).toBeNull();
    expect(starts[0].filters.buckets).toEqual([25]);
    expect(starts[0].profile).toMatchObject({
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
    });

    const seedInput = root.querySelector<HTMLInputElement>(".filter-seed");
    expect(seedInput).not.toBeNull();
    seedInput!.value = "123";
    root.querySelector<HTMLButtonElement>(".filter-start")?.click();
    expect(starts.at(-1)?.seed).toBe(123);
  });

  it("showEmptyResult zobrazi varovani a zachova vyber filtru", () => {
    const root = document.createElement("div");
    const view = renderFilters(root, { onStart: () => undefined });
    const firstPosition = root.querySelector<HTMLInputElement>(".filter-position");

    firstPosition!.checked = true;
    view.showEmptyResult();

    const warning = root.querySelector<HTMLElement>(".filter-empty-warning");
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toContain("do not match any spot");
    expect(firstPosition!.checked).toBe(true);
  });
});

describe("dashboard - DOM statistiky", () => {
  it("zobrazi summary, streak, session count a prazdne skupiny jako nedostupne", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);
    expect(store.record(record).ok).toBe(true);

    const root = document.createElement("div");
    renderDashboard({ store, sessionCount: 1 }, root);

    const css = root.querySelector("style")?.textContent ?? "";
    expect(css).toContain("linear-gradient(180deg,rgba(18,25,38,.98)");
    expect(css).toContain("@media (max-width:640px)");
    expect(css).toContain(".stats-json-box");
    expect(css).toContain(".dashboard-kpi__cards");
    expect(css).toContain(".dashboard-kpi-chart-row");
    expect(css).toContain(".preflop-leak-charts");
    expect(css).not.toContain("background:#fff");
    expect(root.textContent ?? "").toContain("Summary");
    expect(root.textContent ?? "").toContain("KPI");
    expect(root.textContent ?? "").toContain("Current session");
    expect(root.textContent ?? "").toContain("Stats export / import");
    expect(root.textContent ?? "").not.toMatch(/[ĂĹÄŤĹˇĹľ]/);

    expect(root.querySelector<HTMLElement>(".summary-total")?.dataset.total).toBe("1");
    expect(root.querySelector<HTMLElement>(".summary-rate")?.dataset.rate).toBe("100");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi")?.dataset.total).toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='lifetimeRate']")
      ?.textContent).toContain("100.0 %");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='bestStreak']")
      ?.textContent).toContain("1");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='avgResponseMs']"))
      .toBeNull();
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-chart-row[data-key='lifetime']")
      ?.dataset.rate).toBe("100");
    expect(root.querySelector<HTMLElement>(".dashboard-leak-chart")?.dataset.count).toBe("0");
    expect(root.querySelector<HTMLElement>(".dashboard-streak")?.dataset.streak).toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-session-count")?.dataset.sessionCount)
      .toBe("1");

    expect(root.querySelector(".profile-breakdowns")).not.toBeNull();
    expect(root.querySelector(".preflop-leak-charts")).not.toBeNull();
    expect(
      root.querySelector<HTMLElement>(
        '.preflop-leak-chart--context .preflop-leak-chart-row[data-group="RFI"]',
      )?.dataset.rate,
    ).toBe("100");
    expect(
      root.querySelector<HTMLElement>(
        '.preflop-leak-chart--position .preflop-leak-chart-row[data-group="BTN"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.preflop-leak-chart--bucket .preflop-leak-chart-row[data-group="25"]',
      )?.dataset.total,
    ).toBe("1");
    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("0");
    expect(root.querySelector<HTMLElement>(".postflop-kpi-charts")?.dataset.total).toBe("0");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--gameVariant .profile-breakdown-row[data-group="MTT"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--gameVariant .profile-breakdown-row[data-group="MTT"] .profile-breakdown-row__name',
      )?.textContent,
    ).toBe("MTT");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--tableFormat .profile-breakdown-row[data-group="FULL_RING_9"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--tableFormat .profile-breakdown-row[data-group="FULL_RING_9"] .profile-breakdown-row__name',
      )?.textContent,
    ).toBe("9-max full ring");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--blindSpeed .profile-breakdown-row[data-group="REGULAR"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--blindSpeed .profile-breakdown-row[data-group="REGULAR"] .profile-breakdown-row__name',
      )?.textContent,
    ).toBe("Regular");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--street .profile-breakdown-row[data-group="PREFLOP"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--street .profile-breakdown-row[data-group="PREFLOP"] .profile-breakdown-row__name',
      )?.textContent,
    ).toBe("Preflop");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--evModel .profile-breakdown-row[data-group="CHIP_EV"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--evModel .profile-breakdown-row[data-group="CHIP_EV"] .profile-breakdown-row__name',
      )?.textContent,
    ).toBe("chipEV");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--ante .profile-breakdown-row[data-group="OFF"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--ante .profile-breakdown-row[data-group="OFF"] .profile-breakdown-row__name',
      )?.textContent,
    ).toBe("Ante off");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--rangePackId .profile-breakdown-row[data-group="mtt-full-ring-9-regular-preflop-chip-ev-ante-off-v1"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--bucket .profile-breakdown-row[data-group="25"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--context .profile-breakdown-row[data-group="RFI"]',
      )?.dataset.total,
    ).toBe("1");

    const emptyPosition = root.querySelector<HTMLElement>(
      '.breakdown--position .breakdown-row[data-group="UTG"]',
    );
    expect(emptyPosition?.dataset.total).toBe("0");
    expect(emptyPosition?.querySelector(".rate--unavailable")?.textContent).toBe("—");
  });

  it("zobrazi decision-time KPI az po nasbirani preflop nebo postflop casu", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);
    expect(store.record({ ...record, responseMs: 1000 }).ok).toBe(true);

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 2,
      postflopRecords: [{ ...postflopRecord, responseMs: 2000 }],
    }, root);

    const kpi = root.querySelector<HTMLElement>(".dashboard-kpi");
    const card = root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='avgResponseMs']");
    expect(kpi?.dataset.avgResponseMs).toBe("1500");
    expect(card?.textContent).toContain("Avg decision");
    expect(card?.textContent).toContain("1.5 s");
  });

  it("zobrazi KPI leak graf jen pro skupiny s dostatecnym samplem", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);
    const leakRecords: ResultRecord[] = [
      { ...record, qid: "VS_OPEN|BB|15|A5s|ON|1", context: "VS_OPEN", position: "BB", bucket: 15, correct: false, ts: 1 },
      { ...record, qid: "VS_OPEN|BB|15|KQo|ON|2", context: "VS_OPEN", position: "BB", bucket: 15, correct: false, ts: 2 },
      { ...record, qid: "VS_OPEN|BB|15|QJo|ON|3", context: "VS_OPEN", position: "BB", bucket: 15, correct: true, ts: 3 },
      { ...record, qid: "VS_OPEN|BB|15|T9s|ON|4", context: "VS_OPEN", position: "BB", bucket: 15, correct: false, ts: 4 },
      { ...record, qid: "VS_OPEN|BB|15|98s|ON|5", context: "VS_OPEN", position: "BB", bucket: 15, correct: false, ts: 5 },
      { ...record, qid: "RFI|BTN|25|AKs|OFF|6", context: "RFI", position: "BTN", bucket: 25, correct: false, ts: 6 },
    ];
    for (const item of leakRecords) expect(store.record(item).ok).toBe(true);

    const root = document.createElement("div");
    renderDashboard({ store, sessionCount: 6 }, root);

    expect(root.querySelector<HTMLElement>(".dashboard-kpi")?.dataset.total).toBe("6");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='recentRate']")
      ?.textContent).toContain("16.7 %");
    expect(root.querySelector<HTMLElement>(".dashboard-leak-chart")?.dataset.count).toBe("3");
    expect(
      root.querySelector<HTMLElement>(
        '.dashboard-leak-row[data-dim="context"][data-group="VS_OPEN"]',
      )?.dataset.rate,
    ).toBe("20");
    expect(
      root.querySelector<HTMLElement>(
        '.dashboard-leak-row[data-dim="position"][data-group="BB"]',
      )?.dataset.rate,
    ).toBe("20");
    expect(root.querySelector<HTMLElement>(
      '.dashboard-leak-row[data-dim="context"][data-group="RFI"]',
    )).toBeNull();
  });

  it("zobrazi postflop breakdown podle street, textury, StrategyPacku a confidence", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);

    const root = document.createElement("div");
    renderDashboard({ store, sessionCount: 1, postflopRecords: [postflopRecord] }, root);

    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("1");
    expect(root.querySelector<HTMLElement>(".postflop-kpi-charts")?.dataset.total).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--street .postflop-breakdown-row[data-group="FLOP"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--street .postflop-breakdown-row[data-group="FLOP"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Flop");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--boardTextureKey .postflop-breakdown-row[data-group="dry|ace-high|disconnected"]',
      )?.dataset.rate,
    ).toBe("100");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--boardTextureKey .postflop-breakdown-row[data-group="dry|ace-high|disconnected"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("dry, A-high, disconnected");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--strategyPackId .postflop-breakdown-row[data-group="mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--confidence .postflop-breakdown-row[data-group="LOW"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--confidence .postflop-breakdown-row[data-group="LOW"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("low");
    expect(root.querySelector<HTMLElement>(".postflop-breakdown--actionNode")?.textContent)
      .toContain("Flop c-bet in SRP");
    expect(root.querySelector<HTMLElement>(".postflop-breakdown--actionNode")?.textContent)
      .not.toContain("SINGLE_RAISED_POT_CBET");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-kpi-chart--street .postflop-kpi-chart-row[data-group="FLOP"]',
      )?.dataset.rate,
    ).toBe("100");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-kpi-chart--actionNode .postflop-kpi-chart-row[data-group="SINGLE_RAISED_POT_CBET"] .dashboard-kpi-chart-row__label',
      )?.textContent,
    ).toBe("Flop c-bet in SRP");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-kpi-chart--boardTextureKey .postflop-kpi-chart-row[data-group="dry|ace-high|disconnected"] .dashboard-kpi-chart-row__label',
      )?.textContent,
    ).toBe("dry, A-high, disconnected");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-kpi-chart--confidence .postflop-kpi-chart-row[data-group="LOW"] .dashboard-kpi-chart-row__label',
      )?.textContent,
    ).toBe("low");
  });

  it("exportuje a importuje postflop breakdown pres JSON transfer", () => {
    const sourceStore = createStatsStore(new MemoryStorage());
    expect(sourceStore.record(record).ok).toBe(true);
    const sourceRoot = document.createElement("div");
    renderDashboard({
      store: sourceStore,
      sessionCount: 1,
      postflopRecords: [postflopRecord],
    }, sourceRoot);

    sourceRoot.querySelector<HTMLButtonElement>(".stats-export")?.click();
    const exported = sourceRoot.querySelector<HTMLTextAreaElement>(".stats-json-box")?.value;
    expect(exported).toContain("postflopRecords");

    const targetStore = createStatsStore(new MemoryStorage());
    const targetRoot = document.createElement("div");
    let importedPostflop: readonly PostflopStatsV2BridgeRecord[] = [];
    renderDashboard({
      store: targetStore,
      sessionCount: 0,
      postflopRecords: [],
      onPostflopRecordsImported: (records) => {
        importedPostflop = records;
      },
    }, targetRoot);

    const box = targetRoot.querySelector<HTMLTextAreaElement>(".stats-json-box");
    box!.value = exported!;
    targetRoot.querySelector<HTMLButtonElement>(".stats-import")?.click();

    expect(targetStore.events()).toEqual([record]);
    expect(importedPostflop).toEqual([postflopRecord]);
    expect(targetRoot.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total)
      .toBe("1");
    expect(
      targetRoot.querySelector<HTMLElement>(
        '.postflop-breakdown--street .postflop-breakdown-row[data-group="FLOP"]',
      )?.dataset.total,
    ).toBe("1");
  });
});
