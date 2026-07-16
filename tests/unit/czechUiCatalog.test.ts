import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  APP_LANGUAGE_STORAGE_KEY,
  CS,
  catalogForLanguage,
  initializeAppLanguage,
  setAppLanguage,
} from "../../src/ui/cs";

afterEach(() => {
  initializeAppLanguage(null);
});

describe("EN/CZ UI language contract", () => {
  it("keeps all controls in English and localizes only explanatory copy in CZ", () => {
    const english = catalogForLanguage("EN");
    const czech = catalogForLanguage("CZ");

    expect(english.app.tabs).toEqual({
      training: "Training",
      stats: "Stats",
      hh: "HH Import",
    });
    expect(czech.app.tabs).toEqual(english.app.tabs);
    expect(czech.profile.title).toBe("Training profile");
    expect(czech.filters.start).toBe("Start training");
    expect(czech.hh.analyze).toBe("Analyze");
    expect(czech.postflop.heroBucket).toBe("Hero hand bucket");

    expect(english.training.actionEv.unavailable).toContain("does not yet contain solver EV");
    expect(czech.training.actionEv.unavailable).toContain("neobsahuje solverové EV");
    expect(english.profile.productionOffline).toContain("reviewed data");
    expect(czech.profile.productionOffline).toContain("ověřená data");
    expect(english.hh.hint).toContain("Paste a PokerStars hand history");
    expect(czech.hh.hint).toContain("Vložte hand history");
  });

  it("persists the selected language and exposes it through the live catalog proxy", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    setAppLanguage("EN", storage);
    expect(values.get(APP_LANGUAGE_STORAGE_KEY)).toBe("EN");
    expect(CS.system.errorTitle).toBe("An error occurred");

    values.set(APP_LANGUAGE_STORAGE_KEY, "CZ");
    expect(initializeAppLanguage(storage)).toBe("CZ");
    expect(CS.system.errorTitle).toBe("Došlo k chybě");
    expect(CS.filters.start).toBe("Start training");
  });

  it("routes visible UI modules through the central live catalog", () => {
    const sources = [
      readFileSync("src/main.ts", "utf8"),
      readFileSync("src/ui/hhView.ts", "utf8"),
      readFileSync("src/ui/filters.ts", "utf8"),
      readFileSync("src/ui/profileSelector.ts", "utf8"),
      readFileSync("src/ui/postflopView.ts", "utf8"),
    ];
    for (const source of sources) expect(source).toContain("CS.");
  });

  it("keeps Czech as the install-time fallback while runtime can switch to EN", () => {
    const html = readFileSync("index.html", "utf8");
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
      lang: string;
      icons: Array<{ src: string; purpose: string }>;
    };

    expect(html).toContain('<html lang="cs">');
    expect(manifest.lang).toBe("cs");
    expect(manifest.icons).toContainEqual(expect.objectContaining({
      src: "./icons/pkr-trainer.svg",
      purpose: "any maskable",
    }));
  });
});
