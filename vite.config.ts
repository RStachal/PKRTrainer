/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Vite konfigurace pro MTT Preflop Trainer.
// - relativní base pro offline/Android WebView nasazení (Req 12.1, 12.2)
// - výstup do dist/
// - sekce `test` konfiguruje Vitest jako test runner (Req 12.1)
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: true,
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
