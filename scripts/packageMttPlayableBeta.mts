import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { MttPlayableBetaReport } from "./checkMttPlayableBeta.mts";
import {
  buildDeterministicZip,
  reconcileDeterministicZip,
  type DeterministicZipSource,
} from "./lib/deterministicZip.mts";

const CONFIRM_TOKEN = "PACKAGE_MTT_PLAYABLE_BETA";
const DEFAULT_LABEL = "mtt-playable-beta";
const FORPSI_TEMPLATE = resolve("deploy/forpsi/.htaccess.example");
const DIST_DIRECTORY = resolve("dist");
const FORBIDDEN_ARCHIVE_SEGMENTS = [
  "agents/",
  "artifacts/",
  "normalized.json",
  "permission.json",
  "range-intake/",
  "solver-input/",
  "src/",
];

interface CliArgs {
  confirm: string | null;
  label: string;
  manifestPath: string | null;
  outputPath: string | null;
  requireTargetComplete: boolean;
  summary: boolean;
  write: boolean;
}

interface CommandEvidence {
  command: string;
  durationMs: number;
  exitCode: 0;
}

interface PackageManifest {
  schemaVersion: "PKRTRAINER_FTP_PACKAGE_MANIFEST_V1";
  generatedAt: string;
  commit: string;
  gitCleanBeforeChecks: true;
  scope: MttPlayableBetaReport["scope"];
  betaStatus: MttPlayableBetaReport["status"];
  targetScopeComplete: boolean;
  knownLimits: readonly string[];
  releaseEvidence: readonly CommandEvidence[];
  /**
   * Whether the evidence was produced by this run or reused from an earlier one.
   *
   * Reuse is only ever offered for the identical commit with a clean tree, so it
   * is the same code the checks ran against - but a reader of the manifest should
   * never have to infer that, so it is stated.
   */
  releaseEvidenceSource: "THIS_RUN" | { reusedFrom: string; generatedAt: string };
  archive: {
    fileName: string;
    bytes: number;
    sha256: string;
    entryCount: number;
    reconciled: true;
  };
  entries: readonly {
    path: string;
    bytes: number;
    sha256: string;
  }[];
  deployment: {
    uploadContentsTo: "/www/ or /subdoms/<subdomain>/";
    htaccessTemplate: ".htaccess.example";
    passwordFileMustRemainOutsideWebRoot: true;
  };
}

interface PreparedPackage {
  archive: Uint8Array;
  beta: MttPlayableBetaReport;
  sources: readonly DeterministicZipSource[];
}

