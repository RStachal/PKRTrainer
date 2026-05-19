import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderApp } from "../src/App";
import { APP_STATISTICS_KEY } from "../src/state/appStorage";

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
    expect(window.localStorage.getItem(APP_STATISTICS_KEY)).toContain(
      "mtt-15-25-open-btn-a8o",
    );
  });
});
