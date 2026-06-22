import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import {
  emptyMttIntakePriorityCounts,
  MTT_INTAKE_PRIORITY_KEYS,
  mttIntakePriorityForProfile,
  type MttIntakePriorityKey,
} from "../src/data/ranges/mttIntakePriority.ts";

const rawFolder = "Agents/range-intake/raw";
const allowedTrackedRawFiles = new Set([
  "Agents/range-intake/raw/.gitignore",
  "Agents/range-intake/raw/README.md",
]);
const expectedRawGitignore = ["*", "!.gitignore", "!README.md"].join("\n");

interface CliArgs {
  json: boolean;
}

interface IntakeWorkspaceReport {
  valid: boolean;
  rawFolder: string;
  trackedRawFiles: readonly string[];
  localRawFolders: readonly string[];
  counts: {
    legalSlots: number;
    localFolders: number;
    readyForValidation: number;
    waitingForFiles: number;
    missingNormalized: number;
    missingPermission: number;
    byPriority: Record<MttIntakePriorityKey, number>;
  };
  errors: readonly string[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildIntakeWorkspaceReport();
  console.log(args.json ? JSON.stringify(report, null, 2) : renderIntakeWorkspaceReport(report));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run range:intake:guard",
    "  npm run range:intake:guard -- --json",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json };
}

function buildIntakeWorkspaceReport(): IntakeWorkspaceReport {
  const errors: string[] = [];
  const rawGitignorePath = join(rawFolder, ".gitignore");
  const rawReadmePath = join(rawFolder, "README.md");

  if (!existsSync(rawFolder)) {
    errors.push(`${rawFolder} is missing.`);
  }
  if (!existsSync(rawGitignorePath)) {
    errors.push(`${rawGitignorePath} is missing.`);
  } else if (normalizeLineEndings(readFileSync(rawGitignorePath, "utf8").trim()) !== expectedRawGitignore) {
    errors.push(`${rawGitignorePath} must ignore every raw file except .gitignore and README.md.`);
  }
  if (!existsSync(rawReadmePath)) {
    errors.push(`${rawReadmePath} is missing.`);
  }

  const trackedRawFiles = gitTrackedRawFiles();
  const disallowedTrackedRawFiles = trackedRawFiles.filter((file) => !allowedTrackedRawFiles.has(file));
  if (disallowedTrackedRawFiles.length > 0) {
    errors.push(`Disallowed tracked raw intake files: ${disallowedTrackedRawFiles.join(", ")}`);
  }

  const legalSlots = legalImportSlots();
  const legalSlotByRawFolder = new Map(legalSlots.map((slot) => [slot.importSlot.rawInputFolder, slot]));
  const localRawFolders = listLocalRawFolders();
  for (const folder of localRawFolders) {
    const slot = legalSlotByRawFolder.get(folder);
    if (slot === undefined) {
      errors.push(`Unknown raw intake folder: ${folder}`);
      continue;
    }
    errors.push(...validateLocalManifestPair(slot));
  }

  return {
    valid: errors.length === 0,
    rawFolder,
    trackedRawFiles,
    localRawFolders,
    counts: {
      legalSlots: legalSlots.length,
      localFolders: localRawFolders.length,
      readyForValidation: legalSlots.filter((slot) => slot.normalizedPresent && slot.permissionPresent).length,
      waitingForFiles: legalSlots.filter((slot) => !slot.normalizedPresent || !slot.permissionPresent).length,
      missingNormalized: legalSlots.filter((slot) => !slot.normalizedPresent).length,
      missingPermission: legalSlots.filter((slot) => !slot.permissionPresent).length,
      byPriority: countByPriority(legalSlots),
    },
    errors,
  };
}

interface LegalImportSlotState {
  priority: MttIntakePriorityKey;
  importSlot: MttCompletionImportSlotHint;
  normalizedPresent: boolean;
  permissionPresent: boolean;
}

function legalImportSlots(): LegalImportSlotState[] {
  return buildMttCompletionReadinessReport().rows
    .filter((row) => !row.productionReady && row.importSlot !== null)
    .map((row) => legalSlotState(row, row.importSlot as MttCompletionImportSlotHint));
}

function legalSlotState(
  row: MttCompletionReadinessRow,
  importSlot: MttCompletionImportSlotHint,
): LegalImportSlotState {
  const normalizedPresent = existsSync(importSlot.normalizedInputPath);
  const permissionPresent = existsSync(importSlot.permissionManifestPath);
  return {
    priority: mttIntakePriorityForProfile(row, normalizedPresent && permissionPresent),
    importSlot,
    normalizedPresent,
    permissionPresent,
  };
}

function countByPriority(slots: readonly LegalImportSlotState[]): Record<MttIntakePriorityKey, number> {
  const counts = emptyMttIntakePriorityCounts();
  for (const slot of slots) counts[slot.priority] += 1;
  return counts;
}

function listLocalRawFolders(): string[] {
  if (!existsSync(rawFolder)) return [];
  return readdirSync(rawFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${rawFolder}/${entry.name}`)
    .sort();
}

function validateLocalManifestPair(slot: LegalImportSlotState): string[] {
  const errors: string[] = [];
  const expectedPackId = slot.importSlot.packId;

  if (slot.normalizedPresent) {
    const normalizedId = readJsonStringField(slot.importSlot.normalizedInputPath, "id");
    if (normalizedId === null) {
      errors.push(`${slot.importSlot.normalizedInputPath} must contain string field id.`);
    } else if (normalizedId !== expectedPackId) {
      errors.push(`${slot.importSlot.normalizedInputPath} id ${normalizedId} does not match legal packId ${expectedPackId}.`);
    }
  }
  if (slot.permissionPresent) {
    const permissionPackId = readJsonStringField(slot.importSlot.permissionManifestPath, "packId");
    if (permissionPackId === null) {
      errors.push(`${slot.importSlot.permissionManifestPath} must contain string field packId.`);
    } else if (permissionPackId !== expectedPackId) {
      errors.push(`${slot.importSlot.permissionManifestPath} packId ${permissionPackId} does not match legal packId ${expectedPackId}.`);
    }
  }

  return errors;
}

function readJsonStringField(path: string, fieldName: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const value = parsed[fieldName];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function gitTrackedRawFiles(): string[] {
  const result = spawnSync("git", ["ls-files", rawFolder], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to list tracked range intake raw files.");
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function renderIntakeWorkspaceReport(report: IntakeWorkspaceReport): string {
  const lines = [
    "Range intake workspace guard",
    `valid: ${report.valid ? "true" : "false"}`,
    `raw folder: ${report.rawFolder}`,
    `tracked raw files: ${report.trackedRawFiles.length}`,
    `local raw folders: ${report.localRawFolders.length}`,
    `legal slots: ${report.counts.legalSlots}`,
    `ready for validation: ${report.counts.readyForValidation}`,
    `waiting for files: ${report.counts.waitingForFiles}`,
    `missing normalized.json: ${report.counts.missingNormalized}`,
    `missing permission.json: ${report.counts.missingPermission}`,
    `priority counts: ${MTT_INTAKE_PRIORITY_KEYS.map((priority) => `${priority}=${report.counts.byPriority[priority]}`).join(", ")}`,
  ];
  for (const file of report.trackedRawFiles) lines.push(`  tracked: ${file}`);
  for (const folder of report.localRawFolders) lines.push(`  local folder: ${folder}`);
  for (const error of report.errors) lines.push(`  error: ${error}`);
  return lines.join("\n");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
await loadCompleteMttProductionRegistry();
