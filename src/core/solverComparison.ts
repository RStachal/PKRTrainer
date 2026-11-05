import { POSITION_ORDER, type AnteMode, type Position } from "./types";
import type {
  BlindSpeed,
  EvModel,
  GameVariant,
  RakeMode,
  TableFormat,
  TrainingStreet,
} from "./trainingProfile";

export const SOLVER_EXACT_NODE_SCHEMA_VERSION =
  "PKRTRAINER_SOLVER_EXACT_NODE_V1" as const;

export type SolverComparisonGranularity = "COMBO" | "HAND_CLASS";
export type CanonicalSolverActionKind =
  | "CHECK"
  | "FOLD"
  | "CALL"
  | "BET"
  | "RAISE";

export interface SolverExactNodeAction {
  id: string;
  kind: CanonicalSolverActionKind;
  sizeBb?: number;
  sizePotPct?: number;
}

export interface SolverExactNodePlayer {
  seatId: string;
  position: Position;
  startingStackBb: number;
  rangeFingerprint: string;
}

export interface SolverExactNodeSpot {
  spotId: string;
  gameVariant: GameVariant;
  tableFormat: TableFormat;
  blindSpeed: BlindSpeed;
  street: TrainingStreet;
  evModel: EvModel;
  ante: AnteMode;
  rakeMode: RakeMode;
  players: readonly SolverExactNodePlayer[];
  actingSeatId: string;
  board: readonly string[];
  potBb: number;
  effectiveStackBb: number;
  potType: string;
  nodePath: readonly string[];
  variantConfigFingerprint: string;
  treeFingerprint: string;
}

export interface SolverExactNodeRow {
  key: string;
  rangeWeight: number;
  frequenciesPct: Readonly<Record<string, number>>;
  evsBb?: Readonly<Record<string, number>>;
}

export interface SolverExactNodeExport {
  schemaVersion: typeof SOLVER_EXACT_NODE_SCHEMA_VERSION;
  solver: {
    id: string;
    version: string;
    build?: string;
  };
  spot: SolverExactNodeSpot;
  granularity: SolverComparisonGranularity;
  actions: readonly SolverExactNodeAction[];
  rows: readonly SolverExactNodeRow[];
  accuracy: {
    exploitabilityBb: number;
    targetExploitabilityBb: number;
    iterations: number;
  };
}

export interface ExactSolverComparisonOptions {
  equivalentEvThresholdBb: number;
  maxActionEvDeltaBb: number;
  maxDisjointBestActionPct: number;
  maxMeanStrategyDistancePct: number;
  maxRowStrategyDistancePct: number;
}

export const DEFAULT_EXACT_SOLVER_COMPARISON_OPTIONS: ExactSolverComparisonOptions = {
  equivalentEvThresholdBb: 0.01,
  maxActionEvDeltaBb: 0.03,
  maxDisjointBestActionPct: 5,
  maxMeanStrategyDistancePct: 5,
  maxRowStrategyDistancePct: 15,
};

export interface ExactSolverComparisonRow {
  key: string;
  rangeWeight: number;
  frequencyDeltasPct: Record<string, number>;
  maxFrequencyDeltaPct: number;
  strategyDistancePct: number;
  leftDominantActions: string[];
  rightDominantActions: string[];
  maxActionEvDeltaBb: number | null;
  leftBestActions: string[] | null;
  rightBestActions: string[] | null;
  bestActionSetsOverlap: boolean | null;
  pass: boolean;
  reasons: string[];
}

export interface ExactSolverComparisonReport {
  valid: boolean;
  comparable: boolean;
  evidenceLevel:
    | "NOT_COMPARABLE"
    | "HAND_CLASS_DIAGNOSTIC"
    | "EXACT_COMBO_STRATEGY"
    | "EXACT_COMBO_STRATEGY_AND_EV";
  options: ExactSolverComparisonOptions;
  leftErrors: string[];
  rightErrors: string[];
  blockers: string[];
  warnings: string[];
  metrics: {
    rows: number;
    frequencyOutliers: number;
    meanStrategyDistancePct: number;
    maxStrategyDistancePct: number;
    maxFrequencyDeltaPct: number;
    evComparedRows: number;
    evOutliers: number;
    maxActionEvDeltaBb: number | null;
    disjointBestActionRows: number;
    disjointBestActionRowPct: number;
    disjointBestActionRangeWeightPct: number;
  } | null;
  rows: ExactSolverComparisonRow[];
}

