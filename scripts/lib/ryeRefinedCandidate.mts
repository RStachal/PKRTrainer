import { ALL_HAND_CLASSES } from "../../src/core/poker";
import { offeredPreflopActionKeys } from "../../src/core/preflopActionOptions";
import {
  PUSH_FOLD_MAX,
  type ActionContext,
  type ActionKey,
  type HandLabel,
  type Position,
  type StackBucket,
  type TableState,
} from "../../src/core/types";
import { bucketsForContext, positionsForContext } from "../../src/core/drillEngine";
import type { MttPreflopImportRecord } from "../../src/data/ranges/mttPreflopRangePackImport";
import type { AnswerHistory } from "./ryeAnswerHistory.mts";
import { isStale } from "./ryeAnswerHistory.mts";
import type { DraftRecord } from "./ryeDraftImpact.mts";

/**
 * Výběr schválených mřížek draftu, které smí jít do produkčního packu jako
 * **zpřesněné záznamy** (osa otvírače, bod 234).
 *
 * ## Proč je to sítko, ne převod
 *
 * Draft má 118 záznamů a odpovědi z tří čtení; do packu smí jen to, co
 * vlastník schválil **nad dnešní podobou mřížky** a co produkt umí položit
 * jako otázku. Každý důvod, proč mřížka neprojde, se počítá zvlášť - tichý
 * import je ten, kterému se pak nedá věřit (`mtt:rye-import` říká totéž).
 *
 * Kontexty: jen ty, kde spot jmenuje protihráče (`opponentSeatCandidates`
 * v `drillEngine`): `VS_OPEN`, `SQUEEZE`, `VS_3BET`. Zpřesněný záznam bez
 * otvírače nedává smysl a ICM mřížky nemají produkční pack (`DOLAR_EV` sloty
 * jsou prázdné), takže zůstávají v draftu.
 *
 * BB proti SB jde jako `VS_OPEN` z SB - tak to čte RYE a vlastník 16. 9. 2026
 * rozhodl RYE držet; drill SB u BB losuje právě přes tenhle zpřesněný záznam.
 */

export type RefusalReason =
  | "unanswered"
  | "rejected"
  | "stale"
  | "icm"
  | "noOpponent"
  | "contextNotRefined"
  | "actionNotOffered"
  | "notDealt"
  | "duplicateCell";

export interface Refusal {
  sourceFile: string;
  reason: RefusalReason;
  /** Podrobnost pro člověka: které ruce, se kterým souborem se sráží. */
  detail: string;
}

export interface RefinedSelection {
  accepted: MttPreflopImportRecord[];
  refused: Refusal[];
  /** Kolik mřížek propadlo kterým důvodem. */
  counts: Record<RefusalReason, number>;
}

const REFINED_CONTEXTS = new Set<string>(["VS_OPEN", "SQUEEZE", "VS_3BET", "VS_LIMP"]);

/** Zdroj, který se u každého záznamu jmenuje - pack má jinou licenci. */
export const RYE_PROVENANCE = "RYE Rangeviewer 2021 (koupené charty vlastníka)";

function tableStateFor(record: DraftRecord): TableState {
  const context = record.context as ActionContext;
  const bucket = record.bucket as StackBucket;
  return {
    heroPos: record.position as Position,
    pushFold: bucket <= PUSH_FOLD_MAX,
    effectiveStackBB: bucket,
    // Proti limpu nikdo nenavýšil (`facing: NONE`) a aspoň jeden hráč dolimpoval;
    // bez toho by strom nabídl obranu proti otevření a `LIMP` ani `ISO` by na
    // tlačítku nebyly - mřížka by propadla na „doporučení, které produkt
    // nenabízí", ačkoli produkt obojí umí (odpověď vlastníka 2a, 22. 9. 2026).
    limpsBefore: context === "VS_LIMP" ? 1 : 0,
    callsBefore: context === "SQUEEZE" ? 1 : 0,
    facing: context === "VS_3BET"
      ? "3BET"
      : context === "RFI" || context === "PUSH_FOLD" || context === "VS_LIMP" ? "NONE" : "OPEN",
    isBvB: false,
    vsSeat: record.vsSeat as Position,
    // Shove nad listy vlastníka se nabízí jen tam, kde ho mřížka kreslí
    // (rozhodnutí 8a) - a mřížka to o sobě ví.
    jamTaught: Object.values(record.strict).some((actions) => actions.includes("JAM")),
  };
}