try {
  const args = parseArgs(process.argv.slice(2));
  const betaBeforeChecks = runBetaReport();
  assertBetaCanPackage(betaBeforeChecks, args.requireTargetComplete);

  if (!args.write) {
    const prepared = preparePackage(betaBeforeChecks);
    const reconciliation = reconcileDeterministicZip(prepared.archive, prepared.sources);
    if (!reconciliation.valid) throw new Error(reconciliation.errors.join("\n"));
    console.log(renderDryRun(betaBeforeChecks, reconciliation.archiveBytes, reconciliation.entries.length));
    process.exitCode = 0;
  } else {
    if (args.confirm !== CONFIRM_TOKEN) {
      throw new Error(`Writing requires --confirm=${CONFIRM_TOKEN}.`);
    }
    assertGitClean();
    const headCommit = git(["rev-parse", "HEAD"]).trim();
    const reused = args.reuseEvidence ? findReusableEvidence(headCommit) : null;
    const evidence = reused === null ? runReleaseChecks() : reused.evidence;
    assertGitClean();
    const beta = runBetaReport();
    assertBetaCanPackage(beta, args.requireTargetComplete);
    const prepared = preparePackage(beta);
    const reconciliation = reconcileDeterministicZip(prepared.archive, prepared.sources);
    if (!reconciliation.valid) throw new Error(reconciliation.errors.join("\n"));

    const commit = git(["rev-parse", "HEAD"]).trim();
    const shortCommit = commit.slice(0, 12);
    const stamp = timestamp(new Date());
    const defaultBase = `pkrtrainer-ftp-${stamp}-${shortCommit}-${args.label}`;
    const outputPath = args.outputPath ?? resolve("deploy", `${defaultBase}.zip`);
    const manifestPath = args.manifestPath ?? resolve("deploy", `${defaultBase}.manifest.json`);
    validateOutputPaths(outputPath, manifestPath);
    const manifest: PackageManifest = {
      schemaVersion: "PKRTRAINER_FTP_PACKAGE_MANIFEST_V1",
      generatedAt: new Date().toISOString(),
      commit,
      gitCleanBeforeChecks: true,
      scope: beta.scope,
      betaStatus: beta.status,
      targetScopeComplete: beta.targetScopeComplete,
      knownLimits: beta.knownLimits,
      releaseEvidence: evidence,
      releaseEvidenceSource: reused === null
        ? "THIS_RUN"
        : { reusedFrom: reused.manifestFile, generatedAt: reused.generatedAt },
      archive: {
        fileName: basename(outputPath),
        bytes: reconciliation.archiveBytes,
        sha256: reconciliation.archiveSha256,
        entryCount: reconciliation.entries.length,
        reconciled: true,
      },
      entries: reconciliation.entries,
      deployment: {
        uploadContentsTo: "/www/ or /subdoms/<subdomain>/",
        htaccessTemplate: ".htaccess.example",
        passwordFileMustRemainOutsideWebRoot: true,
      },
    };
    writeNewFileAtomically(outputPath, prepared.archive);
    try {
      writeNewFileAtomically(
        manifestPath,
        Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      );
    } catch (error) {
      unlinkSync(outputPath);
      throw error;
    }
    console.log(renderWritten(outputPath, manifestPath, manifest, args.summary));
    process.exitCode = 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let confirm: string | null = null;
  let label = DEFAULT_LABEL;
  let manifestPath: string | null = null;
  let outputPath: string | null = null;
  let requireTargetComplete = false;
  let reuseEvidence = false;
  let summary = false;
  let write = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item === "--require-target-complete") { requireTargetComplete = true; continue; }
    if (item === "--reuse-evidence") { reuseEvidence = true; continue; }
    if (item.startsWith("--confirm=")) { confirm = inlineValue(item, "--confirm"); continue; }
    if (item.startsWith("--label=")) {
      label = inlineValue(item, "--label");
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label)) {
        throw new Error("--label must use 1-64 lowercase letters, digits or hyphens.");
      }
      continue;
    }
    if (item.startsWith("--output=")) { outputPath = resolve(inlineValue(item, "--output")); continue; }
    if (item.startsWith("--manifest=")) { manifestPath = resolve(inlineValue(item, "--manifest")); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  if (!write && confirm !== null) throw new Error("--confirm is valid only with --write.");
  if (!write && (outputPath !== null || manifestPath !== null)) {
    throw new Error("--output and --manifest are valid only with --write.");
  }
  if (reuseEvidence && !write) throw new Error("--reuse-evidence is valid only with --write.");
  return { confirm, label, manifestPath, outputPath, requireTargetComplete, reuseEvidence, summary, write };
}

/**
 * Release evidence from an earlier run of the *same* commit, if there is any.
 *
 * The packaging chain is 24.9 minutes and 90 percent of that is `npm test`. When a
 * ZIP has to be rebuilt for a commit whose checks already passed - a different
 * label, a lost file, a second copy for someone else - rerunning them proves
 * nothing new about that code.
 *
 * The guard is the commit, not the clock. A manifest qualifies only when it
 * records the same HEAD, and the tree is already asserted clean on both sides of
 * this call, so the evidence provably describes the code being packaged. Anything
 * else - a different commit, no manifest, an unreadable one - falls through to
 * running the checks, because a fast ZIP is worth nothing if it might be a ZIP of
 * something unverified.
 */
function findReusableEvidence(
  commit: string,
): { evidence: CommandEvidence[]; manifestFile: string; generatedAt: string } | null {
  let candidates: string[];
  try {
    candidates = readdirSync("deploy").filter((name) => name.endsWith(".manifest.json"));
  } catch {
    return null;
  }

  const matches: { file: string; generatedAt: string; evidence: CommandEvidence[] }[] = [];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(resolve("deploy", file), "utf8")) as Partial<PackageManifest>;
      if (parsed.commit !== commit) continue;
      if (!Array.isArray(parsed.releaseEvidence) || parsed.releaseEvidence.length === 0) continue;
      // Evidence that was itself reused is not reused again: the chain back to a
      // real run should be one step, not a rumour of a rumour.
      if (parsed.releaseEvidenceSource !== undefined && parsed.releaseEvidenceSource !== "THIS_RUN") continue;
      matches.push({
        file,
        generatedAt: String(parsed.generatedAt ?? ""),
        evidence: parsed.releaseEvidence as CommandEvidence[],
      });
    } catch {
      continue;
    }
  }
  if (matches.length === 0) return null;

  matches.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  const best = matches[0];
  console.log(
    `Reusing release evidence from ${best.file} (same commit ${commit.slice(0, 12)}, `
    + `${best.evidence.length} checks, run at ${best.generatedAt}).`,
  );
  return { evidence: best.evidence, manifestFile: best.file, generatedAt: best.generatedAt };
}