const ACTION_KINDS = new Set<CanonicalSolverActionKind>([
  "CHECK",
  "FOLD",
  "CALL",
  "BET",
  "RAISE",
]);
const GAME_VARIANTS = new Set<GameVariant>(["MTT", "SNG", "CASH"]);
const TABLE_FORMATS = new Set<TableFormat>(["FULL_RING_9", "SIX_MAX"]);
const BLIND_SPEEDS = new Set<BlindSpeed>(["REGULAR", "TURBO"]);
const STREETS = new Set<TrainingStreet>(["PREFLOP", "FLOP", "TURN", "RIVER"]);
const EV_MODELS = new Set<EvModel>(["CHIP_EV", "DOLAR_EV", "ICM"]);
const ANTES = new Set<AnteMode>(["ON", "OFF"]);
const RAKE_MODES = new Set<RakeMode>(["NONE", "RAKE", "NO_RAKE"]);
const POSITIONS = new Set<Position>(POSITION_ORDER);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CARD_PATTERN = /^[2-9TJQKA][cdhs]$/;
const ACTION_ID_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const FREQUENCY_SUM_TOLERANCE_PCT = 0.5;
const RANGE_WEIGHT_TOLERANCE = 0.0001;
const DOMINANT_FREQUENCY_TIE_PCT = 0.5;

