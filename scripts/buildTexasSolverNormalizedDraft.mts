import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  classifyBoard,
  type BoardTexture,
  type PostflopAction,
  type PostflopPositionPattern,
  type PostflopPotType,
} from "../src/core/postflopGenerator.ts";
import type { PostflopActionNode } from "../src/core/postflopTrainingSpot.ts";
import {
  representativeFlopForBoardId as representativeBoard,
} from "../src/core/texasSolverBoardCatalog.ts";
import type { Card, HandLabel, Rank, Suit } from "../src/core/types.ts";

const DEFAULT_REVIEW =
  "artifacts/texas-solver-review-integration/reviews/MTT9_50BB_BTN_BB_SRP/CHECK.review-report.json";
const DEFAULT_OUTPUT_DIR = "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP-CHECK";
const DEFAULT_PACK_ID = "mtt-full-ring-9-regular-flop-chip-ev-ante-off-production-v1";
const CREATED_AT = "2026-07-01";
const RANKS = "AKQJT98765432";
const STRONG_RANKS = new Set(["A", "K", "Q", "J", "T"]);
const MIN_MIXED_RAISE_FREQUENCY_FOR_ACTIVE_BUCKET = 25;

interface CliArgs {
  actionNode: Extract<PostflopActionNode, "SINGLE_RAISED_POT_CBET" | "THREE_BET_POT_CBET" | "FLOP_FACING_BET">;
  blindSpeeds: string[];
  evModel: "CHIP_EV" | "DOLAR_EV";
  antes: string[];
  outputDir: string;
  packId: string;
  positionPattern: PostflopPositionPattern;
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">;
  reviewPath: string;
  sprMax: number;
  sprMin: number;
  write: boolean;
}

interface ReviewReport {
  valid?: unknown;
  familyId?: unknown;
  nodeHistory?: unknown;
  files?: unknown;
  anomalies?: unknown;
  blockers?: unknown;
}

interface ReviewFile {
  boardId: string;
  handClasses: Record<string, ReviewHandClassStrategy>;
}

interface ReviewHandClassStrategy {
  averageByAction: Record<string, number>;
  dominantAction: string;
  dominantFrequency: number;
}

interface DraftRuleFile {
  boardId: string;
  boardTextures: BoardTexture[];
  board: [Card, Card, Card];
  handClasses: Record<string, ReviewHandClassStrategy>;
}