/**
 * Akce, které by hráč u téhle mřížky nedostal na tlačítko.
 *
 * Range, jejíž doporučení není v nabídce, by se učila naprázdno: `grade`
 * vyhodnotí odpověď proti doporučení, které nešlo zvolit. Test
 * `adviceMatchesButtons` to hlídá nad rozdávaným poolem; tady se to
 * hlídá dřív, než se mřížka do poolu dostane.
 */
export function actionsNotOffered(record: DraftRecord): string[] {
  const state = tableStateFor(record);
  const bucket = record.bucket as StackBucket;
  const problems: string[] = [];
  for (const hand of Object.keys(record.lenient)) {
    const strict = (record.strict[hand] ?? []) as ActionKey[];
    const lenient = (record.lenient[hand] ?? []) as ActionKey[];
    const offered = new Set(offeredPreflopActionKeys(state, strict, bucket, lenient));
    const wanted = new Set([...lenient, ...strict]);
    for (const action of wanted) {
      if (!offered.has(action as ActionKey)) problems.push(`${hand}:${action}`);
    }
  }
  return problems;
}

/** Ruce bez záznamu jsou fold - a pack chce každou ze 169 tříd výslovně. */
export function fillFolds(map: Record<string, string[]>): Partial<Record<HandLabel, readonly ActionKey[]>> {
  const out: Partial<Record<HandLabel, readonly ActionKey[]>> = {};
  for (const hand of ALL_HAND_CLASSES) {
    const actions = map[hand];
    out[hand] = actions !== undefined && actions.length > 0 ? [...actions] as ActionKey[] : ["FOLD"];
  }
  return out;
}

export function refinedCellKey(record: Pick<DraftRecord, "position" | "bucket" | "context" | "vsSeat">): string {
  return `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat}`;
}

/** Kontexty bez otvírače, kde schválená mřížka RYE nahrazuje obecný záznam packu. */
export const OVERRIDE_CONTEXTS: ReadonlyMap<string, string> = new Map([
  ["PUSH_FOLD", "rozhodnutí vlastníka 17. 9. 2026, bod 256"],
  ["RFI", "rozhodnutí vlastníka 22. 9. 2026, 6a"],
]);

/**
 * Schválené mřížky kontextů bez otvírače, které **nahrazují** obecný záznam packu.
 *
 * Push/fold ani otevření nemají otvírače, takže zpřesněný záznam nedává smysl
 * - a přesto má ten obsah odběratele: rozhodnutí vlastníka 17. 9. 2026 (bod
 * 256), že vlastní export na 10 bb nahradí RYE, a 22. 9. 2026 (6a), že totéž
 * platí pro otevření (a dál rejam, BB proti limpu, squeeze). Do té doby byl
 * vlastníkův chart baseline (Kompendium 4.2, `btnOpenRangeWidth`); RYE je od
 * 16. 9. reference a tady přepisuje obecný záznam, ne jen přidává vrstvu.
 * Proto nese provenance i obecný záznam - jinak by se v packu nedalo poznat,
 * odkud je.
 *
 * Sítko je totéž jako u zpřesněných: schváleno nad dnešní podobou, ne ICM,
 * rozdává se, nabízené akce, jedna mřížka na buňku.
 */
