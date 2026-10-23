import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { isDeferredAsset, isLazyMttProductionAsset } from "../src/pwa/precacheManifestBuild";

const workerPath = "dist/sw.js";
const distPath = resolve("dist");
if (!existsSync(workerPath) || !existsSync(distPath)) {
  throw new Error("dist/ is missing; run npm run build first.");
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
}

function listPrecacheFiles(directory: string): string[] {
  return listFiles(directory)
    .map((path) => relative(distPath, path).split(sep).join("/"))
    .filter((name) => name !== "sw.js" && !name.endsWith(".map"))
    .sort();
}

const worker = readFileSync(workerPath, "utf8");
const precacheFiles = listPrecacheFiles(distPath);
const lazyMttProductionFiles = precacheFiles.filter(isLazyMttProductionAsset);
// Everything the app fetches on demand, which is the MTT packs plus the equity
// table. The rule is the same for both: present in dist, absent from install.
const deferredFiles = precacheFiles.filter(isDeferredAsset);
const requiredPrecacheFiles = precacheFiles.filter((name) => !isDeferredAsset(name));
const mainChunks = precacheFiles.filter((name) => /^assets\/main-[a-zA-Z0-9_-]+\.js$/.test(name));
const errors: string[] = [];
if (mainChunks.length !== 1) errors.push(`Expected one main JS chunk, found ${mainChunks.length}.`);
for (const file of requiredPrecacheFiles) {
  if (!worker.includes(`./${file}`)) {
    errors.push(`Service worker precache is missing ${file}.`);
  }
}
for (const file of deferredFiles) {
  if (worker.includes(`./${file}`)) {
    errors.push(`Deferred chunk must not be install-precached: ${file}.`);
  }
}
if (worker.includes("__PKR_PRECACHE_")) errors.push("Service worker contains build placeholders.");
if (!worker.includes('"./"')) errors.push("Service worker precache is missing the app root.");
if (!/mtt-preflop-[a-f0-9]{16}/.test(worker)) {
  errors.push("Service worker cache name is not content-versioned.");
}

console.log("Dist precache integrity");
console.log(`valid: ${errors.length === 0}`);
console.log(`precache files: ${requiredPrecacheFiles.length}`);
console.log(`lazy MTT production files: ${lazyMttProductionFiles.length}`);
console.log(`main chunks: ${mainChunks.length}`);
for (const error of errors) console.log(`error: ${error}`);
process.exitCode = errors.length === 0 ? 0 : 1;
