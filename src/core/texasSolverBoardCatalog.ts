import type { Card, Rank, Suit } from "./types";

export type SolverBoardSuitTexture = "RAINBOW" | "TWO_TONE" | "MONOTONE";
export type SolverBoardPairing = "UNPAIRED" | "PAIRED" | "TRIPS";

export type SolverBoardCohortId =
  | "ACE_HIGH_DRY_RAINBOW"
  | "ACE_HIGH_DYNAMIC"
  | "BROADWAY_DRY_RAINBOW"
  | "BROADWAY_DYNAMIC"
  | "MIDDLE_DRY_RAINBOW"
  | "MIDDLE_DYNAMIC"
  | "LOW_DRY_RAINBOW"
  | "LOW_DYNAMIC"
  | "HIGH_MONOTONE"
  | "LOW_MONOTONE"
  | "HIGH_PAIRED_RAINBOW"
  | "LOW_PAIRED_RAINBOW"
  | "PAIRED_TWO_TONE"
  | "TRIPS_RAINBOW";

export interface SolverBoardCohortDefinition {
  id: SolverBoardCohortId;
  label: string;
  betaMinimum: number;
  betaDepth: number;
  growthTarget: number;
}

export interface SolverBoardClassification {
  cohortId: SolverBoardCohortId;
  suitTexture: SolverBoardSuitTexture;
  pairing: SolverBoardPairing;
  straightDense: boolean;
  highestRank: Rank;
}

export interface SolverBoardCoverageRow extends SolverBoardCohortDefinition {
  existingBoardIds: readonly string[];
  betaMinimumBoardIds: readonly string[];
  betaDepthBoardIds: readonly string[];
  growthBoardIds: readonly string[];
  betaMinimumGap: number;
  betaDepthGap: number;
  growthGap: number;
}

export const TEXAS_SOLVER_BOARD_CATALOG_VERSION = "2026-07-16.beta-v1";

export const SOLVER_BOARD_COHORTS = [
  cohort("ACE_HIGH_DRY_RAINBOW", "A-high dry rainbow"),
  cohort("ACE_HIGH_DYNAMIC", "A-high dynamic or two-tone"),
  cohort("BROADWAY_DRY_RAINBOW", "K/Q/J-high dry rainbow"),
  cohort("BROADWAY_DYNAMIC", "K/Q/J-high dynamic or two-tone"),
  cohort("MIDDLE_DRY_RAINBOW", "T/9-high dry rainbow"),
  cohort("MIDDLE_DYNAMIC", "T/9-high dynamic or two-tone"),
  cohort("LOW_DRY_RAINBOW", "8-high and lower dry rainbow", 13),
  cohort("LOW_DYNAMIC", "8-high and lower dynamic or two-tone"),
  cohort("HIGH_MONOTONE", "T-high and higher monotone"),
  cohort("LOW_MONOTONE", "9-high and lower monotone"),
  cohort("HIGH_PAIRED_RAINBOW", "T-paired and higher rainbow"),
  cohort("LOW_PAIRED_RAINBOW", "9-paired and lower rainbow"),
  cohort("PAIRED_TWO_TONE", "Paired two-tone"),
  cohort("TRIPS_RAINBOW", "Flopped trips", 13),
] as const satisfies readonly SolverBoardCohortDefinition[];

/**
 * Physical boards already used by committed or generated solver manifests.
 * These mappings remain pinned so regenerating an old batch never changes its
 * card-removal semantics merely because the catalog implementation evolves.
 */
