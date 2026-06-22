import { afterEach, describe, expect, it, vi } from "vitest";

import { createMttProductionLazyLoader } from "../../src/data/ranges/mttProductionLazyLoader";
import { mttPreflopRangePackForProfile } from "../../src/data/ranges/mttPreflopRangePacks";
import type { RangePack } from "../../src/data/ranges/rangePack";
import type {
  GeneratedMttProductionManifestEntry,
  GeneratedMttProductionPack,
} from "../../src/data/ranges/mttProductionRegistry.generated";
import {
  clearMttProductionRuntimeRegistryForTests,
  runtimeMttPreflopRangePacks,
} from "../../src/data/ranges/mttProductionRuntimeRegistry";

afterEach(() => {
  clearMttProductionRuntimeRegistryForTests();
});

describe("MTT production lazy loader", () => {
  it("nacte jen vybrany profil a stejny pack importuje nejvyse jednou", async () => {
    const firstPack = pack("first");
    const secondPack = pack("second");
    const firstLoad = vi.fn(async () => firstPack);
    const secondLoad = vi.fn(async () => secondPack);
    const loader = createMttProductionLazyLoader([
      entry("first", "PROFILE_A", firstLoad),
      entry("second", "PROFILE_B", secondLoad),
    ]);

    await expect(loader.loadProfile("PROFILE_A")).resolves.toMatchObject({
      profileKey: "PROFILE_A",
      packs: [firstPack],
      stale: false,
    });
    await loader.loadProfile("PROFILE_A");

    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).not.toHaveBeenCalled();
    expect(loader.loadedPackIds()).toEqual(["first"]);
    expect(loader.isProfileLoaded("PROFILE_A")).toBe(true);
    expect(loader.isProfileLoaded("PROFILE_B")).toBe(false);
    expect(runtimeMttPreflopRangePacks[0]).toBe(firstPack);
    expect(runtimeMttPreflopRangePacks.filter((candidate) => candidate.id === "first"))
      .toEqual([firstPack]);
  });

  it("oznaci pomaly vysledek stareho profilu jako stale", async () => {
    let resolveFirst!: (value: GeneratedMttProductionPack) => void;
    const firstLoad = vi.fn(() => new Promise<GeneratedMttProductionPack>((resolve) => {
      resolveFirst = resolve;
    }));
    const secondPack = pack("second");
    const loader = createMttProductionLazyLoader([
      entry("first", "PROFILE_A", firstLoad),
      entry("second", "PROFILE_B", async () => secondPack),
    ]);

    const first = loader.loadProfile("PROFILE_A");
    const second = loader.loadProfile("PROFILE_B");
    await expect(second).resolves.toMatchObject({ stale: false, packs: [secondPack] });

    resolveFirst(pack("first"));
    await expect(first).resolves.toMatchObject({ stale: true });
  });

  it("loadAll sdili cache s profilovym nacitanim", async () => {
    const load = vi.fn(async () => pack("only"));
    const loader = createMttProductionLazyLoader([
      entry("only", "PROFILE_A", load),
    ]);

    await loader.loadProfile("PROFILE_A");
    await expect(loader.loadAll()).resolves.toHaveLength(1);
    expect(load).toHaveBeenCalledOnce();
  });

  it("nacte vybranou sadu profilu bez zneplatneni training requestu", async () => {
    let resolveTraining!: (value: GeneratedMttProductionPack) => void;
    const loader = createMttProductionLazyLoader([
      entry("training", "TRAINING", () => new Promise((resolve) => {
        resolveTraining = resolve;
      })),
      entry("preflop", "PREFLOP", async () => pack("preflop")),
      entry("flop", "FLOP", async () => pack("flop")),
      entry("other", "OTHER", async () => pack("other")),
    ]);

    const training = loader.loadProfile("TRAINING");
    await expect(loader.loadProfiles(["PREFLOP", "FLOP"])).resolves.toEqual([
      pack("preflop"),
      pack("flop"),
    ]);

    resolveTraining(pack("training"));
    await expect(training).resolves.toMatchObject({ stale: false });
    expect(loader.loadedPackIds()).toEqual(["flop", "preflop", "training"]);
  });

  it("odmitne modul jehoz export ma jine id nez manifest", async () => {
    const loader = createMttProductionLazyLoader([
      entry("expected", "PROFILE_A", async () => pack("unexpected")),
    ]);

    await expect(loader.loadProfile("PROFILE_A")).rejects.toThrow(
      "expected expected, loaded unexpected",
    );
    expect(loader.loadedPackIds()).toEqual([]);
  });

  it("umi zneplatnit pending profil i kdyz nova volba nepotrebuje import", async () => {
    let resolveFirst!: (value: GeneratedMttProductionPack) => void;
    const loader = createMttProductionLazyLoader([
      entry("first", "PROFILE_A", () => new Promise((resolve) => {
        resolveFirst = resolve;
      })),
    ]);

    const first = loader.loadProfile("PROFILE_A");
    loader.cancelPendingProfileLoads();
    expect(loader.isProfileLoaded("PROFILE_WITHOUT_PACKS")).toBe(true);

    resolveFirst(pack("first"));
    await expect(first).resolves.toMatchObject({ stale: true });
  });

  it("po lazy importu zpristupni pack pres synchronni gameplay resolver", async () => {
    const productionPack: RangePack = {
      id: "mtt-full-ring-9-turbo-preflop-dolar-ev-ante-off-production-v1",
      version: "1.0.0",
      createdAt: "2026-06-22",
      verifiedAt: "2026-06-22",
      confidence: "HIGH",
      dimensions: {
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeed: "TURBO",
        street: "PREFLOP",
        evModel: "DOLAR_EV",
        ante: "OFF",
        rakeMode: "NONE",
      },
      assumptions: [],
      searchQueries: [],
      sourceEvidence: [],
      records: [],
    };
    const profileKey = "FULL_RING_9|TURBO|DOLAR_EV|PREFLOP|OFF";
    const loader = createMttProductionLazyLoader([
      entry(productionPack.id, profileKey, async () => productionPack),
    ]);

    expect(mttPreflopRangePackForProfile(productionPack.dimensions)).toBeUndefined();
    await loader.loadProfile(profileKey);

    expect(mttPreflopRangePackForProfile(productionPack.dimensions)).toBe(productionPack);
  });
});

function entry(
  packId: string,
  profileKey: string,
  load: () => Promise<GeneratedMttProductionPack>,
): GeneratedMttProductionManifestEntry {
  return {
    kind: "mtt-preflop",
    packId,
    profileKey,
    load,
  };
}

function pack(id: string): GeneratedMttProductionPack {
  return { id } as GeneratedMttProductionPack;
}
