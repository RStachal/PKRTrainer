// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import type { Filters } from "../../src/core/types";
import type { TrainingProfile } from "../../src/core/trainingProfile";
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
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--gameVariant .profile-breakdown-row[data-group="MTT"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--tableFormat .profile-breakdown-row[data-group="FULL_RING_9"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--blindSpeed .profile-breakdown-row[data-group="REGULAR"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--street .profile-breakdown-row[data-group="PREFLOP"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--evModel .profile-breakdown-row[data-group="CHIP_EV"]',
      )?.dataset.total,
    ).toBe("1");
    expect(
      root.querySelector<HTMLElement>(
        '.profile-breakdown--ante .profile-breakdown-row[data-group="OFF"]',
      )?.dataset.total,
    ).toBe("1");
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
});
