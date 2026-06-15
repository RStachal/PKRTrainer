import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const rawFolder = "Agents/range-intake/raw";
const allowedTrackedRawFiles = new Set([
  "Agents/range-intake/raw/.gitignore",
  "Agents/range-intake/raw/README.md",
]);
const expectedRawGitignore = ["*", "!.gitignore", "!README.md"].join("\n");

interface IntakeWorkspaceReport {
  valid: boolean;
  rawFolder: string;
  trackedRawFiles: readonly string[];
  errors: readonly string[];
}

const report = buildIntakeWorkspaceReport();
console.log(renderIntakeWorkspaceReport(report));
process.exitCode = report.valid ? 0 : 1;

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

  return {
    valid: errors.length === 0,
    rawFolder,
    trackedRawFiles,
    errors,
  };
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
  ];
  for (const file of report.trackedRawFiles) lines.push(`  tracked: ${file}`);
  for (const error of report.errors) lines.push(`  error: ${error}`);
  return lines.join("\n");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
