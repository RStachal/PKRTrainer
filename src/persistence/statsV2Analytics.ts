import type { ResultRecordV2 } from "./statsRecordV2";

export type StatsV2BreakdownDim =
  | "gameVariant"
  | "tableFormat"
  | "blindSpeed"
  | "street"
  | "evModel"
  | "ante"
  | "rakeMode"
  | "rangePackId"
  | "position"
  | "bucket"
  | "context";

export interface StatsV2Summary {
  total: number;
  correct: number;
  rate: number | null;
}

export interface StatsV2Group {
  key: string;
  total: number;
  correct: number;
  rate: number | null;
}

export function summarizeStatsV2(records: readonly ResultRecordV2[]): StatsV2Summary {
  const total = records.length;
  const correct = records.filter((record) => record.correct).length;
  return {
    total,
    correct,
    rate: successRate(total, correct),
  };
}

export function breakdownStatsV2(
  records: readonly ResultRecordV2[],
  dim: StatsV2BreakdownDim,
): StatsV2Group[] {
  const groups = new Map<string, { total: number; correct: number }>();
  const order: string[] = [];

  for (const record of records) {
    const key = String(record[dim]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { total: 0, correct: 0 };
      groups.set(key, group);
      order.push(key);
    }

    group.total += 1;
    if (record.correct) group.correct += 1;
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    return {
      key,
      total: group.total,
      correct: group.correct,
      rate: successRate(group.total, group.correct),
    };
  });
}

export function availableStatsV2Dimensions(): StatsV2BreakdownDim[] {
  return [
    "gameVariant",
    "tableFormat",
    "blindSpeed",
    "street",
    "evModel",
    "ante",
    "rakeMode",
    "rangePackId",
    "position",
    "bucket",
    "context",
  ];
}

function successRate(total: number, correct: number): number | null {
  if (total <= 0) return null;
  return Math.round((correct / total) * 1000) / 10;
}
