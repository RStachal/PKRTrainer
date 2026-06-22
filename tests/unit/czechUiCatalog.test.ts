import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CS } from "../../src/ui/cs";

describe("český katalog viditelných textů", () => {
  it("drží hlavní shell a HH import v centrálním katalogu", () => {
    expect(CS.app.tabs).toEqual({
      training: "Trénink",
      stats: "Statistiky",
      hh: "Import HH",
    });
    expect(CS.hh.analyze).toBe("Analyzovat");

    const main = readFileSync("src/main.ts", "utf8");
    const hhView = readFileSync("src/ui/hhView.ts", "utf8");
    expect(main).toContain('import { CS } from "./ui/cs"');
    expect(hhView).toContain('import { CS } from "./cs"');
    expect(`${main}\n${hhView}`).not.toMatch(
      /\b(?:Primary sections|Paste hand history here|Decision analysis|Your action|Not scored)\b/,
    );
  });

  it("publikovaná metadata deklarují češtinu a instalační ikonu", () => {
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