interface DraftResult {
  normalized: unknown;
  permission: unknown;
  report: {
    validSource: boolean;
    reviewPath: string;
    packId: string;
    outputDir: string;
    familyId: string;
    nodeHistory: string[];
    files: number;
    rules: number;
    buckets: number;
    provenanceFingerprint: string;
    blockers: string[];
    warnings: string[];
    plannedFiles: Array<{ path: string; written: boolean }>;
    nextCommands: string[];
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const draft = buildDraft(args);
  const report = args.write ? writeDraft(args, draft) : draft.report;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = draft.report.blockers.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let actionNode: CliArgs["actionNode"] = "SINGLE_RAISED_POT_CBET";
  let blindSpeeds = ["REGULAR"];
  let evModel: "CHIP_EV" | "DOLAR_EV" = "CHIP_EV";
  let antes = ["OFF"];
  let outputDir = resolve(DEFAULT_OUTPUT_DIR);
  let packId = DEFAULT_PACK_ID;
  let positionPattern: PostflopPositionPattern = "SRP_BTN_VS_BB";
  let potType: CliArgs["potType"] = "SINGLE_RAISED";
  let reviewPath = resolve(DEFAULT_REVIEW);
  let sprMax = 8;
  let sprMin = 3;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") {
      write = true;
      continue;
    }
    if (item === "--spr-min") {
      sprMin = parseNumber(nextArg(argv, index, "--spr-min"), "--spr-min");
      index += 1;
      continue;
    }
    if (item.startsWith("--spr-min=")) {
      sprMin = parseNumber(requiredInlineValue(item, "--spr-min"), "--spr-min");
      continue;
    }
    if (item === "--spr-max") {
      sprMax = parseNumber(nextArg(argv, index, "--spr-max"), "--spr-max");
      index += 1;
      continue;
    }
    if (item.startsWith("--spr-max=")) {
      sprMax = parseNumber(requiredInlineValue(item, "--spr-max"), "--spr-max");
      continue;
    }
    if (item === "--action-node") {
      actionNode = parseActionNode(nextArg(argv, index, "--action-node"));
      index += 1;
      continue;
    }
    if (item.startsWith("--action-node=")) {
      actionNode = parseActionNode(requiredInlineValue(item, "--action-node"));
      continue;
    }
    if (item === "--pot-type") {
      potType = parsePotType(nextArg(argv, index, "--pot-type"));
      index += 1;
      continue;
    }
    if (item.startsWith("--pot-type=")) {
      potType = parsePotType(requiredInlineValue(item, "--pot-type"));
      continue;
    }
    if (item === "--position-pattern") {
      positionPattern = parsePositionPattern(nextArg(argv, index, "--position-pattern"));
      index += 1;
      continue;
    }
    if (item.startsWith("--position-pattern=")) {
      positionPattern = parsePositionPattern(requiredInlineValue(item, "--position-pattern"));
      continue;
    }
    if (item === "--review") {
      reviewPath = resolve(nextArg(argv, index, "--review"));
      index += 1;
      continue;
    }
    if (item.startsWith("--review=")) {
      reviewPath = resolve(requiredInlineValue(item, "--review"));
      continue;
    }
    if (item === "--output-dir") {
      outputDir = resolve(nextArg(argv, index, "--output-dir"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output-dir=")) {
      outputDir = resolve(requiredInlineValue(item, "--output-dir"));
      continue;
    }
    if (item === "--pack-id") {
      packId = nextArg(argv, index, "--pack-id");
      index += 1;
      continue;
    }
    if (item.startsWith("--pack-id=")) {
      packId = requiredInlineValue(item, "--pack-id");
      continue;
    }
    if (item === "--blind-speeds") {
      blindSpeeds = parseList(nextArg(argv, index, "--blind-speeds"));
      index += 1;
      continue;
    }
    if (item.startsWith("--blind-speeds=")) {
      blindSpeeds = parseList(requiredInlineValue(item, "--blind-speeds"));
      continue;
    }
    if (item === "--antes") {
      antes = parseList(nextArg(argv, index, "--antes"));
      index += 1;
      continue;
    }
    if (item.startsWith("--antes=")) {
      antes = parseList(requiredInlineValue(item, "--antes"));
      continue;
    }
    if (item === "--ev") {
      evModel = parseEv(nextArg(argv, index, "--ev"));
      index += 1;
      continue;
    }
    if (item.startsWith("--ev=")) {
      evModel = parseEv(requiredInlineValue(item, "--ev"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (sprMin < 0 || sprMax < sprMin) throw new Error(`Invalid SPR range: ${sprMin}-${sprMax}`);
  if (!potTypeMatchesActionNode(potType, actionNode)) {
    throw new Error(`Invalid mapping: ${potType} cannot use ${actionNode}`);
  }

  return {
    actionNode,
    blindSpeeds,
    evModel,
    antes,
    outputDir,
    packId,
    positionPattern,
    potType,
    reviewPath,
    sprMax,
    sprMin,
    write,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:texas-solver-normalize-draft",
    "  npm run mtt:texas-solver-normalize-draft -- --write",
    "  npm run mtt:texas-solver-normalize-draft -- --review artifacts/.../CHECK.review-report.json --pack-id mtt-full-ring-9-regular-flop-chip-ev-ante-off-production-v1 --write",
    "  npm run mtt:texas-solver-normalize-draft -- --review artifacts/.../LOWSPR/CHECK.review-report.json --spr-min=0 --spr-max=3 --output-dir artifacts/.../LOWSPR --write",
    "  npm run mtt:texas-solver-normalize-draft -- --review artifacts/.../3BP/CHECK.review.json --pot-type=THREE_BET_POT --action-node=THREE_BET_POT_CBET --position-pattern=3BP_BTN_VS_CO --write",
    "",
    "Builds a review-only canonical flop-production draft from a TexasSolver review report.",
    "The output is written to artifacts/ by default and must still pass human poker review before promotion.",
  ].join("\n");
}

function nextArg(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function requiredInlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function parseList(value: string): string[] {
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (parsed.length === 0) throw new Error("List option cannot be empty.");
  return parsed;
}

function parseEv(value: string): "CHIP_EV" | "DOLAR_EV" {
  if (value === "CHIP_EV" || value === "DOLAR_EV") return value;
  throw new Error(`Unsupported --ev value: ${value}`);
}

function parseActionNode(value: string): CliArgs["actionNode"] {
  if (
    value === "SINGLE_RAISED_POT_CBET" ||
    value === "THREE_BET_POT_CBET" ||
    value === "FLOP_FACING_BET"
  ) {
    return value;
  }
  throw new Error(`Unsupported --action-node value: ${value}`);
}

function parsePotType(value: string): CliArgs["potType"] {
  if (value === "SINGLE_RAISED" || value === "THREE_BET_POT") return value;
  throw new Error(`Unsupported --pot-type value: ${value}`);
}

function parsePositionPattern(value: string): PostflopPositionPattern {
  if (/^(SRP|3BP)_(UTG|UTG_1|UTG_2|LJ|HJ|CO|BTN|SB|BB)_VS_(UTG|UTG_1|UTG_2|LJ|HJ|CO|BTN|SB|BB)$/.test(value)) {
    return value as PostflopPositionPattern;
  }
  if (
    value === "EP_VS_BB" ||
    value === "BTN_VS_BB" ||
    value === "SB_VS_BB" ||
    value === "OOP_RAISER_VS_IP_CALLER" ||
    value === "OOP_CALLER_VS_IP_3BETTOR"
  ) {
    return value;
  }
  throw new Error(`Unsupported --position-pattern value: ${value}`);
}

function potTypeMatchesActionNode(
  potType: CliArgs["potType"],
  actionNode: CliArgs["actionNode"],
): boolean {
  switch (actionNode) {
    case "SINGLE_RAISED_POT_CBET":
      return potType === "SINGLE_RAISED";
    case "THREE_BET_POT_CBET":
      return potType === "THREE_BET_POT";
    case "FLOP_FACING_BET":
      return potType === "SINGLE_RAISED" || potType === "THREE_BET_POT";
  }
}

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number.`);
  return parsed;
}

function buildDraft(args: CliArgs): DraftResult {
  const review = JSON.parse(readFileSync(args.reviewPath, "utf8")) as ReviewReport;
  const familyId = stringValue(review.familyId, "UNKNOWN_FAMILY");
  const nodeHistory = stringArray(review.nodeHistory);
  const files = normalizeFiles(review.files);
  const blockers = [
    ...stringArray(review.blockers),
    ...review.valid === true ? [] : ["TexasSolver review report is not valid."],
  ];
  const warnings = [
    ...stringArray(review.anomalies).map((item) => `Review anomaly: ${item}`),
    "Draft was generated from solver review aggregation and still needs human poker review.",
    "Draft intentionally covers one family/node only, so production coverage is expected to remain incomplete.",
  ];
  const rules = [buildRule(args, familyId, nodeHistory, aggregateFiles(args.actionNode, files))];
  const bucketCount = rules.reduce((count, rule) => count + rule.rangeBuckets.length, 0);
  const normalizedPath = resolve(args.outputDir, "normalized.candidate.json");
  const permissionPath = resolve(args.outputDir, "permission.candidate.json");
  const reportPath = resolve(args.outputDir, "draft-report.json");

  const normalized = {
    contentLanguage: "cs",
    id: args.packId,
    version: `${familyId.toLowerCase()}-${nodeHistory.length === 0 ? "root" : nodeHistory.join("-").toLowerCase()}-draft-v1`,
    createdAt: CREATED_AT,
    verifiedAt: CREATED_AT,
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Review-only draft generated from local TexasSolver exports owned by the PKRTrainer operator.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: args.blindSpeeds,
      street: "FLOP",
      evModel: args.evModel,
      antes: args.antes,
    },
    sourceEvidence: [
      {
        url: `file://${args.reviewPath}`,
        verifiedAt: CREATED_AT,
        operator: "PKRTrainer TexasSolver draft adapter",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: args.evModel,
        methodology: `Aggregated TexasSolver hand-class strategy review for ${familyId} node ${nodeHistory.join(" > ") || "ROOT"}.`,
        licenseNote: "Owned local solver export; not a third-party chart copy.",
      },
      {
        url: `file://${resolve(args.outputDir, "draft-report.json")}`,
        verifiedAt: CREATED_AT,
        operator: "PKRTrainer review workflow",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: args.evModel,
        methodology: "Draft adapter preserves review metadata and defers production promotion to validate/build gates.",
        licenseNote: "Internal review artifact.",
      },
    ],
    assumptions: [
      `${familyId} is mapped to FULL_RING_9 ${args.positionPattern} ${args.potType} ${args.actionNode} training context.`,
      `${nodeHistory.join(" > ") || "ROOT"} node is treated as the hero decision node selected for review.`,
    args.actionNode === "FLOP_FACING_BET"
      ? "TexasSolver FOLD/CALL/RAISE labels are mapped to the facing-bet action space."
      : "TexasSolver BET 25 is mapped to BET_SMALL; larger/all-in bet labels are mapped to BET_BIG.",
      "Board ids from the review file are converted to representative physical cards only for texture/card-removal validation.",
      "This draft is not sufficient production coverage by itself.",
    ],
    rules,
  };

  const permission = {
    packId: args.packId,
    version: `${familyId.toLowerCase()}-permission-draft-v1`,
    reviewedAt: CREATED_AT,
    reviewer: "PKRTrainer operator",
    rightsOwner: "PKRTrainer operator",
    licenseKind: "OWNED_SOLVER_EXPORT",
    allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
    sourceMaterialLocation: args.reviewPath,
    evidence: [
      {
        referenceId: `${familyId}-${nodeHistory.join("-") || "ROOT"}-texas-solver-review`,
        storedAt: args.reviewPath,
        reviewer: "PKRTrainer operator",
        description: "Local TexasSolver review report generated from owned solver exports.",
        containsRangeValues: true,
      },
      {
        referenceId: `${familyId}-${nodeHistory.join("-") || "ROOT"}-draft-report`,
        storedAt: reportPath,
        reviewer: "PKRTrainer operator",
        description: "Internal draft generation report for canonical import candidate.",
        containsRangeValues: true,
      },
    ],
    notes: [
      "Draft permission manifest for validation only.",
      "Promote to Agents/range-intake/raw only after poker review confirms mappings and assumptions.",
    ],
  };
  const provenanceFingerprint = fingerprint({
    reviewPath: args.reviewPath,
    normalized,
    permission,
  });

  return {
    normalized,
    permission,
    report: {
      validSource: blockers.length === 0,
      reviewPath: args.reviewPath,
      packId: args.packId,
      outputDir: args.outputDir,
      familyId,
      nodeHistory,
      files: files.length,
      rules: rules.length,
      buckets: bucketCount,
      provenanceFingerprint,
      blockers,
      warnings,
      plannedFiles: [
        { path: normalizedPath, written: false },
        { path: permissionPath, written: false },
        { path: reportPath, written: false },
      ],
      nextCommands: [
        `npm run validate:range-import -- --kind=flop-production --permission-manifest "${permissionPath}" "${normalizedPath}"`,
        `npm run build:range-module -- --kind=flop-production --dry-run --permission-manifest "${permissionPath}" "${normalizedPath}"`,
      ],
    },
  };
}

function writeDraft(args: CliArgs, draft: DraftResult): DraftResult["report"] {
  const normalizedPath = resolve(args.outputDir, "normalized.candidate.json");
  const permissionPath = resolve(args.outputDir, "permission.candidate.json");
  const reportPath = resolve(args.outputDir, "draft-report.json");
  mkdirSync(dirname(normalizedPath), { recursive: true });
  writeFileSync(normalizedPath, `${JSON.stringify(draft.normalized, null, 2)}\n`, "utf8");
  writeFileSync(permissionPath, `${JSON.stringify(draft.permission, null, 2)}\n`, "utf8");
  const writtenReport = {
    ...draft.report,
    plannedFiles: draft.report.plannedFiles.map((file) => ({ ...file, written: true })),
  };
  writeFileSync(reportPath, `${JSON.stringify(writtenReport, null, 2)}\n`, "utf8");
  return writtenReport;
}

function normalizeFiles(value: unknown): ReviewFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    boardId: stringValue(item.boardId, "unknown"),
    handClasses: normalizeHandClasses(item.handClasses),
  }));
}

