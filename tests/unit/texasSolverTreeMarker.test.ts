import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  cachedTreeMarkerVerdict,
  treeMarkerVerdict,
  type TreeMarkerCacheEntry,
} from "../../scripts/lib/texasSolverTreeMarker.mts";

// Matching root bet sizes cannot separate the two solver trees, because they are
// identical at the flop and diverge only at turn and river. That left 226 of 577
// boards unclassified, hiding three tree-mixing families from the guard meant to
// catch exactly that. This marker reads the board's own turn structure instead.

const MARKER = '"actions":["CHECK"]';
let dir: string | null = null;

function tempFile(name: string, content: string): string {
  dir ??= mkdtempSync(join(tmpdir(), "pkrtrainer-tree-marker-"));
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("tree marker", () => {
  it("calls a dump carrying the suppressed donk node reduced", () => {
    const path = tempFile("reduced.json", `{"a":1,${MARKER},"b":2}`);
    expect(treeMarkerVerdict(path)).toBe("REDUCED");
  });

  it("calls a dump without it full", () => {
    // A full tree's turn nodes always offer more than one action.
    const path = tempFile("full.json", '{"actions":["CHECK","BET 50","RAISE 150"],"x":1}');
    expect(treeMarkerVerdict(path)).toBe("FULL");
  });

  it("does not mistake a longer action list that merely starts with CHECK", () => {
    // The marker is the whole single-action array, not a prefix of a longer one.
    const path = tempFile("prefix.json", '{"actions":["CHECK","BET 25"]}');
    expect(treeMarkerVerdict(path)).toBe("FULL");
  });

  it("finds a marker split across a read boundary", () => {
    // The scanner reads in 8 MB chunks and must carry a tail, or a marker landing
    // on the seam would be missed and a reduced board would pass as full.
    const padding = "x".repeat((8 << 20) - Math.floor(MARKER.length / 2));
    const path = tempFile("boundary.json", `${padding}${MARKER}tail`);
    expect(treeMarkerVerdict(path)).toBe("REDUCED");
  });

  it("handles an empty file without claiming it is reduced", () => {
    expect(treeMarkerVerdict(tempFile("empty.json", ""))).toBe("FULL");
  });

  it("caches on size and mtime, and re-reads when the file changes", () => {
    const cache = new Map<string, TreeMarkerCacheEntry>();
    const path = tempFile("changing.json", '{"actions":["CHECK","BET 50"]}');
    expect(cachedTreeMarkerVerdict(path, cache)).toBe("FULL");
    expect(cache.size).toBe(1);

    // A re-solve rewrites the board; the cache must not answer from the old one.
    writeFileSync(path, `{"a":1,${MARKER}}`, "utf8");
    const future = new Date(Date.now() + 10_000);
    utimesSync(path, future, future);
    expect(cachedTreeMarkerVerdict(path, cache)).toBe("REDUCED");
  });

  it("answers from the cache when the file is untouched", () => {
    const cache = new Map<string, TreeMarkerCacheEntry>();
    const path = tempFile("stable.json", `{${MARKER}}`);
    expect(cachedTreeMarkerVerdict(path, cache)).toBe("REDUCED");
    const entry = cache.get(path);
    expect(entry?.verdict).toBe("REDUCED");
    expect(cachedTreeMarkerVerdict(path, cache)).toBe("REDUCED");
  });
});