export function validateSolverExactNodeExport(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ["Document must be a JSON object."];
  if (input.schemaVersion !== SOLVER_EXACT_NODE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SOLVER_EXACT_NODE_SCHEMA_VERSION}.`);
  }

  validateSolver(input.solver, errors);
  const actionIds = validateActions(input.actions, errors);
  const granularity = input.granularity;
  if (granularity !== "COMBO" && granularity !== "HAND_CLASS") {
    errors.push("granularity must be COMBO or HAND_CLASS.");
  }
  validateSpot(input.spot, errors);
  validateAccuracy(input.accuracy, errors);
  validateRows(input.rows, actionIds, errors);
  return errors;
}

export function canonicalSolverSetupJson(document: SolverExactNodeExport): string {
  return stableStringify({
    schemaVersion: document.schemaVersion,
    spot: document.spot,
    granularity: document.granularity,
    actions: [...document.actions].sort((left, right) => left.id.localeCompare(right.id)),
    targetExploitabilityBb: document.accuracy.targetExploitabilityBb,
  });
}

export function compareSolverExactNodes(
  leftInput: unknown,
  rightInput: unknown,
  overrides: Partial<ExactSolverComparisonOptions> = {},
): ExactSolverComparisonReport {
  const options = { ...DEFAULT_EXACT_SOLVER_COMPARISON_OPTIONS, ...overrides };
  const optionErrors = validateOptions(options);
  const leftErrors = validateSolverExactNodeExport(leftInput);
  const rightErrors = validateSolverExactNodeExport(rightInput);
  const base: ExactSolverComparisonReport = {
    valid: false,
    comparable: false,
    evidenceLevel: "NOT_COMPARABLE",
    options,
    leftErrors,
    rightErrors,
    blockers: [...optionErrors],
    warnings: [],
    metrics: null,
    rows: [],
  };
  if (leftErrors.length > 0 || rightErrors.length > 0 || optionErrors.length > 0) return base;

  const left = leftInput as SolverExactNodeExport;
  const right = rightInput as SolverExactNodeExport;
  if (left.solver.id === right.solver.id) {
    base.blockers.push("Cross-check requires exports from two different solver ids.");
  }
  if (canonicalSolverSetupJson(left) !== canonicalSolverSetupJson(right)) {
    base.blockers.push(
      "Canonical spot setup differs: profile, players/ranges, board, node, tree, granularity and actions must match exactly.",
    );
  }

  const leftRows = new Map(left.rows.map((row) => [row.key, row]));
  const rightRows = new Map(right.rows.map((row) => [row.key, row]));
  const missingLeft = [...rightRows.keys()].filter((key) => !leftRows.has(key));
  const missingRight = [...leftRows.keys()].filter((key) => !rightRows.has(key));
  if (missingLeft.length > 0 || missingRight.length > 0) {
    base.blockers.push(
      `Row keys differ: missing from left=${missingLeft.length}, missing from right=${missingRight.length}.`,
    );
  }
  for (const [key, leftRow] of leftRows) {
    const rightRow = rightRows.get(key);
    if (rightRow !== undefined && Math.abs(leftRow.rangeWeight - rightRow.rangeWeight) > RANGE_WEIGHT_TOLERANCE) {
      base.blockers.push(`Range weight differs for ${key}.`);
      if (base.blockers.length >= 12) break;
    }
  }
  if (base.blockers.length > 0) return base;

  const leftHasEv = left.rows.every((row) => row.evsBb !== undefined);
  const rightHasEv = right.rows.every((row) => row.evsBb !== undefined);
  const compareEv = leftHasEv && rightHasEv;
  if (!compareEv) {
    base.warnings.push(
      "At least one solver export has no complete per-action EV payload; this run compares strategy only.",
    );
  }
  if (left.granularity === "HAND_CLASS") {
    base.warnings.push(
      "Hand-class aggregation can hide suit and blocker differences; use COMBO evidence for production sign-off.",
    );
  }

  const actionIds = left.actions.map((action) => action.id).sort();
  const rows = [...leftRows.keys()].sort().map((key) => compareRow(
    leftRows.get(key)!,
    rightRows.get(key)!,
    actionIds,
    compareEv,
    options,
  ));
  const totalWeight = rows.reduce((sum, row) => sum + row.rangeWeight, 0);
  const meanStrategyDistancePct = totalWeight === 0
    ? 0
    : rows.reduce((sum, row) => sum + row.strategyDistancePct * row.rangeWeight, 0) / totalWeight;
  const frequencyOutliers = rows.filter(
    (row) => row.strategyDistancePct > options.maxRowStrategyDistancePct,
  ).length;
  const evRows = rows.filter((row) => row.maxActionEvDeltaBb !== null);
  const evOutliers = evRows.filter(
    (row) => row.maxActionEvDeltaBb! > options.maxActionEvDeltaBb,
  ).length;
  const disjointBestActionRows = evRows.filter((row) => row.bestActionSetsOverlap === false).length;
  const disjointBestActionRowPct = evRows.length === 0
    ? 0
    : (disjointBestActionRows / evRows.length) * 100;
  const evRangeWeight = evRows.reduce((sum, row) => sum + row.rangeWeight, 0);
  const disjointBestActionRangeWeight = evRows
    .filter((row) => row.bestActionSetsOverlap === false)
    .reduce((sum, row) => sum + row.rangeWeight, 0);
  const disjointBestActionRangeWeightPct = evRangeWeight === 0
    ? 0
    : (disjointBestActionRangeWeight / evRangeWeight) * 100;
  const metrics = {
    rows: rows.length,
    frequencyOutliers,
    meanStrategyDistancePct: round(meanStrategyDistancePct, 4),
    maxStrategyDistancePct: round(max(rows.map((row) => row.strategyDistancePct)), 4),
    maxFrequencyDeltaPct: round(max(rows.map((row) => row.maxFrequencyDeltaPct)), 4),
    evComparedRows: evRows.length,
    evOutliers,
    maxActionEvDeltaBb: evRows.length === 0
      ? null
      : round(max(evRows.map((row) => row.maxActionEvDeltaBb!)), 6),
    disjointBestActionRows,
    disjointBestActionRowPct: round(disjointBestActionRowPct, 4),
    disjointBestActionRangeWeightPct: round(disjointBestActionRangeWeightPct, 4),
  };
  const strategyPass = frequencyOutliers === 0 &&
    metrics.meanStrategyDistancePct <= options.maxMeanStrategyDistancePct;
  const evPass = !compareEv || (
    evOutliers === 0 &&
    metrics.disjointBestActionRangeWeightPct <= options.maxDisjointBestActionPct
  );

  return {
    ...base,
    valid: strategyPass && evPass,
    comparable: true,
    evidenceLevel: left.granularity === "HAND_CLASS"
      ? "HAND_CLASS_DIAGNOSTIC"
      : compareEv
        ? "EXACT_COMBO_STRATEGY_AND_EV"
        : "EXACT_COMBO_STRATEGY",
    metrics,
    rows,
  };
}

function validateSolver(input: unknown, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push("solver must be an object.");
    return;
  }
  requiredString(input.id, "solver.id", errors);
  requiredString(input.version, "solver.version", errors);
  if (input.build !== undefined) requiredString(input.build, "solver.build", errors);
}

function validateActions(input: unknown, errors: string[]): string[] {
  if (!Array.isArray(input) || input.length < 2) {
    errors.push("actions must contain at least two canonical actions.");
    return [];
  }
  const ids: string[] = [];
  input.forEach((rawAction, index) => {
    const tag = `actions[${index}]`;
    if (!isRecord(rawAction)) {
      errors.push(`${tag} must be an object.`);
      return;
    }
    const id = requiredString(rawAction.id, `${tag}.id`, errors);
    if (id !== null) {
      ids.push(id);
      if (!ACTION_ID_PATTERN.test(id)) errors.push(`${tag}.id must be a canonical uppercase action id.`);
    }
    const kind = rawAction.kind;
    if (typeof kind !== "string" || !ACTION_KINDS.has(kind as CanonicalSolverActionKind)) {
      errors.push(`${tag}.kind is unsupported.`);
      return;
    }
    const sizeBb = optionalPositiveNumber(rawAction.sizeBb, `${tag}.sizeBb`, errors);
    const sizePotPct = optionalPositiveNumber(rawAction.sizePotPct, `${tag}.sizePotPct`, errors);
    if ((kind === "BET" || kind === "RAISE") && sizeBb === null && sizePotPct === null) {
      errors.push(`${tag} BET/RAISE must include sizeBb and/or sizePotPct.`);
    }
    if (kind !== "BET" && kind !== "RAISE" && (sizeBb !== null || sizePotPct !== null)) {
      errors.push(`${tag} ${kind} must not include a bet or raise size.`);
    }
  });
  if (new Set(ids).size !== ids.length) errors.push("actions contain duplicate ids.");
  return ids;
}

function validateSpot(input: unknown, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push("spot must be an object.");
    return;
  }
  requiredString(input.spotId, "spot.spotId", errors);
  enumValue(input.gameVariant, GAME_VARIANTS, "spot.gameVariant", errors);
  enumValue(input.tableFormat, TABLE_FORMATS, "spot.tableFormat", errors);
  enumValue(input.blindSpeed, BLIND_SPEEDS, "spot.blindSpeed", errors);
  const street = enumValue(input.street, STREETS, "spot.street", errors);
  enumValue(input.evModel, EV_MODELS, "spot.evModel", errors);
  enumValue(input.ante, ANTES, "spot.ante", errors);
  enumValue(input.rakeMode, RAKE_MODES, "spot.rakeMode", errors);
  const actingSeatId = requiredString(input.actingSeatId, "spot.actingSeatId", errors);
  positiveNumber(input.potBb, "spot.potBb", errors);
  positiveNumber(input.effectiveStackBb, "spot.effectiveStackBb", errors);
  requiredString(input.potType, "spot.potType", errors);
  fingerprint(input.variantConfigFingerprint, "spot.variantConfigFingerprint", errors);
  fingerprint(input.treeFingerprint, "spot.treeFingerprint", errors);

  if (!Array.isArray(input.players) || input.players.length < 2) {
    errors.push("spot.players must contain at least two players.");
  } else {
    const seatIds: string[] = [];
    input.players.forEach((rawPlayer, index) => {
      const tag = `spot.players[${index}]`;
      if (!isRecord(rawPlayer)) {
        errors.push(`${tag} must be an object.`);
        return;
      }
      const seatId = requiredString(rawPlayer.seatId, `${tag}.seatId`, errors);
      if (seatId !== null) seatIds.push(seatId);
      enumValue(rawPlayer.position, POSITIONS, `${tag}.position`, errors);
      positiveNumber(rawPlayer.startingStackBb, `${tag}.startingStackBb`, errors);
      fingerprint(rawPlayer.rangeFingerprint, `${tag}.rangeFingerprint`, errors);
    });
    if (new Set(seatIds).size !== seatIds.length) errors.push("spot.players contain duplicate seatId values.");
    if (actingSeatId !== null && !seatIds.includes(actingSeatId)) {
      errors.push("spot.actingSeatId must match one spot.players seatId.");
    }
  }

  if (!Array.isArray(input.board) || input.board.some((card) => typeof card !== "string")) {
    errors.push("spot.board must be an array of canonical cards.");
  } else {
    const board = input.board as string[];
    const expectedCards = street === null
      ? null
      : street === "PREFLOP"
        ? 0
        : street === "FLOP"
          ? 3
          : street === "TURN"
            ? 4
            : 5;
    if (expectedCards !== null && board.length !== expectedCards) {
      errors.push(`spot.board must contain ${expectedCards} cards for ${street}.`);
    }
    if (board.some((card) => !CARD_PATTERN.test(card))) errors.push("spot.board contains a non-canonical card.");
    if (new Set(board).size !== board.length) errors.push("spot.board contains duplicate cards.");
  }
  if (!Array.isArray(input.nodePath) || input.nodePath.some((entry) => (
    typeof entry !== "string" || !ACTION_ID_PATTERN.test(entry)
  ))) {
    errors.push("spot.nodePath must be an array of non-empty canonical action ids.");
  }
}

function validateAccuracy(input: unknown, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push("accuracy must be an object.");
    return;
  }
  const exploitability = nonNegativeNumber(input.exploitabilityBb, "accuracy.exploitabilityBb", errors);
  const target = positiveNumber(input.targetExploitabilityBb, "accuracy.targetExploitabilityBb", errors);
  const iterations = positiveInteger(input.iterations, "accuracy.iterations", errors);
  if (exploitability !== null && target !== null && exploitability > target) {
    errors.push(`accuracy.exploitabilityBb ${exploitability} exceeds target ${target}.`);
  }
  void iterations;
}

function validateRows(input: unknown, actionIds: readonly string[], errors: string[]): void {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push("rows must contain at least one strategy row.");
    return;
  }
  const keys: string[] = [];
  let evRows = 0;
  input.forEach((rawRow, index) => {
    const tag = `rows[${index}]`;
    if (!isRecord(rawRow)) {
      errors.push(`${tag} must be an object.`);
      return;
    }
    const key = requiredString(rawRow.key, `${tag}.key`, errors);
    if (key !== null) keys.push(key);
    positiveNumber(rawRow.rangeWeight, `${tag}.rangeWeight`, errors, 1);
    const frequencies = validateActionValues(rawRow.frequenciesPct, actionIds, `${tag}.frequenciesPct`, errors, true);
    if (frequencies !== null) {
      const sum = Object.values(frequencies).reduce((total, value) => total + value, 0);
      if (Math.abs(sum - 100) > FREQUENCY_SUM_TOLERANCE_PCT) {
        errors.push(`${tag}.frequenciesPct sums to ${round(sum, 4)}; expected 100.`);
      }
    }
    if (rawRow.evsBb !== undefined) {
      evRows += 1;
      validateActionValues(rawRow.evsBb, actionIds, `${tag}.evsBb`, errors, false);
    }
  });
  if (new Set(keys).size !== keys.length) errors.push("rows contain duplicate keys.");
  if (evRows > 0 && evRows !== input.length) {
    errors.push("Per-action EV must be present for every row or omitted from the whole export.");
  }
}

function validateActionValues(
  input: unknown,
  actionIds: readonly string[],
  tag: string,
  errors: string[],
  frequency: boolean,
): Record<string, number> | null {
  if (!isRecord(input)) {
    errors.push(`${tag} must be an object.`);
    return null;
  }
  const keys = Object.keys(input).sort();
  const expected = [...actionIds].sort();
  if (stableStringify(keys) !== stableStringify(expected)) {
    errors.push(`${tag} must contain every canonical action exactly once.`);
    return null;
  }
  const values: Record<string, number> = {};
  for (const actionId of expected) {
    const value = input[actionId];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${tag}.${actionId} must be finite.`);
      continue;
    }
    if (frequency && (value < 0 || value > 100)) {
      errors.push(`${tag}.${actionId} must be between 0 and 100.`);
      continue;
    }
    values[actionId] = value;
  }
  return values;
}