function normalizeHandClasses(value: unknown): Record<string, ReviewHandClassStrategy> {
  if (!isRecord(value)) return {};
  const result: Record<string, ReviewHandClassStrategy> = {};
  for (const [handClass, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    result[handClass] = {
      averageByAction: normalizeActionMix(raw.averageByAction),
      dominantAction: stringValue(raw.dominantAction, "UNKNOWN"),
      dominantFrequency: numberValue(raw.dominantFrequency),
    };
  }
  return result;
}

function normalizeActionMix(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [action, frequency] of Object.entries(value)) result[action] = numberValue(frequency);
  return result;
}

function aggregateFiles(actionNode: CliArgs["actionNode"], files: readonly ReviewFile[]): DraftRuleFile {
  if (files.length === 0) {
    return {
      boardId: "empty",
      board: representativeBoard("A72r"),
      boardTextures: ["ace-high", "rainbow", "disconnected", "dry"],
      handClasses: {},
    };
  }

  const boardTextures = new Set<BoardTexture>();
  const boards = files.map((file) => {
    const board = representativeBoard(file.boardId);
    for (const texture of classifyBoard(board)) boardTextures.add(texture);
    return board;
  });
  const strategiesByHand = new Map<string, ReviewHandClassStrategy[]>();
  for (const file of files) {
    for (const [handClass, strategy] of Object.entries(file.handClasses)) {
      const strategies = strategiesByHand.get(handClass) ?? [];
      strategies.push(strategy);
      strategiesByHand.set(handClass, strategies);
    }
  }

  const handClasses: Record<string, ReviewHandClassStrategy> = {};
  for (const [handClass, strategies] of strategiesByHand) {
    const actionKeys = new Set(strategies.flatMap((strategy) => Object.keys(strategy.averageByAction)));
    const averageByAction: Record<string, number> = {};
    for (const action of actionKeys) {
      averageByAction[action] = strategies.reduce((sum, strategy) => (
        sum + (strategy.averageByAction[action] ?? 0)
      ), 0) / strategies.length;
    }
    const actionMix = normalizeMappedActionMix(actionNode, averageByAction);
    const dominantAction = mappedDominantAction(actionMix);
    handClasses[handClass] = {
      averageByAction,
      dominantAction,
      dominantFrequency: (actionMix[dominantAction] ?? 0) / 100,
    };
  }

  return {
    boardId: files.map((file) => file.boardId).join("_"),
    board: boards[0],
    boardTextures: [...boardTextures],
    handClasses,
  };
}

