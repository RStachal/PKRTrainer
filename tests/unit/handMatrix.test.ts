// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FlopzillaCategory } from "../../src/core/flopHandCategory";
import type { HandLabel } from "../../src/core/types";
import { combosInClass, handMatrix, type HandMatrixCell } from "../../src/ui/kit/handMatrix";
import { flopzillaCategoryColor } from "../../src/ui/postflopRangeMatrixView";
import { RANGE_MATRIX_COLORS } from "../../src/ui/rangeMatrixView";
import { stylesheet } from "../stylesheets";

/**
 * Matice 13×13 nového GUI (Agents/ui-redesign-plan.md, fáze 2): mřížka podle
 * WAI-ARIA, výběr, zvýraznění skupiny a čitelnost popisku na každé barvě.
 */

function mount(cell: (hand: HandLabel) => HandMatrixCell = () => ({ color: "#2bd576", description: "Open" })) {
  const onSelect = vi.fn();
  const matrix = handMatrix(document, { label: "Matice", cell, hero: "AKo", onSelect });
  document.body.appendChild(matrix.element);
  const at = (hand: string) => matrix.element.querySelector<HTMLElement>(`[data-hand="${hand}"]`)!;
  return { matrix, onSelect, at };
}

const key = (target: HTMLElement, name: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, ...init }));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("matice 13×13", () => {
  it("má 13 řádků po 13 buňkách s rukou v popisku, páry na diagonále", () => {
    const { matrix, at } = mount();
    const rows = matrix.element.querySelectorAll('[role="row"]');
    expect(rows).toHaveLength(13);
    for (const row of rows) expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(13);
    const cells = [...matrix.element.querySelectorAll<HTMLElement>('[role="gridcell"]')];
    expect(cells.map((cell) => cell.dataset.hand)).toContain("72o");
    expect(new Set(cells.map((cell) => cell.dataset.hand)).size).toBe(169);
    expect(cells[0].dataset.hand).toBe("AA");
    expect(cells[1].dataset.hand).toBe("AKs");
    expect(cells[13].dataset.hand).toBe("AKo");
    expect(at("AKs").textContent).toBe("AKs");
    expect(at("AKs").getAttribute("aria-label")).toBe("AKs: Open");
  });

  it("ruka hráče má vlastní značku a je vybraná; tabulátor vede jen na ni", () => {
    const { matrix, at } = mount();
    expect(at("AKo").dataset.hero).toBe("true");
    expect(at("AKo").getAttribute("aria-label")).toBe("AKo: Open (tvoje ruka)");
    expect(at("AKo").getAttribute("aria-selected")).toBe("true");
    const tabbable = matrix.element.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(at("AKo"));
  });

  it("klepnutí vybere ruku, ohlásí ji a výběr se přesune", () => {
    const { onSelect, at } = mount();
    at("T9s").click();
    expect(onSelect).toHaveBeenCalledWith("T9s");
    expect(at("T9s").getAttribute("aria-selected")).toBe("true");
    expect(at("T9s").tabIndex).toBe(0);
    expect(at("AKo").getAttribute("aria-selected")).toBe("false");
    expect(at("AKo").tabIndex).toBe(-1);
    expect(document.activeElement).toBe(at("T9s"));
  });

  it("šipky, Home a End přesouvají výběr a na okraji se zastaví", () => {
    const { onSelect, at } = mount();
    // AKo je řádek 1, sloupec 0.
    key(at("AKo"), "ArrowUp");
    expect(onSelect).toHaveBeenLastCalledWith("AA");
    key(at("AA"), "ArrowUp");
    expect(onSelect).toHaveBeenLastCalledWith("AA");
    key(at("AA"), "ArrowLeft");
    expect(onSelect).toHaveBeenLastCalledWith("AA");
    key(at("AA"), "ArrowRight");
    expect(onSelect).toHaveBeenLastCalledWith("AKs");
    key(at("AKs"), "End");
    expect(onSelect).toHaveBeenLastCalledWith("A2s");
    key(at("A2s"), "ArrowDown");
    expect(onSelect).toHaveBeenLastCalledWith("K2s");
    key(at("K2s"), "Home");
    expect(onSelect).toHaveBeenLastCalledWith("AKo");
    key(at("AKo"), "End", { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith("22");
    expect(document.activeElement).toBe(at("22"));
  });

  it("klávesa jde od buňky se zaměřením, i když ji nikdo nevybral", () => {
    const { onSelect, at } = mount();
    at("QJs").focus();
    key(at("QJs"), "Enter");
    expect(onSelect).toHaveBeenLastCalledWith("QJs");
    expect(at("QJs").getAttribute("aria-selected")).toBe("true");
  });

  it("zvýraznění ztlumí ruce mimo skupinu; buňka smí patřit do dvou", () => {
    const { matrix, at } = mount((hand) => (
      hand === "76s"
        ? { color: "#2bd576", groups: ["BET_SMALL", "BLUFF"], hatched: true, description: "Bet, blaf" }
        : { color: "#2bb1a8", groups: ["CHECK"], description: "Check" }
    ));
    expect(at("76s").dataset.hatched).toBe("true");
    matrix.highlight("BLUFF");
    expect(at("76s").dataset.muted).toBeUndefined();
    expect(at("AA").dataset.muted).toBe("true");
    matrix.highlight("BET_SMALL");
    expect(at("76s").dataset.muted).toBeUndefined();
    matrix.highlight(null);
    expect(matrix.element.querySelectorAll("[data-muted]")).toHaveLength(0);
  });

  it("ruka mimo range zůstane prázdná, bez barvy akce", () => {
    const { at } = mount((hand) => (hand === "AA" ? { color: "#cc3440", description: "All-in" } : { description: "mimo range" }));
    expect(at("72o").dataset.empty).toBe("true");
    expect(at("72o").style.getPropertyValue("--action-accent")).toBe("");
    expect(at("AA").style.getPropertyValue("--action-accent")).toBe("#cc3440");
  });

  it("počítá kombinace třídy", () => {
    expect(combosInClass("AA")).toBe(6);
    expect(combosInClass("AKs")).toBe(4);
    expect(combosInClass("AKo")).toBe(12);
  });
});

describe("popisek buňky je čitelný na každé barvě", () => {
  const tokens = stylesheet("tokens.css");
  const token = (name: string): string => {
    const match = tokens.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`chybí token ${name}`);
    return match[1].trim();
  };

  const rgb = (color: string): [number, number, number] => {
    const hex = color.replace("#", "");
    return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
  };
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: readonly number[]): number =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const contrast = (left: readonly number[], right: readonly number[]): number => {
    const [light, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };

  const plate = token("--dx-matrix-plate").match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  const text = rgb(token("--dx-text"));

  /** Podklad popisku přes barvu buňky, jak ho složí prohlížeč. */
  function underLabel(cell: string): number[] {
    if (!plate) throw new Error("podklad popisku není rgba()");
    const alpha = Number(plate[4]);
    return rgb(cell).map((value, index) => alpha * Number(plate[index + 1]) + (1 - alpha) * value);
  }

  const categories: FlopzillaCategory[] = [
    "SET_PLUS", "MADE_FLUSH", "MADE_STRAIGHT", "TWO_PAIR", "OVERPAIR", "TOP_PAIR", "PAIR",
    "UNDERPAIR", "FLUSH_DRAW", "OESD", "GUTSHOT", "BACKDOOR_DRAW", "OVERCARDS", "AIR",
  ];
  const colors = [
    ...Object.values(RANGE_MATRIX_COLORS),
    ...categories.map(flopzillaCategoryColor),
    // Nejhorší možný případ: buňka by byla bílá.
    "#ffffff",
  ];

  it.each(colors)("na %s má popisek aspoň 4,5:1", (color) => {
    expect(contrast(text, underLabel(color))).toBeGreaterThanOrEqual(4.5);
  });
});
