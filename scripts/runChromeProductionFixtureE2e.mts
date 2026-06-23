import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(".");
const packId = "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1";
const modulePath = resolve("src/data/ranges", `${packId}.ts`);
const registryPath = resolve("src/data/ranges/mttProductionRegistry.generated.ts");
const fixtureDist = resolve("dist-e2e-production-fixture");
const fixtureArtifacts = resolve("artifacts/e2e-production-fixture");
const previewPort = 4174;
const npmCommand = process.platform === "win32" ? "cmd.exe" : "npm";
let preview: ChildProcess | null = null;

assertInsideWorkspace(modulePath);
assertInsideWorkspace(registryPath);
assertInsideWorkspace(fixtureDist);
assertInsideWorkspace(fixtureArtifacts);
if (existsSync(modulePath)) {
  throw new Error(`Synthetic fixture refuses to overwrite existing module: ${modulePath}`);
}

const registryBackup = readFileSync(registryPath, "utf8");

try {
  writeFileSync(modulePath, renderFixtureModule(packId), "utf8");
  runNpm(["run", "mtt:refresh-registry", "--", "--write"]);
  runNpm(["run", "build", "--", "--outDir", fixtureDist]);

  preview = spawn(npmCommand, npmArgs([
    "run",
    "preview",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(previewPort),
    "--outDir",
    fixtureDist,
  ]), {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  await waitForUrl(`http://127.0.0.1:${previewPort}/`);

  runNpm(["run", "e2e:chrome"], {
    MTT_E2E_URL: `http://127.0.0.1:${previewPort}/`,
    MTT_E2E_DIST: fixtureDist,
    MTT_E2E_ARTIFACTS: fixtureArtifacts,
    MTT_E2E_EXPECT_PREFLOP: "production",
    MTT_E2E_VIEWPORTS: "desktop",
  });
  console.log("Synthetic production fixture E2E passed.");
} finally {
  stopProcessTree(preview);
  writeFileSync(registryPath, registryBackup, "utf8");
  rmSync(modulePath, { force: true });
  rmSync(fixtureDist, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function renderFixtureModule(id: string): string {
  return [
    "// Synthetic source-free browser fixture. Never ship this module.",
    'import type { RangePack } from "./rangePack";',
    'import { mttPreflopAnteOnRangePack } from "./mttPreflopRangePacks";',
    "",
    "export const browserE2eProductionRangePack = {",
    "  ...mttPreflopAnteOnRangePack,",
    `  "id": ${JSON.stringify(id)},`,
    '  version: "browser-e2e-production-v1",',
    '  createdAt: "2026-06-23",',
    '  verifiedAt: "2026-06-23",',
    '  assumptions: ["Synthetic source-free production routing fixture."],',
    "} satisfies RangePack;",
    "",
  ].join("\n");
}

function runNpm(
  args: readonly string[],
  env: Record<string, string> = {},
): void {
  const result = spawnSync(npmCommand, npmArgs(args), {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): npm ${args.join(" ")}`);
  }
}

function npmArgs(args: readonly string[]): string[] {
  return process.platform === "win32"
    ? ["/d", "/s", "/c", "npm", ...args]
    : [...args];
}

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Preview did not start: ${url}`);
}

function stopProcessTree(processToStop: ChildProcess | null): void {
  if (!processToStop?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(processToStop.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  processToStop.kill("SIGTERM");
}

function assertInsideWorkspace(path: string): void {
  const workspacePrefix = `${root}${sep}`;
  const normalizedPath = process.platform === "win32" ? path.toLowerCase() : path;
  const normalizedPrefix = process.platform === "win32"
    ? workspacePrefix.toLowerCase()
    : workspacePrefix;
  if (!normalizedPath.startsWith(normalizedPrefix)) {
    throw new Error(`Fixture path escapes workspace: ${path}`);
  }
}
