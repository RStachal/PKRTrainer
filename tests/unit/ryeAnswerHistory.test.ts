import { describe, expect, it } from "vitest";

import { gridContentHash, gridQuestion, isStale } from "../../scripts/lib/ryeAnswerHistory.mts";
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

  it("stejný obrázek pod jinou otázkou je zastaralý", () => {
    // 15. 9. 2026: devět mřížek s verdiktem „sloučení akcí vadí" mělo správné
    // barvy a špatný kontext (push/fold místo čelení otevření). Po opravě se
    // překreslily se stejným otiskem; odmítnutí na nich držet nesmí, protože
    // teď odpovídají na jinou otázku, než jakou majitel posuzoval.
    const hash = gridContentHash(record);
    const answered = { sourceFile: record.sourceFile, verdict: "nesedí", flags: ["sloučení akcí vadí"], readAt: "2026-09-15", contentHash: hash };
    expect(isStale(record, { ...answered, question: gridQuestion(record) })).toBe(false);
    expect(isStale(record, { ...answered, question: "PUSH_FOLD|BB|20|" })).toBe(true);
    // Odpověď bez otázky (čtení před 15. 9.) se posuzuje jen otiskem.
    expect(isStale(record, answered)).toBe(false);
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
