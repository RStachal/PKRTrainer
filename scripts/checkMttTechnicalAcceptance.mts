import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

import { findAvailablePort, stopProcessTree, waitForUrl } from "./lib/previewServer.mts";

interface CliArgs {
  json: boolean;
  outputPath: string;
}

interface CommandResult {
  id: string;
  label: string;
  status: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

interface TechnicalAcceptanceReport {
  valid: boolean;
  counts: {
    commands: number;
    passedCommands: number;
    failedCommands: number;
  };
  tests: {
    suites: number;
    passedSuites: number;
    tests: number;
    passedTests: number;
  } | null;
  artifacts: {
    report: string;
    vitest: string;
    chrome: string;
    productionFixtureChrome: string;
  };
  commands: readonly CommandResult[];
}

const root = resolve(".");
const nodeExecutable = process.execPath;
const viteNodeCli = resolve("scripts/run-cli.mjs");
const viteCli = resolve("node_modules/vite/bin/vite.js");
const tscCli = resolve("node_modules/typescript/bin/tsc");
const vitestCli = resolve("node_modules/vitest/vitest.mjs");
const artifactDirectory = resolve("artifacts/mtt-technical-acceptance");
const vitestReportPath = resolve(artifactDirectory, "vitest.json");
const chromeArtifactPath = resolve(artifactDirectory, "chrome");
const productionFixtureArtifactPath = resolve("artifacts/e2e-production-fixture");
const rawArgs = process.argv.slice(2);
if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log(usage());
  process.exit(0);
}
const args = parseArgs(rawArgs);
const results: CommandResult[] = [];
let preview: ChildProcess | null = null;
let npmShimDirectory: string | null = null;

mkdirSync(artifactDirectory, { recursive: true });

try {
  npmShimDirectory = createNpmShim();
  const testPath = [npmShimDirectory, process.env.PATH ?? ""].join(delimiter);

  results.push(runNodeCommand("typecheck", "TypeScript typecheck", [tscCli, "--noEmit"]));
  results.push(runNodeCommand("tests", "Complete Vitest suite", [
    vitestCli,
    "run",
    "--reporter=json",
    `--outputFile=${vitestReportPath}`,
  ], {
    PATH: testPath,
  }));
  results.push(runNodeCommand("registry", "Generated MTT registry check", [
    viteNodeCli,
    "scripts/refreshMttProductionRegistry.mts",
    "--check",
  ]));
  results.push(runNodeCommand("registry-integrity", "MTT registry integrity", [
    viteNodeCli,
    "scripts/checkMttProductionRegistryIntegrity.mts",
  ]));
  results.push(runNodeCommand("ranges", "Range verification", [
    viteNodeCli,
    "scripts/verifyRanges.mts",
  ]));
  const build = runNodeCommand("build", "Production build", [viteCli, "build"]);
  results.push(build);

  if (build.status === 0) {
    results.push(runNodeCommand("precache", "Dist precache integrity", [
      viteNodeCli,
      "scripts/checkDistPrecache.mts",
    ]));
    results.push(runNodeCommand("bundle", "Bundle budget", [
      viteNodeCli,
      "scripts/checkBundleBudget.mts",
    ]));

    const previewPort = await findAvailablePort();
    preview = spawn(nodeExecutable, [
      viteCli,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(previewPort),
      "--strictPort",
    ], {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    await waitForUrl(`http://127.0.0.1:${previewPort}/`);
    results.push(runNodeCommand("chrome", "Chrome production-build E2E", [
      viteNodeCli,
      "scripts/runChromeE2e.mts",
    ], {
      MTT_E2E_URL: `http://127.0.0.1:${previewPort}/`,
      MTT_E2E_ARTIFACTS: chromeArtifactPath,
    }));
    stopProcessTree(preview);
    preview = null;
  } else {
    results.push(skippedResult("precache", "Dist precache integrity", "Production build failed."));
    results.push(skippedResult("bundle", "Bundle budget", "Production build failed."));
    results.push(skippedResult("chrome", "Chrome production-build E2E", "Production build failed."));
  }

  results.push(runNodeCommand("production-fixture", "Chrome synthetic production PREFLOP/FLOP/TURN/RIVER E2E", [
    viteNodeCli,
    "scripts/runChromeProductionFixtureE2e.mts",
  ]));
} catch (error) {
  results.push({
    id: "runner",
    label: "Technical acceptance runner",
    status: 1,
    durationMs: 0,
    stdout: "",
    stderr: error instanceof Error ? error.stack ?? error.message : String(error),
  });
} finally {
  stopProcessTree(preview);
  if (npmShimDirectory) {
    rmSync(npmShimDirectory, { recursive: true, force: true });
  }
}

const report = buildReport(results, args.outputPath);
mkdirSync(dirname(args.outputPath), { recursive: true });
writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));
process.exitCode = report.valid ? 0 : 1;

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath = resolve(artifactDirectory, "report.json");
  for (const item of argv) {
    if (item === "--summary") {
      continue;
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error("--output requires a path.");
      outputPath = resolve(value);
      continue;
    }
    throw new Error(`Unsupported argument: ${item}`);
  }
  return { json, outputPath };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:technical-acceptance",
    "  npm run mtt:technical-acceptance -- --summary",
    "  npm run mtt:technical-acceptance -- --json",
    "  npm run mtt:technical-acceptance -- --output=artifacts/mtt-technical-acceptance/report.json",
  ].join("\n");
}

