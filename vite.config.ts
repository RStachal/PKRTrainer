/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Vite konfigurace pro MTT Preflop Trainer.
// - relativní base pro offline/Android WebView nasazení (Req 12.1, 12.2)
// - výstup do dist/
// - samostatný vstup pro Service Worker s pevným názvem `sw.js` v kořeni dist/
//   (registrace v src/pwa/registerSw.ts očekává `./sw.js`), Req 12.1, 12.5
// - sekce `test` konfiguruje Vitest jako test runner (Req 12.1)
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: true,
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
    include: ["tests/**/*.{test,spec}.{ts,js}", "src/**/*.{test,spec}.{ts,js}"],
  },
});
