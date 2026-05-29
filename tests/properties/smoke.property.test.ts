import { describe, it } from "vitest";
import fc from "fast-check";

// Smoke test: ověřuje integraci fast-check (PBT) do testovacího rámce (Req 12.1).
describe("fast-check (PBT) smoke", () => {
  it("komutativita sčítání platí pro libovolná celá čísla", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
    );
  });
});