function buildRule(args: CliArgs, familyId: string, nodeHistory: readonly string[], file: DraftRuleFile) {
  const board = file.board;
  const boardTextures = file.boardTextures;
  const buckets = Object.entries(file.handClasses)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([handClass, strategy]) => buildBucket(args.actionNode, handClass as HandLabel, strategy));
  const recommendedAction = mostCommonBucketAction(buckets);
  const sampleHand = buckets[0]?.handClasses[0] as HandLabel | undefined;

  return {
    id: `${familyId.toLowerCase()}-${nodeHistory.join("-").toLowerCase() || "root"}-aggregate`,
    actionNode: args.actionNode,
    potType: args.potType,
    positionPattern: args.positionPattern,
    boardTextures,
    sprMin: args.sprMin,
    sprMax: args.sprMax,
    actions: actionsForActionNode(args.actionNode),
    recommendedAction,
    rangeBuckets: buckets,
    cardRemovalSamples: sampleHand
      ? [{
          handClass: sampleHand,
          heroCards: representativeHeroCards(sampleHand, board),
          board,
          rationale: `Representative sample for aggregated board set ${file.boardId}; generated only to validate card-removal semantics.`,
        }]
      : [],
    explanation:
      `TexasSolver draft for ${familyId} ${nodeHistory.join(" > ") || "ROOT"} aggregated across ${file.boardId}: ` +
      `${recommendedAction} is the most common dominant hand-class action in the reviewed aggregate.`,
  };
}