export function selectGeneralOverrides(
  records: readonly DraftRecord[],
  history: AnswerHistory,
  contexts: ReadonlyMap<string, string> = OVERRIDE_CONTEXTS,
): RefinedSelection {
  const accepted: MttPreflopImportRecord[] = [];
  const refused: Refusal[] = [];
  const counts: Record<RefusalReason, number> = {
    unanswered: 0, rejected: 0, stale: 0, icm: 0, noOpponent: 0, contextNotRefined: 0,
    actionNotOffered: 0, notDealt: 0, duplicateCell: 0,
  };
  const takenCells = new Map<string, string>();
  const refuse = (record: DraftRecord, reason: RefusalReason, detail = ""): void => {
    counts[reason] += 1;
    refused.push({ sourceFile: record.sourceFile, reason, detail });
  };

  for (const record of records) {
    const decision = contexts.get(record.context);
    if (decision === undefined) continue;
    const context = record.context as ActionContext;
    const answer = history.bySourceFile.get(record.sourceFile);
    if (answer === undefined) { refuse(record, "unanswered"); continue; }
    if (answer.verdict !== "sedí") { refuse(record, "rejected", answer.verdict); continue; }
    if (isStale(record, answer)) { refuse(record, "stale", `odpověď z ${answer.readAt}`); continue; }
    if (/^ICM/i.test(record.stackSetupId)) { refuse(record, "icm", record.stackSetupId); continue; }
    if (!positionsForContext(context).includes(record.position as Position)
      || !bucketsForContext(context).includes(record.bucket as StackBucket)) {
      refuse(record, "notDealt", `${record.context}|${record.position}|${record.bucket}`);
      continue;
    }
    const notOffered = actionsNotOffered(record);
    if (notOffered.length > 0) {
      refuse(record, "actionNotOffered", notOffered.slice(0, 6).join(", ") + (notOffered.length > 6 ? ", …" : ""));
      continue;
    }
    const cell = `${record.context}|${record.position}|${record.bucket}`;
    const taken = takenCells.get(cell);
    if (taken !== undefined) { refuse(record, "duplicateCell", `táž buňka jako ${taken}`); continue; }
    takenCells.set(cell, record.sourceFile);

    accepted.push({
      position: record.position as Position,
      sourceStackBB: record.sourceStackBB,
      bucket: record.bucket as StackBucket,
      context,
      provenance: `${RYE_PROVENANCE}, ${record.sourceFile}, schváleno ${answer.readAt}`
        + `${answer.contentHash ? ` (otisk ${answer.contentHash})` : ""}; nahrazuje vlastní export (${decision})`,
      strict: fillFolds(record.strict),
      lenient: fillFolds(record.lenient),
    });
  }

  return { accepted, refused, counts };
}

