import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import type { MttPreflopImportRecord } from "../../src/data/ranges/mttPreflopRangePackImport";
import type { AnswerHistory, RecordedAnswer } from "../../scripts/lib/ryeAnswerHistory.mts";
import { gridContentHash, gridQuestion } from "../../scripts/lib/ryeAnswerHistory.mts";
import type { DraftRecord } from "../../scripts/lib/ryeDraftImpact.mts";
import {
  generalCopiesForFlatCallers,
  selectGeneralOverrides,
  selectRefinedRecords,
} from "../../scripts/lib/ryeRefinedCandidate.mts";

/**
 * Sítko mezi schváleným draftem a produkčním packem (osa otvírače, bod 234).
 *
 * Do packu smí jen mřížka, kterou vlastník schválil nad její dnešní podobou a
 * na kterou se produkt umí zeptat. Každý důvod odmítnutí se počítá zvlášť;
 * tichý převod by vyrobil obsah, o kterém nikdo neví, proč tam je.
 */

function grid(overrides: Partial<DraftRecord>): DraftRecord {
  return {
    // `flatCallers: []` je výchozí, protože to je **to, co parser vrací** u stránky,
    // na které otevření nikdo nedorovnal - a takové jsou skoro všechny. Chybějící
    // seznam znamená „ze jména se to nepozná" a výběr takový záznam odmítá
    // (`flatCallersUnknown`), takže fixtura bez téhle hodnoty by popisovala stav,
    // jaký z importu nevyjde.
    flatCallers: [],
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

  it("dílčí stránka neprojde ani schválená - fold na zbytku rukou zdroj netvrdí", () => {
    // Stránka, jejíž legenda sečte sto procent na obarvené desetině mřížky,
    // popisuje jednu větev strategie. Schválení říká „mřížka sedí na zdroj“,
    // ne „na zbylých rukách se skládá“ - ten fold dodává `fillFolds`.
    // Naměřeno 24. 9. 2026: devět takových záznamů bylo v draftu, šest z nich
    // schválených, a do packu by šly se 143 až 159 ze 169 tříd jako FOLD.
    const record = grid({
      sourceFile: "SQU-40BBMais-BU-vs-EP-MP.html",
      context: "SQUEEZE",
      position: "BTN",
      vsSeat: "UTG",
      bucket: 40,
      partial: true,
    });
    const { accepted, refused } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted).toEqual([]);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toBe("partialPage");
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
      actionNotOffered: 1, notDealt: 1, duplicateCell: 1, partialPage: 0,
      flatCallersUnknown: 0,
    });
    expect(refused.find((row) => row.reason === "actionNotOffered")?.detail).toContain("AA:JAM");
    expect(refused.find((row) => row.reason === "duplicateCell")?.detail).toContain("F3B-20BB-BB-vs-BTN.html");
  });
});

