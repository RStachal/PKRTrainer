import { describe, it, expect, vi } from "vitest";

import { resolveSeed } from "../../src/core/drillEngine";

describe("drillEngine - seed resolution", () => {
  it("ponecha platny seed beze zmeny vcetne hranic", () => {
    expect(resolveSeed(0)).toBe(0);
    expect(resolveSeed(12345)).toBe(12345);
    expect(resolveSeed(0xffffffff)).toBe(0xffffffff);
  });

  it("pro chybejici nebo neplatny seed vygeneruje platny uint32 seed", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      for (const seed of [undefined, null, -1, 1.5, Number.NaN, 0x1_0000_0000]) {
        const resolved = resolveSeed(seed);
        expect(Number.isInteger(resolved)).toBe(true);
        expect(resolved).toBeGreaterThanOrEqual(0);
        expect(resolved).toBeLessThanOrEqual(0xffffffff);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
