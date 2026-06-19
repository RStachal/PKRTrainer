import type { FlopProductionStrategyPack } from "./flopProductionStrategyPack";
import type { RiverProductionStrategyPack } from "./riverProductionStrategyPack";
import type { TurnProductionStrategyPack } from "./turnProductionStrategyPack";
import { RANKS, SUITS } from "../../core/poker";
import type { Card, HandLabel } from "../../core/types";

export type ProductionStrategyPack =
  | FlopProductionStrategyPack
  | TurnProductionStrategyPack
  | RiverProductionStrategyPack;

export function validateProductionStrategySemantics(
  pack: ProductionStrategyPack,
): string[] {
  const errors = [
    ...duplicateCoverageErrors(pack),
    ...duplicateRuleErrors(pack),
  ];

  for (const rule of pack.rules) {
    const lanesByHand = new Map<string, Set<string>>();
    for (const bucket of rule.rangeBuckets) {
      for (const hand of bucket.handClasses) {
        const lanes = lanesByHand.get(hand) ?? new Set<string>();
        lanes.add(bucket.lane);
        lanesByHand.set(hand, lanes);
      }
    }
    errors.push(...handClassOverlapErrors(rule, lanesByHand));
    errors.push(...cardRemovalErrors(pack, rule, lanesByHand));
  }

  return errors;
}

function cardRemovalErrors(
  pack: ProductionStrategyPack,
  rule: ProductionStrategyPack["rules"][number],
  lanesByHand: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const errors: string[] = [];
  const expectedBoardLength = pack.dimensions.street === "FLOP"
    ? 3
    : pack.dimensions.street === "TURN"
      ? 4
      : 5;
  const samples = rule.cardRemovalSamples ?? [];
  if (samples.length === 0) {
    return [`${rule.id}: at least one card removal sample is required.`];
  }
  for (const [index, sample] of samples.entries()) {
    const prefix = `${rule.id}: card removal sample ${index + 1}`;
    if (sample.board.length !== expectedBoardLength) {
      errors.push(`${prefix} must contain ${expectedBoardLength} board cards.`);
    }
    if (sample.rationale.trim().length === 0) {
      errors.push(`${prefix} needs rationale.`);
    }
    const cards = [...sample.heroCards, ...sample.board];
    if (new Set(cards.map(cardKey)).size !== cards.length) {
      errors.push(`${prefix} contains duplicate physical cards.`);
    }
    const derivedHand = handClassFromCards(sample.heroCards);
    if (derivedHand !== sample.handClass) {
      errors.push(`${prefix} hero cards resolve to ${derivedHand}, not ${sample.handClass}.`);
    }
    if (!lanesByHand.has(sample.handClass)) {
      errors.push(`${prefix} hand ${sample.handClass} is absent from range buckets.`);
    }
    for (const hand of lanesByHand.keys()) {
      if (!hasAvailableCombo(hand, sample.board)) {
        errors.push(`${prefix} removes every combo of range hand ${hand}.`);
      }
    }
  }
  return errors;
}

function handClassFromCards(cards: readonly [Card, Card]): HandLabel {
  const [first, second] = cards;
  const firstIndex = RANKS.indexOf(first.rank);
  const secondIndex = RANKS.indexOf(second.rank);
  if (firstIndex === secondIndex) return `${first.rank}${second.rank}`;
  const high = firstIndex < secondIndex ? first : second;
  const low = firstIndex < secondIndex ? second : first;
  return `${high.rank}${low.rank}${high.suit === low.suit ? "s" : "o"}`;
}

function hasAvailableCombo(hand: HandLabel, board: readonly Card[]): boolean {
  const blocked = new Set(board.map(cardKey));
  const cards = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));
  for (let first = 0; first < cards.length; first += 1) {
    if (blocked.has(cardKey(cards[first]))) continue;
    for (let second = first + 1; second < cards.length; second += 1) {
      if (blocked.has(cardKey(cards[second]))) continue;
      if (handClassFromCards([cards[first], cards[second]]) === hand) return true;
    }
  }
  return false;
}

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function handClassOverlapErrors(
  rule: ProductionStrategyPack["rules"][number],
  lanesByHand: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const errors: string[] = [];
  const policies = rule.handClassOverlapPolicies ?? [];
  const policiesByHand = new Map<string, typeof policies[number]>();
  for (const policy of policies) {
    if (policiesByHand.has(policy.handClass)) {
      errors.push(`${rule.id}: duplicate overlap policy for hand ${policy.handClass}.`);
    }
    policiesByHand.set(policy.handClass, policy);
    if (policy.rationale.trim().length === 0) {
      errors.push(`${rule.id}: overlap policy for hand ${policy.handClass} needs rationale.`);
    }
  }

  for (const [hand, lanes] of lanesByHand) {
    if (lanes.size < 2) continue;
    const policy = policiesByHand.get(hand);
    if (policy === undefined) {
      errors.push(`${rule.id}: hand ${hand} appears in multiple range buckets without overlap policy.`);
      continue;
    }
    if (sortedValues(lanes).join(",") !== sortedValues(policy.lanes).join(",")) {
      errors.push(`${rule.id}: overlap policy lanes do not match buckets for hand ${hand}.`);
    }
  }
  for (const policy of policies) {
    if ((lanesByHand.get(policy.handClass)?.size ?? 0) < 2) {
      errors.push(`${rule.id}: overlap policy for hand ${policy.handClass} has no bucket overlap.`);
    }
  }
  return errors;
}

