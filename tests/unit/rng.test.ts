import { describe, it, expect } from "vitest";

import { hashStr, mulberry32 } from "../../src/core/rng";

describe("rng - deterministicka primitiva", () => {
  it("mulberry32 vraci stabilni sekvenci pro stejny seed", () => {
    const a = mulberry32(123456789);
    const b = mulberry32(123456789);

    expect(Array.from({ length: 10 }, () => a())).toEqual(
      Array.from({ length: 10 }, () => b()),
    );
  });

  it("mulberry32 je stabilni na hranicnich seedech 0 a uint32 max", () => {
    const zero = mulberry32(0);
    expect(Array.from({ length: 5 }, () => zero().toFixed(12))).toEqual([
      "0.266429208685",
      "0.000329745701",
      "0.223272027448",
      "0.146202147938",
      "0.467327822931",
    ]);

    const max = mulberry32(0xffffffff);
    expect(Array.from({ length: 5 }, () => max().toFixed(12))).toEqual([
      "0.896422614111",
      "0.189478256740",
      "0.715652678162",
      "0.944059909321",
      "0.845236431574",
    ]);
  });

  it("hashStr je stabilni FNV-1a uint32 hash", () => {
    expect(hashStr("")).toBe(2166136261);
    expect(hashStr("PKRTrainer")).toBe(336907727);
    expect(hashStr("RFI|BTN|15|AKs|ON")).toBe(1118463844);
  });
});
