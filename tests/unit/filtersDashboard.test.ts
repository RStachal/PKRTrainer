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
    expect(warning?.textContent).toContain("žádnému spotu");
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

    expect(root.querySelector<HTMLElement>(".summary-total")?.dataset.total).toBe("1");
    expect(root.querySelector<HTMLElement>(".summary-rate")?.dataset.rate).toBe("100");
    expect(root.querySelector<HTMLElement>(".dashboard-streak")?.dataset.streak).toBe("1");
    expect(root.querySelector<HTMLElement>(".dashboard-session-count")?.dataset.sessionCount)
      .toBe("1");

    expect(root.querySelector(".profile-breakdowns")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("0");
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
    ).toBe("Ante vypnute");
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

  it("zobrazi postflop breakdown podle street, textury, StrategyPacku a confidence", () => {
    const storage = new MemoryStorage();
    const store = createStatsStore(storage);

    const root = document.createElement("div");
    renderDashboard({ store, sessionCount: 1, postflopRecords: [postflopRecord] }, root);

    expect(root.querySelector<HTMLElement>(".postflop-breakdowns")?.dataset.total).toBe("1");
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
    ).toBe("nizka");
    expect(root.querySelector<HTMLElement>(".postflop-breakdown--actionNode")?.textContent)
      .toContain("Flop c-bet v SRP");
    expect(root.querySelector<HTMLElement>(".postflop-breakdown--actionNode")?.textContent)
      .not.toContain("SINGLE_RAISED_POT_CBET");
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
