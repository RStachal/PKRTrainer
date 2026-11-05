import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  validateActionEvSet,
  type ActionEvSet,
} from "../src/core/actionEv.ts";
import type { PostflopAction } from "../src/core/postflopGenerator.ts";
import {
  validateFlopProductionStrategyPack,
  type FlopProductionStrategyPack,
} from "../src/data/ranges/flopProductionStrategyPack.ts";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated.ts";

const SCHEMA = "pkrtrainer_mtt_postflop_action_ev_intake_v1";
const CANDIDATE_CONFIRM = "WRITE_MTT_POSTFLOP_ACTION_EV_CANDIDATE";
const TEMPLATE_OVERWRITE_CONFIRM = "OVERWRITE_MTT_POSTFLOP_ACTION_EV_TEMPLATE";
const DEFAULT_TEMPLATE_DIR = "artifacts/mtt-action-ev-intake";
const MAX_REPORTED_ERRORS = 80;

type PilotEntry = (typeof generatedMttPostflopPilotPacks)[number];

interface CliArgs {
  all: boolean;
  candidateOut: string | null;
  catalogId: string | null;
  confirm: string;
  inputPath: string | null;
  json: boolean;
  outputPath: string | null;
  overwriteTemplate: boolean;
  refreshBlankTemplates: boolean;
  summary: boolean;
  templateDir: string;
  templateOut: string | null;
  writeCandidate: boolean;
  writeTemplate: boolean;
}

interface IntakeValue {
  action: PostflopAction;
  evBb: number | null;
}

interface IntakeRow {
  ruleId: string;
  ruleIndex: number;
  bucketIndex: number;
  bucketLabel: string;
  values: IntakeValue[];
  equivalentThresholdBb: number | null;
  acceptableThresholdBb: number | null;
}

