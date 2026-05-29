// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getByText } from "@testing-library/dom";

// Smoke test: ověřuje integraci jsdom + @testing-library/dom (DOM testy, Req 12.1).
describe("jsdom + @testing-library/dom smoke", () => {
  it("vykreslí element do DOM a najde jej podle textu", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p>Ahoj stůl</p>`;
    document.body.appendChild(root);

    const el = getByText(root, "Ahoj stůl");
    expect(el).toBeDefined();
    expect(el.textContent).toBe("Ahoj stůl");
  });
});
