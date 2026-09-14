import { describe, expect, it } from "vitest";

import { gridContentHash, isStale } from "../../scripts/lib/ryeAnswerHistory.mts";
import type { DraftRecord } from "../../scripts/lib/ryeDraftImpact.mts";

const record = {
  position: "BB",
  bucket: 20,
  context: "SQUEEZE",
  vsSeat: "LJ",
  stackSetupId: "MUL",
  sourceStackBB: 20,
  strict: { AA: ["JAM"], KQs: ["CALL"] },
  lenient: { AA: ["JAM"], KQs: ["CALL"] },
  mix: {},
  notes: [],
  sourceFile: "MUL-20BB-BB-vs-MP_LP.html",
} as unknown as DraftRecord;

describe("isStale", () => {
  it("s otiskem rozhoduje otisk", () => {
    const hash = gridContentHash(record);
    expect(isStale(record, { sourceFile: record.sourceFile, verdict: "sedí", flags: [], readAt: "2026-09-10", contentHash: hash })).toBe(false);
    expect(isStale(record, { sourceFile: record.sourceFile, verdict: "sedí", flags: [], readAt: "2026-09-10", contentHash: "jiný" })).toBe(true);
  });

  it("bez otisku a bez částečných vah platí odpověď dál", () => {
    expect(isStale(record, { sourceFile: record.sourceFile, verdict: "nesedí", flags: [], readAt: "2026-09-09" })).toBe(false);
  });

  it("odpověď nad mřížkou bez některé barvy je zastaralá i bez částečných vah", () => {
    // 9. 9. 2026 stránka nekreslila `All in` na dvou stránkách čtených jako
    // čelení all-inu; majitel je posoudil bez třetiny tříd. Odhad podle
    // částečných vah by tvrdil „beze změny" - a to by bylo přečteno o něčem jiném.
    expect(isStale(record, {
      sourceFile: record.sourceFile, verdict: "nesedí", flags: ["moc těsné"], readAt: "2026-09-09",
      readWithoutActions: ["All in"],
    })).toBe(true);
  });
});
