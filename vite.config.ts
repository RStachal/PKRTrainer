/// <reference types="vitest/config" />
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
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
/**
 * Kolik vitest workerů si můžeme dovolit právě teď.
 *
 * Vrací nižší číslo, když na stroji běží solver, protože každý worker rozjede
 * vlastní strom podprocesů a solver už jádra drží. Detekce je záměrně
 * fail-open: když se zjišťování nepovede, vrátí konzervativní čtyřku, protože
 * spadlá konfigurace je horší než pomalá sada.
 */
function resolveTestWorkers(): number {
  const override = Number(process.env.PKRTRAINER_TEST_WORKERS);
  if (Number.isFinite(override) && override > 0) return override;
  try {
    const listing = execSync("tasklist /FI \"IMAGENAME eq console_solver.exe\" /NH", {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    return /console_solver/i.test(listing) ? 4 : 8;
  } catch {
    return 4;
  }
}

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
    // Kolik jich smí běžet, se ZJIŠŤUJE, ne předpokládá. Čtyři workery byly
    // zvoleny tak, aby se sada snesla se solverem, a měření ukázalo, co ten strop
    // stojí: sada obsahuje 58,7 minuty práce, deset CLI souborů z ní tvoří 55 %,
    // nejpomalejší dva 432 a 405 sekund.
    //
    // Bylo by lákavé zvednout to natvrdo s odůvodněním, že solver běží jen v noci.
    // Jenže ho spouští časovač na 21:00, ne dohoda — takže sada spuštěná večer by
    // narazila na osm solverů a šestnáct jader by obsluhovalo dvaatřicet vláken.
    // Proto se tu solver hledá za běhu a limit se podle toho sníží.
    maxWorkers: resolveTestWorkers(),
    minWorkers: 1,
    include: ["tests/**/*.{test,spec}.{ts,js}", "src/**/*.{test,spec}.{ts,js}"],
  },
});
