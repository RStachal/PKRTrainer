import { afterEach, describe, expect, it, vi } from "vitest";

import { createMttProductionLazyLoader } from "../../src/data/ranges/mttProductionLazyLoader";
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
    expect(runtimeMttPreflopRangePacks).toEqual([firstPack]);
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
