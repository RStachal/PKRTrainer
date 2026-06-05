import { describe, expect, it } from "vitest";

import { createLazyRangeFile } from "../../src/data/ranges/lazyRangeFile";
import type { RangeRecord } from "../../src/data/ranges/schema";

const record: RangeRecord = {
  position: "BTN",
  bucket: 25,
  context: "RFI",
  lenient: { AKs: ["OPEN_2X"] },
  strict: { AKs: ["OPEN_2X"] },
};

describe("lazyRangeFile", () => {
  it("nestavi entries pri import-like metadata pristupu a build cacheuje", () => {
    let builds = 0;
    const file = createLazyRangeFile("ON", "test-v1", () => {
      builds += 1;
      return [record];
    });

    expect(file.ante).toBe("ON");
    expect(file.version).toBe("test-v1");
    expect(builds).toBe(0);
    expect(file.entries).toEqual([record]);
    expect(file.entries).toBe(file.entries);
    expect(builds).toBe(1);
  });
});
