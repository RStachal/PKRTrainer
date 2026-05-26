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
  it("zpracuje klik na akcni tlacitko a ulozi vysledek", () => {
    const app = setupDom();

    renderApp(app);
    expect(app.textContent).toContain("Stack split");
    expect(app.textContent).toContain("0/0 · 0/0");
    expect(app.querySelector(".range-panel")).toBeNull();
    expect(app.textContent).not.toContain("Vysvetleni spravne odpovedi");

    const action = app.querySelector<HTMLButtonElement>("[data-action]");
    if (!action) throw new Error("Missing action button");

    action.click();

    expect(app.querySelector(".range-panel")).not.toBeNull();
    expect(app.textContent).toContain("Vysvetleni spravne odpovedi");
    expect(app.textContent).toMatch(/Spr|patn/);
    expect(
      app
        .querySelector<HTMLButtonElement>("[data-action]")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(window.localStorage.getItem(APP_STATE_KEY)).toContain("bySpot");
  });

  it("po dokonceni bloku zobrazi shrnuti session", () => {
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
    expect(app.textContent).toContain("15-20 BB");
    expect(app.textContent).toContain("21-25 BB");

    app.querySelector<HTMLButtonElement>("[data-new-block]")?.click();

    expect(app.textContent).toContain("Remaining");
    expect(app.textContent).not.toContain("Session dokoncena");
  });

  it("umozni nastavit blok, seed, rezim, stack band a scoring", () => {
    const app = setupDom();

    renderApp(app);

    const blockSize = app.querySelector<HTMLInputElement>("[data-block-size]");
    const seed = app.querySelector<HTMLInputElement>("[data-seed]");
    const mode = app.querySelector<HTMLSelectElement>("[data-mode]");
    const stackBand = app.querySelector<HTMLSelectElement>("[data-stack-band]");
    const strict = app.querySelector<HTMLSelectElement>("[data-strict]");

    if (!blockSize || !seed || !mode || !stackBand || !strict) {
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

    const updatedStackBand =
      app.querySelector<HTMLSelectElement>("[data-stack-band]");
    if (!updatedStackBand) throw new Error("Missing stack band select");
    updatedStackBand.value = "BB_21_25";
    updatedStackBand.dispatchEvent(new window.Event("change", { bubbles: true }));

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
    expect(app.querySelector<HTMLSelectElement>("[data-stack-band]")?.value).toBe(
      "BB_21_25",
    );
    expect(app.querySelector<HTMLSelectElement>("[data-strict]")?.value).toBe(
      "STRICT",
    );
  });

  it("umi filtrovat blok podle stack bandu", () => {
    const app = setupDom();

    renderApp(app);

    const stackBand = app.querySelector<HTMLSelectElement>("[data-stack-band]");
    if (!stackBand) throw new Error("Missing stack band select");

    stackBand.value = "BB_21_25";
    stackBand.dispatchEvent(new window.Event("change", { bubbles: true }));

    const spotMeta = app.querySelector(".spot-meta");
    if (!spotMeta) throw new Error("Missing spot meta");

    expect(spotMeta.textContent).toContain("21-25 BB");
  });

  it("umi jednim klikem prepnout stack band na slabsi vetev", () => {
    const app = setupDom();

    renderApp(app);

    const spotMetaBefore = app.querySelector(".spot-meta");
    if (!spotMetaBefore) throw new Error("Missing initial spot meta");

    const initialBand = spotMetaBefore.textContent?.includes("21-25 BB")
      ? "BB_21_25"
      : "BB_15_20";
    const expectedFocusBand =
      initialBand === "BB_21_25" ? "BB_15_20" : "BB_21_25";

    const action = app.querySelector<HTMLButtonElement>("[data-action]");
    if (!action) throw new Error("Missing action button");
    action.click();

    const focusButton = app.querySelector<HTMLButtonElement>("[data-stack-focus]");
    if (!focusButton) throw new Error("Missing stack focus button");
    expect(focusButton.dataset.stackFocus).toBe(expectedFocusBand);
    expect(app.textContent).toContain("Trenovat druhou vetev");

    focusButton.click();

    const stackBand = app.querySelector<HTMLSelectElement>("[data-stack-band]");
    if (!stackBand) throw new Error("Missing stack band select after focus click");
    expect(stackBand.value).toBe(expectedFocusBand);
  });

  it("umi jednim klikem prepnout stack band i na druhou vetev", () => {
    const app = setupDom();

    renderApp(app);

    const spotMetaBefore = app.querySelector(".spot-meta");
    if (!spotMetaBefore) throw new Error("Missing initial spot meta");

    const initialBand = spotMetaBefore.textContent?.includes("21-25 BB")
      ? "BB_21_25"
      : "BB_15_20";

    const action = app.querySelector<HTMLButtonElement>("[data-action]");
    if (!action) throw new Error("Missing action button");
    action.click();

    const secondaryButton = Array.from(
      app.querySelectorAll<HTMLButtonElement>("[data-stack-focus]"),
    ).find((button) => button.textContent?.includes("Trenovat druhou vetev"));
    if (!secondaryButton) throw new Error("Missing secondary stack focus button");

    expect(secondaryButton.dataset.stackFocus).toBe(initialBand);
    secondaryButton.click();

    const stackBand = app.querySelector<HTMLSelectElement>("[data-stack-band]");
    if (!stackBand) throw new Error("Missing stack band select after second click");
    expect(stackBand.value).toBe(initialBand);
  });

  it("filtruje blok podle vybrane kategorie", () => {
    const app = setupDom();

    renderApp(app);

    const category = app.querySelector<HTMLSelectElement>("[data-category]");
    if (!category) throw new Error("Missing category select");

    category.value = "BB_DEFEND";
    category.dispatchEvent(new window.Event("change", { bubbles: true }));

    expect(app.textContent).toContain("DEFEND");
    expect(app.textContent).not.toContain("BTN open proti blind");
  });

  it("nabizi jen kategorie s dostupnym obsahem pro aktualni format a fazi", () => {
    const app = setupDom();

    renderApp(app);

    const category = app.querySelector<HTMLSelectElement>("[data-category]");
    if (!category) throw new Error("Missing category select");

    const initialOptions = Array.from(category.options).map(
      (option) => option.value,
    );

    expect(initialOptions).toContain("OPEN_HJ_CO_BTN");
    expect(initialOptions).toContain("BB_DEFEND");
    expect(initialOptions).toContain("BB_DEFEND_2X");
    expect(initialOptions).toContain("REJAM");
    expect(initialOptions).toContain("SB_OPEN");
    expect(initialOptions).not.toContain("RIVER_PFR_VALUEBET");

    const format = app.querySelector<HTMLSelectElement>("[data-format]");
    if (!format) throw new Error("Missing format select");

    format.value = "CASH_100BB";
    format.dispatchEvent(new window.Event("change", { bubbles: true }));

    const phase = app.querySelector<HTMLSelectElement>("[data-phase]");
    if (!phase) throw new Error("Missing phase select");

    phase.value = "FLOP";
    phase.dispatchEvent(new window.Event("change", { bubbles: true }));

    const flopCategory = app.querySelector<HTMLSelectElement>("[data-category]");
    if (!flopCategory) throw new Error("Missing category select after phase");

    expect(Array.from(flopCategory.options).map((option) => option.value)).toEqual([
      "ALL",
      "FLOP_CBET_HU_DRY_PFR",
    ]);
  });
});
