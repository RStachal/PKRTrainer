import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  isLazyMttProductionAsset,
  isPreflopEquityAsset,
  isSolvedTurnAsset,
} from "../src/pwa/precacheManifestBuild";

const DIST_ASSETS_DIR = join(process.cwd(), "dist", "assets");
const MAX_JS_KB = numberFromEnv("BUNDLE_MAX_JS_KB", 325);
const MAX_GZIP_KB = numberFromEnv("BUNDLE_MAX_GZIP_KB", 86);
const MAX_PRECACHE_JS_KB = numberFromEnv("BUNDLE_MAX_PRECACHE_JS_KB", 400);
const MAX_PRECACHE_GZIP_KB = numberFromEnv("BUNDLE_MAX_PRECACHE_GZIP_KB", 128);
const MAX_LAZY_MTT_JS_KB = numberFromEnv("BUNDLE_MAX_LAZY_MTT_JS_KB", 512);
const MAX_LAZY_MTT_GZIP_KB = numberFromEnv("BUNDLE_MAX_LAZY_MTT_GZIP_KB", 128);
const MAX_LAZY_MTT_TOTAL_JS_KB = numberFromEnv("BUNDLE_MAX_LAZY_MTT_TOTAL_JS_KB", 32768);
const MAX_LAZY_MTT_TOTAL_GZIP_KB = numberFromEnv(
  "BUNDLE_MAX_LAZY_MTT_TOTAL_GZIP_KB",
  8192,
);
// The equity table is fetched when a session starts, so it is off the install
// path and does not belong in the precache totals - but it is not an MTT
// production pack either, and folding it into that bucket would hide it behind a
// 32 MB allowance. Its own line, sized just above what the table costs today, so
// growth has to be deliberate.
const MAX_DEFERRED_JS_KB = numberFromEnv("BUNDLE_MAX_DEFERRED_JS_KB", 140);
const MAX_DEFERRED_GZIP_KB = numberFromEnv("BUNDLE_MAX_DEFERRED_GZIP_KB", 52);

let hasFailure = false;

if (!existsSync(DIST_ASSETS_DIR)) {
  console.error("Bundle budget check needs a built dist/assets directory. Run npm run build first.");
  process.exit(1);
}

const jsFiles = readdirSync(DIST_ASSETS_DIR)
  .filter((file) => file.endsWith(".js"))
  .sort();

if (jsFiles.length === 0) {
  console.error("Bundle budget check found no JS assets in dist/assets.");
  process.exit(1);
}

console.log("\n=== Bundle budget ===");
console.log(`max raw JS asset: ${MAX_JS_KB} KiB`);
console.log(`max gzip JS asset: ${MAX_GZIP_KB} KiB`);

let precacheRawKb = 0;
let precacheGzipKb = 0;
let lazyMttRawKb = 0;
let lazyMttGzipKb = 0;
let lazyMttCount = 0;
let deferredRawKb = 0;
let deferredGzipKb = 0;
let deferredCount = 0;

for (const file of jsFiles) {
  const path = join(DIST_ASSETS_DIR, file);
  const rawBytes = statSync(path).size;
  const gzipBytes = gzipSync(readFileSync(path)).length;
  const rawKb = bytesToKiB(rawBytes);
  const gzipKb = bytesToKiB(gzipBytes);

  console.log(`${file}: raw=${rawKb.toFixed(2)} KiB gzip=${gzipKb.toFixed(2)} KiB`);

  // A solved turn family is budgeted with the lazy MTT content it is: fetched
  // per profile, never on the install path, and capped per chunk so one family
  // cannot grow without anyone noticing.
  const lazyMttProduction = isLazyMttProductionAsset(file) || isSolvedTurnAsset(file);
  const deferred = isPreflopEquityAsset(file);
  if (lazyMttProduction) {
    lazyMttCount += 1;
    lazyMttRawKb += rawKb;
    lazyMttGzipKb += gzipKb;
  } else if (deferred) {
    deferredCount += 1;
    deferredRawKb += rawKb;
    deferredGzipKb += gzipKb;
  } else {
    precacheRawKb += rawKb;
    precacheGzipKb += gzipKb;
  }

  const rawLimit = lazyMttProduction
    ? MAX_LAZY_MTT_JS_KB
    : deferred ? MAX_DEFERRED_JS_KB : MAX_JS_KB;
  const gzipLimit = lazyMttProduction
    ? MAX_LAZY_MTT_GZIP_KB
    : deferred ? MAX_DEFERRED_GZIP_KB : MAX_GZIP_KB;
  if (rawKb > rawLimit) {
    hasFailure = true;
    console.error(`${file} exceeds raw JS budget: ${rawKb.toFixed(2)} KiB > ${rawLimit} KiB`);
  }
  if (gzipKb > gzipLimit) {
    hasFailure = true;
    console.error(`${file} exceeds gzip JS budget: ${gzipKb.toFixed(2)} KiB > ${gzipLimit} KiB`);
  }
}

console.log(
  `precache JS total: raw=${precacheRawKb.toFixed(2)} KiB gzip=${precacheGzipKb.toFixed(2)} KiB`,
);
console.log(
  `lazy MTT JS total: count=${lazyMttCount} raw=${lazyMttRawKb.toFixed(2)} KiB ` +
    `gzip=${lazyMttGzipKb.toFixed(2)} KiB`,
);

console.log(
  `deferred JS total: count=${deferredCount} raw=${deferredRawKb.toFixed(2)} KiB ` +
    `gzip=${deferredGzipKb.toFixed(2)} KiB`,
);

checkTotalBudget("precache raw JS", precacheRawKb, MAX_PRECACHE_JS_KB);
checkTotalBudget("precache gzip JS", precacheGzipKb, MAX_PRECACHE_GZIP_KB);
checkTotalBudget("lazy MTT raw JS", lazyMttRawKb, MAX_LAZY_MTT_TOTAL_JS_KB);
checkTotalBudget("lazy MTT gzip JS", lazyMttGzipKb, MAX_LAZY_MTT_TOTAL_GZIP_KB);

if (hasFailure) {
  process.exitCode = 1;
}

function checkTotalBudget(label: string, actualKb: number, limitKb: number): void {
  if (actualKb <= limitKb) return;
  hasFailure = true;
  console.error(`${label} exceeds budget: ${actualKb.toFixed(2)} KiB > ${limitKb} KiB`);
}

function bytesToKiB(bytes: number): number {
  return bytes / 1024;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}
