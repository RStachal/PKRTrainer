import { createHash } from "node:crypto";

export interface PrecacheBuildManifest {
  version: string;
  entries: readonly string[];
}

export function isLazyMttProductionAsset(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/");
  const baseName = normalized.split("/").pop() ?? "";
  return (
    baseName.startsWith("mtt-") &&
    (baseName.includes("-production-") || baseName.includes("-pilot-")) &&
    /-[a-zA-Z0-9_-]{8,}\.js$/.test(baseName)
  );
}

/**
 * The all-in equity table, which is fetched when a session starts.
 *
 * 115 KB of source that prices the action buttons. Precaching it would put it on
 * the install path of every user, including the ones who only ever open a
 * postflop drill, for a table that is not needed until the first preflop spot is
 * dealt - and that the app is written to run without.
 */
export function isPreflopEquityAsset(fileName: string): boolean {
  const baseName = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  return /^preflop-equity-[a-zA-Z0-9_-]{8,}\.js$/.test(baseName);
}

/**
 * A solved turn family, one chunk each.
 *
 * These are the largest content the app has per unit of use: a family answers
 * one spot at one depth, and a player who never reaches it should never pay for
 * it. Eleven of them precached would be four hundred kilobytes on the install
 * path of someone who might only ever open a preflop drill.
 */
export function isSolvedTurnAsset(fileName: string): boolean {
  const baseName = fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  return /^mtt-turn-solved-[a-z0-9-]+-[a-zA-Z0-9_-]{8,}\.js$/.test(baseName);
}

/** Assets the app fetches when it needs them, so they stay off the install path. */
export function isDeferredAsset(fileName: string): boolean {
  return (
    isLazyMttProductionAsset(fileName) ||
    isPreflopEquityAsset(fileName) ||
    isSolvedTurnAsset(fileName)
  );
}

export function mttProductionChunkNameForModuleId(moduleId: string): string | null {
  const normalized = moduleId.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  if (fileName === "mttPostflopTrainingRuntime.ts") {
    return "mtt-postflop-pilot-runtime";
  }
  // Solved turn families live under ranges/turn/ and are named for the family
  // rather than for a profile, so they need their own naming rule to land in a
  // chunk the precache manifest recognises as deferred.
  if (normalized.includes("/ranges/turn/") && fileName.endsWith(".generated.ts")) {
    return `mtt-turn-solved-${fileName.slice(0, -".generated.ts".length)}`;
  }
  if (
    !fileName.endsWith(".ts") ||
    !fileName.startsWith("mtt-") ||
    !fileName.includes("-production-")
  ) {
    return null;
  }
  return fileName.slice(0, -3);
}

export function buildPrecacheManifest(
  bundleFileNames: readonly string[],
): PrecacheBuildManifest {
  const entries = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    ...bundleFileNames
      .filter((fileName) => (
        fileName !== "sw.js" &&
        !fileName.endsWith(".map") &&
        !isDeferredAsset(fileName)
      ))
      .map((fileName) => `./${fileName}`),
  ];
  const uniqueEntries = [...new Set(entries)].sort();
  return {
    version: createHash("sha256").update(uniqueEntries.join("\n")).digest("hex").slice(0, 16),
    entries: uniqueEntries,
  };
}

export function injectPrecacheManifest(
  workerCode: string,
  manifest: PrecacheBuildManifest,
): string {
  const output = workerCode
    .replace("__PKR_PRECACHE_VERSION__", manifest.version)
    .replace(
      JSON.stringify("__PKR_PRECACHE_ENTRIES__"),
      JSON.stringify(JSON.stringify(manifest.entries)),
    );
  if (output.includes("__PKR_PRECACHE_")) {
    throw new Error("Service worker precache placeholders were not replaced.");
  }
  return output;
}
