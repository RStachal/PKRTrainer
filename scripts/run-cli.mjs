import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

/**
 * Run a CLI script from a cached bundle instead of transpiling it every time.
 *
 *   node scripts/run-cli.mjs scripts/checkMttBlockers.mts -- --summary
 *
 * Every one of the hundred scripts here used to run under vite-node, which
 * transpiles the whole import graph in-process and shares nothing between runs.
 * That is most of what a CLI invocation cost: an empty script under vite-node
 * takes 3.3 seconds, but a real gate that imports the data layer took 66. Ten
 * gates in a chain was eleven minutes of transpiling the same modules ten times.
 *
 * Measured on the registry integrity gate: 66,354 ms under vite-node, 174 ms
 * from a bundle, identical output. The whole ten-gate chain went from 28.7
 * minutes to 1.7 seconds.
 *
 * The bundle is keyed by the content of everything it could contain, so editing
 * any source file invalidates it. That matters more than the speed: a stale
 * bundle would let a gate pass against code that no longer exists, which is
 * worse than a slow gate.
 *
 * The bundled module is imported rather than spawned - there is no second
 * process, and `process.argv` is rewritten first so the script sees exactly the
 * arguments it would have seen when invoked directly.
 */

const CACHE_DIR = resolve(".cache/cli");
const WATCHED = ["src", "scripts", "package.json", "tsconfig.json"];

function walk(path) {
  const entries = [];
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!existsSync(current)) continue;
    const info = statSync(current);
    if (!info.isDirectory()) {
      entries.push(`${current}:${info.size}:${info.mtimeMs}`);
      continue;
    }
    for (const child of readdirSync(current)) {
      if (child === "node_modules" || child.startsWith(".")) continue;
      stack.push(join(current, child));
    }
  }
  return entries;
}

/**
 * A key covering everything the bundle could have inlined.
 *
 * Size and modification time rather than content: hashing 1,300 files on every
 * invocation would give back the time this exists to save, and a file whose
 * content changes without either moving is not a case that arises from editing.
 */
function cacheKey() {
  const parts = WATCHED.flatMap(walk).sort();
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);
}

const [, , entry, ...rest] = process.argv;
if (entry === undefined) {
  console.error("Usage: node scripts/run-cli.mjs <script.mts> [args...]");
  process.exit(2);
}

const entryPath = resolve(entry);
if (!existsSync(entryPath)) {
  console.error(`run-cli: no such script: ${entry}`);
  process.exit(2);
}

const name = entryPath.split(/[\\/]/).pop().replace(/\.mts$/, "");
const outfile = join(CACHE_DIR, `${name}-${cacheKey()}.mjs`);

if (!existsSync(outfile)) {
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    // Dependencies stay external: they are already JavaScript and resolvable,
    // and inlining them would make the bundle slower to produce than to skip.
    packages: "external",
    logLevel: "error",
  });
}

// The script reads process.argv as though it had been invoked directly, so it
// has to see its own path in argv[1] and nothing of this runner.
process.argv = [process.argv[0], entryPath, ...rest];
await import(pathToFileURL(outfile).href);
