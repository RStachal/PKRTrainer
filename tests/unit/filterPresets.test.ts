// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { renderFilters } from "../../src/ui/filters";

/**
 * Předvolby: pojmenované skupiny místo jedenatřiceti zaškrtávátek.
 *
 * Filtr má devět pozic, třináct hloubek a devět situací, a než hráč rozdá první
 * ruku, musí se prokousat všemi. Skoro vždycky se přitom vybírá souvislá
 * skupina - rané pozice, krátké stacky, obrana proti openu - takže rozbalovátko
 * pokrývá běžný případ jedním kliknutím.
 *
 * Co musí přežít: zaškrtávátka zůstávají v DOM se svými třídami a `data-`
 * atributy. Na jejich počty spoléhá kontrakt DOM testů a kdo chce přesně UTG a
 * button, musí si to pořád umět naklikat. Rozbalovátko je zkratka, ne náhrada.
 */
function render(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  renderFilters(root, { onStart: () => undefined });
  return root;
}

const checked = (root: HTMLElement, selector: string, attr: string): string[] => (
  [...root.querySelectorAll<HTMLInputElement>(selector)]
    .filter((input) => input.checked)
    .map((input) => input.dataset[attr] ?? "")
    .sort()
);

function choose(root: HTMLElement, selector: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(selector);
  if (select === null) throw new Error(`${selector} chybí`);
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

describe("předvolby filtrů", () => {
  it("zaškrtávátka zůstávají v DOM v původním počtu", () => {
    // Kontrakt DOM testů. Kdyby je rozbalovátko nahradilo, spadne čtení stavu
    // filtru všude jinde - a spadne to jinde než tady.
    const root = render();
    expect(root.querySelectorAll(".filter-position").length).toBe(9);
    expect(root.querySelectorAll(".filter-bucket").length).toBe(13);
    expect(root.querySelectorAll(".filter-context").length).toBe(9);
  });

  it("předvolba pozic zaškrtne právě svou skupinu", () => {
    const root = render();
    choose(root, ".filter-position-preset", "early");
    expect(checked(root, ".filter-position", "position")).toEqual(["UTG", "UTG+1", "UTG+2"]);
    choose(root, ".filter-position-preset", "blinds");
    expect(checked(root, ".filter-position", "position")).toEqual(["BB", "SB"]);
  });

  it("předvolba hloubek respektuje hranice, kterými se řídí obsah", () => {
    const root = render();
    choose(root, ".filter-bucket-preset", "short");
    expect(checked(root, ".filter-bucket", "bucket")).toEqual(["10", "15", "20", "5"]);
    choose(root, ".filter-bucket-preset", "deep");
    expect(checked(root, ".filter-bucket", "bucket")).toEqual(["100", "125", "150", "60", "75"]);
  });

  it("předvolba situací pokrývá obranu proti otevření jedním výběrem", () => {
    const root = render();
    choose(root, ".filter-context-preset", "vs-open");
    expect(checked(root, ".filter-context", "context"))
      .toEqual(["SQUEEZE", "VS_3BET", "VS_4BET", "VS_OPEN"]);
  });

  it("ruční změna přepne rozbalovátko na vlastní výběr", () => {
    // Bez tohohle by rozbalovátko tvrdilo „rané pozice" nad výběrem, který rané
    // pozice není - a to je horší než žádná zkratka.
    const root = render();
    choose(root, ".filter-position-preset", "early");
    const utg = root.querySelector<HTMLInputElement>('.filter-position[data-position="UTG"]');
    expect(utg).not.toBeNull();
    utg!.checked = false;
    utg!.dispatchEvent(new Event("change"));
    expect(root.querySelector<HTMLSelectElement>(".filter-position-preset")?.value).toBe("");
  });

  it("výběr, který předvolbě odpovídá, ji v rozbalovátku ukáže", () => {
    const root = render();
    for (const input of root.querySelectorAll<HTMLInputElement>(".filter-bucket")) {
      const bucket = Number(input.dataset.bucket);
      input.checked = bucket >= 25 && bucket <= 50;
    }
    // Refresh se pověsí na změnu kteréhokoli zaškrtávátka.
    root.querySelector<HTMLInputElement>(".filter-bucket")?.dispatchEvent(new Event("change"));
    expect(root.querySelector<HTMLSelectElement>(".filter-bucket-preset")?.value).toBe("mid");
  });
});
