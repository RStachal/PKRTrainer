import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter } from "node:path";
import { dirname, join, resolve } from "node:path";
import {
  parseAdbDevices,
  summarizeAndroidDeviceAvailability,
  type AndroidDevicePreflightReport,
} from "../src/e2e/androidDeviceAvailability";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  adbPath: string | null;
}

const rawArgs = process.argv.slice(2);
if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const args = parseArgs(rawArgs);
const adbPath = args.adbPath ?? findAdbPath();
const report = runPreflight(adbPath);

if (args.outputPath) {
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));
process.exitCode = report.valid ? 0 : 1;

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = resolve("artifacts/e2e-android-preflight/report.json");
  let adbPath: string | null = null;

  for (const item of argv) {
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--no-output") {
      outputPath = null;
      continue;
    }
    if (item.startsWith("--output=")) {
      const value = item.slice("--output=".length).trim();
      if (value.length === 0) throw new Error("--output requires a path.");
      outputPath = resolve(value);
      continue;
    }
    if (item.startsWith("--adb=")) {
      const value = item.slice("--adb=".length).trim();
      if (value.length === 0) throw new Error("--adb requires a path.");
      adbPath = value;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}`);
  }

  return { json, outputPath, adbPath };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run e2e:android:preflight",
    "  npm run e2e:android:preflight -- --json",
    "  npm run e2e:android:preflight -- --output=artifacts/e2e-android-preflight/report.json",
    "  npm run e2e:android:preflight -- --adb=/path/to/adb",
  ].join("\n");
}

function runPreflight(adbPath: string | null): AndroidDevicePreflightReport {
  if (!adbPath) {
    return summarizeAndroidDeviceAvailability({ adbPath: null });
  }

  const result = spawnSync(adbPath, ["devices", "-l"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });

  if (result.status !== 0 || result.error) {
    return summarizeAndroidDeviceAvailability({
      adbPath,
      adbError: [result.stderr.trim(), result.error?.message ?? ""].filter(Boolean).join("\n"),
    });
  }

  return summarizeAndroidDeviceAvailability({
    adbPath,
    devices: parseAdbDevices(result.stdout),
  });
}

function findAdbPath(): string | null {
  const explicit = process.env.ADB_PATH?.trim();
  if (explicit && existsSync(explicit)) return explicit;

  const fromSdk = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
  ]
    .filter((path): path is string => Boolean(path))
    .flatMap((sdkRoot) => [
      join(sdkRoot, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"),
      join(sdkRoot, "platform-tools", "adb"),
    ])
    .find((candidate) => existsSync(candidate));
  if (fromSdk) return fromSdk;

  return findExecutableOnPath(process.platform === "win32" ? "adb.exe" : "adb");
}

function findExecutableOnPath(executable: string): string | null {
  const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = join(entry, executable);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function renderReport(report: AndroidDevicePreflightReport): string {
  const lines = [
    "Android WebView/device preflight",
    `valid: ${report.valid}`,
    `status: ${report.status}`,
    `adb: ${report.adbPath ?? "not found"}`,
    `devices: ${report.counts.devices} total, ${report.counts.ready} ready`,
  ];

  if (report.devices.length > 0) {
    lines.push("listed devices:");
    for (const device of report.devices) {
      const suffix = device.details ? ` ${device.details}` : "";
      lines.push(`  - ${device.serial}: ${device.state}${suffix}`);
    }
  }

  if (report.blockers.length > 0) {
    lines.push("blockers:");
    lines.push(...report.blockers.map((blocker) => `  - ${blocker}`));
  }

  if (report.followups.length > 0) {
    lines.push("followups:");
    lines.push(...report.followups.map((followup) => `  - ${followup}`));
  }

  return lines.join("\n");
}