function sortedValues(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function duplicateCoverageErrors(pack: ProductionStrategyPack): string[] {
  const street = streetLabel(pack);
  const errors: string[] = [];
  if (new Set(pack.dimensions.blindSpeeds).size !== pack.dimensions.blindSpeeds.length) {
    errors.push(`${street} production blindSpeeds coverage contains duplicates.`);
  }
  if (new Set(pack.dimensions.antes).size !== pack.dimensions.antes.length) {
    errors.push(`${street} production ante coverage contains duplicates.`);
  }
  return errors;
}

function duplicateRuleErrors(pack: ProductionStrategyPack): string[] {
  const street = streetLabel(pack);
  const errors: string[] = [];
  const ruleIds = new Set<string>();
  const selectors = new Map<string, string>();

  for (const rule of pack.rules) {
    if (ruleIds.has(rule.id)) {
      errors.push(`Duplicate ${street.toLowerCase()} production rule id: ${rule.id}.`);
    }
    ruleIds.add(rule.id);
    const selector = semanticSelector(pack, rule);
    const firstRuleId = selectors.get(selector);
    if (firstRuleId !== undefined) {
      errors.push(
        `${street} production rule ${rule.id} duplicates selector of ${firstRuleId}.`,
      );
    } else {
      selectors.set(selector, rule.id);
    }
  }

  for (let index = 0; index < pack.rules.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < pack.rules.length; otherIndex += 1) {
      const first = pack.rules[index];
      const second = pack.rules[otherIndex];
      if (
        semanticSelector(pack, first) !== semanticSelector(pack, second) &&
        selectorsOverlap(pack, first, second)
      ) {
        errors.push(
          `${street} production rule ${second.id} overlaps selector of ${first.id}.`,
        );
      }
    }
  }

  return errors;
}

function selectorsOverlap(
  pack: ProductionStrategyPack,
  first: ProductionStrategyPack["rules"][number],
  second: ProductionStrategyPack["rules"][number],
): boolean {
  if (
    first.actionNode !== second.actionNode ||
    first.potType !== second.potType ||
    first.positionPattern !== second.positionPattern ||
    first.sprMin > second.sprMax ||
    second.sprMin > first.sprMax
  ) {
    return false;
  }
  if (pack.dimensions.street === "FLOP") {
    const a = first as FlopProductionStrategyPack["rules"][number];
    const b = second as FlopProductionStrategyPack["rules"][number];
    return intersects(a.boardTextures, b.boardTextures);
  }
  if (pack.dimensions.street === "TURN") {
    const a = first as TurnProductionStrategyPack["rules"][number];
    const b = second as TurnProductionStrategyPack["rules"][number];
    return a.priorFlopAction === b.priorFlopAction &&
      intersects(a.turnCardClasses, b.turnCardClasses);
  }
  const a = first as RiverProductionStrategyPack["rules"][number];
  const b = second as RiverProductionStrategyPack["rules"][number];
  return a.priorTurnAction === b.priorTurnAction &&
    intersects(a.riverRunoutClasses, b.riverRunoutClasses);
}

function intersects<T>(first: readonly T[], second: readonly T[]): boolean {
  const values = new Set(first);
  return second.some((item) => values.has(item));
}

function semanticSelector(
  pack: ProductionStrategyPack,
  rule: ProductionStrategyPack["rules"][number],
): string {
  const common = [
    rule.actionNode,
    rule.potType,
    rule.positionPattern,
    rule.sprMin,
    rule.sprMax,
  ];
  if (pack.dimensions.street === "FLOP") {
    const item = rule as FlopProductionStrategyPack["rules"][number];
    return [...common, [...item.boardTextures].sort().join(",")].join("|");
  }
  if (pack.dimensions.street === "TURN") {
    const item = rule as TurnProductionStrategyPack["rules"][number];
    return [
      ...common,
      item.priorFlopAction,
      [...item.turnCardClasses].sort().join(","),
    ].join("|");
  }
  const item = rule as RiverProductionStrategyPack["rules"][number];
  return [
    ...common,
    item.priorTurnAction,
    [...item.riverRunoutClasses].sort().join(","),
  ].join("|");
}

function streetLabel(pack: ProductionStrategyPack): "Flop" | "Turn" | "River" {
  switch (pack.dimensions.street) {
    case "FLOP":
      return "Flop";
    case "TURN":
      return "Turn";
    case "RIVER":
      return "River";
  }
}
