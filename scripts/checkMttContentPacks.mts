import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  CONTENT_PACK_MANIFEST_SCHEMA,
  buildContentPackLibraryReport,
  type ContentPackLibraryReport,
  type ContentPackManifest,
  type InstalledContentPack,
} from "../src/pwa/contentPackManifest.ts";

const DEFAULT_OUTPUT = "artifacts/mtt-content-packs/report.json";

interface CliArgs {
  manifestPath: string | null;
  installedPath: string | null;
  assetRoot: string | null;
  outputPath: string | null;
  json: boolean;
  summary: boolean;
}

interface AssetCheck {
  id: string;
  path: string;
  exists: boolean;
  bytes: number | null;
  bytesMatch: boolean;
  sha256: string | null;
  sha256Match: boolean;
}

interface CliReport extends ContentPackLibraryReport {
  assetRoot: string | null;
  assetChecks: readonly AssetCheck[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const manifest = args.manifestPath === null ? emptyManifest() : readJson<ContentPackManifest>(args.manifestPath);
  const installed = args.installedPath === null ? [] : readJson<InstalledContentPack[]>(args.installedPath);
  const baseReport = buildContentPackLibraryReport(manifest, installed);
  const assetChecks = args.assetRoot === null ? [] : checkAssets(manifest, args.assetRoot);
  const assetErrors = assetChecks.flatMap(assetCheckErrors);
  const report: CliReport = {
    ...baseReport,
    valid: baseReport.valid && assetErrors.length === 0,
    assetRoot: args.assetRoot,
    assetChecks,
    errors: [...baseReport.errors, ...assetErrors],
    counts: {
      ...baseReport.counts,
      errors: baseReport.counts.errors + assetErrors.length,
    },
  };
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let manifestPath: string | null = null;
  let installedPath: string | null = null;
  let assetRoot: string | null = null;
  let outputPath: string | null = null;
  let json = false;
  let summary = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(DEFAULT_OUTPUT);
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    if (item.startsWith("--manifest=")) {
      manifestPath = resolve(inlineValue(item, "--manifest"));
      continue;
    }
    if (item.startsWith("--installed=")) {
      installedPath = resolve(inlineValue(item, "--installed"));
      continue;
    }
    if (item.startsWith("--asset-root=")) {
      assetRoot = resolve(inlineValue(item, "--asset-root"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { manifestPath, installedPath, assetRoot, outputPath, json, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:content-packs -- --summary",
    "  npm run mtt:content-packs -- --manifest=artifacts/content-packs/manifest.json --asset-root=dist --output",
    "  npm run mtt:content-packs -- --manifest=manifest.json --installed=installed.json --json",
    "",
    "Validates optional offline MTT content pack metadata, update plan and optional asset hash integrity.",
  ].join("\n");
}

function emptyManifest(): ContentPackManifest {
  return {
    schema: CONTENT_PACK_MANIFEST_SCHEMA,
    generatedAt: "not-generated",
    appShellVersion: "development",
    packs: [],
  };
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`File does not exist: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function checkAssets(manifest: ContentPackManifest, assetRoot: string): AssetCheck[] {
  return manifest.packs.map((pack) => {
    const path = join(assetRoot, pack.assetPath);
    if (!existsSync(path)) {
      return {
        id: pack.id,
        path,
        exists: false,
        bytes: null,
        bytesMatch: false,
        sha256: null,
        sha256Match: false,
      };
    }
    const content = readFileSync(path);
    const sha256 = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const bytes = statSync(path).size;
    return {
      id: pack.id,
      path,
      exists: true,
      bytes,
      bytesMatch: bytes === pack.bytes,
      sha256,
      sha256Match: sha256 === pack.sha256,
    };
  });
}

function assetCheckErrors(check: AssetCheck): string[] {
  const errors: string[] = [];
  if (!check.exists) errors.push(`${check.id}: asset file is missing at ${check.path}.`);
  if (check.exists && !check.bytesMatch) errors.push(`${check.id}: asset byte size does not match manifest.`);
  if (check.exists && !check.sha256Match) errors.push(`${check.id}: asset sha256 does not match manifest.`);
  return errors;
}

function renderReport(report: CliReport, summaryOnly: boolean): string {
  const lines = [
    "MTT content packs",
    `valid: ${report.valid}`,
    `packs: ${report.counts.packs}`,
    `bundled: ${report.counts.bundled}`,
    `optional: ${report.counts.optional}`,
    `remote disabled: ${report.counts.remoteDisabled}`,
    `total bytes: ${report.counts.totalBytes}`,
    `release trains: ${report.releaseTrains.length}`,
    `scenarios: ${report.scenarioIds.length}`,
    `update plan: ${report.updatePlan.length}`,
    `asset checks: ${report.assetChecks.length}`,
    `errors: ${report.counts.errors}`,
  ];
  if (!summaryOnly) {
    for (const item of report.updatePlan) {
      lines.push(`PLAN ${item.action} ${item.id}: ${item.reason}`);
    }
    for (const check of report.assetChecks) {
      lines.push(
        `ASSET ${check.id}: exists=${check.exists} bytes=${check.bytesMatch} sha256=${check.sha256Match}`,
      );
    }
  }
  for (const error of report.errors) lines.push(`ERROR: ${error}`);
  return lines.join("\n");
}

function inlineValue(item: string, option: string): string {
  const value = item.slice(`${option}=`.length).trim();
  if (value.length === 0) throw new Error(`${option} requires a value.\n\n${usage()}`);
  return value;
}
