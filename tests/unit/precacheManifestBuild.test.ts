import { describe, expect, it } from "vitest";

import {
  buildPrecacheManifest,
  injectPrecacheManifest,
} from "../../src/pwa/precacheManifestBuild";

describe("precache build manifest", () => {
  it("generuje stabilni verzi a uplny seznam produkcnich assetu", () => {
    const first = buildPrecacheManifest([
      "sw.js",
      "assets/main-abc.js.map",
      "assets/main-abc.js",
      "index.html",
    ]);
    const second = buildPrecacheManifest([
      "index.html",
      "assets/main-abc.js",
      "sw.js",
    ]);

    expect(first).toEqual(second);
    expect(first.version).toMatch(/^[a-f0-9]{16}$/);
    expect(first.entries).toEqual([
      "./",
      "./assets/main-abc.js",
      "./index.html",
      "./manifest.webmanifest",
    ]);
  });

  it("zmeni cache verzi pri zmene hashovaneho chunku", () => {
    expect(buildPrecacheManifest(["assets/main-a.js"]).version)
      .not.toBe(buildPrecacheManifest(["assets/main-b.js"]).version);
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
