import { describe, expect, it } from "vitest";

import { NEXT_UI_STORAGE_KEY, isNextUiEnabled } from "../../src/ui/trainer/uiFlag";

/**
 * Přepínač nového GUI tréninku. Od 3. 11. 2026 je nové GUI výchozí
 * (Agents/ui-redesign-plan.md, fáze 1); klasika zůstává za `?ui=classic`
 * a výslovně zvolená klasika se pamatuje.
 */
function memory(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("přepínač nového GUI", () => {
  it("bez volby a bez úložiště je výchozí nové GUI", () => {
    expect(isNextUiEnabled("", memory())).toBe(true);
    expect(isNextUiEnabled("", null)).toBe(true);
  });

  it("výslovně zvolená klasika zůstane, výslovně zvolené nové taky", () => {
    expect(isNextUiEnabled("", memory({ [NEXT_UI_STORAGE_KEY]: "0" }))).toBe(false);
    expect(isNextUiEnabled("", memory({ [NEXT_UI_STORAGE_KEY]: "1" }))).toBe(true);
  });

  it("parametr v adrese rozhodne a volbu si zapamatuje", () => {
    const storage = memory();
    expect(isNextUiEnabled("?ui=classic", storage)).toBe(false);
    expect(storage.items.get(NEXT_UI_STORAGE_KEY)).toBe("0");
    expect(isNextUiEnabled("", storage)).toBe(false);
    expect(isNextUiEnabled("?ui=next", storage)).toBe(true);
    expect(storage.items.get(NEXT_UI_STORAGE_KEY)).toBe("1");
  });

  it("nečitelné úložiště nové GUI nevypne", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(isNextUiEnabled("", broken)).toBe(true);
    expect(isNextUiEnabled("?ui=classic", broken)).toBe(false);
  });
});