interface ActionEvIntake {
  schemaVersion: string;
  catalogId: string;
  pilotScope: string;
  packId: string;
  packVersion: string;
  baseFingerprint: string;
  generatedAt: string;
  source: {
    kind: string;
    unit: string;
    rightsConfirmed: boolean;
    sourceReference: string;
  };
  review: {
    reviewer: string;
    reviewedAt: string;
    decision: string;
  };
  rows: IntakeRow[];
  notes: string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = args.inputPath === null
    ? prepareTemplates(args)
    : validateAndBuildCandidate(args);
  if (args.outputPath !== null) writeJson(args.outputPath, report);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let all = false;
  let candidateOut: string | null = null;
  let catalogId: string | null = null;
  let confirm = "";
  let inputPath: string | null = null;
  let json = false;
  let outputPath: string | null = null;
  let overwriteTemplate = false;
  let refreshBlankTemplates = false;
  let summary = false;
  let templateDir = resolve(DEFAULT_TEMPLATE_DIR);
  let templateOut: string | null = null;
  let writeCandidate = false;
  let writeTemplate = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--all") { all = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item === "--write-template") { writeTemplate = true; continue; }
    if (item === "--overwrite-template") { overwriteTemplate = true; continue; }
    if (item === "--refresh-blank-templates") { refreshBlankTemplates = true; continue; }
    if (item === "--write-candidate") { writeCandidate = true; continue; }
    if (item === "--catalog-id") {
      catalogId = requiredValue(argv, index, item); index += 1; continue;
    }
    if (item.startsWith("--catalog-id=")) { catalogId = inlineValue(item, "--catalog-id"); continue; }
    if (item === "--input") {
      inputPath = resolve(requiredValue(argv, index, item)); index += 1; continue;
    }
    if (item.startsWith("--input=")) { inputPath = resolve(inlineValue(item, "--input")); continue; }
    if (item === "--template-dir") {
      templateDir = resolve(requiredValue(argv, index, item)); index += 1; continue;
    }
    if (item.startsWith("--template-dir=")) { templateDir = resolve(inlineValue(item, "--template-dir")); continue; }
    if (item === "--template-out") {
      templateOut = resolve(requiredValue(argv, index, item)); index += 1; continue;
    }
    if (item.startsWith("--template-out=")) { templateOut = resolve(inlineValue(item, "--template-out")); continue; }
    if (item === "--candidate-out") {
      candidateOut = resolve(requiredValue(argv, index, item)); index += 1; continue;
    }
    if (item.startsWith("--candidate-out=")) { candidateOut = resolve(inlineValue(item, "--candidate-out")); continue; }
    if (item === "--output") {
      outputPath = resolve(requiredValue(argv, index, item)); index += 1; continue;
    }
    if (item.startsWith("--output=")) { outputPath = resolve(inlineValue(item, "--output")); continue; }
    if (item === "--confirm") {
      confirm = requiredValue(argv, index, item); index += 1; continue;
    }
    if (item.startsWith("--confirm=")) { confirm = inlineValue(item, "--confirm"); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  if (inputPath !== null) {
    if (all || writeTemplate || overwriteTemplate || refreshBlankTemplates || templateOut !== null) {
      throw new Error("--input cannot be combined with template-generation flags.");
    }
    if (outputPath !== null) throw new Error("--output is only valid for template generation.");
    if (writeCandidate && confirm !== CANDIDATE_CONFIRM) {
      throw new Error(`--write-candidate requires --confirm=${CANDIDATE_CONFIRM}.`);
    }
    if (!writeCandidate && confirm.length > 0) throw new Error("--confirm requires --write-candidate.");
  } else {
    if (!all && catalogId === null) throw new Error(`Choose --catalog-id or --all.\n\n${usage()}`);
    if (all && catalogId !== null) throw new Error("--all cannot be combined with --catalog-id.");
    if (all && templateOut !== null) throw new Error("--template-out is only valid for one --catalog-id.");
    if (writeCandidate || candidateOut !== null) {
      throw new Error("Candidate flags require --input.");
    }
    if (overwriteTemplate && !writeTemplate) throw new Error("--overwrite-template requires --write-template.");
    if (refreshBlankTemplates && !writeTemplate) {
      throw new Error("--refresh-blank-templates requires --write-template.");
    }
    if (refreshBlankTemplates && overwriteTemplate) {
      throw new Error("--refresh-blank-templates cannot be combined with --overwrite-template.");
    }
    if (overwriteTemplate && confirm !== TEMPLATE_OVERWRITE_CONFIRM) {
      throw new Error(`--overwrite-template requires --confirm=${TEMPLATE_OVERWRITE_CONFIRM}.`);
    }
    if (!overwriteTemplate && confirm.length > 0) throw new Error("--confirm requires --overwrite-template.");
  }

  return {
    all, candidateOut, catalogId, confirm, inputPath, json, overwriteTemplate, summary,
    outputPath, refreshBlankTemplates, templateDir, templateOut, writeCandidate, writeTemplate,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-action-ev-intake -- --all --write-template",
    "  npm run mtt:postflop-action-ev-intake -- --all --write-template --refresh-blank-templates --output=<report.json>",
    "  npm run mtt:postflop-action-ev-intake -- --catalog-id=<pilot-id> --write-template",
    `  npm run mtt:postflop-action-ev-intake -- --catalog-id=<pilot-id> --write-template --overwrite-template --confirm=${TEMPLATE_OVERWRITE_CONFIRM}`,
    "  npm run mtt:postflop-action-ev-intake -- --input=<completed-template.json> --summary",
    `  npm run mtt:postflop-action-ev-intake -- --input=<completed-template.json> --write-candidate --confirm=${CANDIDATE_CONFIRM}`,
    "",
    "Creates source-safe blank action-EV templates or validates a complete owned solver export.",
    "It never derives EV from frequencies and never writes runtime strategy directly.",
  ].join("\n");
}

function prepareTemplates(args: CliArgs) {
  const entries = args.all
    ? [...generatedMttPostflopPilotPacks]
    : [requiredEntry(args.catalogId ?? "")];
  const templatePaths = entries.map((entry) => (
    args.templateOut ?? resolve(args.templateDir, entry.catalogId, "action-ev-intake.template.json")
  ));
  if (args.outputPath !== null && templatePaths.some((path) => samePath(path, args.outputPath ?? ""))) {
    throw new Error("Template status output must not overwrite an action-EV intake template.");
  }
  const templates = entries.map((entry) => {
    const template = templateFor(entry);
    const outputPath = args.templateOut ?? resolve(args.templateDir, entry.catalogId, "action-ev-intake.template.json");
    const existing = existsSync(outputPath);
    let stale = false;
    let sourceSafeBlank = false;
    let refreshableBlank = false;
    if (existing) {
      try {
        const existingTemplate = readJson<unknown>(outputPath);
        stale = !isCurrentTemplateStructure(existingTemplate, template);
        sourceSafeBlank = isSourceSafeBlankTemplate(existingTemplate);
        refreshableBlank = stale && sourceSafeBlank;
      } catch {
        stale = true;
      }
    }
    const refreshedBlank = args.refreshBlankTemplates && refreshableBlank;
    const written = args.writeTemplate && (!existing || args.overwriteTemplate || refreshedBlank);
    if (written) {
      writeJson(outputPath, template);
      stale = false;
      sourceSafeBlank = true;
    }
    return {
      catalogId: entry.catalogId,
      pilotScope: entry.scope,
      packId: entry.pack.id,
      baseFingerprint: template.baseFingerprint,
      outputPath,
      decisions: template.rows.length,
      actionValueSlots: template.rows.reduce((sum, row) => sum + row.values.length, 0),
      existing,
      stale,
      written,
      refreshableBlank,
      refreshedBlank,
      sourceSafeBlank,
      nonBlank: existing && !sourceSafeBlank,
      protectedStale: stale && !refreshableBlank,
    };
  });
  return {
    valid: templates.every((item) => !item.stale),
    // `as const` tu není kosmetika: bez něj TypeScript odvodí `mode: string`,
    // což znemožní zúžení `report.mode === "TEMPLATE"` v `renderReport` - a
    // ohlásí to jako dvacet chyb „vlastnost neexistuje na sjednocení", které
    // vypadají jako dvacet různých vad místo jedné.
    mode: "TEMPLATE" as const,
    schemaVersion: SCHEMA,
    strategyValues: "none",
    counts: {
      pilots: templates.length,
      decisions: templates.reduce((sum, item) => sum + item.decisions, 0),
      actionValueSlots: templates.reduce((sum, item) => sum + item.actionValueSlots, 0),
      existingTemplates: templates.filter((item) => item.existing).length,
      staleTemplates: templates.filter((item) => item.stale).length,
      writtenTemplates: templates.filter((item) => item.written).length,
      blankTemplates: templates.filter((item) => item.sourceSafeBlank).length,
      nonBlankTemplates: templates.filter((item) => item.nonBlank).length,
      refreshableBlankTemplates: templates.filter((item) => item.refreshableBlank).length,
      refreshedBlankTemplates: templates.filter((item) => item.refreshedBlank).length,
      protectedStaleTemplates: templates.filter((item) => item.protectedStale).length,
    },
    templates,
    errors: [] as string[],
  };
}

function validateAndBuildCandidate(args: CliArgs) {
  const inputPath = args.inputPath ?? "";
  if (!existsSync(inputPath)) throw new Error(`Input file does not exist: ${inputPath}`);
  const input = readJson<ActionEvIntake>(inputPath);
  const catalogId = typeof input.catalogId === "string" ? input.catalogId : "";
  const entry = requiredEntry(catalogId);
  const expected = templateFor(entry);
  const allErrors: string[] = [];
  const candidateOut = args.candidateOut ?? resolve(
    DEFAULT_TEMPLATE_DIR,
    entry.catalogId,
    "normalized.action-ev.candidate.json",
  );
  const reportOut = candidateReportPath(candidateOut);

  if (samePath(inputPath, candidateOut)) {
    allErrors.push("candidate output must not overwrite the reviewed intake input.");
  }
  if (samePath(inputPath, reportOut)) {
    allErrors.push("candidate report must not overwrite the reviewed intake input.");
  }

  if (args.catalogId !== null && args.catalogId !== catalogId) {
    allErrors.push(`Input catalogId ${catalogId || "(missing)"} does not match --catalog-id ${args.catalogId}.`);
  }
  validateHeader(input, expected, allErrors);
  const rowValidation = validateRows(input, expected, entry, allErrors);

  let candidate: FlopProductionStrategyPack | null = null;
  if (allErrors.length === 0) {
    candidate = buildCandidate(entry.pack, input);
    const candidateErrors = validateFlopProductionStrategyPack(candidate);
    allErrors.push(...candidateErrors.map((error) => `Candidate pack: ${error}`));
  }

  const valid = allErrors.length === 0 && candidate !== null;
  let written = false;
  if (args.writeCandidate && valid && candidate !== null) {
    const candidateDocument = jsonDocument(candidate);
    writeDocument(candidateOut, candidateDocument);
    writeJson(reportOut, {
      schemaVersion: "pkrtrainer_mtt_postflop_action_ev_candidate_report_v1",
      catalogId: entry.catalogId,
      pilotScope: entry.scope,
      baseFingerprint: expected.baseFingerprint,
      inputSha256: sha256(readFileSync(inputPath)),
      candidateSha256: sha256(candidateDocument),
      sourceKind: input.source.kind,
      sourceReference: input.source.sourceReference,
      rightsConfirmed: input.source.rightsConfirmed,
      reviewer: input.review.reviewer,
      reviewedAt: input.review.reviewedAt,
      reviewDecision: input.review.decision,
      decisions: rowValidation.completeDecisions,
      actionValueSlots: rowValidation.completeActionValues,
      productionPromotion: false,
    });
    written = true;
  }

  return {
    valid,
    mode: "VALIDATE" as const,
    schemaVersion: SCHEMA,
    catalogId: entry.catalogId,
    pilotScope: entry.scope,
    inputPath,
    candidateOut,
    reportOut,
    written,
    productionPromotion: false,
    counts: {
      expectedDecisions: expected.rows.length,
      completeDecisions: rowValidation.completeDecisions,
      missingDecisions: expected.rows.length - rowValidation.completeDecisions,
      expectedActionValueSlots: expected.rows.reduce((sum, row) => sum + row.values.length, 0),
      completeActionValueSlots: rowValidation.completeActionValues,
      errors: allErrors.length,
    },
    errors: allErrors.slice(0, MAX_REPORTED_ERRORS),
    truncatedErrors: Math.max(0, allErrors.length - MAX_REPORTED_ERRORS),
  };
}

function templateFor(entry: PilotEntry): ActionEvIntake {
  return {
    schemaVersion: SCHEMA,
    catalogId: entry.catalogId,
    pilotScope: entry.scope,
    packId: entry.pack.id,
    packVersion: entry.pack.version,
    baseFingerprint: baseFingerprint(entry),
    generatedAt: new Date().toISOString().slice(0, 10),
    source: {
      kind: "OWNED_SOLVER_EXPORT",
      unit: "BB",
      rightsConfirmed: true,
      sourceReference: "",
    },
    review: {
      reviewer: "",
      reviewedAt: "",
      decision: "PENDING",
    },
    rows: entry.pack.rules.flatMap((rule, ruleIndex) => (
      rule.rangeBuckets.map((bucket, bucketIndex) => ({
        ruleId: rule.id,
        ruleIndex,
        bucketIndex,
        bucketLabel: bucket.label,
        values: rule.actions.map((action) => ({ action, evBb: null })),
        equivalentThresholdBb: null,
        acceptableThresholdBb: null,
      }))
    )),
    notes: [
      "Fill only from an owned counterfactual solver EV export reviewed for this exact pilot.",
      "Every offered action needs finite BB EV; strategy frequencies are not EV.",
      "Set reviewer, reviewedAt, decision APPROVED and both thresholds before validation.",
      "sourceReference is optional for the owner-confirmed owned-export workflow.",
    ],
  };
}

function validateHeader(input: ActionEvIntake, expected: ActionEvIntake, errors: string[]): void {
  if (input.schemaVersion !== SCHEMA) errors.push(`schemaVersion must be ${SCHEMA}.`);
  if (input.catalogId !== expected.catalogId) errors.push(`catalogId must be ${expected.catalogId}.`);
  if (input.pilotScope !== expected.pilotScope) errors.push(`pilotScope must be ${expected.pilotScope}.`);
  if (input.packId !== expected.packId) errors.push(`packId must be ${expected.packId}.`);
  if (input.packVersion !== expected.packVersion) errors.push(`packVersion must be ${expected.packVersion}.`);
  if (input.baseFingerprint !== expected.baseFingerprint) {
    errors.push("baseFingerprint does not match the current pilot structure; regenerate the template.");
  }
  if (input.source?.kind !== "OWNED_SOLVER_EXPORT") errors.push("source.kind must be OWNED_SOLVER_EXPORT.");
  if (input.source?.unit !== "BB") errors.push("source.unit must be BB.");
  if (input.source?.rightsConfirmed !== true) errors.push("source.rightsConfirmed must be true.");
  if (typeof input.review?.reviewer !== "string" || input.review.reviewer.trim().length === 0) {
    errors.push("review.reviewer is required.");
  }
  if (!isIsoDate(input.review?.reviewedAt)) errors.push("review.reviewedAt must be a valid YYYY-MM-DD date.");
  if (input.review?.decision !== "APPROVED") errors.push("review.decision must be APPROVED.");
}

function validateRows(
  input: ActionEvIntake,
  expected: ActionEvIntake,
  entry: PilotEntry,
  errors: string[],
): { completeDecisions: number; completeActionValues: number } {
  if (!Array.isArray(input.rows)) {
    errors.push("rows must be an array.");
    return { completeDecisions: 0, completeActionValues: 0 };
  }
  const expectedByKey = new Map(expected.rows.map((row) => [rowKey(row.ruleId, row.bucketIndex), row]));
  const seen = new Set<string>();
  let completeDecisions = 0;
  let completeActionValues = 0;

  for (const [inputIndex, row] of input.rows.entries()) {
    if (!row || typeof row.ruleId !== "string" || !Number.isInteger(row.bucketIndex)) {
      errors.push(`rows[${inputIndex}] needs ruleId and integer bucketIndex.`);
      continue;
    }
    const key = rowKey(row.ruleId, row.bucketIndex);
    const expectedRow = expectedByKey.get(key);
    if (seen.has(key)) {
      errors.push(`rows[${inputIndex}] duplicates ${key}.`);
      continue;
    }
    seen.add(key);
    if (expectedRow === undefined) {
      errors.push(`rows[${inputIndex}] targets unexpected decision ${key}.`);
      continue;
    }
    const rowErrors: string[] = [];
    if (row.ruleIndex !== expectedRow.ruleIndex) rowErrors.push(`ruleIndex must be ${expectedRow.ruleIndex}`);
    if (row.bucketLabel !== expectedRow.bucketLabel) rowErrors.push(`bucketLabel must be ${JSON.stringify(expectedRow.bucketLabel)}`);
    if (!Array.isArray(row.values)) {
      rowErrors.push("values must be an array");
    } else {
      const expectedActions = expectedRow.values.map((value) => value.action);
      const actions = row.values.map((value) => value?.action);
      if (JSON.stringify(actions) !== JSON.stringify(expectedActions)) {
        rowErrors.push(`actions must be ${expectedActions.join(",")}`);
      }
      for (const [valueIndex, value] of row.values.entries()) {
        if (!value || !Number.isFinite(value.evBb)) rowErrors.push(`values[${valueIndex}].evBb must be finite`);
      }
    }
    if (!isNonNegativeFinite(row.equivalentThresholdBb)) {
      rowErrors.push("equivalentThresholdBb must be a non-negative finite number");
    }
    if (!isNonNegativeFinite(row.acceptableThresholdBb)) {
      rowErrors.push("acceptableThresholdBb must be a non-negative finite number");
    }
    if (
      Number.isFinite(row.equivalentThresholdBb) &&
      Number.isFinite(row.acceptableThresholdBb) &&
      (row.acceptableThresholdBb as number) < (row.equivalentThresholdBb as number)
    ) {
      rowErrors.push("acceptableThresholdBb must be >= equivalentThresholdBb");
    }
    if (rowErrors.length === 0) {
      const rule = entry.pack.rules[expectedRow.ruleIndex];
      const set = actionEvSet(row);
      rowErrors.push(...validateActionEvSet(set, rule.actions));
    }
    if (rowErrors.length === 0) {
      completeDecisions += 1;
      completeActionValues += row.values.length;
    } else {
      errors.push(...rowErrors.map((error) => `${key}: ${error}.`));
    }
  }

  for (const key of expectedByKey.keys()) {
    if (!seen.has(key)) errors.push(`Missing decision row ${key}.`);
  }
  return { completeDecisions, completeActionValues };
}

function buildCandidate(pack: FlopProductionStrategyPack, input: ActionEvIntake): FlopProductionStrategyPack {
  const rows = new Map(input.rows.map((row) => [rowKey(row.ruleId, row.bucketIndex), row]));
  return {
    ...pack,
    version: pack.version.endsWith("-action-ev-v1") ? pack.version : `${pack.version}-action-ev-v1`,
    verifiedAt: input.review.reviewedAt,
    assumptions: [
      ...pack.assumptions,
      "Counterfactual action EV is attached only from the reviewed owned solver intake sidecar.",
    ],
    rules: pack.rules.map((rule) => ({
      ...rule,
      rangeBuckets: rule.rangeBuckets.map((bucket, bucketIndex) => {
        const row = rows.get(rowKey(rule.id, bucketIndex));
        if (row === undefined) throw new Error(`Missing validated row ${rowKey(rule.id, bucketIndex)}.`);
        return { ...bucket, actionEvs: actionEvSet(row) };
      }),
    })),
  };
}

function actionEvSet(row: IntakeRow): ActionEvSet<PostflopAction> {
  return {
    source: "SOLVER",
    unit: "BB",
    values: row.values.map((value) => ({ action: value.action, evBb: value.evBb as number })),
    equivalentThresholdBb: row.equivalentThresholdBb as number,
    acceptableThresholdBb: row.acceptableThresholdBb as number,
  };
}

function baseFingerprint(entry: PilotEntry): string {
  return sha256(JSON.stringify({
    catalogId: entry.catalogId,
    pilotScope: entry.scope,
    packId: entry.pack.id,
    packVersion: entry.pack.version,
    rules: entry.pack.rules.map((rule) => ({
      id: rule.id,
      actionNode: rule.actionNode,
      potType: rule.potType,
      positionPattern: rule.positionPattern,
      boardTextures: rule.boardTextures,
      sprMin: rule.sprMin,
      sprMax: rule.sprMax,
      actions: rule.actions,
      rangeBuckets: rule.rangeBuckets.map((bucket) => ({
        lane: bucket.lane,
        label: bucket.label,
        action: bucket.action,
        handClasses: bucket.handClasses,
        features: bucket.features,
        weightPct: bucket.weightPct,
        actionMix: bucket.actionMix,
      })),
    })),
  }));
}

function isCurrentTemplateStructure(value: unknown, expected: ActionEvIntake): boolean {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== expected.schemaVersion ||
    value.catalogId !== expected.catalogId ||
    value.pilotScope !== expected.pilotScope ||
    value.packId !== expected.packId ||
    value.packVersion !== expected.packVersion ||
    value.baseFingerprint !== expected.baseFingerprint ||
    typeof value.generatedAt !== "string" ||
    !isRecord(value.source) ||
    value.source.kind !== "OWNED_SOLVER_EXPORT" ||
    value.source.unit !== "BB" ||
    typeof value.source.rightsConfirmed !== "boolean" ||
    (value.source.sourceReference !== undefined && typeof value.source.sourceReference !== "string") ||
    !isRecord(value.review) ||
    typeof value.review.reviewer !== "string" ||
    typeof value.review.reviewedAt !== "string" ||
    typeof value.review.decision !== "string" ||
    !Array.isArray(value.rows) ||
    value.rows.length !== expected.rows.length
  ) {
    return false;
  }

