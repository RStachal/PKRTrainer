import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import type { AnswerHistory, RecordedAnswer } from "../../scripts/lib/ryeAnswerHistory.mts";
import { gridContentHash, gridQuestion } from "../../scripts/lib/ryeAnswerHistory.mts";
import type { DraftRecord } from "../../scripts/lib/ryeDraftImpact.mts";
import { selectGeneralOverrides, selectRefinedRecords } from "../../scripts/lib/ryeRefinedCandidate.mts";

/**
 * Sítko mezi schváleným draftem a produkčním packem (osa otvírače, bod 234).
 *
 * Do packu smí jen mřížka, kterou vlastník schválil nad její dnešní podobou a
 * na kterou se produkt umí zeptat. Každý důvod odmítnutí se počítá zvlášť;
 * tichý převod by vyrobil obsah, o kterém nikdo neví, proč tam je.
 */

function grid(overrides: Partial<DraftRecord>): DraftRecord {
  return {
    position: "BB", bucket: 20, context: "VS_OPEN", vsSeat: "BTN", stackSetupId: "F3B",
    sourceStackBB: 20, strict: { AA: ["3BET"], KQs: ["CALL"] }, lenient: { AA: ["3BET"], KQs: ["CALL"] },
    mix: {}, notes: [], sourceFile: "F3B-20BB-BB-vs-BTN.html",
    ...overrides,
  };
}

function approved(record: DraftRecord, extra: Partial<RecordedAnswer> = {}): RecordedAnswer {
  return {
    sourceFile: record.sourceFile, verdict: "sedí", flags: [], readAt: "2026-09-15",
    contentHash: gridContentHash(record), question: gridQuestion(record), ...extra,
  };
}

function history(answers: RecordedAnswer[]): AnswerHistory {
  return { origin: "test", readAt: "2026-09-15", bySourceFile: new Map(answers.map((a) => [a.sourceFile, a])) };
}

describe("výběr zpřesněných záznamů", () => {
  it("schválená mřížka jde do packu se sedačkou, původem a foldem u všech zbylých tříd", () => {
    const record = grid({});
    const { accepted, refused } = selectRefinedRecords([record], history([approved(record)]));
    expect(refused).toEqual([]);
    expect(accepted).toHaveLength(1);
    const out = accepted[0];
    expect(out.vsSeat).toBe("BTN");
    expect(out.provenance).toContain("F3B-20BB-BB-vs-BTN.html");
    expect(out.provenance).toContain("schváleno 2026-09-15");
    expect(out.strict.AA).toEqual(["3BET"]);
    expect(out.lenient.KQs).toEqual(["CALL"]);
    expect(out.strict["72o"]).toEqual(["FOLD"]);
    expect(Object.keys(out.strict)).toHaveLength(ALL_HAND_CLASSES.length);
    expect(Object.keys(out.lenient)).toHaveLength(ALL_HAND_CLASSES.length);
  });

  it("BB proti SB jde jako VS_OPEN z SB - rozhodnutí vlastníka 16. 9. 2026 držet RYE", () => {
    const bvb = grid({ sourceFile: "F3B-20BB-BB-vs-SB.html", vsSeat: "SB" });
    const { accepted, refused } = selectRefinedRecords([bvb], history([approved(bvb)]));
    expect(refused).toEqual([]);
    expect(accepted[0]?.vsSeat).toBe("SB");
  });

  it("každý důvod odmítnutí se počítá zvlášť", () => {
    const rejected = grid({ sourceFile: "F3B-20BB-BB-vs-CO.html", vsSeat: "CO" });
    const stale = grid({ sourceFile: "F3B-20BB-BB-vs-HJ.html", vsSeat: "HJ" });
    const icm = grid({ sourceFile: "ICM3-bb20bb-btn30bb.html", stackSetupId: "ICM3" });
    const pushFold = grid({ sourceFile: "PU-10bb-BU.html", context: "PUSH_FOLD", position: "BTN", bucket: 10, vsSeat: "", stackSetupId: "PU" });
    // Jam proti otevření na 50 bb produkt nenabízí (`RE_JAM_MAX` = 40; na 40 bb
    // se od 22. 9. 2026 nabízí tam, kde ho mřížka kreslí - rozhodnutí 8a).
    const jamDeep = grid({ sourceFile: "F3B-50BB-BB-vs-BTN.html", bucket: 50, sourceStackBB: 50, strict: { AA: ["JAM"] }, lenient: { AA: ["JAM"] } });
    const twin = grid({ sourceFile: "F3B-20BB-BB-vs-BTN-dup.html" });
    const first = grid({});
    const unanswered = grid({ sourceFile: "F3B-20BB-BB-vs-LJ.html", vsSeat: "LJ" });
    // Obranu proti otevření drill rozdává až od lojacku.
    const notDealt = grid({ sourceFile: "F3B-20BB-UTG1-vs-UTG.html", position: "UTG+1", vsSeat: "UTG" });

    const answers = [
      approved(rejected, { verdict: "nesedí" }),
      approved(stale, { contentHash: "jiný" }),
      approved(icm), approved(pushFold), approved(jamDeep), approved(twin), approved(first), approved(notDealt),
    ];
    const { accepted, counts, refused } = selectRefinedRecords(
      [rejected, stale, icm, pushFold, jamDeep, first, twin, unanswered, notDealt],
      history(answers),
    );
    expect(accepted.map((record) => record.provenance)).toHaveLength(1);
    expect(counts).toEqual({
      unanswered: 1, rejected: 1, stale: 1, icm: 1, noOpponent: 0, contextNotRefined: 1,
      actionNotOffered: 1, notDealt: 1, duplicateCell: 1,
    });
    expect(refused.find((row) => row.reason === "actionNotOffered")?.detail).toContain("AA:JAM");
    expect(refused.find((row) => row.reason === "duplicateCell")?.detail).toContain("F3B-20BB-BB-vs-BTN.html");
  });
});

