import { describe, expect, it } from "vitest";

import { stylesheet } from "../stylesheets";

/**
 * Tokeny nového GUI (src/ui/styles/tokens.css) a prvky, které je používají.
 *
 * Kontrast se měří tady, nad samotnými tokeny, bez prohlížeče: každá dvojice
 * text/pozadí, kterou návrh používá, musí mít aspoň 4,5:1 (WCAG AA pro běžný
 * text) a zaměření aspoň 3:1 proti stránce. Plán: Agents/ui-redesign-plan.md.
 */

const tokensCss = stylesheet("tokens.css");
const componentsCss = stylesheet("components.css");

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declaredProperties(css: string): Map<string, string> {
  const declared = new Map<string, string>();
  for (const match of withoutComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (!declared.has(match[1])) declared.set(match[1], match[2].trim());
  }
  return declared;
}

const tokens = declaredProperties(tokensCss);

function hex(name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`token ${name} není šestimístná barva: ${value}`);
  }
  return value;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => channel(parseInt(color.slice(at, at + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(left: string, right: string): number {
  const [light, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const SURFACES = ["--dx-bg", "--dx-surface-sunken", "--dx-surface", "--dx-surface-raised"];
const TEXTS = ["--dx-text", "--dx-text-secondary", "--dx-text-muted", "--dx-text-subtle", "--dx-link"];
const OUTCOMES = ["best", "equivalent", "acceptable", "mistake", "unsolved"];
const SUITS = ["--dx-suit-clubs", "--dx-suit-diamonds", "--dx-suit-hearts", "--dx-suit-spades"];

describe("tokeny vzhledu", () => {
  it("měřítko kontrastu sedí na známých hodnotách", () => {
    // Bez toho by chyba ve vzorci udělala ze všech bran níž kulisu.
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThan(4.5);
  });

  it("každý text je čitelný na každé ploše", () => {
    const failing: string[] = [];
    for (const text of TEXTS) {
      for (const surface of SURFACES) {
        const ratio = contrast(hex(text), hex(surface));
        if (ratio < 4.5) failing.push(`${text} na ${surface}: ${ratio.toFixed(2)}`);
      }
    }
    expect(failing).toEqual([]);
  });

  it("text na akcentu, na verdiktech a na stole je čitelný", () => {
    const pairs: Array<[string, string]> = [
      ["--dx-on-accent", "--dx-accent"],
      ["--dx-text", "--dx-felt"],
      ["--dx-text", "--dx-felt-rail"],
      ...OUTCOMES.map((outcome): [string, string] => [
        `--dx-on-outcome-${outcome}`,
        `--dx-outcome-${outcome}`,
      ]),
    ];
    const failing = pairs
      .map(([text, surface]) => ({ text, surface, ratio: contrast(hex(text), hex(surface)) }))
      .filter((pair) => pair.ratio < 4.5)
      .map((pair) => `${pair.text} na ${pair.surface}: ${pair.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it("barvy na kartě mají kontrast i v malé velikosti", () => {
    // Malá karta na desce v mobilu má barvu kolem 13 px, takže platí 4,5:1,
    // ne mírnějších 3:1 pro velký text.
    const failing = SUITS
      .map((suit) => ({ suit, ratio: contrast(hex(suit), hex("--dx-card-face")) }))
      .filter((pair) => pair.ratio < 4.5)
      .map((pair) => `${pair.suit}: ${pair.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it("zaměření je vidět proti stránce i proti plochám", () => {
    for (const surface of SURFACES) {
      expect(contrast(hex("--dx-accent"), hex(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it("verdikty se navzájem liší", () => {
    const colors = OUTCOMES.map((outcome) => hex(`--dx-outcome-${outcome}`).toLowerCase());
    expect(new Set(colors).size).toBe(OUTCOMES.length);
  });

  it("pohyb se vypne, když o to hráč požádá", () => {
    const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*\}/.exec(tokensCss)?.[1] ?? "";
    expect(reduced).toMatch(/--dx-duration-fast:\s*0ms/);
    expect(reduced).toMatch(/--dx-duration:\s*0ms/);
  });
});

describe("prvky nad tokeny", () => {
  it("odkazují jen na tokeny, které existují", () => {
    const defined = new Set([...tokens.keys(), ...declaredProperties(componentsCss).keys()]);
    // Barvu akce nastavuje kód z jediného zdroje barev akcí, ne CSS.
    defined.add("--action-accent");
    const used = [...withoutComments(componentsCss + tokensCss).matchAll(/var\((--[a-z0-9-]+)/gi)]
      .map((match) => match[1]);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("nemají vlastní barvy - vše jde přes tokeny", () => {
    const css = withoutComments(componentsCss);
    expect(css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(css.match(/\b(rgba?|hsla?)\(/gi) ?? []).toEqual([]);
  });

  it("nic nenačítají ze sítě", () => {
    // Aplikace je offline-first (zásada 4 v Agents/design.md): žádné písmo
    // ani obrázek odjinud.
    for (const css of [tokensCss, componentsCss]) {
      expect(withoutComments(css)).not.toMatch(/@import|url\(/i);
    }
  });
});