export const LEGACY_TEXAS_SOLVER_BOARDS = {
  "432mono": "4s,3s,2s",
  "654r": "6s,5d,4c",
  "664r": "6s,6d,4c",
  "742r": "7s,4d,2c",
  "765tt": "7s,6s,5d",
  "875tt": "8s,7s,5d",
  "876tt": "8s,7s,6d",
  "883r": "8s,8d,3c",
  "955tt": "9s,5s,5d",
  "976tt": "9s,7s,6d",
  "985mono": "9s,8s,5s",
  "986tt": "9s,8s,6d",
  "997r": "9s,9d,7c",
  A72r: "As,7d,2c",
  A76tt: "As,7s,6d",
  A85mono: "As,8s,5s",
  A95r: "As,9d,5c",
  AK5r: "As,Kd,5c",
  AKQtt: "As,Ks,Qd",
  AQ6r: "As,Qd,6c",
  AT4mono: "As,Ts,4s",
  J73r: "Js,7d,3c",
  J85tt: "Js,8s,5d",
  J87r: "Js,8d,7c",
  JT9tt: "Js,Th,9h",
  K72r: "Ks,7d,2c",
  K83r: "Ks,8d,3c",
  K98tt: "Ks,9s,8d",
  KJ4tt: "Ks,Js,4d",
  KJTmono: "Ks,Js,Ts",
  KQ5r: "Ks,Qd,5c",
  Q72r: "Qs,7d,2c",
  Q76mono: "Qs,7s,6s",
  Q84r: "Qs,8d,4c",
  QJ2tt: "Qs,Jh,2h",
  QJ9tt: "Qs,Js,9d",
  QQ7r: "Qs,Qd,7c",
  T76tt: "Ts,7s,6d",
  T84r: "Ts,8d,4c",
  T97r: "Ts,9d,7c",
} as const satisfies Readonly<Record<string, string>>;