  return value.rows.every((candidateRow, rowIndex) => {
    const expectedRow = expected.rows[rowIndex];
    if (
      !isRecord(candidateRow) ||
      candidateRow.ruleId !== expectedRow.ruleId ||
      candidateRow.ruleIndex !== expectedRow.ruleIndex ||
      candidateRow.bucketIndex !== expectedRow.bucketIndex ||
      candidateRow.bucketLabel !== expectedRow.bucketLabel ||
      !Array.isArray(candidateRow.values) ||
      candidateRow.values.length !== expectedRow.values.length ||
      !isNullableNonNegativeFinite(candidateRow.equivalentThresholdBb) ||
      !isNullableNonNegativeFinite(candidateRow.acceptableThresholdBb)
    ) {
      return false;
    }
    return candidateRow.values.every((candidateValue, valueIndex) => (
      isRecord(candidateValue) &&
      candidateValue.action === expectedRow.values[valueIndex].action &&
      (candidateValue.evBb === null ||
        (typeof candidateValue.evBb === "number" && Number.isFinite(candidateValue.evBb)))
    ));
  });
}

function isSourceSafeBlankTemplate(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA ||
    !isRecord(value.source) ||
    value.source.kind !== "OWNED_SOLVER_EXPORT" ||
    value.source.unit !== "BB" ||
    value.source.rightsConfirmed !== true ||
    value.source.sourceReference !== "" ||
    !isRecord(value.review) ||
    value.review.reviewer !== "" ||
    value.review.reviewedAt !== "" ||
    value.review.decision !== "PENDING" ||
    !Array.isArray(value.rows) ||
    value.rows.length === 0
  ) {
    return false;
  }
  return value.rows.every((row) => (
    isRecord(row) &&
    row.equivalentThresholdBb === null &&
    row.acceptableThresholdBb === null &&
    Array.isArray(row.values) &&
    row.values.length > 0 &&
    row.values.every((candidate) => isRecord(candidate) && candidate.evBb === null)
  ));
}