function compareRow(
  left: SolverExactNodeRow,
  right: SolverExactNodeRow,
  actionIds: readonly string[],
  compareEv: boolean,
  options: ExactSolverComparisonOptions,
): ExactSolverComparisonRow {
  const frequencyDeltasPct: Record<string, number> = {};
  for (const actionId of actionIds) {
    frequencyDeltasPct[actionId] = round(
      right.frequenciesPct[actionId] - left.frequenciesPct[actionId],
      4,
    );
  }
  const absoluteFrequencyDeltas = Object.values(frequencyDeltasPct).map(Math.abs);
  const strategyDistancePct = absoluteFrequencyDeltas.reduce((sum, value) => sum + value, 0) / 2;
  const reasons: string[] = [];
  if (strategyDistancePct > options.maxRowStrategyDistancePct) {
    reasons.push(`strategy distance ${round(strategyDistancePct, 4)} exceeds ${options.maxRowStrategyDistancePct}.`);
  }

  let maxActionEvDeltaBb: number | null = null;
  let leftBestActions: string[] | null = null;
  let rightBestActions: string[] | null = null;
  let bestActionSetsOverlap: boolean | null = null;
  if (compareEv) {
    const leftEvs = left.evsBb!;
    const rightEvs = right.evsBb!;
    maxActionEvDeltaBb = max(actionIds.map((actionId) => Math.abs(rightEvs[actionId] - leftEvs[actionId])));
    leftBestActions = equivalentBestActions(leftEvs, actionIds, options.equivalentEvThresholdBb);
    rightBestActions = equivalentBestActions(rightEvs, actionIds, options.equivalentEvThresholdBb);
    bestActionSetsOverlap = leftBestActions.some((action) => rightBestActions!.includes(action));
    if (maxActionEvDeltaBb > options.maxActionEvDeltaBb) {
      reasons.push(`action-EV delta ${round(maxActionEvDeltaBb, 6)} exceeds ${options.maxActionEvDeltaBb}.`);
    }
    if (!bestActionSetsOverlap) reasons.push("equivalent best-action sets are disjoint.");
  }

  return {
    key: left.key,
    rangeWeight: left.rangeWeight,
    frequencyDeltasPct,
    maxFrequencyDeltaPct: round(max(absoluteFrequencyDeltas), 4),
    strategyDistancePct: round(strategyDistancePct, 4),
    leftDominantActions: dominantActions(left.frequenciesPct, actionIds),
    rightDominantActions: dominantActions(right.frequenciesPct, actionIds),
    maxActionEvDeltaBb: maxActionEvDeltaBb === null ? null : round(maxActionEvDeltaBb, 6),
    leftBestActions,
    rightBestActions,
    bestActionSetsOverlap,
    pass: reasons.length === 0,
    reasons,
  };
}