function runReleaseChecks(): CommandEvidence[] {
  const commands: readonly { display: string; args: readonly string[] }[] = [
    { display: "npm run typecheck", args: ["run", "typecheck"] },
    { display: "npm test -- --reporter=dot", args: ["test", "--", "--reporter=dot"] },
    { display: "npm run mtt:refresh-registry -- --check", args: ["run", "mtt:refresh-registry", "--", "--check"] },
    { display: "npm run mtt:core-release -- --summary", args: ["run", "mtt:core-release", "--", "--summary"] },
    { display: "npm run mtt:playable-beta -- --summary", args: ["run", "mtt:playable-beta", "--", "--summary"] },
    { display: "npm run verify:ranges", args: ["run", "verify:ranges"] },
    { display: "npm run range:intake:guard", args: ["run", "range:intake:guard"] },
    { display: "npm run build", args: ["run", "build"] },
    { display: "npm run verify:precache", args: ["run", "verify:precache"] },
    { display: "npm run bundle:budget", args: ["run", "bundle:budget"] },
    { display: "npm run e2e:chrome:preview", args: ["run", "e2e:chrome:preview"] },
  ];
  return commands.map((command) => {
    const started = Date.now();
    const result = runNpm(command.args);
    if (result.status !== 0) {
      throw new Error(
        `${command.display} failed (${result.status ?? "no exit"}).\n` +
        `${result.stdout.trim()}\n${result.stderr.trim()}`.trim(),
      );
    }
    return {
      command: command.display,
      durationMs: Date.now() - started,
      exitCode: 0,
    };
  });
}

function runNpm(args: readonly string[]) {
  const npmCli = process.env.npm_execpath;
  if (npmCli !== undefined && existsSync(npmCli)) {
    return spawnSync(process.execPath, [npmCli, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
}

function runBetaReport(): MttPlayableBetaReport {
  const result = spawnSync(process.execPath, [
    resolve("scripts/run-cli.mjs"),
    resolve("scripts/checkMttPlayableBeta.mts"),
    "--json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `MTT playable-beta gate failed (${result.status ?? "no exit"}): ` +
      `${result.stderr.trim() || result.stdout.trim() || "no output"}`,
    );
  }
  return JSON.parse(result.stdout) as MttPlayableBetaReport;
}

function assertBetaCanPackage(report: MttPlayableBetaReport, requireTargetComplete: boolean): void {
  if (!report.valid) throw new Error("MTT playable beta is not launchable.");
  if (requireTargetComplete && !report.targetScopeComplete) {
    throw new Error(
      `MTT playable-beta target is incomplete (${report.counts.preflopReady}/${report.counts.preflopTargets} preflop).`,
    );
  }
}

function preparePackage(beta: MttPlayableBetaReport): PreparedPackage {
  if (!existsSync(DIST_DIRECTORY)) throw new Error("dist/ does not exist; run npm run build first.");
  if (!existsSync(FORPSI_TEMPLATE)) throw new Error(`FORPSI template is missing: ${FORPSI_TEMPLATE}`);
  const sources = [
    ...readDirectoryFiles(DIST_DIRECTORY).filter((source) => !source.path.endsWith(".map")),
    { path: ".htaccess.example", bytes: readFileSync(FORPSI_TEMPLATE) },
  ];
  validateReleaseMembership(sources);
  return {
    archive: buildDeterministicZip(sources),
    beta,
    sources,
  };
}

function readDirectoryFiles(root: string, directory = root): DeterministicZipSource[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) throw new Error(`Release source must not contain a symbolic link: ${path}`);
      if (stats.isDirectory()) return readDirectoryFiles(root, path);
      if (!stats.isFile()) throw new Error(`Release source is not a regular file: ${path}`);
      return [{
        path: relative(root, path).split(sep).join("/"),
        bytes: readFileSync(path),
      }];
    });
}

