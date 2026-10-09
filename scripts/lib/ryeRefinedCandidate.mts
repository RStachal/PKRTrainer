import { ALL_HAND_CLASSES } from "../../src/core/poker";
import { offeredPreflopActionKeys } from "../../src/core/preflopActionOptions";
import {
  POSITION_ORDER,
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
import { seatOfVillainAbbrev, villainGroupSeats } from "./ryeActionMapping.mts";
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
  | "duplicateCell"
  | "partialPage"
  /**
   * Ze jména se nepoznalo, kdo otevření dorovnal.
   *
   * Klíč packu umí „nikdo nedorovnal" i jmenovaný seznam, ale **neumí „nevíme"**
   * - a kdyby takový záznam prošel, dostal by klíč obecného záznamu pro tu
   * sedačku a tiše by přebil nebo byl přebit mřížkou, která o sobě ví víc.
   *
   * Dnes to nepotká ani jeden záznam, ale **první verze téhle podmínky shodila
   * čtyři**, a chytlo to až měření přijatých záznamů před a po (69 → 63).
   * Záměna byla v tom, co znamená chybějící seznam: stránky `BBSTR-vs-SB-Limp-…`
   * nemají soupeře ve jméně vůbec (nese ho rodina), takže jim seznam chyběl -
   * jenže u limpu ze SB **nikdo nedorovnal**, a to je odpověď, ne nejistota.
   * Parser teď u takových tvarů vrací prázdný seznam a chybějící zůstal jen pro
   * jméno, které nabízí dvě rozestavení.
   *
   * Je to tedy pojistka, ne oprava - ale bez ní by se první takové jméno zařadilo
   * mlčky, a s ní se málem tiše ztratil obsah, který do packu patří.
   */
  | "flatCallersUnknown";

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

export function refinedCellKey(
  record: Pick<DraftRecord, "position" | "bucket" | "context" | "vsSeat" | "flatCallers">,
): string {
  return `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat}`
    + `|@${flatSuffix(record.flatCallers)}`;
}

/**
 * Část buňky za dorovnávající - rozhodnutí 4a.
 *
 * Bez ní se dvě mřížky lišící se jen dorovnávajícím hádaly o tutéž buňku a
 * druhá z nich dostala `duplicateCell`, tedy se **zahodila**. Která z nich to
 * byla, rozhodovalo pořadí v draftu, ne pravidlo - a rozdíl mezi nimi je velký:
 * BTN na 100 bb squeezuje 67 kombinací proti flatu z EP a 102 proti CO.
 *
 * Tři stavy, tři různé buňky, stejně jako u `flatKey` v `ryeDraftImpact`:
 * `—` nikdo nedorovnal, `?` ze jména se to nepozná, jinak seznam. Záznam s `?`
 * se do packu nedostane vůbec (`flatCallersUnknown`), ale buňku má mít vlastní -
 * jinak by se sloučil s „nikdo nedorovnal" a jeden z nich by zmizel jako
 * duplicitní, podle pořadí v draftu.
 */
function flatSuffix(flatCallers: readonly string[] | undefined): string {
  if (flatCallers === undefined) return "?";
  return flatCallers.length === 0 ? "—" : flatCallers.join("+");
}

/**
 * Seznamy dorovnávajících, které z jednoho záznamu vzniknou.
 *
 * Bez skupiny je to jeden seznam - ten původní. Se skupinou, jejíž složení je
 * podložené, jeden seznam na každou konkrétní sedačku; se skupinou neznámou zase
 * jen ten původní, takže se nic nevymýšlí.
 *
 * Víc skupin v jednom seznamu se **nekombinuje**: žádná taková stránka v korpusu
 * není (měřeno 7. 10. 2026) a kartézský součin dvou skupin by vyrobil záznamy pro
 * situace, o kterých zdroj nic neříká.
 */
function flatCallerVariants(
  record: Pick<DraftRecord, "flatCallers" | "vsSeat" | "position">,
): readonly string[][] {
  const flat = record.flatCallers ?? [];
  const groups = flat.filter((villain) => (
    villainGroupSeats(villain, record.vsSeat, record.position).length > 0
  ));
  if (groups.length !== 1) return [[...flat]];
  const [group] = groups;
  const seats = villainGroupSeats(group, record.vsSeat, record.position);
  return seats.map((seat) => flat.map((villain) => (villain === group ? seat : villain)));
}

/**
 * Mřížka s dorovnávajícím jde do packu **i jako obecná odpověď pro tu sedačku** -
 * ne dočasně, ale protože zpřesnění musí stát **vedle** obecné odpovědi.
 *
 * ## Proč to tu je
 *
 * Záznam s osou dorovnávajícího má klíč `…|vsCO|@BTN` a je to **zpřesnění**, ne
 * jediná odpověď. Řetěz pádu (`refinementFallbackChain`) jde „zahoď
 * dorovnávající → zahoď sedačku → obecná", takže když obecná odpověď pro tu
 * buňku nikde neleží, pád nemá kam padnout a zpřesnění je nedosažitelné.
 *
 * Změřeno 7. 10. 2026 hned po zavedení osy: tři buňky (`SQUEEZE|BB|20|vsCO`,
 * `SQUEEZE|BB|20|vsLJ`, `SQUEEZE|SB|20|vsCO`) zůstaly bez obecného záznamu, takže
 * obsah, který byl dosažitelný, přestal být - a počet přijatých se přitom
 * nezměnil (69). Základní pack ty buňky nedrží: kontext `SQUEEZE` přináší teprve
 * RYE, takže není na co padnout.
 *
 * ## Vyvrácený důvod, proč měla zmizet
 *
 * Do 9. 10. 2026 tu stálo „**až drill osu umí, tahle kopie se má smazat**" a
 * v commitu 4a i v T1 jsem napsal, že tím dnem ztratila důvod. **Je to vyvrácené.**
 * Zkusil jsem ji 9. 10. smazat a `validate:range-import` zčervenal 25 chybami
 * „refined record is unreachable: … has no sibling without flatCallers". Umět se
 * na osu zeptat a mít na co spadnout jsou dvě různé věci; kopie je ta druhá.
 *
 * Co z toho platí dál: **dvě odpovědi na tutéž otázku se nesmí rozejít.** Proto
 * jsou obě z téže mřížky a provenance to říká - ne proto, že je to provizorium.
 *
 * ## Která mřížka obecnou buňku bere
 *
 * Kopie se dělá jen tam, kde tu buňku **nikdo nedrží bez osy** - jinak by přebila
 * mřížku, která o sobě ví víc. A když o obecnou buňku soupeří víc mřížek, bere ji
 * ta s nejranějším dorovnávajícím: je to nejtěsnější range, takže chyba jde směrem
 * „hráč hraje míň rukou, než zdroj dovoluje", ne naopak. To je vlastníkovo
 * pravidlo z T4 („nejtěsnější dorovnávající, nejranější sedačka") a platí dál,
 * i když původní důvod („dočasně, než drill osu umí") padl.
 */
function seatRank(seat: string): number {
  const index = POSITION_ORDER.indexOf(seat as Position);
  // Zkratka, která sedačku nejmenuje (skupina `EP`, `LP`), je až za jmenovanými:
  // jmenovaná sedačka před skupinou je vlastníkovo pravidlo z T4, bod 3.
  return index === -1 ? POSITION_ORDER.length : index;
}

export function generalCopiesForFlatCallers(
  accepted: readonly MttPreflopImportRecord[],
): MttPreflopImportRecord[] {
  const cellOfRecord = (record: MttPreflopImportRecord): string => (
    `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat ?? ""}`
  );
  const heldWithoutAxis = new Set(
    accepted.filter((record) => record.flatCallers === undefined).map(cellOfRecord),
  );
  const best = new Map<string, MttPreflopImportRecord>();
  for (const record of accepted) {
    if (record.flatCallers === undefined || record.flatCallers.length === 0) continue;
    const cell = cellOfRecord(record);
    if (heldWithoutAxis.has(cell)) continue;
    const rival = best.get(cell);
    const rank = (row: MttPreflopImportRecord): number => Math.min(
      ...(row.flatCallers ?? []).map((flat) => seatRank(seatOfVillainAbbrev(flat) ?? flat)),
    );
    if (rival === undefined || rank(record) < rank(rival)) best.set(cell, record);
  }
  return [...best.values()].map((record) => {
    const { flatCallers, ...withoutAxis } = record;
    return {
      ...withoutAxis,
      provenance: `${record.provenance ?? ""} [i jako obecná odpověď pro tu sedačku,`
        + ` dorovnávající ${flatCallers?.join("+") ?? "?"}; zpřesnění stojí vedle ní, ne místo ní]`,
    };
  });
}

/**
 * Pořadí, ve kterém se o buňku hlásí - vlastníkovo pravidlo z T4, bod 3.
 *
 * „Když na rozdanou situaci sedí víc stránek, vyhrává přesná hloubka před
 * ‚40+', jmenovaná sedačka před skupinou a **úplná strategie (MUL) před
 * squeeze-only (SQU)**."
 *
 * ## Proč to musí být napsané pravidlo
 *
 * Buňku bere první, kdo o ni požádá; druhý dostane `duplicateCell` a zahodí se.
 * Do 7. 10. 2026 o tom rozhodovalo **abecední pořadí jmen souborů** - `MUL`
 * je před `SQU`, takže to vycházelo správně, ale náhodou. Přesně na to si
 * vlastník stěžoval u rozhodnutí 4: „která z nich přistane, neurčuje žádné
 * napsané pravidlo". Stačilo by přejmenovat rodinu a obsah by se tiše obrátil.
 *
 * Proč MUL vyhrává: SQU stránka kreslí **jen squeeze**, kdežto MUL celou
 * strategii proti témuž otevření a dorovnání. Měřeno na mřížkách z 1. 10.: SQU
 * pro BB na 40 bb obarví 5,7 % kombinací, kdežto MUL pro týž typ spotu callne
 * 506 kombinací. Ze squeeze-only stránky by `fillFolds` dodal fold na zbytku,
 * takže by se hráč učil skládat 94 % rukou tam, kde zdroj dorovnává.
 *
 * Ostatní dvě části pravidla tady nejsou, a je to tak správně: přesnou hloubku
 * proti pásmu řeší druhý průchod (`spanQueue`), a jmenovanou sedačku proti
 * skupině nejde rozhodnout při importu - skupina se na konkrétní sedačku
 * přeloží až při rozdávání, kdy je vidět otvírač i hrdina.
 */
const FAMILY_RANK: ReadonlyMap<string, number> = new Map([["MUL", 0], ["SQU", 1]]);

export function preferredOrder(records: readonly DraftRecord[]): DraftRecord[] {
  const rank = (record: DraftRecord): number => (
    FAMILY_RANK.get(/^[A-Za-z]+/.exec(record.sourceFile)?.[0]?.toUpperCase() ?? "") ?? 0.5
  );
  // Stabilní řazení: rodiny mimo pravidlo si drží pořadí, jaké měly, a vejdou
  // se mezi MUL a SQU. Měnit pořadí něčeho, o čem pravidlo nemluví, by znamenalo
  // tiše přerovnat obsah, který se dodává dnes.
  return [...records].sort((left, right) => rank(left) - rank(right));
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
    actionNotOffered: 0, notDealt: 0, duplicateCell: 0, partialPage: 0, flatCallersUnknown: 0,
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
    // Dílčí stránka neprojde ani se schválením.
    //
    // Schválení říká „mřížka sedí na zdroj“, a to je pravda - jenže u stránky,
    // která kreslí jen jednu větev, se tím neschvaluje fold na zbylých rukách.
    // Ten do záznamu dodává `fillFolds`, ne zdroj a ne čtenář. Naměřeno
    // 24. 9. 2026: v kandidátu měl squeeze záznam **157 ze 169 tříd jako FOLD**
    // (92,9 %) z mřížky, která obarvila 4 % kombinací.
    if (record.partial === true) {
      refuse(record, "partialPage", "stránka kreslí jen jednu větev strategie");
      continue;
    }
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
    actionNotOffered: 0, notDealt: 0, duplicateCell: 0, partialPage: 0, flatCallersUnknown: 0,
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

  for (const record of preferredOrder(records)) {
    const answer = history.bySourceFile.get(record.sourceFile);
    if (answer === undefined) { refuse(record, "unanswered"); continue; }
    if (answer.verdict !== "sedí") { refuse(record, "rejected", answer.verdict); continue; }
    if (isStale(record, answer)) { refuse(record, "stale", `odpověď z ${answer.readAt}`); continue; }
    // Dílčí stránka neprojde ani se schválením.
    //
    // Schválení říká „mřížka sedí na zdroj“, a to je pravda - jenže u stránky,
    // která kreslí jen jednu větev, se tím neschvaluje fold na zbylých rukách.
    // Ten do záznamu dodává `fillFolds`, ne zdroj a ne čtenář. Naměřeno
    // 24. 9. 2026: v kandidátu měl squeeze záznam **157 ze 169 tříd jako FOLD**
    // (92,9 %) z mřížky, která obarvila 4 % kombinací.
    if (record.partial === true) {
      refuse(record, "partialPage", "stránka kreslí jen jednu větev strategie");
      continue;
    }
    if (/^ICM/i.test(record.stackSetupId)) { refuse(record, "icm", record.stackSetupId); continue; }
    if (!REFINED_CONTEXTS.has(record.context)) { refuse(record, "contextNotRefined", record.context); continue; }
    if (record.vsSeat === "") { refuse(record, "noOpponent"); continue; }
    // Klíč packu „nevíme" neumí - viz `flatCallersUnknown`.
    if (record.flatCallers === undefined) { refuse(record, "flatCallersUnknown"); continue; }
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
    /*
     * Skupina se rozpadne na konkrétní sedačky - vlastníkovo zadání z T4:
     * „skupinu drill rozdá jako konkrétní sedačku mezi otvíračem a hrdinou".
     *
     * Rozbaluje se **tady**, ne v drillu, a je to vědomé: tady je vidět otvírač
     * i hrdina, takže se filtr „mezi nimi" dá uplatnit, a drill pak jen losuje
     * mezi klíči, které v packu opravdu jsou - tedy stejně, jako to dělá u
     * otvírače a u scénáře. Kdyby skupinu překládal drill, mohl by se zeptat na
     * klíč, který nikdo nenapsal.
     *
     * Skupina, jejíž složení není podložené (`LP`), se nerozbalí a záznam
     * zůstane klíčovaný na ni; dosažitelný je přes dočasnou obecnou kopii.
     * Viz `villainGroupSeats`.
     */
    const variants = flatCallerVariants(record).map((flat) => flat.map(
      /*
       * Do packu jde **sedačka produktu**, ne zkratka zdroje.
       *
       * Schéma packu u téhle osy říká „hráči se zkratka neukáže", a je to
       * doslova tak: stůl kreslí dorovnání podle `POSITION_ORDER`, kde `MP` ani
       * `BU` nejsou - našel by -1 a nenakreslil **nic**. Osa by tím byla
       * nefunkční, aniž by cokoli spadlo.
       *
       * Zkratka, která se přeložit nedá, zůstane: to jsou skupiny bez
       * podloženého složení (`LP`), a ty drill nerozdá, protože je v packu
       * nenajde jako sedačku. Čekají na vlastníka a dosažitelné jsou přes
       * dočasnou obecnou kopii.
       */
      (villain) => seatOfVillainAbbrev(villain) ?? villain,
    ));
    for (const flatCallers of variants) {
      accepted.push({
        position: record.position as Position,
        sourceStackBB: record.sourceStackBB,
        bucket: record.bucket as StackBucket,
        context,
        vsSeat: record.vsSeat as Position,
        // Prázdný seznam se nepředává: „otevření nikdo nedorovnal" je přesně to,
        // co znamená `vsSeat` sám, a vlastní klíč by dnešní obsah rozdělil na dvě
        // poloviny bez důvodu.
        ...(flatCallers.length > 0 ? { flatCallers } : {}),
        provenance: variants.length > 1
          ? `${provenance} [skupina ${record.flatCallers.join("+")} rozdána jako ${flatCallers.join("+")}]`
          : provenance,
        strict,
        lenient,
      });
    }

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
