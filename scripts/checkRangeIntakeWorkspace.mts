import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import {
  buildMttCompletionReadinessReport,
  type MttCompletionImportSlotHint,
  type MttCompletionReadinessRow,
} from "../src/data/ranges/mttProductionReadiness.ts";
import { generatedMttProductionManifest } from "../src/data/ranges/mttProductionRegistry.generated.ts";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks.ts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
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
const expectedRawGitignore = [
  "*",
  "!.gitignore",
  "!README.md",
  "!*/",
  "!*/permission.json",
].join("\n");

interface CliArgs {
  json: boolean;
  outputPath: string | null;
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
  await loadCompleteMttProductionRegistry();
  const report = buildIntakeWorkspaceReport();
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
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
    "  npm run range:intake:guard -- --output=artifacts/range-intake-guard-report.json",
    "",
    "Output:",
    "  --json",
    "  --output=artifacts/range-intake-guard-report.json",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error(`--output requires a path.\n\n${usage()}`);
      outputPath = resolve(value);
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { json, outputPath };
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
    errors.push(`${rawGitignorePath} must ignore strategy files while allowing .gitignore, README.md and exact permission.json manifests.`);
  }
  if (!existsSync(rawReadmePath)) {
    errors.push(`${rawReadmePath} is missing.`);
  }

  const legalSlots = legalImportSlots();
  const trackedRawFiles = gitTrackedRawFiles();
  const sourceSafePermissionFiles = new Set(generatedMttProductionManifest.map((entry) => (
    `${rawFolder}/${entry.packId}/permission.json`
  )));
  for (const slot of legalSlots) {
    sourceSafePermissionFiles.add(slot.importSlot.permissionManifestPath.replaceAll("\\", "/"));
  }
  const legalSlotByRawFolder = new Map(legalSlots.map((slot) => [slot.importSlot.rawInputFolder, slot]));
  const productionPackByRawFolder = new Map(generatedMttProductionManifest.map((entry) => [
    `${rawFolder}/${entry.packId}`,
    entry.packId,
  ]));
  // Preview pack má povolení, ale nikdy nebude mít produkční slot: odpovídá jen
  // tam, kde ví, takže `productionReady` z principu nesplní (ICM vrstva ze
  // schválených mřížek RYE, rozhodnutí vlastníka 4a z 22. 9. 2026). Do té doby
  // brána každou takovou složku hlásila jako neznámou - a jediná odpověď, která
  // by jí vyhověla, by byla povolení nedokládat.
  const previewPackByRawFolder = new Map(allMttPreflopRangePacks
    .filter((pack) => pack.confidence === "LOW"
      && !productionPackByRawFolder.has(`${rawFolder}/${pack.id}`)
      && !legalSlotByRawFolder.has(`${rawFolder}/${pack.id}`))
    .map((pack) => [`${rawFolder}/${pack.id}`, pack.id]));
  // Manifest preview packu do gitu patří ze stejného důvodu jako produkční: je
  // to doklad povolení bez jediné hodnoty ze zdroje. Proto se seznam povolených
  // sledovaných souborů dokončuje až tady, kde jsou preview packy známé; do
  // 23. 9. 2026 brána vlastní manifest hlásila jako „disallowed tracked file".
  for (const folder of previewPackByRawFolder.keys()) {
    sourceSafePermissionFiles.add(`${folder}/permission.json`);
  }
  const disallowedTrackedRawFiles = trackedRawFiles.filter((file) => (
    !allowedTrackedRawFiles.has(file) && !sourceSafePermissionFiles.has(file)
  ));
  if (disallowedTrackedRawFiles.length > 0) {
    errors.push(`Disallowed tracked raw intake files: ${disallowedTrackedRawFiles.join(", ")}`);
  }

  const localRawFolders = listLocalRawFolders();
  for (const folder of localRawFolders) {
    const slot = legalSlotByRawFolder.get(folder);
    if (slot !== undefined) {
      errors.push(...validateLocalManifestPair(slot));
      continue;
    }
    const productionPackId = productionPackByRawFolder.get(folder);
    if (productionPackId !== undefined) {
      errors.push(...validatePromotedRawFolder(folder, productionPackId));
      continue;
    }
    const previewPackId = previewPackByRawFolder.get(folder);
    if (previewPackId !== undefined) {
      errors.push(...validatePreviewRawFolder(folder, previewPackId));
      continue;
    }
    errors.push(`Unknown raw intake folder: ${folder}`);
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

function validatePromotedRawFolder(folder: string, expectedPackId: string): string[] {
  const errors: string[] = [];
  const normalizedPath = `${folder}/normalized.json`;
  const permissionPath = `${folder}/permission.json`;

  if (existsSync(normalizedPath)) {
    const normalizedId = readJsonStringField(normalizedPath, "id");
    if (normalizedId !== expectedPackId) {
      errors.push(`${normalizedPath} id ${normalizedId ?? "missing"} does not match production packId ${expectedPackId}.`);
    }
  }
  if (!existsSync(permissionPath)) {
    errors.push(`Promoted production pack is missing source-free manifest: ${permissionPath}`);
  } else {
    const permissionPackId = readJsonStringField(permissionPath, "packId");
    if (permissionPackId !== expectedPackId) {
      errors.push(`${permissionPath} packId ${permissionPackId ?? "missing"} does not match production packId ${expectedPackId}.`);
    }
  }

  return errors;
}

/**
 * Složka preview packu: povolení ano, zdrojová data ne.
 *
 * Kandidát preview packu bydlí v `artifacts/`, ne tady - do `raw/` patří jen
 * manifest, a ten musí jmenovat právě ten pack, ke kterému leží. Bez té
 * kontroly by stačilo vyrobit složku se jménem packu a brána by mlčela.
 */
function validatePreviewRawFolder(folder: string, expectedPackId: string): string[] {
  const errors: string[] = [];
  const permissionPath = `${folder}/permission.json`;
  if (!existsSync(permissionPath)) {
    errors.push(`Preview pack is missing source-free manifest: ${permissionPath}`);
    return errors;
  }
  const permissionPackId = readJsonStringField(permissionPath, "packId");
  if (permissionPackId !== expectedPackId) {
    errors.push(`${permissionPath} packId ${permissionPackId ?? "missing"} does not match preview packId ${expectedPackId}.`);
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
