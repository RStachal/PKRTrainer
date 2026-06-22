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
    baseName.includes("-production-") &&
    /-[a-zA-Z0-9_-]{8,}\.js$/.test(baseName)
  );
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
        !isLazyMttProductionAsset(fileName)
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
