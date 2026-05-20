import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderApp } from "../src/App";
import { APP_STATE_KEY } from "../src/state/appStorage";

function setupDom(): HTMLDivElement {
  const dom = new JSDOM('<div id="app"></div>', {
    url: "http://localhost",
  });

  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;

  const app = dom.window.document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing app root");

  return app;
}

afterEach(() => {
  globalThis.window?.localStorage.clear();
});

describe("app interaction", () => {
  it("zpracuje klik na akční tlačítko a uloží výsledek", () => {
    const app = setupDom();

    renderApp(app);
    app.querySelector<HTMLButtonElement>('[data-action="OPEN"]')?.click();

    expect(app.textContent).toContain("Správně.");
    expect(
      app
        .querySelector<HTMLButtonElement>('[data-action="OPEN"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(window.localStorage.getItem(APP_STATE_KEY)).toContain(
      "mtt-15-25-open-btn-a8o",
    );
  });

  it("po dokončení bloku zobrazí shrnutí session", () => {
    const app = setupDom();

    renderApp(app);

    while (!app.textContent?.includes("Session dokoncena")) {
      const action = app.querySelector<HTMLButtonElement>("[data-action]");
      if (!action) throw new Error("Missing action button");

      action.click();
      app.querySelector<HTMLButtonElement>("[data-next]")?.click();
    }

    expect(app.textContent).toContain("Session dokoncena");
    expect(app.textContent).toContain("spravne");

    app.querySelector<HTMLButtonElement>("[data-new-block]")?.click();

    expect(app.textContent).toContain("Remaining");
    expect(app.textContent).not.toContain("Session dokoncena");
  });

  it("umozni nastavit blok, seed, rezim a scoring", () => {
    const app = setupDom();

    renderApp(app);

    const blockSize = app.querySelector<HTMLInputElement>("[data-block-size]");
    const seed = app.querySelector<HTMLInputElement>("[data-seed]");
    const mode = app.querySelector<HTMLSelectElement>("[data-mode]");
    const strict = app.querySelector<HTMLSelectElement>("[data-strict]");

    if (!blockSize || !seed || !mode || !strict) {
      throw new Error("Missing session controls");
    }

    blockSize.value = "5";
    blockSize.dispatchEvent(new window.Event("change", { bubbles: true }));

    const updatedSeed = app.querySelector<HTMLInputElement>("[data-seed]");
    if (!updatedSeed) throw new Error("Missing seed input");
    updatedSeed.value = "42";
    updatedSeed.dispatchEvent(new window.Event("change", { bubbles: true }));

    const updatedMode = app.querySelector<HTMLSelectElement>("[data-mode]");
    if (!updatedMode) throw new Error("Missing mode select");
    updatedMode.value = "MISSED";
    updatedMode.dispatchEvent(new window.Event("change", { bubbles: true }));

    const updatedStrict = app.querySelector<HTMLSelectElement>("[data-strict]");
    if (!updatedStrict) throw new Error("Missing strict select");
    updatedStrict.value = "STRICT";
    updatedStrict.dispatchEvent(new window.Event("change", { bubbles: true }));

    expect(app.querySelector<HTMLInputElement>("[data-block-size]")?.value).toBe(
      "5",
    );
    expect(app.querySelector<HTMLInputElement>("[data-seed]")?.value).toBe("42");
    expect(app.querySelector<HTMLSelectElement>("[data-mode]")?.value).toBe(
      "MISSED",
    );
    expect(app.querySelector<HTMLSelectElement>("[data-strict]")?.value).toBe(
      "STRICT",
    );
  });

  it("filtruje blok podle vybrane kategorie", () => {
    const app = setupDom();

    renderApp(app);

    const category = app.querySelector<HTMLSelectElement>("[data-category]");
    if (!category) throw new Error("Missing category select");

    category.value = "BB_DEFEND";
    category.dispatchEvent(new window.Event("change", { bubbles: true }));

    expect(app.textContent).toContain("BB defend proti BTN open");
    expect(app.textContent).not.toContain("BTN open proti blind");
  });
});