const RANKS: readonly Rank[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const BOARD_ID_PATTERN = /^([AKQJT98765432])([AKQJT98765432])([AKQJT98765432])(mono|tt|r)$/;
const CARD_PATTERN = /^([AKQJT98765432])([shdc])$/;

export function texasSolverBoardForId(boardId: string): string {
  const legacy = (LEGACY_TEXAS_SOLVER_BOARDS as Readonly<Record<string, string>>)[boardId];
  if (legacy !== undefined) return legacy;
  return representativeFlopForBoardId(boardId).map((card) => `${card.rank}${card.suit}`).join(",");
}

export function representativeFlopForBoardId(boardId: string): [Card, Card, Card] {
  const legacy = (LEGACY_TEXAS_SOLVER_BOARDS as Readonly<Record<string, string>>)[boardId];
  if (legacy !== undefined) return parseTexasSolverBoard(legacy);
  const parsed = parseBoardId(boardId);
  const suits = canonicalSuits(parsed.ranks, parsed.suffix);
  const cards = parsed.ranks.map((rank, index) => ({ rank, suit: suits[index] })) as [Card, Card, Card];
  if (new Set(cards.map((card) => `${card.rank}${card.suit}`)).size !== 3) {
    throw new Error(`Board id ${boardId} does not describe three distinct cards.`);
  }
  return cards;
}

export function parseTexasSolverBoard(value: string): [Card, Card, Card] {
  const tokens = value.split(",").map((token) => token.trim());
  if (tokens.length !== 3) throw new Error(`TexasSolver board must contain three cards: ${value}`);
  const cards = tokens.map((token) => {
    const match = CARD_PATTERN.exec(token);
    if (match === null) throw new Error(`Invalid TexasSolver card: ${token}`);
    return { rank: match[1] as Rank, suit: match[2] as Suit };
  }) as [Card, Card, Card];
  if (new Set(cards.map((card) => `${card.rank}${card.suit}`)).size !== 3) {
    throw new Error(`TexasSolver board contains duplicate cards: ${value}`);
  }
  return cards;
}

export function isSupportedSolverBoardId(boardId: string): boolean {
  try {
    representativeFlopForBoardId(boardId);
    return true;
  } catch {
    return false;
  }
}

export function classifySolverBoardId(boardId: string): SolverBoardClassification {
  const cards = parseTexasSolverBoard(texasSolverBoardForId(boardId));
  const rankValues = cards.map((card) => rankValue(card.rank));
  const uniqueRanks = [...new Set(rankValues)].sort((a, b) => b - a);
  const uniqueSuits = new Set(cards.map((card) => card.suit)).size;
  const pairing: SolverBoardPairing = uniqueRanks.length === 1
    ? "TRIPS"
    : uniqueRanks.length === 2
      ? "PAIRED"
      : "UNPAIRED";
  const suitTexture: SolverBoardSuitTexture = uniqueSuits === 1
    ? "MONOTONE"
    : uniqueSuits === 2
      ? "TWO_TONE"
      : "RAINBOW";
  const highestValue = Math.max(...rankValues);
  const highestRank = rankForValue(highestValue);
  const straightDense = pairing === "UNPAIRED" && isStraightDense(uniqueRanks);

  return {
    cohortId: cohortIdFor({ highestValue, pairing, straightDense, suitTexture }),
    suitTexture,
    pairing,
    straightDense,
    highestRank,
  };
}

export function enumerateCanonicalSolverBoardIds(): string[] {
  const ids: string[] = [];
  for (let first = 0; first < RANKS.length; first += 1) {
    for (let second = first; second < RANKS.length; second += 1) {
      for (let third = second; third < RANKS.length; third += 1) {
        const ranks = [RANKS[first], RANKS[second], RANKS[third]] as const;
        const uniqueRanks = new Set(ranks).size;
        ids.push(`${ranks.join("")}r`);
        if (uniqueRanks > 1) ids.push(`${ranks.join("")}tt`);
        if (uniqueRanks === 3) ids.push(`${ranks.join("")}mono`);
      }
    }
  }
  return ids;
}

export function buildSolverBoardCoveragePlan(
  existingInput: readonly string[] = Object.keys(LEGACY_TEXAS_SOLVER_BOARDS),
): SolverBoardCoverageRow[] {
  const existing = unique(existingInput);
  for (const boardId of existing) {
    if (!isSupportedSolverBoardId(boardId)) throw new Error(`Unsupported existing solver board id: ${boardId}`);
  }

  const candidatesByCohort = new Map<SolverBoardCohortId, string[]>();
  for (const boardId of enumerateCanonicalSolverBoardIds()) {
    const cohortId = classifySolverBoardId(boardId).cohortId;
    candidatesByCohort.set(cohortId, [...(candidatesByCohort.get(cohortId) ?? []), boardId]);
  }

  return SOLVER_BOARD_COHORTS.map((definition) => {
    const existingBoardIds = existing
      .filter((boardId) => classifySolverBoardId(boardId).cohortId === definition.id)
      .sort();
    const candidates = candidatesByCohort.get(definition.id) ?? [];
    const growthBoardIds = selectDiverseBoards(existingBoardIds, candidates, definition.growthTarget);
    const betaMinimumBoardIds = growthBoardIds.slice(0, Math.max(definition.betaMinimum, existingBoardIds.length));
    const betaDepthBoardIds = growthBoardIds.slice(0, Math.max(definition.betaDepth, existingBoardIds.length));
    return {
      ...definition,
      existingBoardIds,
      betaMinimumBoardIds,
      betaDepthBoardIds,
      growthBoardIds,
      betaMinimumGap: Math.max(0, definition.betaMinimum - existingBoardIds.length),
      betaDepthGap: Math.max(0, definition.betaDepth - existingBoardIds.length),
      growthGap: Math.max(0, definition.growthTarget - existingBoardIds.length),
    };
  });
}

function cohort(
  id: SolverBoardCohortId,
  label: string,
  growthTarget = 20,
): SolverBoardCohortDefinition {
  return { id, label, betaMinimum: 6, betaDepth: 12, growthTarget };
}

function parseBoardId(boardId: string): {
  ranks: [Rank, Rank, Rank];
  suffix: "r" | "tt" | "mono";
} {
  const match = BOARD_ID_PATTERN.exec(boardId);
  if (match === null) throw new Error(`Unsupported solver board id: ${boardId}`);
  const ranks = [match[1], match[2], match[3]] as [Rank, Rank, Rank];
  const values = ranks.map(rankValue);
  if (!(values[0] >= values[1] && values[1] >= values[2])) {
    throw new Error(`Solver board ranks must be in descending order: ${boardId}`);
  }
  return { ranks, suffix: match[4] as "r" | "tt" | "mono" };
}

function canonicalSuits(
  ranks: readonly [Rank, Rank, Rank],
  suffix: "r" | "tt" | "mono",
): [Suit, Suit, Suit] {
  if (suffix === "r") return ["s", "h", "d"];
  if (suffix === "mono") {
    if (new Set(ranks).size !== 3) throw new Error("A monotone flop cannot contain a paired rank.");
    return ["s", "s", "s"];
  }
  if (new Set(ranks).size === 1) throw new Error("A trips flop cannot be two-tone.");
  return ranks[0] === ranks[1] ? ["s", "h", "s"] : ["s", "s", "h"];
}

function cohortIdFor(input: {
  highestValue: number;
  pairing: SolverBoardPairing;
  straightDense: boolean;
  suitTexture: SolverBoardSuitTexture;
}): SolverBoardCohortId {
  if (input.pairing === "TRIPS") return "TRIPS_RAINBOW";
  if (input.pairing === "PAIRED") {
    if (input.suitTexture === "TWO_TONE") return "PAIRED_TWO_TONE";
    return input.highestValue >= 10 ? "HIGH_PAIRED_RAINBOW" : "LOW_PAIRED_RAINBOW";
  }
  if (input.suitTexture === "MONOTONE") {
    return input.highestValue >= 10 ? "HIGH_MONOTONE" : "LOW_MONOTONE";
  }

  const dynamic = input.straightDense || input.suitTexture === "TWO_TONE";
  if (input.highestValue === 14) return dynamic ? "ACE_HIGH_DYNAMIC" : "ACE_HIGH_DRY_RAINBOW";
  if (input.highestValue >= 11) return dynamic ? "BROADWAY_DYNAMIC" : "BROADWAY_DRY_RAINBOW";
  if (input.highestValue >= 9) return dynamic ? "MIDDLE_DYNAMIC" : "MIDDLE_DRY_RAINBOW";
  return dynamic ? "LOW_DYNAMIC" : "LOW_DRY_RAINBOW";
}

function isStraightDense(values: readonly number[]): boolean {
  if (values.length !== 3) return false;
  const normalized = new Set(values);
  if (normalized.has(14)) normalized.add(1);
  for (let low = 1; low <= 10; low += 1) {
    let count = 0;
    for (let value = low; value < low + 5; value += 1) {
      if (normalized.has(value)) count += 1;
    }
    if (count === 3) return true;
  }
  return false;
}

function selectDiverseBoards(
  pinnedInput: readonly string[],
  candidatesInput: readonly string[],
  target: number,
): string[] {
  const selected = unique(pinnedInput);
  const remaining = unique(candidatesInput)
    .filter((boardId) => !selected.includes(boardId))
    .sort();

  while (selected.length < target && remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (const [index, boardId] of remaining.entries()) {
      const distance = selected.length === 0
        ? rankSpreadScore(boardId)
        : Math.min(...selected.map((selectedId) => rankDistance(boardId, selectedId)));
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

function rankDistance(first: string, second: string): number {
  const a = parseBoardId(first).ranks.map(rankValue);
  const b = parseBoardId(second).ranks.map(rankValue);
  return Math.abs(a[0] - b[0]) * 3 + Math.abs(a[1] - b[1]) * 2 + Math.abs(a[2] - b[2]);
}

function rankSpreadScore(boardId: string): number {
  const values = parseBoardId(boardId).ranks.map(rankValue);
  return (values[0] - values[2]) * 10 + values[1];
}

function rankValue(rank: Rank): number {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  if (rank === "T") return 10;
  return Number(rank);
}

function rankForValue(value: number): Rank {
  const rank = RANKS.find((candidate) => rankValue(candidate) === value);
  if (rank === undefined) throw new Error(`Unsupported rank value: ${value}`);
  return rank;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