function buildBucket(actionNode: CliArgs["actionNode"], handClass: HandLabel, strategy: ReviewHandClassStrategy) {
  const actionMix = normalizeMappedActionMix(actionNode, strategy.averageByAction);
  const dominantAction = primaryBucketAction(actionNode, actionMix);
  return {
    lane: laneForHand(actionNode, handClass, dominantAction),
    label: `${handClass} · ${dominantAction}`,
    action: dominantAction,
    handClasses: [handClass],
    features: featuresForHand(handClass, dominantAction),
    actionMix: Object.entries(actionMix).map(([action, frequencyPct]) => ({
      action,
      frequencyPct,
      visibility: "EXACT",
    })),
  };
}

function actionsForActionNode(actionNode: CliArgs["actionNode"]): PostflopAction[] {
  return actionNode === "FLOP_FACING_BET"
    ? ["FOLD", "CALL", "RAISE"]
    : ["CHECK", "BET_SMALL", "BET_BIG"];
}

function fallbackActionForNode(actionNode: CliArgs["actionNode"]): PostflopAction {
  return actionNode === "FLOP_FACING_BET" ? "CALL" : "CHECK";
}

function normalizeMappedActionMix(
  actionNode: CliArgs["actionNode"],
  source: Record<string, number>,
): Record<PostflopAction, number> {
  const legalActions = actionsForActionNode(actionNode);
  const mapped: Record<PostflopAction, number> = {
    CHECK: 0,
    BET_SMALL: 0,
    BET_BIG: 0,
    CALL: 0,
    RAISE: 0,
    FOLD: 0,
  };
  for (const [action, frequency] of Object.entries(source)) {
    const mappedAction = mapSolverAction(actionNode, action);
    if (mappedAction === null) continue;
    mapped[mappedAction] += Math.max(0, frequency);
  }
  const relevant = Object.fromEntries(legalActions.map((action) => [action, mapped[action]])) as Record<PostflopAction, number>;
  const total = Object.values(relevant).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return Object.fromEntries(legalActions.map((action) => [
      action,
      action === fallbackActionForNode(actionNode) ? 100 : 0,
    ])) as Record<PostflopAction, number>;
  }
  const result = Object.fromEntries(legalActions.map((action) => [
    action,
    roundPct((relevant[action] / total) * 100),
  ])) as Record<PostflopAction, number>;
  const delta = roundPct(100 - legalActions.reduce((sum, action) => sum + (result[action] ?? 0), 0));
  const dominant = mappedDominantAction(result);
  result[dominant] = roundPct(result[dominant] + delta);
  return result;
}

