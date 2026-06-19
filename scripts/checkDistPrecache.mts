import { existsSync, readFileSync, readdirSync } from "node:fs";

const workerPath = "dist/sw.js";
const assetsPath = "dist/assets";
if (!existsSync(workerPath) || !existsSync(assetsPath)) {
  throw new Error("dist/ is missing; run npm run build first.");
}

const worker = readFileSync(workerPath, "utf8");
const mainChunks = readdirSync(assetsPath).filter((name) => (
  /^main-[a-zA-Z0-9_-]+\.js$/.test(name)
));
const errors: string[] = [];
if (mainChunks.length !== 1) errors.push(`Expected one main JS chunk, found ${mainChunks.length}.`);
for (const chunk of mainChunks) {
  if (!worker.includes(`./assets/${chunk}`)) {
    errors.push(`Service worker precache is missing assets/${chunk}.`);
  }
}
if (worker.includes("__PKR_PRECACHE_")) errors.push("Service worker contains build placeholders.");
if (!worker.includes("./index.html")) errors.push("Service worker precache is missing index.html.");
if (!worker.includes("./manifest.webmanifest")) {
  errors.push("Service worker precache is missing manifest.webmanifest.");
}
if (!/mtt-preflop-[a-f0-9]{16}/.test(worker)) {
  errors.push("Service worker cache name is not content-versioned.");
}

console.log("Dist precache integrity");
console.log(`valid: ${errors.length === 0}`);
console.log(`main chunks: ${mainChunks.length}`);
for (const error of errors) console.log(`error: ${error}`);
process.exitCode = errors.length === 0 ? 0 : 1;
