import {
  POSTFLOP_STRATEGY_ACTIONS,
  validatePostflopStrategyPack,
  type PostflopStrategyAction,
  type PostflopStrategyPack,
  type PostflopStrategyRule,
} from "./postflopStrategyPack";

export interface PostflopStrategyRuleOverlap {
  firstRuleId: string;
  secondRuleId: string;
  sharedTextures: readonly string[];
  sprMin: number;
  sprMax: number;
  actionNode: string;
}

export interface PostflopStrategyPackImportReport {
  packId: string;
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
  sourceCount: number;
  ruleCount: number;
  unsupportedActionCount: number;
  unsupportedActions: readonly string[];
  overlapCount: number;
  overlaps: readonly PostflopStrategyRuleOverlap[];
}

const SUPPORTED_RESOLVER_ACTIONS = new Set<PostflopStrategyAction>(POSTFLOP_STRATEGY_ACTIONS);

export function buildPostflopStrategyPackImportReport(
  pack: PostflopStrategyPack,
): PostflopStrategyPackImportReport {
  const errors = validatePostflopStrategyPack(pack);
  const overlaps = findPostflopStrategyRuleOverlaps(pack.rules);
  const unsupportedActions = unsupportedPreferredActions(pack.rules);
  const warnings = warningMessages(pack, overlaps, unsupportedActions);

  return {
    packId: pack.id,
    valid: errors.length === 0,
    errors,
    warnings,
    sourceCount: pack.sourceEvidence.length,
    ruleCount: pack.rules.length,
    unsupportedActionCount: unsupportedActions.length,
    unsupportedActions,
    overlapCount: overlaps.length,
    overlaps,
  };
}

export function renderPostflopStrategyPackImportReport(
  report: PostflopStrategyPackImportReport,
): string {
  const lines = [
    `PostflopStrategyPack: ${report.packId}`,
    `valid: ${report.valid}`,
    `sources: ${report.sourceCount}`,
    `rules: ${report.ruleCount}`,
    `unsupported preferred actions: ${report.unsupportedActionCount}`,
    `overlaps: ${report.overlapCount}`,
  ];

  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) lines.push(`- ${error}`);
  }

  if (report.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  if (report.overlaps.length > 0) {
    lines.push("overlap details:");
    for (const overlap of report.overlaps) {
      lines.push(
        `- ${overlap.firstRuleId} <-> ${overlap.secondRuleId} ` +
        `[${overlap.actionNode}, SPR ${overlap.sprMin}-${overlap.sprMax}, ` +
        `textures ${overlap.sharedTextures.join(", ")}]`,
      );
    }
  }

  return lines.join("\n");
}

export function findPostflopStrategyRuleOverlaps(
  rules: readonly PostflopStrategyRule[],
): PostflopStrategyRuleOverlap[] {
  const overlaps: PostflopStrategyRuleOverlap[] = [];

  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const overlap = ruleOverlap(rules[i], rules[j]);
      if (overlap) overlaps.push(overlap);
    }
  }

  return overlaps;
}

function unsupportedPreferredActions(
  rules: readonly PostflopStrategyRule[],
): string[] {
  const allowedActions = new Set<PostflopStrategyAction>(POSTFLOP_STRATEGY_ACTIONS);
  const unsupported = new Set<string>();

  for (const rule of rules) {
    if (!allowedActions.has(rule.preferredAction)) unsupported.add(rule.preferredAction);
    if (!SUPPORTED_RESOLVER_ACTIONS.has(rule.preferredAction)) {
      unsupported.add(rule.preferredAction);
    }
  }

  return [...unsupported].sort();
}

function warningMessages(
  pack: PostflopStrategyPack,
  overlaps: readonly PostflopStrategyRuleOverlap[],
  unsupportedActions: readonly string[],
): string[] {
  const warnings: string[] = [];

  if (pack.confidence === "LOW") {
    warnings.push("Postflop StrategyPack confidence is LOW; review before production use.");
  }
  if (pack.sourceEvidence.length < 2) {
    warnings.push("Postflop StrategyPack should cite at least two public sources.");
  }
  if (overlaps.length > 0) {
    warnings.push("Postflop StrategyPack has overlapping rules; resolver tie-break must stay tested.");
  }
  if (unsupportedActions.length > 0) {
    warnings.push("Postflop StrategyPack contains preferred actions unsupported by current resolver.");
  }

  return warnings;
}

function ruleOverlap(
  first: PostflopStrategyRule,
  second: PostflopStrategyRule,
): PostflopStrategyRuleOverlap | null {
  if (first.actionNode !== second.actionNode) return null;

  const sharedTextures = first.boardTextures
    .filter((texture) => second.boardTextures.includes(texture));
  if (sharedTextures.length === 0) return null;

  const sprMin = Math.max(first.sprMin, second.sprMin);
  const sprMax = Math.min(first.sprMax, second.sprMax);
  if (sprMax < sprMin) return null;

  return {
    firstRuleId: first.id,
    secondRuleId: second.id,
    sharedTextures,
    sprMin,
    sprMax,
    actionNode: first.actionNode,
  };
}
