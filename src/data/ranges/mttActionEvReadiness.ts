import { validateActionEvSet } from "../../core/actionEv";
import { ALL_HAND_CLASSES } from "../../core/poker";
import { offeredPreflopActionKeysForContext } from "../../core/preflopActionOptions";
import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import type { RangePack } from "./rangePack";

export interface ActionEvCoverageRow {
  packId: string;
  completeDecisions: number;
  totalDecisions: number;
  coveragePct: number;
  ready: boolean;
}

export interface MttActionEvReadinessReport {
  valid: boolean;
  comparisonReady: boolean;
  preflop: {
    completeDecisions: number;
    totalDecisions: number;
    readyPacks: number;
    totalPacks: number;
    rows: readonly ActionEvCoverageRow[];
  };
  postflop: {
    completeDecisions: number;
    totalDecisions: number;
    readyPacks: number;
    totalPacks: number;
    rows: readonly ActionEvCoverageRow[];
  };
  blockers: readonly string[];
  errors: readonly string[];
}

export function buildMttActionEvReadinessReport(input: {
  preflopPacks: readonly RangePack[];
  postflopPacks: readonly FlopProductionStrategyPack[];
}): MttActionEvReadinessReport {
  const errors: string[] = [];
  const preflopRows = input.preflopPacks.map((pack) => preflopCoverage(pack, errors));
  const postflopRows = input.postflopPacks.map((pack) => postflopCoverage(pack, errors));
  const preflop = summarizeRows(preflopRows);
  const postflop = summarizeRows(postflopRows);
  const comparisonReady = (
    errors.length === 0 &&
    preflop.totalPacks > 0 &&
    postflop.totalPacks > 0 &&
    preflop.readyPacks === preflop.totalPacks &&
    postflop.readyPacks === postflop.totalPacks
  );

  return {
    valid: errors.length === 0,
    comparisonReady,
    preflop,
    postflop,
    blockers: [...preflopRows, ...postflopRows]
      .filter((row) => !row.ready)
      .map((row) => (
        `${row.packId}: complete solver action EV ${row.completeDecisions}/${row.totalDecisions} decisions.`
      )),
    errors,
  };
}

function preflopCoverage(pack: RangePack, errors: string[]): ActionEvCoverageRow {
  let completeDecisions = 0;
  const totalDecisions = pack.records.length * ALL_HAND_CLASSES.length;

  for (const [recordIndex, record] of pack.records.entries()) {
    for (const hand of ALL_HAND_CLASSES) {
      const strict = record.strict[hand] ?? [];
      const offeredActions = offeredPreflopActionKeysForContext(
        record.context,
        record.position,
        record.bucket,
        strict,
      );
      const set = record.actionEvs?.[hand];
      if (set === undefined) continue;
      const setErrors = validateActionEvSet(set, offeredActions);
      if (setErrors.length === 0) {
        completeDecisions += 1;
      } else {
        errors.push(...setErrors.map((error) => (
          `${pack.id}.records[${recordIndex}].actionEvs.${hand}: ${error}.`
        )));
      }
    }
  }

  return coverageRow(pack.id, completeDecisions, totalDecisions);
}

function postflopCoverage(
  pack: FlopProductionStrategyPack,
  errors: string[],
): ActionEvCoverageRow {
  let completeDecisions = 0;
  let totalDecisions = 0;

  for (const [ruleIndex, rule] of pack.rules.entries()) {
    for (const [bucketIndex, bucket] of rule.rangeBuckets.entries()) {
      totalDecisions += 1;
      if (bucket.actionEvs === undefined) continue;
      const setErrors = validateActionEvSet(bucket.actionEvs, rule.actions);
      if (setErrors.length === 0) {
        completeDecisions += 1;
      } else {
        errors.push(...setErrors.map((error) => (
          `${pack.id}.rules[${ruleIndex}].rangeBuckets[${bucketIndex}].actionEvs: ${error}.`
        )));
      }
    }
  }

  return coverageRow(pack.id, completeDecisions, totalDecisions);
}

function coverageRow(
  packId: string,
  completeDecisions: number,
  totalDecisions: number,
): ActionEvCoverageRow {
  return {
    packId,
    completeDecisions,
    totalDecisions,
    coveragePct: totalDecisions === 0
      ? 0
      : Math.round((completeDecisions / totalDecisions) * 1_000) / 10,
    ready: totalDecisions > 0 && completeDecisions === totalDecisions,
  };
}

function summarizeRows(rows: readonly ActionEvCoverageRow[]) {
  return {
    completeDecisions: rows.reduce((sum, row) => sum + row.completeDecisions, 0),
    totalDecisions: rows.reduce((sum, row) => sum + row.totalDecisions, 0),
    readyPacks: rows.filter((row) => row.ready).length,
    totalPacks: rows.length,
    rows,
  };
}