function validateReleaseMembership(sources: readonly DeterministicZipSource[]): void {
  const paths = sources.map((source) => source.path);
  for (const required of [".htaccess.example", "index.html", "manifest.webmanifest", "sw.js"]) {
    if (!paths.includes(required)) throw new Error(`FTP package is missing ${required}.`);
  }
  if (!paths.some((path) => /^assets\/main-[A-Za-z0-9_-]+\.js$/.test(path))) {
    throw new Error("FTP package has no hashed main JavaScript asset.");
  }
  for (const path of paths) {
    const lower = path.toLocaleLowerCase("en-US");
    if (lower.endsWith(".map")) throw new Error(`Source map must not enter the FTP package: ${path}.`);
    const forbidden = FORBIDDEN_ARCHIVE_SEGMENTS.find((segment) => lower.includes(segment));
    if (forbidden !== undefined) throw new Error(`Forbidden release archive path ${path}.`);
  }
}

function validateOutputPaths(outputPath: string, manifestPath: string): void {
  if (!outputPath.toLocaleLowerCase("en-US").endsWith(".zip")) throw new Error("--output must end in .zip.");
  if (!manifestPath.toLocaleLowerCase("en-US").endsWith(".json")) {
    throw new Error("--manifest must end in .json.");
  }
  if (samePath(outputPath, manifestPath)) throw new Error("ZIP and manifest paths must differ.");
  for (const path of [outputPath, manifestPath]) {
    if (isWithin(DIST_DIRECTORY, path) || samePath(path, FORPSI_TEMPLATE)) {
      throw new Error("Release output must not overwrite an input file.");
    }
    if (existsSync(path)) throw new Error(`Release output already exists: ${path}`);
  }
}

function writeNewFileAtomically(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  if (existsSync(temporary)) unlinkSync(temporary);
  try {
    writeFileSync(temporary, bytes, { flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function assertGitClean(): void {
  const status = git(["status", "--porcelain"]);
  if (status.trim().length > 0) {
    throw new Error(`FTP release packaging requires a clean git worktree.\n${status.trim()}`);
  }
}

function git(args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout;
}

function renderDryRun(report: MttPlayableBetaReport, bytes: number, entries: number): string {
  return [
    "MTT playable-beta FTP package dry run",
    `scope: ${report.scope}`,
    `status: ${report.status}`,
    `target scope complete: ${report.targetScopeComplete}`,
    `archive entries: ${entries}`,
    `archive bytes: ${bytes}`,
    "written: false",
    `write token: ${CONFIRM_TOKEN}`,
  ].join("\n");
}

function renderWritten(
  outputPath: string,
  manifestPath: string,
  manifest: PackageManifest,
  summary: boolean,
): string {
  const lines = [
    "MTT playable-beta FTP package",
    `scope: ${manifest.scope}`,
    `status: ${manifest.betaStatus}`,
    `target scope complete: ${manifest.targetScopeComplete}`,
    `commit: ${manifest.commit}`,
    `release checks: ${manifest.releaseEvidence.length}/${manifest.releaseEvidence.length}`,
    `archive entries: ${manifest.archive.entryCount}`,
    `archive SHA-256: ${manifest.archive.sha256}`,
    `zip: ${outputPath}`,
    `manifest: ${manifestPath}`,
  ];
  if (!summary) lines.push(...manifest.knownLimits.map((limit) => `limit: ${limit}`));
  return lines.join("\n");
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.`);
  return value;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase("en-US") === resolve(right).toLocaleLowerCase("en-US");
}

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:ftp-package -- --summary",
    `  npm run mtt:ftp-package -- --write --confirm=${CONFIRM_TOKEN} --summary`,
    "  add --require-target-complete for the final eight-profile beta milestone",
    "",
    "",
    "A confirmed write reruns the complete test, release, build and Chrome E2E chain before creating the ZIP.",
    "Add --reuse-evidence to reuse that chain from an earlier manifest for the SAME commit,",
    "which turns a 25-minute rebuild into seconds. It falls back to running the chain whenever",
    "no manifest matches HEAD, and the manifest always records which of the two happened.",
  ].join("\n");
}
