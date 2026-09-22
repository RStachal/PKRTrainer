import { positionsForFormat } from "../../src/core/trainingProfile";
import type { Position, StackBucket, ActionContext } from "../../src/core/types";
import { bucketsForContext, positionsForContext } from "../../src/core/drillEngine";
import type { MttPreflopImportRecord } from "../../src/data/ranges/mttPreflopRangePackImport";
import type { RangeStackSetup } from "../../src/data/ranges/rangePack";
import type { AnswerHistory } from "./ryeAnswerHistory.mts";
import { isStale } from "./ryeAnswerHistory.mts";
import type { DraftRecord } from "./ryeDraftImpact.mts";
import { scenarioLabel } from "./ryeIcmScenarios.mts";
import {
  RYE_PROVENANCE, fillFolds, actionsNotOffered, type Refusal, type RefusalReason,
} from "./ryeRefinedCandidate.mts";

/**
 * Výběr schválených **ICM** mřížek draftu do $EV packu se scénářem v klíči.
 *
 * ## Proč zvlášť od zpřesněných záznamů
 *
 * `selectRefinedRecords` ICM mřížky **odmítá** (důvod `icm`) a má pravdu:
 * chipEV pack by dostal range počítanou pod jiným modelem EV a nikdo by to
 * v něm nepoznal. Vlastník 22. 9. 2026 rozhodl, kam patří (rozhodnutí 3a):
 * do profilu SIX_MAX / $EV, se scénářem v klíči. Sedačky zdroje (UTG, HJ, CO,
 * BU, SB, BB) sedí na šestistolovou sadu produktu 1:1, takže se nic nepřekládá
 * - na rozdíl od devítistolového odvození, které sedačky přejmenovává.
 *
 * ## Co odlišuje scénář od otvírače
 *
 * Dvě ICM mřížky téže buňky a téhož otvírače se liší **jen** rozložením stacků
 * u stolu (bod 256: šest takových srážek). Scénář proto patří do klíče vedle
 * otvírače, a katalog scénářů do packu - jinak by stůl nakreslil rozložení,
 * pod kterým odpověď neplatí. Mřížka bez scénáře v draftu sem nepatří.
 *
 * ## Sítko
 *
 * Totéž jako u zpřesněných záznamů, jen sedačky se ověřují proti šestistolové
 * sadě: schváleno nad dnešní podobou mřížky, kontext s osou otvírače, sedačka
 * i hloubka, na kterou se drill ptá, akce, které produkt nabízí, a jedna
 * mřížka na (buňka, otvírač, scénář). Každý důvod se počítá zvlášť.
 */

export interface IcmSelection {
  accepted: MttPreflopImportRecord[];
  refused: Refusal[];
  counts: Record<RefusalReason, number>;
  /** Katalog scénářů, na které přijaté záznamy ukazují. */
  stackSetups: Record<string, RangeStackSetup>;
}

/** Kontexty, kde má scénář i otvírač smysl; stejná množina jako u zpřesněných. */
const ICM_CONTEXTS = new Set<string>(["VS_OPEN", "SQUEEZE", "VS_3BET"]);

const SIX_MAX_SEATS = new Set<string>(positionsForFormat("SIX_MAX"));

function emptyCounts(): Record<RefusalReason, number> {
  return {
    unanswered: 0, rejected: 0, stale: 0, icm: 0, noOpponent: 0, contextNotRefined: 0,
    actionNotOffered: 0, notDealt: 0, duplicateCell: 0,
  };
}

/** Stacky scénáře po sedačkách, jen ty, které šestistolový profil kreslí. */
function stackSetupOfRecord(record: DraftRecord): RangeStackSetup | undefined {
  const stacks = record.stackSetup;
  if (stacks === undefined) return undefined;
  const stacksBB: Partial<Record<Position, number>> = {};
  for (const [seat, stackBB] of Object.entries(stacks)) {
    if (SIX_MAX_SEATS.has(seat)) stacksBB[seat as Position] = stackBB;
  }
  return Object.keys(stacksBB).length < 2
    ? undefined
    : { label: scenarioLabel(stacksBB as Record<string, number>), stacksBB };
}

export function selectIcmRecords(
  records: readonly DraftRecord[],
  history: AnswerHistory,
): IcmSelection {
  const accepted: MttPreflopImportRecord[] = [];
  const refused: Refusal[] = [];
  const counts = emptyCounts();
  const stackSetups: Record<string, RangeStackSetup> = {};
  const takenCells = new Map<string, string>();

  const refuse = (record: DraftRecord, reason: RefusalReason, detail = ""): void => {
    counts[reason] += 1;
    refused.push({ sourceFile: record.sourceFile, reason, detail });
  };

  for (const record of records) {
    // Mřížka bez scénáře patří do chipEV packu, ne sem; `selectRefinedRecords`
    // si ji vezme. Tenhle výběr je právě o tom, co scénář nese.
    if (!/^ICM/i.test(record.stackSetupId)) continue;
    const answer = history.bySourceFile.get(record.sourceFile);
    if (answer === undefined) { refuse(record, "unanswered"); continue; }
    if (answer.verdict !== "sedí") { refuse(record, "rejected", answer.verdict); continue; }
    if (isStale(record, answer)) { refuse(record, "stale", `odpověď z ${answer.readAt}`); continue; }
    if (!ICM_CONTEXTS.has(record.context)) { refuse(record, "contextNotRefined", record.context); continue; }
    if (record.vsSeat === "") { refuse(record, "noOpponent"); continue; }
    const context = record.context as ActionContext;
    // Sedačka hrdiny i otvírače musí u šestistolového stolu existovat a drill
    // se na ni v tom kontextu musí ptát; jinak je to mrtvý obsah.
    if (!SIX_MAX_SEATS.has(record.position) || !SIX_MAX_SEATS.has(record.vsSeat)
      || !positionsForContext(context).includes(record.position as Position)
      || !bucketsForContext(context).includes(record.bucket as StackBucket)) {
      refuse(record, "notDealt", `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat}`);
      continue;
    }
    const notOffered = actionsNotOffered(record);
    if (notOffered.length > 0) {
      refuse(record, "actionNotOffered", notOffered.slice(0, 6).join(", ") + (notOffered.length > 6 ? ", …" : ""));
      continue;
    }
    const setup = stackSetupOfRecord(record);
    if (setup === undefined) {
      refuse(record, "notDealt", `scénář ${record.stackSetupId} bez stacků šestistolových sedaček`);
      continue;
    }
    const cell = `${record.context}|${record.position}|${record.bucket}|vs${record.vsSeat}|#${record.stackSetupId}`;
    const taken = takenCells.get(cell);
    if (taken !== undefined) { refuse(record, "duplicateCell", `táž buňka, otvírač i scénář jako ${taken}`); continue; }
    takenCells.set(cell, record.sourceFile);
    stackSetups[record.stackSetupId] = setup;

    accepted.push({
      position: record.position as Position,
      sourceStackBB: record.sourceStackBB,
      bucket: record.bucket as StackBucket,
      context,
      vsSeat: record.vsSeat as Position,
      stackSetupId: record.stackSetupId,
      provenance: `${RYE_PROVENANCE}, ${record.sourceFile}, schváleno ${answer.readAt}`
        + `${answer.contentHash ? ` (otisk ${answer.contentHash})` : ""}`,
      strict: fillFolds(record.strict),
      lenient: fillFolds(record.lenient),
    });
  }

  return { accepted, refused, counts, stackSetups };
}