function equivalentBestActions(
  evs: Readonly<Record<string, number>>,
  actionIds: readonly string[],
  thresholdBb: number,
): string[] {
  const best = max(actionIds.map((actionId) => evs[actionId]));
  return actionIds.filter((actionId) => best - evs[actionId] <= thresholdBb);
}

function dominantActions(
  frequencies: Readonly<Record<string, number>>,
  actionIds: readonly string[],
): string[] {
  const highest = max(actionIds.map((actionId) => frequencies[actionId]));
  return actionIds.filter((actionId) => highest - frequencies[actionId] <= DOMINANT_FREQUENCY_TIE_PCT);
}

function validateOptions(options: ExactSolverComparisonOptions): string[] {
  const errors = Object.entries(options)
    .filter(([, value]) => !Number.isFinite(value) || value < 0)
    .map(([key]) => `${key} must be a non-negative finite number.`);
  for (const key of [
    "maxDisjointBestActionPct",
    "maxMeanStrategyDistancePct",
    "maxRowStrategyDistancePct",
  ] as const) {
    if (options[key] > 100) errors.push(`${key} must not exceed 100.`);
  }
  return errors;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  tag: string,
  errors: string[],
): T | null {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    errors.push(`${tag} is unsupported.`);
    return null;
  }
  return value as T;
}

