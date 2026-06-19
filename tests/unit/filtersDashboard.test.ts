// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import type { Filters } from "../../src/core/types";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import type { PostflopLineResultRecord } from "../../src/persistence/postflopLineResultRecord";
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
  schemaVersion: 4,
  qid: "POSTFLOP|FLOP|1|As-Kd-Qh",
  correct: true,
  ts: 2,
  profileId: "MTT|FULL_RING_9|REGULAR|FLOP|CHIP_EV|ON|NONE",
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  ante: "ON",
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

const postflopLineRecord: PostflopLineResultRecord = {
  schema: "postflop_line_result_record_v1",
  schemaVersion: 1,
  lineId: "POSTFLOP_LINE|1|Ah-7d-2c-5s-Jd",
  seed: 1,
  profileId: postflopRecord.profileId,
  startedAt: 1,
  completedAt: 2,
  totalStreets: 1,
  correctStreets: 1,
  perfect: true,
  streetResults: [
    {
      index: 0,
      street: "FLOP",
      record: postflopRecord,
      potBBBefore: 6,
      effectiveStackBBBefore: 40,
      potBBAfter: 10,
      effectiveStackBBAfter: 38,
    },
  ],
  actionHistory: [
    {
      street: "FLOP",
      actionNode: "SINGLE_RAISED_POT_CBET",
      action: "BET_SMALL",
      source: "CHOSEN",
      potBBBefore: 6,
      effectiveStackBBBefore: 40,
      potBBAfter: 10,
      effectiveStackBBAfter: 38,
      terminal: false,
    },
  ],
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
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>(".filter-bulk-all"))
      .map((button) => button.getAttribute("aria-label"))).toEqual([
        "Select all positions",
        "Select all stack depths",
        "Select all action contexts",
      ]);
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>(".filter-bulk-none"))
      .map((button) => button.getAttribute("aria-label"))).toEqual([
        "Clear positions",
        "Clear stack depths",
        "Clear action contexts",
      ]);
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

  it("umi programove nastavit targeted filtry", () => {
    const root = document.createElement("div");
    const view = renderFilters(root, { onStart: () => undefined });

    view.setFilters({
      positions: ["BB"],
      buckets: [15],
      contexts: ["VS_OPEN"],
      ante: "OFF",
      scoringMode: "STRICT",
    });

    expect(root.querySelector<HTMLInputElement>('.filter-position[data-position="BB"]')?.checked)
      .toBe(true);
    expect(root.querySelector<HTMLInputElement>('.filter-bucket[data-bucket="15"]')?.checked)
      .toBe(true);
    expect(root.querySelector<HTMLInputElement>('.filter-context[data-context="VS_OPEN"]')?.checked)
      .toBe(true);
    expect(root.querySelector<HTMLInputElement>(".filter-ante")?.checked).toBe(false);
    expect(root.querySelector<HTMLSelectElement>(".filter-scoring")?.value).toBe("STRICT");
  });

  it("pri 6-max profilu skryje full-ring pozice z pozicniho filtru", () => {
    const root = document.createElement("div");
    const view = renderFilters(root, { onStart: () => undefined });
    root.querySelector<HTMLInputElement>('.filter-position[data-position="UTG+1"]')!.checked =
      true;

    const format = root.querySelector<HTMLSelectElement>(".profile-format");
    expect(format).not.toBeNull();
    format!.value = "SIX_MAX";
    format!.dispatchEvent(new Event("change"));

    expect(Array.from(root.querySelectorAll<HTMLInputElement>(".filter-position"))
      .map((input) => input.dataset.position)).toEqual([
        "UTG",
        "HJ",
        "CO",
        "BTN",
        "SB",
        "BB",
      ]);
    expect(root.querySelector('.filter-position[data-position="UTG+1"]')).toBeNull();
    expect(root.querySelector('.filter-position[data-position="UTG+2"]')).toBeNull();
    expect(root.querySelector('.filter-position[data-position="LJ"]')).toBeNull();
    expect(view.getFilters().positions).toEqual([]);

    root.querySelector<HTMLInputElement>('.filter-position[data-position="CO"]')!.checked = true;
    expect(view.getFilters().positions).toEqual(["CO"]);
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
    expect(css).toContain(".stats-profile-select");
    expect(css).toContain(".stats-reset-profile");
    expect(css).toContain(".dashboard-kpi__cards");
    expect(css).toContain(".dashboard-kpi-chart-row");
    expect(css).toContain(".dashboard-confidence-kpi-row");
    expect(css).toContain(".dashboard-decision-trend");
    expect(css).toContain(".dashboard-leak-row__train");
    expect(css).toContain(".dashboard-accuracy-trend");
    expect(css).toContain(".dashboard-accuracy-trend__bar");
    expect(css).toContain(".preflop-curriculum");
    expect(css).toContain(".preflop-curriculum__recommendation");
    expect(css).toContain(".preflop-leak-charts");
    expect(css).not.toContain("background:#fff");
    expect(root.textContent ?? "").toContain("Summary");
    expect(root.textContent ?? "").toContain("KPI");
    expect(root.textContent ?? "").toContain("Training focus");
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
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='confidenceWeightedRate']")
      ?.textContent).toContain("100.0 %");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='avgResponseMs']"))
      .toBeNull();
    expect(root.querySelector<HTMLElement>(".dashboard-kpi")?.dataset.confidenceWeightedRate)
      .toBe("100");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi")?.dataset.confidenceWeightedTotal)
      .toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-chart-row[data-key='lifetime']")
      ?.dataset.rate).toBe("100");
    expect(root.querySelector<HTMLElement>(
      '.dashboard-confidence-kpi-row[data-group="preflop-verified"]',
    )?.dataset.weightedTotal).toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi")?.dataset.trendWindows).toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-accuracy-trend")?.dataset.windows)
      .toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-accuracy-trend__bar")?.dataset.rate)
      .toBe("100");
    expect(root.querySelector<HTMLElement>(".dashboard-accuracy-trend__bar")?.dataset.source)
      .toBe("preflop");
    expect(root.querySelector<HTMLElement>(".dashboard-leak-chart")?.dataset.count).toBe("0");
    expect(root.querySelector<HTMLElement>(".preflop-curriculum")?.dataset.available).toBe("false");
    expect(root.querySelector<HTMLElement>(".preflop-curriculum")?.textContent)
      .toContain("Build sample");
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
        '.profile-breakdown--rangePackId .profile-breakdown-row[data-group="LEGACY_UNKNOWN_STRATEGY"]',
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
    expect(kpi?.dataset.decisionTrendAvailable).toBe("false");
    expect(kpi?.dataset.decisionTrendSamples).toBe("2");
    expect(card?.textContent).toContain("Avg decision");
    expect(card?.textContent).toContain("1.5 s");
    expect(root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='decisionTrend']"))
      .toBeNull();
    expect(root.querySelector<HTMLElement>(".dashboard-decision-trend")?.dataset.available)
      .toBe("false");
    expect(root.querySelector<HTMLElement>(".dashboard-decision-trend")?.textContent)
      .toContain("Needs 6 timed decisions");
  });

  it("zobrazi recent accuracy trend po oknech vcetne postflop vysledku", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);
    for (let index = 1; index <= 7; index += 1) {
      expect(store.record({
        ...record,
        qid: `RFI|BTN|25|AKs|OFF|trend-${index}`,
        correct: index % 2 === 0,
        ts: index,
      }).ok).toBe(true);
    }

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 10,
      postflopRecords: [
        { ...postflopRecord, qid: "POSTFLOP|FLOP|trend-8", correct: true, ts: 8 },
        { ...postflopRecord, qid: "POSTFLOP|FLOP|trend-9", correct: false, ts: 9 },
        { ...postflopRecord, qid: "POSTFLOP|FLOP|trend-10", correct: true, ts: 10 },
      ],
    }, root);

    const bars = Array.from(
      root.querySelectorAll<HTMLElement>(".dashboard-accuracy-trend__bar"),
    );
    expect(root.querySelector<HTMLElement>(".dashboard-kpi")?.dataset.trendWindows).toBe("2");
    expect(root.querySelector<HTMLElement>(".dashboard-accuracy-trend")?.dataset.windows)
      .toBe("2");
    expect(root.textContent).toContain("Recent accuracy trend");
    expect(bars).toHaveLength(2);
    expect(bars[0].dataset.total).toBe("5");
    expect(bars[0].dataset.correct).toBe("2");
    expect(bars[0].dataset.rate).toBe("40");
    expect(bars[0].dataset.source).toBe("preflop");
    expect(bars[0].textContent).toContain("2/5");
    expect(bars[1].dataset.total).toBe("5");
    expect(bars[1].dataset.correct).toBe("3");
    expect(bars[1].dataset.rate).toBe("60");
    expect(bars[1].dataset.source).toBe("mixed");
    expect(bars[1].textContent).toContain("3/5");
  });

  it("vazi KPI podle confidence a fallback postflop spoty nezapocita plnou vahou", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);
    expect(store.record({ ...record, qid: "RFI|BTN|25|AKs|OFF|weighted", correct: true, ts: 1 })
      .ok).toBe(true);

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 4,
      postflopRecords: [
        { ...postflopRecord, qid: "POSTFLOP|FLOP|weighted-low", correct: false, confidence: "LOW", ts: 2 },
        { ...postflopRecord, qid: "POSTFLOP|FLOP|weighted-high", correct: true, confidence: "HIGH", ts: 3 },
        {
          ...postflopRecord,
          qid: "POSTFLOP|FLOP|weighted-fallback",
          correct: false,
          confidence: null,
          strategyPackId: null,
          ts: 4,
        },
      ],
    }, root);

    const kpi = root.querySelector<HTMLElement>(".dashboard-kpi");
    const weighted = root.querySelector<HTMLElement>(".dashboard-confidence-kpi");
    const card = root.querySelector<HTMLElement>(
      ".dashboard-kpi-card[data-kpi='confidenceWeightedRate']",
    );
    expect(kpi?.dataset.confidenceWeightedRate).toBe("72.7");
    expect(kpi?.dataset.confidenceWeightedTotal).toBe("2.8");
    expect(card?.textContent).toContain("72.7 %");
    expect(card?.textContent).toContain("2.8w");
    expect(weighted?.dataset.total).toBe("4");
    expect(weighted?.dataset.weightedTotal).toBe("2.8");
    expect(weighted?.dataset.weightedCorrect).toBe("2");
    expect(weighted?.dataset.rate).toBe("72.7");
    expect(root.querySelector<HTMLElement>(
      '.dashboard-confidence-kpi-row[data-group="preflop-verified"]',
    )?.dataset.averageWeight).toBe("1");
    expect(root.querySelector<HTMLElement>(
      '.dashboard-confidence-kpi-row[data-group="postflop-high"]',
    )?.dataset.weightedTotal).toBe("1");
    expect(root.querySelector<HTMLElement>(
      '.dashboard-confidence-kpi-row[data-group="postflop-low"]',
    )?.dataset.weightedTotal).toBe("0.5");
    expect(root.querySelector<HTMLElement>(
      '.dashboard-confidence-kpi-row[data-group="postflop-fallback"]',
    )?.dataset.weightedTotal).toBe("0.3");
  });

  it("zobrazi decision-time trend az po dostatecnem timed samplu", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);
    const preflopTimes = [2000, 1800, 2200];
    preflopTimes.forEach((responseMs, index) => {
      expect(store.record({
        ...record,
        qid: `RFI|BTN|25|AKs|OFF|speed-${index}`,
        correct: true,
        responseMs,
        ts: index + 1,
      }).ok).toBe(true);
    });

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 6,
      postflopRecords: [
        { ...postflopRecord, qid: "POSTFLOP|FLOP|speed-4", correct: true, responseMs: 1000, ts: 4 },
        { ...postflopRecord, qid: "POSTFLOP|FLOP|speed-5", correct: true, responseMs: 900, ts: 5 },
        { ...postflopRecord, qid: "POSTFLOP|FLOP|speed-6", correct: true, responseMs: 1100, ts: 6 },
      ],
    }, root);

    const kpi = root.querySelector<HTMLElement>(".dashboard-kpi");
    const trend = root.querySelector<HTMLElement>(".dashboard-decision-trend");
    const bars = Array.from(root.querySelectorAll<HTMLElement>(".dashboard-decision-trend__bar"));
    const card = root.querySelector<HTMLElement>(".dashboard-kpi-card[data-kpi='decisionTrend']");
    expect(kpi?.dataset.decisionTrendAvailable).toBe("true");
    expect(kpi?.dataset.decisionTrendSamples).toBe("6");
    expect(kpi?.dataset.decisionTrendDeltaMs).toBe("-1000");
    expect(card?.textContent).toContain("Faster by 1.0 s");
    expect(trend?.dataset.available).toBe("true");
    expect(trend?.dataset.direction).toBe("faster");
    expect(trend?.dataset.deltaMs).toBe("-1000");
    expect(trend?.dataset.windows).toBe("2");
    expect(bars).toHaveLength(2);
    expect(bars[0].dataset.averageMs).toBe("2000");
    expect(bars[0].dataset.source).toBe("preflop");
    expect(bars[1].dataset.averageMs).toBe("1000");
    expect(bars[1].dataset.source).toBe("postflop");
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
    const focusedFilters: Filters[] = [];
    renderDashboard({
      store,
      sessionCount: 6,
      onStartPreflopFocus: (filters) => focusedFilters.push(filters),
    }, root);

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
    expect(root.querySelector<HTMLElement>(".preflop-curriculum")?.dataset.available).toBe("true");
    expect(root.querySelector<HTMLElement>(".preflop-curriculum")?.dataset.recommendations)
      .toBe("3");
    expect(root.querySelector<HTMLElement>(".preflop-curriculum")?.textContent)
      .toContain("Stack: 15 BB");
    expect(root.querySelector<HTMLElement>(".preflop-curriculum")?.textContent)
      .toContain("Next study focus");
    expect(root.querySelectorAll(".preflop-curriculum__recommendation")).toHaveLength(3);
    expect(root.querySelectorAll(".preflop-curriculum__recommendation-train")).toHaveLength(3);
    expect(root.querySelector<HTMLElement>(".preflop-curriculum__recommendation")
      ?.dataset.recentMistakes).toBe("4");
    root.querySelector<HTMLButtonElement>(
      '.dashboard-leak-row[data-dim="context"][data-group="VS_OPEN"] .dashboard-leak-row__train',
    )?.click();
    root.querySelector<HTMLButtonElement>(".preflop-curriculum__recommendation-train")?.click();
    root.querySelector<HTMLButtonElement>(".preflop-curriculum__start")?.click();
    expect(focusedFilters).toEqual([
      {
        positions: [],
        buckets: [],
        contexts: ["VS_OPEN"],
        ante: "ON",
        scoringMode: "LENIENT",
      },
      {
        positions: [],
        buckets: [15],
        contexts: [],
        ante: "ON",
        scoringMode: "LENIENT",
      },
      {
        positions: [],
        buckets: [15],
        contexts: [],
        ante: "ON",
        scoringMode: "LENIENT",
      },
    ]);
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
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--potType .postflop-breakdown-row[data-group="SINGLE_RAISED"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Single-raised pot");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--positionPattern .postflop-breakdown-row[data-group="BTN_VS_BB"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Button vs BB (IP)");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--positionPair .postflop-breakdown-row[data-group="BTN_VS_BB"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("BTN vs BB");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--sourceQuality .postflop-breakdown-row[data-group="PREVIEW"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Preview / low confidence");
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
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-kpi-chart--sourceQuality .postflop-kpi-chart-row[data-group="PREVIEW"] .dashboard-kpi-chart-row__label',
      )?.textContent,
    ).toBe("Preview / low confidence");
  });

  it("oddeluje single-spot a hand-line postflop KPI flow", () => {
    const root = document.createElement("div");
    renderDashboard({
      store: createStatsStore(new MemoryStorage()),
      sessionCount: 2,
      postflopRecords: [postflopRecord],
      postflopLineRecords: [postflopLineRecord],
    }, root);

    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("2");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--flowMode .postflop-breakdown-row[data-group="SINGLE_SPOT"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--flowMode .postflop-breakdown-row[data-group="HAND_LINE"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--flowMode .postflop-breakdown-row[data-group="HAND_LINE"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Hand line");
  });

  it("oddeluje MTT postflop KPI podle profilu, confidence a flow modu", () => {
    const sixMaxDolarRiver: PostflopStatsV2BridgeRecord = {
      ...postflopRecord,
      qid: "POSTFLOP|RIVER|six-max-turbo-dollar",
      correct: true,
      profileId: "MTT|SIX_MAX|TURBO|RIVER|DOLAR_EV|OFF|NONE",
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      street: "RIVER",
      evModel: "DOLAR_EV",
      ante: "OFF",
      actionNode: "RIVER_FACING_BET",
      boardTextureKey: "two-tone|connected|straight-possible",
      chosen: "CALL",
      recommended: "CALL",
      strategyPackId: "mtt-six-max-turbo-river-production-private-v1",
      strategyRuleId: "river-six-max-turbo-dollar-facing-bet-call",
      confidence: "HIGH",
    };
    const fallbackTurn: PostflopStatsV2BridgeRecord = {
      ...postflopRecord,
      qid: "POSTFLOP|TURN|fallback",
      correct: false,
      profileId: "MTT|FULL_RING_9|REGULAR|TURN|CHIP_EV|ON|NONE",
      street: "TURN",
      actionNode: "TURN_BARREL",
      chosen: "CHECK",
      recommended: "BET_SMALL",
      strategyPackId: null,
      strategyRuleId: "postflop-generator-heuristic",
      confidence: null,
    };
    const dollarLineRecord: PostflopLineResultRecord = {
      ...postflopLineRecord,
      lineId: "POSTFLOP_LINE|dollar-river",
      profileId: sixMaxDolarRiver.profileId,
      streetResults: [{
        ...postflopLineRecord.streetResults[0],
        street: "RIVER",
        record: sixMaxDolarRiver,
      }],
      actionHistory: [{
        ...postflopLineRecord.actionHistory[0],
        street: "RIVER",
        actionNode: "RIVER_FACING_BET",
        action: "CALL",
      }],
    };
    const root = document.createElement("div");

    renderDashboard({
      store: createStatsStore(new MemoryStorage()),
      sessionCount: 3,
      postflopRecords: [postflopRecord, fallbackTurn],
      postflopLineRecords: [dollarLineRecord],
    }, root);

    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("3");
    expect(root.querySelector<HTMLElement>(".postflop-kpi-charts")?.dataset.total).toBe("3");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--flowMode .postflop-breakdown-row[data-group="SINGLE_SPOT"]',
      )?.dataset.total,
    ).toBe("2");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--flowMode .postflop-breakdown-row[data-group="HAND_LINE"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--tableFormat .postflop-breakdown-row[data-group="SIX_MAX"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--tableFormat .postflop-breakdown-row[data-group="SIX_MAX"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("6-max");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--blindSpeed .postflop-breakdown-row[data-group="TURBO"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Turbo");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--evModel .postflop-breakdown-row[data-group="DOLAR_EV"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("$EV");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--ante .postflop-breakdown-row[data-group="OFF"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("Ante off");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--sourceQuality .postflop-breakdown-row[data-group="PRODUCTION"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--sourceQuality .postflop-breakdown-row[data-group="PREVIEW"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--sourceQuality .postflop-breakdown-row[data-group="FALLBACK"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.postflop-breakdown--actionNode .postflop-breakdown-row[data-group="RIVER_FACING_BET"] .postflop-breakdown-row__name',
      )?.textContent,
    ).toBe("River facing bet");
    expect(root.textContent).not.toContain("DOLAR_EV");
    expect(root.textContent).not.toContain("SIX_MAX");
    expect(root.textContent).not.toContain("RIVER_FACING_BET");
    expect(root.textContent).not.toContain("mtt-six-max-turbo-river-production-private-v1");
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

  it("labeluje DOLAR_EV v dashboard profilech jako $EV bez raw enumu", () => {
    const store = createStatsStore(new MemoryStorage());
    const dolarRecord: PostflopStatsV2BridgeRecord = {
      ...postflopRecord,
      profileId: "MTT|FULL_RING_9|REGULAR|FLOP|DOLAR_EV|ON|NONE",
      evModel: "DOLAR_EV",
    };
    const root = document.createElement("div");

    renderDashboard({
      store,
      sessionCount: 0,
      postflopRecords: [dolarRecord],
    }, root);

    const profileOptions = Array.from(root.querySelectorAll<HTMLOptionElement>(
      ".stats-profile-select option",
    )).map((option) => option.textContent).join(" ");

    expect(profileOptions).toContain("MTT 9-max full ring Regular Flop $EV ON");
    expect(profileOptions).not.toContain("DOLAR_EV");
    expect(root.textContent).not.toContain("DOLAR_EV");
  });

  it("pri selhani ulozeni postflop importu zobrazi source-free status a UI nespadne", () => {
    const sourceStore = createStatsStore(new MemoryStorage());
    expect(sourceStore.record(record).ok).toBe(true);
    const sourceRoot = document.createElement("div");
    renderDashboard({
      store: sourceStore,
      sessionCount: 1,
      postflopRecords: [postflopRecord],
    }, sourceRoot);
    sourceRoot.querySelector<HTMLButtonElement>(".stats-export")?.click();

    const targetStore = createStatsStore(new MemoryStorage());
    const targetRoot = document.createElement("div");
    renderDashboard({
      store: targetStore,
      sessionCount: 0,
      postflopRecords: [],
      onPostflopRecordsImported: () => false,
    }, targetRoot);

    targetRoot.querySelector<HTMLTextAreaElement>(".stats-json-box")!.value =
      sourceRoot.querySelector<HTMLTextAreaElement>(".stats-json-box")!.value;
    targetRoot.querySelector<HTMLButtonElement>(".stats-import")?.click();

    const status = targetRoot.querySelector<HTMLElement>(".stats-transfer__status");
    expect(targetStore.events()).toEqual([record]);
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("postflop log could not be saved");
    expect(status?.textContent).not.toMatch(/https?:|www\.|source|zdroj|RangePack|mtt-|flop-/i);
    expect(targetRoot.querySelector<HTMLElement>(".dashboard")).not.toBeNull();
  });

  it("umi exportovat a resetovat vybrany stats profil", () => {
    const store = createStatsStore(new MemoryStorage());
    const offRecord = { ...record, qid: "RFI|BTN|25|AKs|OFF", ts: 1 };
    const onRecord = { ...record, qid: "RFI|BTN|25|AQs|ON", ts: 2 };
    expect(store.record(offRecord).ok).toBe(true);
    expect(store.record(onRecord).ok).toBe(true);
    let savedPostflop: readonly PostflopStatsV2BridgeRecord[] = [postflopRecord];

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 2,
      postflopRecords: savedPostflop,
      onPostflopRecordsImported: (records) => {
        savedPostflop = records;
        return true;
      },
    }, root);

    const select = root.querySelector<HTMLSelectElement>(".stats-profile-select");
    const reset = root.querySelector<HTMLButtonElement>(".stats-reset-profile");
    const exportBtn = root.querySelector<HTMLButtonElement>(".stats-export");
    const box = root.querySelector<HTMLTextAreaElement>(".stats-json-box");
    expect(select).not.toBeNull();
    expect(reset?.disabled).toBe(true);
    const postflopOption = Array.from(select!.options)
      .find((option) => option.value === postflopRecord.profileId);
    expect(postflopOption).not.toBeUndefined();
    select!.value = postflopRecord.profileId;
    select!.dispatchEvent(new Event("change"));
    expect(reset?.disabled).toBe(false);

    exportBtn?.click();
    const exported = JSON.parse(box!.value) as {
      events: ResultRecord[];
      postflopRecords: PostflopStatsV2BridgeRecord[];
    };
    expect(exported.events).toEqual([]);
    expect(exported.postflopRecords).toEqual([postflopRecord]);

    reset?.click();
    expect(store.events()).toEqual([offRecord, onRecord]);
    expect(savedPostflop).toEqual([]);
    expect(root.querySelector<HTMLElement>(".stats-transfer__status")?.textContent)
      .toContain("Selected profile stats were reset.");
  });

  it("pri selhani ulozeni postflop resetu zobrazi source-free status a zachova dashboard", () => {
    const store = createStatsStore(new MemoryStorage());
    const offRecord = { ...record, qid: "RFI|BTN|25|AKs|OFF", ts: 1 };
    expect(store.record(offRecord).ok).toBe(true);

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 1,
      postflopRecords: [postflopRecord],
      onPostflopRecordsImported: () => false,
    }, root);

    const select = root.querySelector<HTMLSelectElement>(".stats-profile-select");
    select!.value = postflopRecord.profileId;
    select!.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".stats-reset-profile")?.click();

    const status = root.querySelector<HTMLElement>(".stats-transfer__status");
    expect(store.events()).toEqual([offRecord]);
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toContain("postflop log could not be saved");
    expect(status?.textContent).not.toMatch(/https?:|www\.|source|zdroj|RangePack|mtt-|flop-/i);
    expect(root.querySelector<HTMLElement>(".dashboard")).not.toBeNull();
  });
});