function primaryBucketAction(
  actionNode: CliArgs["actionNode"],
  actionMix: Record<PostflopAction, number>,
): PostflopAction {
  const dominantAction = mappedDominantAction(actionMix);
  if (actionNode === "FLOP_FACING_BET") {
    const raiseFrequency = actionMix.RAISE ?? 0;
    if (dominantAction !== "RAISE" && raiseFrequency >= MIN_MIXED_RAISE_FREQUENCY_FOR_ACTIVE_BUCKET) {
      return "RAISE";
    }
  }
  return dominantAction;
}

function mapSolverAction(actionNode: CliArgs["actionNode"], action: string): PostflopAction | null {
  if (actionNode === "FLOP_FACING_BET") {
    if (action === "FOLD") return "FOLD";
    if (action === "CALL") return "CALL";
    if (action === "RAISE" || action.startsWith("RAISE_")) return "RAISE";
    return null;
  }
  if (action === "CHECK") return "CHECK";
  if (action.startsWith("BET_")) {
    const amount = Number(action.slice("BET_".length));
    return Number.isFinite(amount) && amount > 75 ? "BET_BIG" : "BET_SMALL";
  }
  return null;
}

function mappedDominantAction(actionMix: Record<string, number>): PostflopAction {
  return Object.entries(actionMix).sort((left, right) => right[1] - left[1])[0]?.[0] as PostflopAction ?? "CHECK";
}

