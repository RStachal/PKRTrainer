import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildMttCompletionReadinessReport,
  filterMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessFilters,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { parseMttFilterArg } from "../src/data/ranges/mttCliFilterParsing.ts";
import {
  emptyMttIntakePriorityCounts,
  MTT_INTAKE_PRIORITY_KEYS,
  mttIntakePriorityForProfile,
  mttIntakePriorityRank,
  parseMttIntakePriority,
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";
import {
  buildRangeModuleDryRunCommand,
  validateRangeImportCommand,
} from "../src/data/ranges/rangeImportCommands.ts";

interface CliArgs {
  filters: MttCompletionReadinessFilters;
  json: boolean;
  outputPath: string | null;
  packetDir: string | null;
  priority: MttIntakePriorityKey | null;
}

interface NextMttActionRow {
  priority: MttIntakePriorityKey;
  slotId: string;
  status: MttCompletionReadinessRow["status"];
  coverageKind: MttCompletionReadinessRow["coverageKind"];
  currentPackId: string | null;
  packId: string;
  rawInputFolder: string;
  normalizedInputPath: string;
  permissionManifestPath: string;
  missingFiles: readonly string[];
  requiredFiles: readonly RequiredIntakeFile[];
  blockers: readonly string[];
  commands: {
    validate: string;
    buildDryRun: string;
    validateReady: string;
    promoteDryRun: string;
    promoteWrite: string;
    registryIntegrity: string;
    technicalAcceptance: string;
    androidPreflight: string;
  };
  operatorChecklist: readonly string[];
}

interface NextMttActionReport {
  valid: boolean;
  state: "COMPLETE" | "READY_FOR_VALIDATION" | "WAITING_FOR_FILES";
  filters: MttCompletionReadinessFilters;
  priority: MttIntakePriorityKey | null;
  counts: {
    blockerRows: number;
    readyForValidation: number;
    missingNormalized: number;
    missingPermission: number;
    byPriority: Record<MttIntakePriorityKey, number>;
  };
  nextAction: NextMttActionRow | null;
  followUpCommands: readonly string[];
  sourceReports: readonly string[];
}

interface RequiredIntakeFile {
  path: string;
  purpose: string;
  acceptance: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildNextMttActionReport(args);
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (args.packetDir !== null) {
    writeNextActionIntakePacket(report, args.packetDir);
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderNextMttActionReport(report));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:next-action",
    "  npm run mtt:next-action -- --json",
    "  npm run mtt:next-action -- --priority=P2_PREFLOP_DOLAR_EV",
    "  npm run mtt:next-action -- --format=SIX_MAX --ev=DOLAR_EV --street=RIVER",
    "",
    "Output:",
    "  --json",
    "  --output=artifacts/mtt-next-action/report.json",
    "  --packet-dir=artifacts/mtt-next-action/packet",
    `  --priority=${MTT_INTAKE_PRIORITY_KEYS.join("|")}`,
    "",
    "Filters:",
    "  --format=FULL_RING_9|SIX_MAX",
    "  --speed=REGULAR|TURBO",
    "  --ev=CHIP_EV|DOLAR_EV",
    "  --street=PREFLOP|FLOP|TURN|RIVER",
    "  --ante=ON|OFF",
    "  --status=candidate|missing|non-production|preview|blocked",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  const filters: MttCompletionReadinessFilters = {};
  let json = false;
  let outputPath: string | null = null;
  let packetDir: string | null = null;
  let priority: MttIntakePriorityKey | null = null;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--priority=")) {
      priority = parseMttIntakePriority(item.slice("--priority=".length), usage);
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    if (item.startsWith("--packet-dir=")) {
      const value = item.slice("--packet-dir=".length).trim();
      if (value.length === 0) throw new Error(`--packet-dir requires a path.\n\n${usage()}`);
      packetDir = resolve(value);
      continue;
    }
    if (parseMttFilterArg(item, filters, usage)) continue;
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { filters, json, outputPath, packetDir, priority };
}

function buildNextMttActionReport(args: CliArgs): NextMttActionReport {
  const filtered = filterMttCompletionReadinessReport(buildMttCompletionReadinessReport(), args.filters);
  const rows = filtered.rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .map((row) => nextMttActionRow(row, row.importSlot as MttCompletionImportSlotHint))
    .filter((row) => args.priority === null || row.priority === args.priority)
    .sort(compareRows);
  const nextAction = rows.find((row) => row.missingFiles.length === 0) ?? rows[0] ?? null;
  const readyForValidation = rows.filter((row) => row.missingFiles.length === 0).length;

  return {
    valid: rows.length === 0,
    state: nextAction === null ? "COMPLETE" : nextAction.missingFiles.length === 0 ? "READY_FOR_VALIDATION" : "WAITING_FOR_FILES",
    filters: args.filters,
    priority: args.priority,
    counts: {
      blockerRows: rows.length,
      readyForValidation,
      missingNormalized: rows.filter((row) => row.missingFiles.includes(row.normalizedInputPath)).length,
      missingPermission: rows.filter((row) => row.missingFiles.includes(row.permissionManifestPath)).length,
      byPriority: countByPriority(rows),
    },
    nextAction,
    followUpCommands: [
      "npm run mtt:validate-ready-intake",
      "npm run mtt:intake-plan -- --summary",
      "npm run mtt:acceptance",
      "npm run mtt:release-gates",
      "npm run mtt:handoff -- --strict",
      "npm run e2e:android:preflight",
      "npm run release:check",
    ],
    sourceReports: [
      "npm run mtt:handoff -- --output=artifacts/mtt-handoff-report.json",
      "npm run mtt:next-action -- --packet-dir=artifacts/mtt-next-action/packet",
      "npm run range:intake:guard -- --output=artifacts/range-intake-guard-report.json",
      "npm run range:intake -- --output=artifacts/range-intake-report.json",
      "npm run mtt:slots -- --json",
      "npm run mtt:slots -- --output=artifacts/mtt-slots-report.json",
      "npm run mtt:completion -- --json",
      "npm run mtt:completion -- --output=artifacts/mtt-completion-report.json",
      "npm run mtt:intake-plan -- --json",
      "npm run mtt:intake-plan -- --output=artifacts/mtt-intake-plan-report.json",
      "npm run mtt:blockers -- --json",
      "npm run mtt:blockers -- --output=artifacts/mtt-blockers-report.json",
      "npm run mtt:postflop-matrix -- --output=artifacts/mtt-postflop-matrix-report.json",
      "npm run mtt:postflop-positions -- --output=artifacts/mtt-postflop-positions-report.json",
      "npm run mtt:postflop-coverage -- --output=artifacts/mtt-postflop-coverage-report.json",
      "npm run mtt:postflop-release -- --output=artifacts/mtt-postflop-release-report.json",
      "npm run mtt:validate-ready-intake -- --output=artifacts/mtt-validate-ready-intake-report.json",
      "npm run mtt:promote-ready -- --output=artifacts/mtt-promote-ready-report.json",
      "npm run e2e:android:preflight -- --output=artifacts/e2e-android-preflight/report.json",
      "npm run mtt:release-gates -- --json",
      "npm run mtt:release-gates -- --output=artifacts/mtt-release-gates-report.json",
      "npm run mtt:acceptance -- --output=artifacts/mtt-acceptance-report.json",
    ],
  };
}

function nextMttActionRow(
  row: MttCompletionReadinessRow,
  importSlot: MttCompletionImportSlotHint,
): NextMttActionRow {
  const missingFiles = [
    existsSync(importSlot.normalizedInputPath) ? null : importSlot.normalizedInputPath,
    existsSync(importSlot.permissionManifestPath) ? null : importSlot.permissionManifestPath,
  ].filter((path): path is string => path !== null);

  return {
    priority: mttIntakePriorityForProfile(row, missingFiles.length === 0),
    slotId: [
      row.tableFormat,
      row.blindSpeed,
      row.evModel,
      row.street,
      row.ante,
    ].join("|"),
    status: row.status,
    coverageKind: row.coverageKind,
    currentPackId: row.packId,
    packId: importSlot.packId,
    rawInputFolder: importSlot.rawInputFolder,
    normalizedInputPath: importSlot.normalizedInputPath,
    permissionManifestPath: importSlot.permissionManifestPath,
    missingFiles,
    blockers: row.missingReasons,
    requiredFiles: requiredFilesForSlot(importSlot),
    commands: {
      validate: validateRangeImportCommand(importSlot),
      buildDryRun: buildRangeModuleDryRunCommand(importSlot),
      validateReady: validateReadyCommand(row),
      promoteDryRun: promoteDryRunCommand(row),
      promoteWrite: "npm run mtt:promote-ready -- --write --confirm=WRITE_READY_MTT_MODULES",
      registryIntegrity: "npm run mtt:registry-integrity",
      technicalAcceptance: "npm run mtt:technical-acceptance",
      androidPreflight: "npm run e2e:android:preflight",
    },
    operatorChecklist: operatorChecklistForSlot(row),
  };
}

function requiredFilesForSlot(importSlot: MttCompletionImportSlotHint): readonly RequiredIntakeFile[] {
  return [
    {
      path: importSlot.normalizedInputPath,
      purpose: "Normalized production range JSON for the exact canonical MTT slot.",
      acceptance: [
        `Pack id must be ${importSlot.packId}.`,
        `Import kind must validate as ${importSlot.kind}.`,
        "No placeholder values, metadata-only profile copies or inferred chart values.",
      ],
    },
    {
      path: importSlot.permissionManifestPath,
      purpose: "Permission manifest proving runtime redistribution rights for this pack.",
      acceptance: [
        `Manifest packId must be ${importSlot.packId}.`,
        "Evidence must permit redistribution inside the PKRTrainer runtime bundle.",
        "Reviewer, rights owner and evidence references must be explicit.",
      ],
    },
  ];
}

function validateReadyCommand(row: MttCompletionReadinessRow): string {
  return [
    "npm run mtt:validate-ready-intake --",
    `--format=${row.tableFormat}`,
    `--speed=${row.blindSpeed}`,
    `--ev=${row.evModel}`,
    `--street=${row.street}`,
    `--ante=${row.ante}`,
  ].join(" ");
}

function promoteDryRunCommand(row: MttCompletionReadinessRow): string {
  return [
    "npm run mtt:promote-ready --",
    "--dry-run",
    `--format=${row.tableFormat}`,
    `--speed=${row.blindSpeed}`,
    `--ev=${row.evModel}`,
    `--street=${row.street}`,
    `--ante=${row.ante}`,
  ].join(" ");
}

function operatorChecklistForSlot(row: MttCompletionReadinessRow): readonly string[] {
  const checklist = [
    "Place both required files in the listed raw folder.",
    "Run the single-slot validate command before any module generation.",
    "Run the build dry-run command and inspect the output module path.",
    "Run the filtered ready-intake validation; it must report productionReady true for this slot.",
    "Run promote-ready in dry-run mode before the confirmed write.",
    "After write, refresh/check registry, run registry integrity and technical acceptance.",
    "Run Android preflight and attach readySerial/device blocker evidence to release notes.",
  ];

  if (row.blindSpeed === "TURBO") {
    checklist.unshift(
      "Turbo slot must use dedicated turbo hand recommendations or an explicit reviewed reuse policy.",
    );
  }
  if (row.evModel === "DOLAR_EV") {
    checklist.unshift(
      "$EV slot must not reuse chipEV ranges without explicit reviewed reuse permission.",
    );
  }
  return checklist;
}

function countByPriority(rows: readonly NextMttActionRow[]): Record<MttIntakePriorityKey, number> {
  const counts = emptyMttIntakePriorityCounts();
  for (const row of rows) counts[row.priority] += 1;
  return counts;
}

function compareRows(a: NextMttActionRow, b: NextMttActionRow): number {
  return (
    mttIntakePriorityRank(a.priority) - mttIntakePriorityRank(b.priority) ||
    readinessRank(a) - readinessRank(b) ||
    statusRank(a.status) - statusRank(b.status) ||
    a.slotId.localeCompare(b.slotId, "en")
  );
}

function readinessRank(row: NextMttActionRow): number {
  return row.missingFiles.length === 0 ? 0 : 1;
}

function statusRank(status: MttCompletionReadinessRow["status"]): number {
  if (status === "MISSING") return 0;
  if (status === "CANDIDATE") return 1;
  return 2;
}

function renderNextMttActionReport(report: NextMttActionReport): string {
  const lines = [
    "Next MTT action",
    `priority filter: ${report.priority ?? "all"}`,
    `valid: ${report.valid}`,
    `state: ${report.state}`,
    `blocker rows: ${report.counts.blockerRows}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `priority counts: ${MTT_INTAKE_PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];

  if (report.nextAction === null) {
    lines.push("next action: none");
    lines.push("MTT completion matrix is production-ready for the selected filters.");
  } else {
    const action = report.nextAction;
    lines.push(`priority: ${action.priority}`);
    lines.push(`slot: ${action.slotId}`);
    lines.push(`pack: ${action.packId}`);
    lines.push(`status: ${action.status}`);
    lines.push(`coverage: ${action.coverageKind}`);
    lines.push(`raw folder: ${action.rawInputFolder}`);
    if (action.currentPackId !== null) lines.push(`current pack: ${action.currentPackId}`);
    for (const missingFile of action.missingFiles) lines.push(`missing file: ${missingFile}`);
    lines.push("required files:");
    for (const requiredFile of action.requiredFiles) {
      lines.push(`  - ${requiredFile.path}: ${requiredFile.purpose}`);
      for (const acceptance of requiredFile.acceptance) lines.push(`    acceptance: ${acceptance}`);
    }
    lines.push(`validate: ${action.commands.validate}`);
    lines.push(`build dry-run: ${action.commands.buildDryRun}`);
    lines.push(`validate ready: ${action.commands.validateReady}`);
    lines.push(`promote dry-run: ${action.commands.promoteDryRun}`);
    lines.push(`promote write: ${action.commands.promoteWrite}`);
    lines.push(`registry integrity: ${action.commands.registryIntegrity}`);
    lines.push(`technical acceptance: ${action.commands.technicalAcceptance}`);
    lines.push(`android preflight: ${action.commands.androidPreflight}`);
    for (const blocker of action.blockers) lines.push(`blocker: ${blocker}`);
    lines.push("operator checklist:");
    for (const item of action.operatorChecklist) lines.push(`  - ${item}`);
  }

  lines.push("follow-up commands:");
  for (const command of report.followUpCommands) lines.push(`  ${command}`);
  lines.push("source reports:");
  for (const command of report.sourceReports) lines.push(`  ${command}`);

  return lines.join("\n");
}

function writeNextActionIntakePacket(report: NextMttActionReport, packetRoot: string): void {
  const action = report.nextAction;
  if (action === null) {
    mkdirSync(packetRoot, { recursive: true });
    writeFileSync(
      join(packetRoot, "README.md"),
      [
        "# MTT intake packet",
        "",
        "No pending MTT intake action matches the selected filters.",
        "Do not create placeholder range files.",
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  const packetDir = join(packetRoot, action.packId);
  mkdirSync(packetDir, { recursive: true });
  const expectedPaths = {
    warning: "Do not copy this packet into raw intake as data. It is a checklist only.",
    slotId: action.slotId,
    priority: action.priority,
    packId: action.packId,
    rawInputFolder: action.rawInputFolder,
    normalizedInputPath: action.normalizedInputPath,
    permissionManifestPath: action.permissionManifestPath,
    requiredFiles: action.requiredFiles,
    missingFiles: action.missingFiles,
    commands: action.commands,
    operatorChecklist: action.operatorChecklist,
    blockers: action.blockers,
  };

  writeFileSync(
    join(packetDir, "expected-paths.json"),
    `${JSON.stringify(expectedPaths, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(packetDir, "README.md"), renderIntakePacketReadme(action), "utf8");
  writeFileSync(
    join(packetDir, "NORMALIZED_JSON_REQUIREMENTS.md"),
    renderRequiredFileNotes(action.requiredFiles[0]),
    "utf8",
  );
  writeFileSync(
    join(packetDir, "PERMISSION_JSON_REQUIREMENTS.md"),
    renderRequiredFileNotes(action.requiredFiles[1]),
    "utf8",
  );
}

function renderIntakePacketReadme(action: NextMttActionRow): string {
  return [
    "# MTT intake packet",
    "",
    `Priority: ${action.priority}`,
    `Slot: ${action.slotId}`,
    `Pack: ${action.packId}`,
    `Raw folder: ${action.rawInputFolder}`,
    "",
    "This packet is a checklist only. It must not be used as strategy data.",
    "Do not create placeholder normalized.json or permission.json files.",
    "The two raw intake files must come from reviewed legal evidence and must match the canonical pack id above.",
    "",
    "## Required files",
    "",
    ...action.requiredFiles.flatMap((file) => [
      `- ${file.path}`,
      `  - Purpose: ${file.purpose}`,
      ...file.acceptance.map((item) => `  - Acceptance: ${item}`),
    ]),
    "",
    "## Commands",
    "",
    `- Validate import: ${action.commands.validate}`,
    `- Build dry-run: ${action.commands.buildDryRun}`,
    `- Validate ready slot: ${action.commands.validateReady}`,
    `- Promote dry-run: ${action.commands.promoteDryRun}`,
    `- Promote write: ${action.commands.promoteWrite}`,
    `- Registry integrity: ${action.commands.registryIntegrity}`,
    `- Technical acceptance: ${action.commands.technicalAcceptance}`,
    `- Android preflight: ${action.commands.androidPreflight}`,
    "",
    "## Operator checklist",
    "",
    ...action.operatorChecklist.map((item) => `- ${item}`),
    "",
    "## Current blockers",
    "",
    ...action.blockers.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderRequiredFileNotes(file: RequiredIntakeFile): string {
  return [
    "# Required intake file",
    "",
    `Path: ${file.path}`,
    "",
    file.purpose,
    "",
    "## Acceptance",
    "",
    ...file.acceptance.map((item) => `- ${item}`),
    "",
    "Do not use placeholder values. Do not infer strategy values from metadata only.",
    "",
  ].join("\n");
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
