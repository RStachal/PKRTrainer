import { describe, expect, it } from "vitest";

import {
  buildPrecacheManifest,
  injectPrecacheManifest,
  isLazyMttProductionAsset,
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
    const manifest = buildPrecacheManifest([
      "assets/main-AbCd1234.js",
      lazyPack,
      `${lazyPack}.map`,
    ]);

    expect(isLazyMttProductionAsset(lazyPack)).toBe(true);
    expect(isLazyMttProductionAsset("assets/postflop-line-AbCd1234.js")).toBe(false);
    expect(manifest.entries).toContain("./assets/main-AbCd1234.js");
    expect(manifest.entries).not.toContain(`./${lazyPack}`);
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
      "/repo/src/data/ranges/flopProductionStrategyPack.ts",
    )).toBeNull();
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
