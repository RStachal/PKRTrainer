import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CS } from "../../src/ui/cs";

describe("český katalog viditelných textů", () => {
  it("drží hlavní shell, profil, filtry a HH import v centrálním katalogu", () => {
    expect(CS.app.tabs).toEqual({
      training: "Trénink",
      stats: "Statistiky",
      hh: "Import HH",
    });
    expect(CS.hh.analyze).toBe("Analyzovat");
    expect(CS.hh.title).toBe("Import historie hand");
    expect(CS.hh.facts.board).toBe("Společné karty");
    expect(CS.hh.facts.pot).toBe("Bank");
    expect(CS.postflop.heroBucket).toBe("Kategorie handy Hero");
    expect(CS.postflop.situation).toBe("Situace");
    expect(CS.postflop.facingBet).toBe("Čelíme sázce");

    const main = readFileSync("src/main.ts", "utf8");
    const hhView = readFileSync("src/ui/hhView.ts", "utf8");
    const filters = readFileSync("src/ui/filters.ts", "utf8");
    const profileSelector = readFileSync("src/ui/profileSelector.ts", "utf8");
    const postflopView = readFileSync("src/ui/postflopView.ts", "utf8");
    expect(main).toContain('import { CS } from "./ui/cs"');
    expect(hhView).toContain('import { CS } from "./cs"');
    expect(filters).toContain('import { CS } from "./cs"');
    expect(profileSelector).toContain('import { CS } from "./cs"');
    expect(postflopView).toContain('import { CS } from "./cs"');
    expect(`${main}\n${hhView}\n${filters}\n${profileSelector}\n${postflopView}`).not.toMatch(
      /\b(?:Primary sections|Paste hand history here|Decision analysis|Your action|Not scored|Training profile|Start training|Change situation|Next spot|Unsupported profile|Generate spot|New spot|Hand line complete|Hero bucket|Flop review|Turn review|River review|eff\. stack)\b/,
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