function runNodeCommand(
  id: string,
  label: string,
  nodeArgs: readonly string[],
  env: Record<string, string> = {},
): CommandResult {
  const startedAt = Date.now();
  const result = spawnSync(nodeExecutable, [...nodeArgs], {
    cwd: root,
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      ...env,
    },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    id,
    label,
    status: result.status ?? 1,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout.trim(),
    stderr: [result.stderr.trim(), result.error?.message ?? ""].filter(Boolean).join("\n"),
  };
}

function skippedResult(id: string, label: string, reason: string): CommandResult {
  return {
    id,
    label,
    status: 1,
    durationMs: 0,
    stdout: "",
    stderr: `Skipped: ${reason}`,
  };
}

function buildReport(
  commands: readonly CommandResult[],
  outputPath: string,
): TechnicalAcceptanceReport {
  const failedCommands = commands.filter((command) => command.status !== 0).length;
  return {
    valid: failedCommands === 0,
    counts: {
      commands: commands.length,
      passedCommands: commands.length - failedCommands,
      failedCommands,
    },
    tests: readVitestSummary(),
    artifacts: {
      report: relativePath(outputPath),
      vitest: relativePath(vitestReportPath),
      chrome: relativePath(chromeArtifactPath),
      productionFixtureChrome: relativePath(productionFixtureArtifactPath),
    },
    commands,
  };
}

function readVitestSummary(): TechnicalAcceptanceReport["tests"] {
  if (!existsSync(vitestReportPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(vitestReportPath, "utf8")) as {
      numTotalTestSuites: number;
      numPassedTestSuites: number;
      numTotalTests: number;
      numPassedTests: number;
    };
    return {
      suites: parsed.numTotalTestSuites,
      passedSuites: parsed.numPassedTestSuites,
      tests: parsed.numTotalTests,
      passedTests: parsed.numPassedTests,
    };
  } catch {
    return null;
  }
}

function renderReport(report: TechnicalAcceptanceReport): string {
  const lines = [
    "MTT technical acceptance",
    `valid: ${report.valid}`,
    `commands: ${report.counts.commands}`,
    `passed commands: ${report.counts.passedCommands}`,
    `failed commands: ${report.counts.failedCommands}`,
    `report: ${report.artifacts.report}`,
  ];
  if (report.tests) {
    lines.push(
      `tests: ${report.tests.passedSuites}/${report.tests.suites} suites, ` +
      `${report.tests.passedTests}/${report.tests.tests} tests`,
    );
  }
  for (const command of report.commands) {
    lines.push(
      `${command.status === 0 ? "PASS" : "FAIL"} ${command.id} ` +
      `(${command.durationMs} ms): ${command.label}`,
    );
    if (command.status !== 0 && command.stderr) lines.push(command.stderr);
  }
  return lines.join("\n");
}

function createNpmShim(): string {
  const directory = mkdtempSync(join(tmpdir(), "pkrtrainer-npm-shim-"));
  const shimScript = resolve(directory, "npm-shim.mjs");
  const nodeDirectory = dirname(nodeExecutable);
  writeFileSync(shimScript, [
    'import { spawnSync } from "node:child_process";',
    'import { readFileSync } from "node:fs";',
    'import { delimiter, dirname, resolve } from "node:path";',
    "const args = process.argv.slice(2);",
    "let scriptName;",
    "let scriptArgs;",
    'if (args[0] === "run" && args[1]) {',
    "  scriptName = args[1];",
    '  scriptArgs = args.slice(args[2] === "--" ? 3 : 2);',
    '} else if (args[0] === "test") {',
    '  scriptName = "test";',
    '  scriptArgs = args.slice(args[1] === "--" ? 2 : 1);',
    "} else {",
    '  console.error(`Unsupported npm shim command: ${args.join(" ")}`);',
    "  process.exit(1);",
    "}",
    "const root = process.cwd();",
    'const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));',
    "const script = pkg.scripts?.[scriptName];",
    'if (typeof script !== "string") {',
    '  console.error(`Missing package script: ${scriptName}`);',
    "  process.exit(1);",
    "}",
    `const pathValue = [resolve(root, "node_modules/.bin"), ${JSON.stringify(nodeDirectory)}, process.env.PATH ?? ""].join(delimiter);`,
    'const command = [script, ...scriptArgs.map(quoteArgument)].join(" ");',
    'const result = spawnSync(command, { cwd: root, env: { ...process.env, PATH: pathValue }, shell: true, stdio: "inherit", windowsHide: true });',
    "if (result.error) throw result.error;",
    "process.exit(result.status ?? 1);",
    "function quoteArgument(value) {",
    '  if (/^[A-Za-z0-9_./:=\\\\-]+$/.test(value)) return value;',
    '  return `"${value.replaceAll(\'"\', \'""\')}"`;',
    "}",
    "",
  ].join("\n"), "utf8");
  if (process.platform === "win32") {
    writeFileSync(resolve(directory, "npm.cmd"), [
      "@echo off",
      `"${nodeExecutable}" "${shimScript}" %*`,
      "",
    ].join("\r\n"), "utf8");
  } else {
    writeFileSync(resolve(directory, "npm"), [
      "#!/bin/sh",
      `exec "${nodeExecutable}" "${shimScript}" "$@"`,
      "",
    ].join("\n"), { encoding: "utf8", mode: 0o755 });
  }
  return directory;
}

function relativePath(path: string): string {
  return path.slice(root.length + 1).replaceAll("\\", "/");
}