describe("obecné záznamy nahrazené RYE (push/fold, otevření)", () => {
  // Rozhodnutí vlastníka 17. 9. 2026 (push/fold 10 bb) a 22. 9. 2026 (6a: RFI).
  const pushFold = grid({
    sourceFile: "PU-10bb-BU.html", context: "PUSH_FOLD", position: "BTN", bucket: 10, sourceStackBB: 10,
    vsSeat: "", stackSetupId: "PU", strict: { AA: ["JAM"], "72o": ["FOLD"] }, lenient: { AA: ["JAM"], "72o": ["FOLD"] },
  });
  const open100 = grid({
    sourceFile: "OP-100BB-BU.html", context: "RFI", position: "BTN", bucket: 100, sourceStackBB: 100,
    vsSeat: "", stackSetupId: "OP", strict: { AA: ["OPEN_25X"], "76s": ["OPEN_25X"] }, lenient: { AA: ["OPEN_25X"], "76s": ["OPEN_25X"] },
  });
  // Na 20 bb kreslí RYE u části rukou open-shove; nad listy (15 bb) se nabízí
  // jen tam, kde ho range učí (`jamTaught`, OPEN_SHOVE_TAUGHT_MAX = 20).
  const open20 = grid({
    sourceFile: "OP-20BB-BU.html", context: "RFI", position: "BTN", bucket: 20, sourceStackBB: 20,
    vsSeat: "", stackSetupId: "OP", strict: { AA: ["OPEN_2X"], "22": ["JAM"] }, lenient: { AA: ["OPEN_2X"], "22": ["JAM"] },
  });
  // Na 25 bb už shove místo otevření nikdo nekreslí a produkt ho nenabízí.
  const open25 = grid({
    sourceFile: "OP-25BB-BU.html", context: "RFI", position: "BTN", bucket: 25, sourceStackBB: 25,
    vsSeat: "", stackSetupId: "OP", strict: { AA: ["OPEN_2X"], "22": ["JAM"] }, lenient: { AA: ["OPEN_2X"], "22": ["JAM"] },
  });
  const defence = grid({});

  it("bere push/fold i otevření, otevření s jamem na 20 bb, a odmítne jam na 25 bb", () => {
    const { accepted, counts, refused } = selectGeneralOverrides(
      [pushFold, open100, open20, open25, defence],
      history([approved(pushFold), approved(open100), approved(open20), approved(open25), approved(defence)]),
    );
    expect(accepted.map((record) => `${record.context}|${record.position}|${record.bucket}`))
      .toEqual(["PUSH_FOLD|BTN|10", "RFI|BTN|100", "RFI|BTN|20"]);
    expect(accepted.every((record) => record.vsSeat === undefined)).toBe(true);
    expect(accepted[1].provenance).toContain("22. 9. 2026, 6a");
    expect(counts.actionNotOffered).toBe(1);
    expect(refused.find((row) => row.reason === "actionNotOffered")?.sourceFile).toBe("OP-25BB-BU.html");
  });
});