function mostCommonBucketAction(buckets: Array<{ action: PostflopAction }>): PostflopAction {
  const counts = new Map<PostflopAction, number>();
  for (const bucket of buckets) counts.set(bucket.action, (counts.get(bucket.action) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "CHECK";
}

function laneForHand(
  actionNode: CliArgs["actionNode"],
  handClass: string,
  action: PostflopAction,
): "VALUE" | "BLUFF" | "CHECK" {
  if (actionNode === "FLOP_FACING_BET") {
    if (action !== "RAISE") return "CHECK";
    if (isPair(handClass) || STRONG_RANKS.has(handClass[0])) return "VALUE";
    return "BLUFF";
  }
  if (action === "CHECK") return "CHECK";
  if (isPair(handClass) || STRONG_RANKS.has(handClass[0])) return "VALUE";
  return "BLUFF";
}

function featuresForHand(handClass: string, action: PostflopAction): string[] {
  const features = [featureForAction(action)];
  if (isPair(handClass)) features.push("pocket-pair");
  if (handClass.endsWith("s")) features.push("suited");
  if (handClass.endsWith("o")) features.push("offsuit");
  if (STRONG_RANKS.has(handClass[0])) features.push("high-card-density");
  return features;
}

function featureForAction(action: PostflopAction): string {
  switch (action) {
    case "CHECK":
      return "solver-check-frequency";
    case "CALL":
      return "solver-call-frequency";
    case "FOLD":
      return "solver-fold-frequency";
    case "RAISE":
      return "solver-raise-frequency";
    case "BET_SMALL":
    case "BET_BIG":
      return "solver-bet-frequency";
  }
}

function isPair(handClass: string): boolean {
  return handClass.length === 2 && handClass[0] === handClass[1];
}

function representativeHeroCards(handClass: HandLabel, board: readonly Card[]): [Card, Card] {
  const blocked = new Set(board.map(cardKey));
  const ranks = handClass.replace(/[so]$/, "").split("") as Rank[];
  const suited = handClass.endsWith("s");
  const offsuit = handClass.endsWith("o");
  const candidates = fullDeck().filter((card) => !blocked.has(cardKey(card)));
  for (const first of candidates) {
    for (const second of candidates) {
      if (cardKey(first) === cardKey(second)) continue;
      if (first.rank !== ranks[0] || second.rank !== ranks[1]) continue;
      if (suited && first.suit !== second.suit) continue;
      if (offsuit && first.suit === second.suit) continue;
      return [first, second];
    }
  }
  throw new Error(`Cannot build representative hero cards for ${handClass}.`);
}

function fullDeck(): Card[] {
  const suits: Suit[] = ["s", "h", "d", "c"];
  return RANKS.split("").flatMap((rank) => suits.map((suit) => ({ rank: rank as Rank, suit })));
}

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  )).join(",")}}`;
}
