import type {
  GeneratedMttProductionManifestEntry,
  GeneratedMttProductionPack,
} from "./mttProductionRegistry.generated";
import { generatedMttProductionManifest } from "./mttProductionRegistry.generated";
import { registerMttProductionPack } from "./mttProductionRuntimeRegistry";

export interface MttProductionProfileLoadResult {
  profileKey: string;
  packs: readonly GeneratedMttProductionPack[];
  stale: boolean;
}

export interface MttProductionLazyLoader {
  loadProfile(profileKey: string): Promise<MttProductionProfileLoadResult>;
  loadProfiles(profileKeys: readonly string[]): Promise<readonly GeneratedMttProductionPack[]>;
  loadAll(): Promise<readonly GeneratedMttProductionPack[]>;
  loadedPackIds(): readonly string[];
  isProfileLoaded(profileKey: string): boolean;
  cancelPendingProfileLoads(): void;
}

export function createMttProductionLazyLoader(
  manifest: readonly GeneratedMttProductionManifestEntry[] =
    generatedMttProductionManifest,
): MttProductionLazyLoader {
  const loads = new Map<string, Promise<GeneratedMttProductionPack>>();
  const loaded = new Set<string>();
  let latestProfileRequest = 0;

  const loadEntry = (
    entry: GeneratedMttProductionManifestEntry,
  ): Promise<GeneratedMttProductionPack> => {
    const cached = loads.get(entry.packId);
    if (cached) return cached;
    const pending = entry.load()
      .then((pack) => {
        registerMttProductionPack(entry, pack);
        loaded.add(entry.packId);
        return pack;
      })
      .catch((error) => {
        loads.delete(entry.packId);
        throw error;
      });
    loads.set(entry.packId, pending);
    return pending;
  };

  return {
    async loadProfile(profileKey) {
      const request = ++latestProfileRequest;
      const packs = await Promise.all(
        manifest
          .filter((entry) => entry.profileKey === profileKey)
          .map(loadEntry),
      );
      return {
        profileKey,
        packs,
        stale: request !== latestProfileRequest,
      };
    },
    loadProfiles(profileKeys) {
      const requested = new Set(profileKeys);
      return Promise.all(
        manifest
          .filter((entry) => requested.has(entry.profileKey))
          .map(loadEntry),
      );
    },
    loadAll() {
      return Promise.all(manifest.map(loadEntry));
    },
    loadedPackIds() {
      return [...loads.keys()].sort();
    },
    isProfileLoaded(profileKey) {
      return manifest
        .filter((entry) => entry.profileKey === profileKey)
        .every((entry) => loaded.has(entry.packId));
    },
    cancelPendingProfileLoads() {
      latestProfileRequest += 1;
    },
  };
}

export const mttProductionLazyLoader = createMttProductionLazyLoader();
