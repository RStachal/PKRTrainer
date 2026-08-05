/// <reference types="vitest/config" />
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import {
  buildPrecacheManifest,
  injectPrecacheManifest,
  isLazyMttProductionAsset,
  mttProductionChunkNameForModuleId,
} from "./src/pwa/precacheManifestBuild";

const publicDirectory = fileURLToPath(new URL("./public", import.meta.url));

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
}

function listPublicAssets(): string[] {
  return listFiles(publicDirectory)
    .map((path) => relative(publicDirectory, path).split(sep).join("/"));
}

// Vite konfigurace pro MTT Preflop Trainer.
// - relativní base pro offline/Android WebView nasazení (Req 12.1, 12.2)
// - výstup do dist/
// - samostatný vstup pro Service Worker s pevným názvem `sw.js` v kořeni dist/
//   (registrace v src/pwa/registerSw.ts očekává `./sw.js`), Req 12.1, 12.5
// - sekce `test` konfiguruje Vitest jako test runner (Req 12.1)

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "pkrtrainer-precache-manifest",
      apply: "build",
      generateBundle(_options, bundle) {
        const worker = bundle["sw.js"];
        if (!worker || worker.type !== "chunk") {
          throw new Error("Expected generated sw.js chunk.");
        }
        const manifest = buildPrecacheManifest([
          ...Object.keys(bundle).filter((fileName) => !isLazyMttProductionAsset(fileName)),
          ...listPublicAssets(),
        ]);
        worker.code = injectPrecacheManifest(worker.code, manifest);
      },
    },
  ],
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: "hidden",
    rollupOptions: {
      input: {
        // Hlavní HTML vstup aplikace (JS/CSS bundly zůstávají hashované).
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        // Service Worker jako samostatný vstup → emitován jako kořenový sw.js.
        sw: fileURLToPath(new URL("./src/pwa/sw.ts", import.meta.url)),
      },
      output: {
        // SW musí mít stabilní, nehashovaný název v kořeni (kvůli scope a
        // očekávané cestě v registraci); ostatní vstupy zůstávají hashované.
        entryFileNames: (chunk) =>
          chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        manualChunks(id) {
          const mttProductionChunkName = mttProductionChunkNameForModuleId(id);
          if (mttProductionChunkName !== null) return mttProductionChunkName;
          if (id.split("\\").join("/").endsWith("/src/core/postflopLineSimulator.ts")) {
            return "postflop-line";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  test: {
    // Výchozí prostředí je `node` pro property/unit testy jádra
    // (tests/properties, tests/unit). DOM testy si vyžádají jsdom
    // přes komentář `// @vitest-environment jsdom` na začátku souboru.
    environment: "node",
    globals: true,
    // Mnoho integračních testů spouští další Node/PowerShell CLI procesy, takže
    // jeden worker znamená celý strom cmd -> npm -> node -> vite-node.
    //
    // Čtyřka není opatrnost, je to naměřená hodnota. Zvedl jsem ji na osm s tím,
    // že sada obsahuje 58,7 minuty práce a víc workerů ji stlačí — a měření to
    // otočilo naruby: 915 s při čtyřech, 4572 s při osmi. Každý CLI soubor se
    // zpomalil sedmkrát až dvanáctkrát, například mttPostflopActionEvIntakeCli
    // ze 186 s na 2251 s.
    //
    // Důvod je v tom, co ty testy dělají: osm workerů rozjede osm dalších
    // npm/vite-node stromů, takže na šestnácti jádrech soupeří přes třicet
    // procesů a studený start každého z nich se natáhne. Práce tu není dělitelná
    // tak, jak vypadá — přidání workerů přidává hlavně režii.
    //
    // Neměňte to bez měření. PKRTRAINER_TEST_WORKERS je pro případ, kdy sada běží
    // vedle něčeho jiného a potřebuje ubrat.
    maxWorkers: Number(process.env.PKRTRAINER_TEST_WORKERS ?? 4),
    minWorkers: 1,
    include: ["tests/**/*.{test,spec}.{ts,js}", "src/**/*.{test,spec}.{ts,js}"],
  },
});