function requiredEntry(catalogId: string): PilotEntry {
  const entry = generatedMttPostflopPilotPacks.find((item) => item.catalogId === catalogId);
  if (entry === undefined) {
    throw new Error(`Unknown --catalog-id ${catalogId || "(missing)"}. Available: ${generatedMttPostflopPilotPacks.map((item) => item.catalogId).join(", ")}`);
  }
  return entry;
}

function renderReport(report: ReturnType<typeof prepareTemplates> | ReturnType<typeof validateAndBuildCandidate>, summary: boolean): string {
  if (report.mode === "TEMPLATE") {
    const lines = [
      "MTT postflop action-EV intake",
      `valid: ${report.valid}`,
      `mode: ${report.mode}`,
      `pilots: ${report.counts.pilots}`,
      `decisions: ${report.counts.decisions}`,
      `action value slots: ${report.counts.actionValueSlots}`,
      `existing templates: ${report.counts.existingTemplates}`,
      `stale templates: ${report.counts.staleTemplates}`,
      `written templates: ${report.counts.writtenTemplates}`,
      `blank templates: ${report.counts.blankTemplates}`,
      `nonblank templates: ${report.counts.nonBlankTemplates}`,
      `refreshable blank templates: ${report.counts.refreshableBlankTemplates}`,
      `refreshed blank templates: ${report.counts.refreshedBlankTemplates}`,
      `protected stale templates: ${report.counts.protectedStaleTemplates}`,
      `strategy values: ${report.strategyValues}`,
    ];
    if (!summary) lines.push(...report.templates.map((item) => `${item.catalogId}: ${item.outputPath}`));
    return lines.join("\n");
  }
  const lines = [
    "MTT postflop action-EV intake",
    `valid: ${report.valid}`,
    `mode: ${report.mode}`,
    `catalog: ${report.catalogId}`,
    `decisions: ${report.counts.completeDecisions}/${report.counts.expectedDecisions}`,
    `action value slots: ${report.counts.completeActionValueSlots}/${report.counts.expectedActionValueSlots}`,
    `errors: ${report.counts.errors}`,
    `candidate written: ${report.written}`,
    "production promotion: false",
  ];
  if (!summary) {
    lines.push(...report.errors.map((error) => `error: ${error}`));
    if (report.truncatedErrors > 0) lines.push(`error: ... ${report.truncatedErrors} more`);
  }
  return lines.join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.`);
  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeDocument(path, jsonDocument(value));
}

function jsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeDocument(path: string, document: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, document, "utf8");
}

function candidateReportPath(candidateOut: string): string {
  return /\.json$/i.test(candidateOut)
    ? candidateOut.replace(/\.json$/i, ".report.json")
    : `${candidateOut}.report.json`;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase() === resolve(right).toLocaleLowerCase();
}

function rowKey(ruleId: string, bucketIndex: number): string {
  return `${ruleId}#${bucketIndex}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isNonNegativeFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableNonNegativeFinite(value: unknown): boolean {
  return value === null || isNonNegativeFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