export function selectRefinedRecords(
  records: readonly DraftRecord[],
  history: AnswerHistory,
): RefinedSelection {
  const accepted: MttPreflopImportRecord[] = [];
  const refused: Refusal[] = [];
  const counts: Record<RefusalReason, number> = {
    unanswered: 0, rejected: 0, stale: 0, icm: 0, noOpponent: 0, contextNotRefined: 0,
    actionNotOffered: 0, notDealt: 0, duplicateCell: 0,
  };
  const takenCells = new Map<string, string>();
  // Stránky s pásmem hloubek počkají na druhý průchod (viz níž).
  const spanQueue: {
    record: DraftRecord;
    context: ActionContext;
    provenance: string;
    strict: ReturnType<typeof fillFolds>;
    lenient: ReturnType<typeof fillFolds>;
  }[] = [];

  const refuse = (record: DraftRecord, reason: RefusalReason, detail = ""): void => {
    counts[reason] += 1;
    refused.push({ sourceFile: record.sourceFile, reason, detail });
  };

  for (const record of records) {
    const answer = history.bySourceFile.get(record.sourceFile);
    if (answer === undefined) { refuse(record, "unanswered"); continue; }
    if (answer.verdict !== "sedí") { refuse(record, "rejected", answer.verdict); continue; }
    if (isStale(record, answer)) { refuse(record, "stale", `odpověď z ${answer.readAt}`); continue; }
    if (/^ICM/i.test(record.stackSetupId)) { refuse(record, "icm", record.stackSetupId); continue; }
    if (!REFINED_CONTEXTS.has(record.context)) { refuse(record, "contextNotRefined", record.context); continue; }
    if (record.vsSeat === "") { refuse(record, "noOpponent"); continue; }
    const context = record.context as ActionContext;
    // Záznam, na který se drill nikdy nezeptá, je mrtvý obsah
    // (`shippedRecordsAreDealable`): obranu proti otevření drill rozdává
    // až od lojacku, UTG+1 a UTG+2 by v packu jen ležely.
    if (!positionsForContext(record.context as ActionContext).includes(record.position as Position)
      || !bucketsForContext(record.context as ActionContext).includes(record.bucket as StackBucket)) {
      refuse(record, "notDealt", `${record.context}|${record.position}|${record.bucket}`);
      continue;
    }
    const notOffered = actionsNotOffered(record);
    if (notOffered.length > 0) {
      refuse(record, "actionNotOffered", notOffered.slice(0, 6).join(", ") + (notOffered.length > 6 ? ", …" : ""));
      continue;
    }
    const cell = refinedCellKey(record);
    const taken = takenCells.get(cell);
    if (taken !== undefined) { refuse(record, "duplicateCell", `táž buňka jako ${taken}`); continue; }
    takenCells.set(cell, record.sourceFile);

    const provenance = `${RYE_PROVENANCE}, ${record.sourceFile}, schváleno ${answer.readAt}`
      + `${answer.contentHash ? ` (otisk ${answer.contentHash})` : ""}`;
    const strict = fillFolds(record.strict);
    const lenient = fillFolds(record.lenient);
    accepted.push({
      position: record.position as Position,
      sourceStackBB: record.sourceStackBB,
      bucket: record.bucket as StackBucket,
      context,
      vsSeat: record.vsSeat as Position,
      provenance,
      strict,
      lenient,
    });

    if ((record.bucketSpan ?? []).length > 1) {
      spanQueue.push({ record, context, provenance, strict, lenient });
    }
  }

  // Stránka, která platí pro pásmo hloubek, obsadí celé pásmo - ale až teď,
  // po všech primárních hloubkách, a nikdy nepřebije tu, na které jiná
  // stránka **začíná**.
  //
  // Pásma zdroje na sebe nasedají: `15-20BB` a `20-25BB` si obě říkají o 20 bb,
  // `30-40BB` a `40-50BB` o 40, `40-50BB` a `50BBMAIS` o 50. Dokud se pásmo
  // dopisovalo hned u své stránky, vyhrála ta, která byla v draftu dřív - a na
  // 20 bb je ten rozdíl vidět nejvíc: stránka 15-20 tam jamuje 18,9 % rukou,
  // stránka 20-25 nejamuje vůbec. Hráč by dostal jednu z těch dvou odpovědí
  // podle pořadí v souboru, což není rozhodnutí, ale náhoda (nález vlastníka
  // 23. 9. 2026).
  //
  // Pravidlo je proto stejné jako u konkrétnější stránky: **primární hloubka je
  // silnější než pásmo**. Na 20 bb platí `20-25BB`, na 40 `40-50BB`, na 50
  // `50BBMAIS` - vždycky ta stránka, jejíž jméno tou hloubkou začíná. Zbytek
  // pásma se dopíše jen tam, kde nikdo nezačíná. Strop pásma je 75 bb
  // (rozhodnutí vlastníka 1c, 22. 9. 2026).
  for (const { record, context, provenance, strict, lenient } of spanQueue) {
    for (const bucket of record.bucketSpan ?? []) {
      if (bucket === record.bucket) continue;
      if (!bucketsForContext(context).includes(bucket as StackBucket)) continue;
      const spanCell = refinedCellKey({ ...record, bucket });
      const spanTaken = takenCells.get(spanCell);
      if (spanTaken !== undefined) {
        refuse(record, "duplicateCell", `${bucket} bb z pásma už drží ${spanTaken}`);
        continue;
      }
      takenCells.set(spanCell, record.sourceFile);
      accepted.push({
        position: record.position as Position,
        sourceStackBB: record.sourceStackBB,
        bucket: bucket as StackBucket,
        context,
        vsSeat: record.vsSeat as Position,
        provenance: `${provenance}; stránka platí pro pásmo `
          + `${(record.bucketSpan ?? []).join("-")} bb, tohle je ${bucket} bb z něj`,
        strict,
        lenient,
      });
    }
  }

  return { accepted, refused, counts };
}