describe("pásmo hloubek: stránka platná od-do obsadí celé pásmo", () => {
  /**
   * Rozhodnutí vlastníka 1c a 2a (22. 9. 2026). Squeeze stránky zdroje platí
   * „od 40 bb výš", BB proti limpu „20-25BB"; jeden záznam na spodní hranici by
   * nechal zbytek pásma prázdný, ačkoli o něm zdroj mluví. Strop je 75 bb:
   * nad 100 bb korpus mlčí a odvozovat tam range by bylo tvrzení bez zdroje.
   */
  const squeeze = (overrides: Partial<DraftRecord> = {}): DraftRecord => grid({
    context: "SQUEEZE", position: "BTN", bucket: 40, vsSeat: "HJ", sourceStackBB: 40,
    stackSetupId: "SQU", sourceFile: "SQU-40BBMais-BU-vs-HJ-CO.html",
    bucketSpan: [40, 50, 60, 75],
    strict: { AA: ["SQUEEZE"], KQs: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"], KQs: ["SQUEEZE"] },
    ...overrides,
  });

  it("squeeze ze stránky „40 bb a víc“ obsadí 40, 50, 60 i 75 a nic hlubšího", () => {
    const record = squeeze();
    const { accepted, refused } = selectRefinedRecords([record], history([approved(record)]));
    expect(refused).toEqual([]);
    expect(accepted.map((row) => row.bucket)).toEqual([40, 50, 60, 75]);
    expect(accepted.every((row) => row.vsSeat === "HJ" && row.context === "SQUEEZE")).toBe(true);
    // Kopie musí říct, že je z pásma, jinak by v packu vypadala jako vlastní měření.
    expect(accepted[0].provenance).not.toContain("pásmo");
    expect(accepted[3].provenance).toContain("pásmo 40-50-60-75 bb, tohle je 75 bb");
    // Obsah je tentýž, jen hloubka jiná.
    expect(accepted[3].strict.AA).toEqual(["SQUEEZE"]);
  });

  it("konkrétnější stránka drží buňku; z pásma se kopie nepřepíše", () => {
    const span = squeeze();
    const exact = squeeze({
      bucket: 60, sourceStackBB: 60, sourceFile: "SQU-60BB-BU-vs-HJ-CO.html",
      bucketSpan: undefined,
      strict: { AA: ["SQUEEZE"], KQs: ["FOLD"] }, lenient: { AA: ["SQUEEZE"], KQs: ["FOLD"] },
    });
    const { accepted, refused } = selectRefinedRecords([exact, span], history([approved(exact), approved(span)]));
    const at60 = accepted.filter((row) => row.bucket === 60);
    expect(at60).toHaveLength(1);
    expect(at60[0].provenance).toContain("SQU-60BB-BU-vs-HJ-CO.html");
    expect(refused.map((row) => row.reason)).toContain("duplicateCell");
    expect(refused.find((row) => row.reason === "duplicateCell")?.detail).toContain("60 bb z pásma");
  });

  /**
   * Pásma zdroje na sebe nasedají a na 20 bb si odporují: stránka 15-20 tam
   * jamuje, stránka 20-25 ne. Nález vlastníka z 23. 9. 2026 - do té doby
   * vyhrávala ta, která byla v draftu dřív, takže odpověď hráče záležela na
   * pořadí v souboru. Test drží obojí: kdo vyhraje, a že na pořadí nezáleží.
   */
  const limpPage = (
    bucket: number, span: number[], file: string, jam: boolean,
  ): DraftRecord => grid({
    context: "VS_LIMP", position: "BB", bucket, vsSeat: "SB", sourceStackBB: bucket,
    stackSetupId: "BBSTR", sourceFile: file, bucketSpan: span,
    strict: { AA: ["ISO_3X"], "22": jam ? ["JAM"] : ["LIMP"] },
    lenient: { AA: ["ISO_3X"], "22": jam ? ["JAM"] : ["LIMP"] },
  });

  it("na překryvu pásem vyhraje stránka, která tou hloubkou začíná", () => {
    const shallow = limpPage(15, [15, 20], "BBSTR-vs-SB-Limp-15-20BB.html", true);
    const deeper = limpPage(20, [20, 25], "BBSTR-vs-SB-Limp-20-25BB.html", false);
    for (const order of [[shallow, deeper], [deeper, shallow]]) {
      const { accepted } = selectRefinedRecords(order, history([approved(shallow), approved(deeper)]));
      const at20 = accepted.filter((row) => row.bucket === 20);
      expect(at20).toHaveLength(1);
      // Na 20 bb platí stránka 20-25, tedy ta, která tam nejamuje.
      expect(at20[0].provenance).toContain("BBSTR-vs-SB-Limp-20-25BB.html");
      expect(at20[0].strict["22"]).toEqual(["LIMP"]);
      // A 15 i 25 bb zůstanou obsazené, pásmo se tím neztratí.
      expect(accepted.map((row) => row.bucket).sort((l, r) => l - r)).toEqual([15, 20, 25]);
    }
  });

  it("BB proti limpu jde jako VS_LIMP z SB a obsadí své pásmo", () => {
    const limp = grid({
      context: "VS_LIMP", position: "BB", bucket: 20, vsSeat: "SB", sourceStackBB: 20,
      stackSetupId: "BBSTR", sourceFile: "BBSTR-vs-SB-Limp-20-25BB.html",
      bucketSpan: [20, 25],
      strict: { AA: ["ISO_3X"], KQs: ["LIMP"] }, lenient: { AA: ["ISO_3X"], KQs: ["LIMP"] },
    });
    const { accepted, refused } = selectRefinedRecords([limp], history([approved(limp)]));
    expect(refused).toEqual([]);
    expect(accepted.map((row) => row.bucket)).toEqual([20, 25]);
    expect(accepted.every((row) => row.context === "VS_LIMP" && row.vsSeat === "SB")).toBe(true);
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

describe("osa dorovnávajícího ve výběru (rozhodnutí 4a)", () => {
  it("dvě mřížky lišící se jen dorovnávajícím se obě dostanou do packu", () => {
    // Do 7. 10. 2026 si o tutéž buňku řekly obě a druhá dostala `duplicateCell`,
    // tedy se **zahodila** - a která to byla, rozhodovalo pořadí v draftu.
    // Rozdíl mezi nimi je přitom velký: BTN na 100 bb squeezuje 67 kombinací
    // proti flatu z EP a 102 proti CO.
    const viaMp = grid({ sourceFile: "MUL-20BB-BB-vs-BTN_MP.html", flatCallers: ["MP"] });
    const viaCo = grid({ sourceFile: "MUL-20BB-BB-vs-BTN_CO.html", flatCallers: ["CO"] });
    const { accepted, refused } = selectRefinedRecords(
      [viaMp, viaCo],
      history([approved(viaMp), approved(viaCo)]),
    );
    expect(refused).toEqual([]);
    expect(accepted).toHaveLength(2);
    // `MP` vyjde jako `LJ`: do packu jde **sedačka produktu**, ne zkratka zdroje.
    // Změřeno 8. 10. 2026, že na tom osa stojí - stůl kreslí dorovnání podle
    // `POSITION_ORDER`, kde `MP` není, takže by nenakreslil nic a osa by byla
    // tichá. V devítce sedaček zdroje je `MP` mezi UTG+2 a HJ, tedy LJ.
    expect(accepted.map((row) => row.flatCallers?.join("+")).sort()).toEqual(["CO", "LJ"]);
  });

  it("prázdný seznam se do záznamu nepíše - je to obecná odpověď pro tu sedačku", () => {
    // „Otevření nikdo nedorovnal" je přesně to, co znamená `vsSeat` sám. Vlastní
    // klíč by dnešní obsah rozdělil na dvě poloviny a jedna by se přestala
    // nacházet.
    const record = grid({ flatCallers: [] });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted).toHaveLength(1);
    expect(accepted[0].flatCallers).toBeUndefined();
  });

  it("stejní dorovnávající se o buňku pořád dělit nesmí", () => {
    // Opačný směr, a je důležitější: kdyby klíč rozlišoval něco, co se neliší,
    // obě mřížky by prošly a jedna by druhou v packu přebila podle ničeho.
    const first = grid({ sourceFile: "MUL-a.html", flatCallers: ["MP"] });
    const second = grid({ sourceFile: "MUL-b.html", flatCallers: ["MP"] });
    const { accepted, counts } = selectRefinedRecords(
      [first, second],
      history([approved(first), approved(second)]),
    );
    expect(accepted).toHaveLength(1);
    expect(counts.duplicateCell).toBe(1);
  });

  it("záznam, u kterého se dorovnávající ze jména nepoznali, do packu nejde", () => {
    // Klíč packu „nevíme" neumí: takový záznam by dostal klíč obecného záznamu
    // pro tu sedačku a tiše by přebil mřížku, která o sobě ví víc. Jméno
    // `SQU-40BBMais-MP-vs-EP-EP-or-EP-MP` nabízí dvě rozestavení.
    const record = grid({ sourceFile: "SQU-dve-rozestaveni.html" });
    delete (record as { flatCallers?: readonly string[] }).flatCallers;
    const { accepted, counts } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted).toEqual([]);
    expect(counts.flatCallersUnknown).toBe(1);
  });

  it("úplná strategie (MUL) bere buňku před squeeze-only (SQU)", () => {
    /*
     * Vlastníkovo pravidlo z T4, bod 3. Do 7. 10. 2026 to vycházelo správně, ale
     * **náhodou**: buňku bral první, kdo o ni požádal, a `MUL` je v abecedě před
     * `SQU`. Přejmenovat rodinu by obsah tiše obrátil.
     *
     * Proč MUL: SQU kreslí jen squeeze (pro BB na 40 bb 5,7 % kombinací), kdežto
     * MUL celou strategii proti témuž otevření a dorovnání (506 kombinací callu).
     * Ze squeeze-only stránky by `fillFolds` dodal fold na zbytku, takže by se
     * hráč učil skládat 94 % rukou tam, kde zdroj dorovnává.
     *
     * Pořadí na vstupu je schválně **obrácené**, aby test měřil pravidlo, ne abecedu.
     */
    const squeezeOnly = grid({ sourceFile: "SQU-20BB-BB-vs-BTN_MP.html", flatCallers: ["MP"] });
    const fullStrategy = grid({ sourceFile: "MUL-20BB-BB-vs-BTN_MP.html", flatCallers: ["MP"] });
    const { accepted, refused } = selectRefinedRecords(
      [squeezeOnly, fullStrategy],
      history([approved(squeezeOnly), approved(fullStrategy)]),
    );
    expect(accepted).toHaveLength(1);
    expect(accepted[0].provenance).toContain("MUL-20BB-BB-vs-BTN_MP.html");
    expect(refused[0]?.sourceFile).toBe("SQU-20BB-BB-vs-BTN_MP.html");
  });
});

describe("obecná kopie u mřížek s dorovnávajícím", () => {
  /*
   * Záznam s klíčem `…|vsCO|@BTN` je **zpřesnění**, ne jediná odpověď: řetěz pádu
   * jde „zahoď dorovnávající → zahoď sedačku → obecná", takže bez obecné odpovědi
   * pro tu buňku není na co spadnout. Změřeno 7. 10. 2026: tři buňky zůstaly bez
   * obecného záznamu a počet přijatých se přitom nezměnil (69).
   *
   * **9. 10. 2026 jsem tuhle kopii zkusil smazat**, protože jsem v commitu 4a
   * napsal, že s uměním drillu ztratila důvod. `validate:range-import` zčervenal
   * 25 chybami „refined record is unreachable: … has no sibling without
   * flatCallers". Proto je tu test, který to drží: jinak si to někdo (nebo já
   * znovu) přečte v komentáři jako premisu.
   */
  const refined = (vsSeat: string, flatCallers: string[]): MttPreflopImportRecord => ({
    position: "BB", bucket: 20, context: "SQUEEZE", sourceStackBB: 20,
    vsSeat: vsSeat as never, flatCallers,
    provenance: `RYE, ${flatCallers.join("+")}.html`,
    strict: {}, lenient: {},
  });

  it("buňka bez obecného záznamu kopii dostane, jinak je zpřesnění nedosažitelné", () => {
    const copies = generalCopiesForFlatCallers([refined("CO", ["BTN"])]);
    expect(copies).toHaveLength(1);
    expect(copies[0].flatCallers).toBeUndefined();
    expect(copies[0].vsSeat).toBe("CO");
    // Provenance musí říct, **proč** je táž mřížka v packu dvakrát. Do 9. 10. tam
    // stálo „dočasně … drill se na osu zatím neumí zeptat" a obojí přestalo platit.
    expect(copies[0].provenance).toContain("zpřesnění stojí vedle ní");
    expect(copies[0].provenance).not.toContain("dočasně");
  });

  it("buňku, kterou někdo drží bez osy, kopie nepřebije", () => {
    // Mřížka, která o sobě ví víc, má vyhrát. Kopie je výplň, ne náhrada.
    const held = { ...refined("CO", ["BTN"]), provenance: "obecny" };
    delete (held as { flatCallers?: readonly string[] }).flatCallers;
    expect(generalCopiesForFlatCallers([refined("CO", ["BTN"]), held])).toEqual([]);
  });

  it("o obecnou buňku soupeří víc mřížek a bere ji nejranější dorovnávající", () => {
    /*
     * Vlastníkovo „nejtěsnější dorovnávající (nejranější sedačka)" z T4. Je to
     * nejtěsnější range, takže chyba jde směrem „hráč hraje míň rukou, než zdroj
     * dovoluje", ne naopak. Měřeno na mřížkách z 1. 10.: BTN na 100 bb squeezuje
     * 67 kombinací proti flatu z EP, 84 proti MP a 102 proti CO.
     *
     * Vstup je schválně v obráceném pořadí, aby test měřil pravidlo, ne pořadí.
     */
    const copies = generalCopiesForFlatCallers([
      refined("UTG", ["BTN"]),
      refined("UTG", ["HJ"]),
      refined("UTG", ["CO"]),
    ]);
    expect(copies).toHaveLength(1);
    expect(copies[0].provenance).toContain("HJ.html");
  });

  it("prázdný ani chybějící seznam kopii nevyrábí", () => {
    // Takový záznam je obecná odpověď sám; kopie by byla jen duplicita.
    const empty = refined("CO", []);
    const missing = refined("CO", ["BTN"]);
    delete (missing as { flatCallers?: readonly string[] }).flatCallers;
    expect(generalCopiesForFlatCallers([empty, missing])).toEqual([]);
  });
});

describe("skupina dorovnávajících je jeden hráč, ne dva", () => {
  /*
   * Zdroj píše skupinu lomítkem („EP/MP FLATCALL", „CO/BU FLATCALL") a do
   * 9. 10. 2026 z ní vycházeli **dva** dorovnávající, takže by drill rozdal pot
   * ve čtyřech k range postavené pro tři. Změřeno z velikostí squeeze.
   */
  it("složená skupina se rozbalí na jednu sedačku, ne na dvě", () => {
    /*
     * Změřeno z velikostí squeeze: BB na 40 bb squeezuje na 11 bb proti jednomu
     * jmenovanému dorovnávajícímu i proti skupině `CO/BU`. Druhý dorovnávající by
     * pot zvětšil a squeeze zvedl, takže skupina je jeden hráč.
     */
    const record = grid({
      context: "SQUEEZE", position: "BB", bucket: 40, vsSeat: "UTG",
      flatCallers: ["CO-BTN"], sourceFile: "MUL-40BB-BB-vs-EP_CO-BTN.html",
      strict: { AA: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"] },
    });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    // Dvě varianty, protože skupina jmenuje dvě možné sedačky - ale každá nese
    // **jednoho** dorovnávajícího, ne oba.
    expect(accepted).toHaveLength(2);
    for (const row of accepted) expect(row.flatCallers).toHaveLength(1);
    expect(accepted.map((row) => row.flatCallers?.[0]).sort()).toEqual(["BTN", "CO"]);
  });

  it("skupina EP/MP ze jména jmenuje tři sedačky a každá je sama", () => {
    const record = grid({
      context: "SQUEEZE", position: "BB", bucket: 40, vsSeat: "UTG",
      flatCallers: ["EP-MP"], sourceFile: "MUL-40BB-BB-vs-EP_EP-MP.html",
      strict: { AA: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"] },
    });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted).toHaveLength(3);
    for (const row of accepted) expect(row.flatCallers).toHaveLength(1);
    expect(accepted.map((row) => row.flatCallers?.[0]).sort())
      .toEqual(["LJ", "UTG+1", "UTG+2"]);
  });
});

describe("rozbalení skupiny dorovnávajících ve výběru", () => {
  it("jedna mřížka se skupinou EP vyrobí záznam na každou konkrétní sedačku", () => {
    /*
     * Vlastníkovo T4: „skupinu drill rozdá jako konkrétní sedačku mezi otvíračem
     * a hrdinou a ukáže ji". Rozbaluje se při výběru, ne v drillu, aby drill
     * losoval jen mezi klíči, které v packu opravdu jsou - stejně jako to dělá
     * u otvírače a u scénáře.
     *
     * Pozor: dnes to **nedodá nic**. Ze šestnácti záznamů korpusu s `EP` jako
     * dorovnávajícím je čtrnáct bez odpovědi a dva „nesedí" (měřeno 7. 10. 2026),
     * takže je to příprava na schválení, ne doručení.
     */
    const record = grid({
      context: "SQUEEZE", position: "BB", bucket: 20, vsSeat: "UTG",
      flatCallers: ["EP"], sourceFile: "MUL-20BB-BB-vs-EP_EP.html",
      strict: { AA: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"] },
    });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted.map((row) => row.flatCallers?.join("+"))).toEqual(["UTG+1", "UTG+2"]);
    // Provenance musí říct, že sedačka je rozdaná ze skupiny, ne přečtená ze zdroje.
    expect(accepted[0].provenance).toContain("skupina EP rozdána jako UTG+1");
  });

  it("skupina vedle jmenované sedačky drží tu jmenovanou", () => {
    // `MUL-…-vs-EP_EP-MP` má dorovnávající dva: skupinu a jmenovanou sedačku.
    // Rozbalit se má jen ta skupina; `MP` zůstane, jak ho zdroj napsal.
    const record = grid({
      context: "SQUEEZE", position: "BB", bucket: 20, vsSeat: "UTG",
      flatCallers: ["EP", "MP"], sourceFile: "MUL-20BB-BB-vs-EP_EP-MP.html",
      strict: { AA: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"] },
    });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    // Skupina se rozbalí na konkrétní sedačky a jmenovaný `MP` se přeloží na `LJ`:
    // pack mluví slovníkem produktu, viz test výš.
    expect(accepted.map((row) => row.flatCallers?.join("+")))
      .toEqual(["UTG+1+LJ", "UTG+2+LJ"]);
  });

  it("LP se po rozhodnutí 1a rozbaluje na CO a BTN", () => {
    /*
     * **Změněno 9. 10. 2026.** Do té chvíle tenhle test čekal, že `LP` zůstane
     * nerozbalená, a byl to správný test správného stavu: složení `LP` se z korpusu
     * nedalo změřit. Rozhodl to vlastník (odpověď 1a) poznámkami z koučinku („Late
     * Position: CO - BTN") a tím, že zdroj staví `LP` do téže řady jako vypsané
     * `CO/BU`.
     */
    const record = grid({
      context: "SQUEEZE", position: "BB", bucket: 20, vsSeat: "LJ",
      flatCallers: ["LP"], sourceFile: "MUL-20BB-BB-vs-MP_LP.html",
      strict: { AA: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"] },
    });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted).toHaveLength(2);
    expect(accepted.map((row) => row.flatCallers?.[0]).sort()).toEqual(["BTN", "CO"]);
  });

  it("zkratka, kterou zdroj nevysvětluje, se nerozbaluje", () => {
    // Pojistka proti vymýšlení: neznámá skupina zůstane, jak je, a záznam je jeden.
    // Drill si ho nevyžádá, protože to není sedačka produktu - a to je správně.
    const record = grid({
      context: "SQUEEZE", position: "BB", bucket: 20, vsSeat: "LJ",
      flatCallers: ["XX"], sourceFile: "MUL-20BB-BB-vs-MP_XX.html",
      strict: { AA: ["SQUEEZE"] }, lenient: { AA: ["SQUEEZE"] },
    });
    const { accepted } = selectRefinedRecords([record], history([approved(record)]));
    expect(accepted).toHaveLength(1);
    expect(accepted[0].flatCallers).toEqual(["XX"]);
    expect(accepted[0].provenance).not.toContain("rozdána");
  });
});