function requiredString(value: unknown, tag: string, errors: string[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${tag} is required.`);
    return null;
  }
  if (value !== value.trim()) errors.push(`${tag} must not contain surrounding whitespace.`);
  return value;
}

function fingerprint(value: unknown, tag: string, errors: string[]): string | null {
  const parsed = requiredString(value, tag, errors);
  if (parsed !== null && !SHA256_PATTERN.test(parsed)) {
    errors.push(`${tag} must use sha256:<64 lowercase hex characters>.`);
  }
  return parsed;
}

function optionalPositiveNumber(value: unknown, tag: string, errors: string[]): number | null {
  if (value === undefined) return null;
  return positiveNumber(value, tag, errors);
}

function positiveNumber(
  value: unknown,
  tag: string,
  errors: string[],
  maximum = Number.POSITIVE_INFINITY,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum) {
    errors.push(`${tag} must be a positive finite number${Number.isFinite(maximum) ? ` <= ${maximum}` : ""}.`);
    return null;
  }
  return value;
}

function nonNegativeNumber(value: unknown, tag: string, errors: string[]): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${tag} must be a non-negative finite number.`);
    return null;
  }
  return value;
}

function positiveInteger(value: unknown, tag: string, errors: string[]): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors.push(`${tag} must be a positive integer.`);
    return null;
  }
  return value;
}

function max(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
