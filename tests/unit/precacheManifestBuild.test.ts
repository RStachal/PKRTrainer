import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RollupOutput } from "rollup";
import { describe, expect, it } from "vitest";
import { build } from "vite";

import {
  buildPrecacheManifest,
  injectPrecacheManifest,
  isLazyMttProductionAsset,
  isDeferredAsset,
  mttProductionChunkNameForModuleId,
} from "../../src/pwa/precacheManifestBuild";

describe("precache build manifest", () => {
  it("generuje stabilni verzi a uplny seznam produkcnich assetu", () => {
    const first = buildPrecacheManifest([
      "sw.js",
      "assets/main-abc.js.map",
      "assets/main-abc.js",
      "icons/pkr-trainer.svg",
      "index.html",
    ]);
    const second = buildPrecacheManifest([
      "index.html",
      "icons/pkr-trainer.svg",
      "assets/main-abc.js",
      "sw.js",
    ]);

    expect(first).toEqual(second);
    expect(first.version).toMatch(/^[a-f0-9]{16}$/);
    expect(first.entries).toEqual([
      "./",
      "./assets/main-abc.js",
      "./icons/pkr-trainer.svg",
      "./index.html",
      "./manifest.webmanifest",
    ]);
  });

  it("zmeni cache verzi pri zmene hashovaneho chunku", () => {
    expect(buildPrecacheManifest(["assets/main-a.js"]).version)
      .not.toBe(buildPrecacheManifest(["assets/main-b.js"]).version);
  });

  it("neprecachuje profilove MTT production chunky", () => {
    const lazyPack = "assets/mtt-full-ring-9-turbo-flop-chip-ev-ante-off-production-v1-AbCd1234.js";
    const lazyPilotRuntime = "assets/mtt-postflop-pilot-runtime-AbCd1234.js";
    const manifest = buildPrecacheManifest([
      "assets/main-AbCd1234.js",
      lazyPack,
      lazyPilotRuntime,
      `${lazyPack}.map`,
    ]);

    expect(isLazyMttProductionAsset(lazyPack)).toBe(true);
    expect(isLazyMttProductionAsset(lazyPilotRuntime)).toBe(true);
    expect(isLazyMttProductionAsset("assets/postflop-line-AbCd1234.js")).toBe(false);
    expect(manifest.entries).toContain("./assets/main-AbCd1234.js");
    expect(manifest.entries).not.toContain(`./${lazyPack}`);
    expect(manifest.entries).not.toContain(`./${lazyPilotRuntime}`);
  });

  it("odvozuje deterministicky chunk name z production module path", () => {
    const expected = "mtt-six-max-regular-river-dolar-ev-ante-on-production-v1";
    expect(mttProductionChunkNameForModuleId(
      `C:\\repo\\src\\data\\ranges\\${expected}.ts`,
    )).toBe(expected);
    expect(mttProductionChunkNameForModuleId(
      `/repo/src/data/ranges/${expected}.ts`,
    )).toBe(expected);
    expect(mttProductionChunkNameForModuleId(
      "/repo/src/data/ranges/mttProductionRuntimeRegistry.ts",
    )).toBeNull();
    expect(mttProductionChunkNameForModuleId(
      "/repo/src/data/ranges/mttPostflopTrainingRuntime.ts",
    )).toBe("mtt-postflop-pilot-runtime");
    expect(mttProductionChunkNameForModuleId(
      "/repo/src/data/ranges/flopProductionStrategyPack.ts",
    )).toBeNull();
  });

  it("dá vyřešené turn rodině jméno, které precache pozná jako odložené", () => {
    // Tohle se jednou rozbilo tiše. Rodiny se emitují jako `.json`, protože jako
    // TypeScript stály dvanáct vteřin transformace v každém běhu sady - jenže
    // pravidlo hlídalo `.generated.ts`, po převodu přestalo platit, chunky
    // dostaly jméno podle souboru a precache je přestal poznávat. Rozpočet
    // vyskočil z 362 kB na 4,4 MB: celý solverový obsah se ocitl na instalační
    // cestě. Chytil to až rozpočet, ne test.
    for (const path of [
      "/repo/src/data/ranges/turn/mtt9-40bb-utg-bb-srp.generated.json",
      "C:\\repo\\src\\data\\ranges\\turn\\mtt9-40bb-utg-bb-srp.generated.json",
    ]) {
      const name = mttProductionChunkNameForModuleId(path);
      expect(name).toBe("mtt-turn-solved-mtt9-40bb-utg-bb-srp");
      expect(isDeferredAsset(`assets/${name}-AbCd1234.js`)).toBe(true);
    }
  });

  it("stejné pravidlo platí pro river, ne jen pro turn", () => {
    // Riverové rodiny jsou stejně velké a emitují se stejně. Kdyby je pravidlo
    // nepoznalo, zopakoval by se tentýž skok rozpočtu o ulici dál - a znovu by to
    // nechytil test, ale až rozpočet.
    for (const path of [
      "/repo/src/data/ranges/river/mtt9-20bb-btn-bb-srp-lowspr.generated.json",
      "C:\\repo\\src\\data\\ranges\\river\\mtt9-20bb-btn-bb-srp-lowspr.generated.json",
    ]) {
      const name = mttProductionChunkNameForModuleId(path);
      expect(name).toBe("mtt-river-solved-mtt9-20bb-btn-bb-srp-lowspr");
      expect(isDeferredAsset(`assets/${name}-AbCd1234.js`)).toBe(true);
    }
  });

  it("tabulka EV se pozná taky, přestože leží vedle rodin", () => {
    // `/ranges/river-ev/` neobsahuje `/ranges/river/`, takže naivní pořadí
    // podmínek by ji nepoznalo vůbec: chunk by dostal jméno podle souboru,
    // precache by ho vzal za nutný a půl megabajtu EV by přistálo na instalační
    // cestě i tomu, kdo si otevře jen preflopový dril.
    for (const path of [
      "/repo/src/data/ranges/river-ev/mtt9-20bb-btn-bb-srp-lowspr.generated.json",
      "C:\\repo\\src\\data\\ranges\\river-ev\\mtt9-20bb-btn-bb-srp-lowspr.generated.json",
    ]) {
      const name = mttProductionChunkNameForModuleId(path);
      expect(name).toBe("mtt-river-ev-solved-mtt9-20bb-btn-bb-srp-lowspr");
      expect(isDeferredAsset(`assets/${name}-AbCd1234.js`)).toBe(true);
    }
    // A rodina se nesmí schovat pod EV: jsou to dva různé chunky.
    expect(mttProductionChunkNameForModuleId(
      "/repo/src/data/ranges/river/mtt9-20bb-btn-bb-srp-lowspr.generated.json",
    )).toBe("mtt-river-solved-mtt9-20bb-btn-bb-srp-lowspr");
  });

  it("turnová tabulka EV a její manifest jsou taky odložené", () => {
    // Potřetí tatáž past, a tentokrát změřená dřív, než ta data vznikla:
    // `/ranges/turn-ev/` v pravidle chybělo, takže 48 tabulek dostalo jméno
    // podle souboru a instalační cesta vyskočila z 386 KiB na **20,7 MB raw /
    // 3,95 MB gzip** (bod 230). Zaplatil by to každý hráč při instalaci.
    for (const path of [
      "/repo/src/data/ranges/turn-ev/mtt9-20bb-btn-bb-srp-lowspr.generated.json",
      "C:\\repo\\src\\data\\ranges\\turn-ev\\mtt9-20bb-btn-bb-srp-lowspr.generated.json",
    ]) {
      const name = mttProductionChunkNameForModuleId(path);
      expect(name).toBe("mtt-turn-ev-solved-mtt9-20bb-btn-bb-srp-lowspr");
      expect(isDeferredAsset(`assets/${name}-AbCd1234.js`)).toBe(true);
    }
    // Rodina se nesmí schovat pod EV ani tady.
    expect(mttProductionChunkNameForModuleId(
      "/repo/src/data/ranges/turn/mtt9-20bb-btn-bb-srp-lowspr.generated.json",
    )).toBe("mtt-turn-solved-mtt9-20bb-btn-bb-srp-lowspr");
    // Manifest je seznam, podle kterého se tabulky stahují - nesmí být na
    // instalační cestě dřív než ony.
    const manifest = mttProductionChunkNameForModuleId(
      "/repo/src/data/ranges/turnEvManifest.generated.ts",
    );
    expect(manifest).toBe("mtt-manifest-turn-ev");
    expect(isDeferredAsset(`assets/${manifest}-AbCd1234.js`)).toBe(true);
  });

  it("realny Vite build emituje production modul jako lazy chunk mimo precache", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-lazy-mtt-"));
    const packId = "mtt-six-max-turbo-turn-chip-ev-ante-off-production-v1";
    try {
      writeFileSync(
        join(directory, "index.html"),
        '<script type="module" src="/main.ts"></script>',
        "utf8",
      );
      writeFileSync(
        join(directory, "main.ts"),
        `(globalThis as typeof globalThis & { loadPack?: unknown }).loadPack = ` +
          `() => import("./${packId}.ts").then((module) => module.pack);`,
        "utf8",
      );
      writeFileSync(
        join(directory, `${packId}.ts`),
        `export const pack = { id: ${JSON.stringify(packId)} };`,
        "utf8",
      );

      const result = await build({
        root: directory,
        logLevel: "silent",
        build: {
          write: false,
          rollupOptions: {
            output: {
              chunkFileNames: "assets/[name]-[hash].js",
              manualChunks(id) {
                return mttProductionChunkNameForModuleId(id) ?? undefined;
              },
            },
          },
        },
      });
      const outputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
      const fileNames = outputs.flatMap((output) => (
        output.output.map((entry) => entry.fileName)
      ));
      const productionChunk = fileNames.find((fileName) => (
        fileName.startsWith(`assets/${packId}-`) && fileName.endsWith(".js")
      ));

      expect(productionChunk).toBeDefined();
      expect(isLazyMttProductionAsset(productionChunk!)).toBe(true);
      expect(buildPrecacheManifest(fileNames).entries)
        .not.toContain(`./${productionChunk}`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("vlozi manifest do worker kodu a odstrani build tokeny", () => {
    const manifest = buildPrecacheManifest(["assets/main-a.js"]);
    const output = injectPrecacheManifest(
      'const cache="mtt-preflop-__PKR_PRECACHE_VERSION__";const files=JSON.parse("__PKR_PRECACHE_ENTRIES__");',
      manifest,
    );

    expect(output).toContain(`mtt-preflop-${manifest.version}`);
    expect(output).toContain("./assets/main-a.js");
    expect(output).not.toContain("__PKR_PRECACHE_");
  });
});
