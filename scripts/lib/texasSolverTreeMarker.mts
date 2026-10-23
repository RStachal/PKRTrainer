import { openSync, readSync, closeSync, statSync } from "node:fs";

/**
 * Tell a full solver tree from the reduced review-only one by its own content.
 *
 * Matching root bet sizes against parameter sets cannot do this, because the two
 * trees are IDENTICAL at the flop root - they diverge only at turn and river.
 * Whenever a board's root sizes fit both a full and a low_memory set the root
 * test can only shrug, and it shrugged at 226 of 577 boards. Measured, 32 of
 * those were reduced, hiding three tree-mixing families from the guard that
 * exists to catch exactly that.
 *
 * The discriminator: a full parameter set declares `set_bet_sizes oop,turn,donk`,
 * a reduced one does not. With no donk size the solver still emits the turn donk
 * node, but with CHECK as its only legal action. A full tree never produces a
 * single-action node, so the byte string `"actions":["CHECK"]` appearing anywhere
 * means reduced.
 *
 * Validated against every board the root test was confident about: 305 full and
 * 46 reduced, with zero disagreements. It also does not false-fire on the
 * shallowest family in the library, where a player might plausibly be too short
 * to bet.
 *
 * Cost is asymmetric and that shapes the reading. A reduced verdict is decided by
 * the first hit, so it exits almost immediately; a full verdict is a claim that
 * the marker occurs NOWHERE and needs the whole file. Callers therefore cache on
 * size and mtime, which a re-solve changes.
 */
export type TreeMarkerVerdict = "FULL" | "REDUCED";

const DONK_MARKER = Buffer.from('"actions":["CHECK"]', "utf8");
const CHUNK_BYTES = 8 << 20;
/** Longest possible split of the marker across a chunk boundary. */
const OVERLAP = DONK_MARKER.length - 1;

export function treeMarkerVerdict(dumpPath: string): TreeMarkerVerdict {
  const handle = openSync(dumpPath, "r");
  try {
    const buffer = Buffer.alloc(CHUNK_BYTES + OVERLAP);
    let carried = 0;
    let position = 0;
    for (;;) {
      const read = readSync(handle, buffer, carried, CHUNK_BYTES, position);
      if (read === 0) return "FULL";
      position += read;
      const filled = buffer.subarray(0, carried + read);
      if (filled.includes(DONK_MARKER)) return "REDUCED";
      // Keep the tail so a marker split across the boundary is still seen.
      const keep = Math.min(OVERLAP, filled.length);
      filled.subarray(filled.length - keep).copy(buffer, 0);
      carried = keep;
    }
  } finally {
    closeSync(handle);
  }
}

export interface TreeMarkerCacheEntry {
  size: number;
  mtimeMs: number;
  verdict: TreeMarkerVerdict;
}

/**
 * Cached verdict. The key is the file's size and mtime, so a board that gets
 * re-solved is re-read rather than answered from a stale entry.
 */
export function cachedTreeMarkerVerdict(
  dumpPath: string,
  cache: Map<string, TreeMarkerCacheEntry>,
): TreeMarkerVerdict {
  const stats = statSync(dumpPath);
  const hit = cache.get(dumpPath);
  if (hit !== undefined && hit.size === stats.size && hit.mtimeMs === stats.mtimeMs) {
    return hit.verdict;
  }
  const verdict = treeMarkerVerdict(dumpPath);
  cache.set(dumpPath, { size: stats.size, mtimeMs: stats.mtimeMs, verdict });
  return verdict;
}
