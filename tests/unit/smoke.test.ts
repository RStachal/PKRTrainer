import { describe, it, expect } from "vitest";

// Smoke test: ověřuje, že Vitest runner běží (Req 12.1 — testovací rámec).
describe("Vitest runner smoke", () => {
  it("spustí triviální assertion", () => {
    expect(true).toBe(true);
  });
});
