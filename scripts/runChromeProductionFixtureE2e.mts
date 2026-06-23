import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { resolve, sep } from "node:path";

const root = resolve(".");
const packId = "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1";
const flopPackId = "mtt-full-ring-9-regular-flop-chip-ev-ante-on-production-v1";
const modulePath = resolve("src/data/ranges", `${packId}.ts`);
const flopModulePath = resolve("src/data/ranges", `${flopPackId}.ts`);
const validationPath = resolve("scripts/.mtt-production-fixture-validation.mts");
const registryPath = resolve("src/data/ranges/mttProductionRegistry.generated.ts");
const fixtureDist = resolve("dist-e2e-production-fixture");
const fixtureArtifacts = resolve("artifacts/e2e-production-fixture");
const previewPort = await findAvailablePort();
const nodeExecutable = process.execPath;
const viteNodeCli = resolve("node_modules/vite-node/vite-node.mjs");
const viteCli = resolve("node_modules/vite/bin/vite.js");
const tscCli = resolve("node_modules/typescript/bin/tsc");
let preview: ChildProcess | null = null;

assertInsideWorkspace(modulePath);
assertInsideWorkspace(flopModulePath);
assertInsideWorkspace(validationPath);
assertInsideWorkspace(registryPath);
assertInsideWorkspace(fixtureDist);
assertInsideWorkspace(fixtureArtifacts);
if (existsSync(modulePath)) {
  throw new Error(`Synthetic fixture refuses to overwrite existing module: ${modulePath}`);
}
if (existsSync(flopModulePath)) {
  throw new Error(`Synthetic fixture refuses to overwrite existing module: ${flopModulePath}`);
}
if (existsSync(validationPath)) {
  throw new Error(`Synthetic fixture refuses to overwrite validator: ${validationPath}`);
}

const registryBackup = readFileSync(registryPath, "utf8");

try {
  writeFileSync(modulePath, renderFixtureModule(packId), "utf8");
  writeFileSync(flopModulePath, renderFlopFixtureModule(flopPackId), "utf8");
  writeFileSync(validationPath, renderFixtureValidationModule(flopPackId), "utf8");
  runNode([viteNodeCli, "scripts/refreshMttProductionRegistry.mts", "--write"]);
  runNode([viteNodeCli, validationPath]);
  runNode([tscCli, "--noEmit"]);
  runNode([viteCli, "build", "--outDir", fixtureDist]);

  preview = spawn(nodeExecutable, [
    viteCli,
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(previewPort),
    "--strictPort",
    "--outDir",
    fixtureDist,
  ], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  await waitForUrl(`http://127.0.0.1:${previewPort}/`);

  runNode([viteNodeCli, "scripts/runChromeE2e.mts"], {
    MTT_E2E_URL: `http://127.0.0.1:${previewPort}/`,
    MTT_E2E_DIST: fixtureDist,
    MTT_E2E_ARTIFACTS: fixtureArtifacts,
    MTT_E2E_EXPECT_PREFLOP: "production",
    MTT_E2E_EXPECT_POSTFLOP_PACK_ID: flopPackId,
    MTT_E2E_VIEWPORTS: "desktop",
  });
  console.log("Synthetic production fixture E2E passed.");
} finally {
  stopProcessTree(preview);
  writeFileSync(registryPath, registryBackup, "utf8");
  rmSync(modulePath, { force: true });
  rmSync(flopModulePath, { force: true });
  rmSync(validationPath, { force: true });
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

function renderFlopFixtureModule(id: string): string {
  return [
    "// Synthetic source-free browser fixture. Never ship this module.",
    'import { LEGACY_POSTFLOP_POSITION_PATTERNS, type BoardTexture, type PostflopPositionPattern, type PostflopPotType } from "../../core/postflopGenerator";',
    'import { ALL_HAND_CLASSES } from "../../core/poker";',
    "import {",
    "  FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS,",
    "  FLOP_PRODUCTION_REQUIRED_POT_TYPES,",
    "  FLOP_PRODUCTION_REQUIRED_TEXTURES,",
    '  type FlopProductionStrategyPack,',
    '  type FlopProductionStrategyRule,',
    '} from "./flopProductionStrategyPack";',
    "",
    "const positionPatterns: readonly PostflopPositionPattern[] = [",
    "  ...FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS,",
    "  ...LEGACY_POSTFLOP_POSITION_PATTERNS,",
    "];",
    "const rules: FlopProductionStrategyRule[] = [];",
    "for (const potType of FLOP_PRODUCTION_REQUIRED_POT_TYPES) {",
    "  for (const positionPattern of positionPatterns) {",
    "    for (const texture of FLOP_PRODUCTION_REQUIRED_TEXTURES) {",
    "      rules.push(cbetRule(potType, positionPattern, texture));",
    "      rules.push(facingBetRule(potType, positionPattern, texture));",
    "    }",
    "  }",
    "}",
    "",
    "export const browserE2eFlopProductionPack = {",
    `  "id": ${JSON.stringify(id)},`,
    '  version: "browser-e2e-flop-production-v1",',
    '  createdAt: "2026-06-23",',
    '  verifiedAt: "2026-06-23",',
    '  confidence: "MEDIUM",',
    '  licenseKind: "OWNED_SOLVER_EXPORT",',
    '  licenseNote: "Synthetic browser fixture.",',
    "  dimensions: {",
    '    gameVariant: "MTT",',
    '    tableFormat: "FULL_RING_9",',
    '    blindSpeeds: ["REGULAR"],',
    '    street: "FLOP",',
    '    evModel: "CHIP_EV",',
    '    antes: ["ON"],',
    "  },",
    "  sourceEvidence: [",
    "    {",
    '      url: "https://example.test/browser-flop-owned",',
    '      verifiedAt: "2026-06-23",',
    '      operator: "PKRTrainer Browser Fixture",',
    '      gameVariant: "MTT",',
    '      tableFormat: "FULL_RING_9",',
    '      street: "FLOP",',
    '      evModel: "CHIP_EV",',
    '      methodology: "Synthetic source-free browser production fixture.",',
    '      licenseNote: "Owned synthetic fixture.",',
    "    },",
    "    {",
    '      url: "https://example.test/browser-flop-review",',
    '      verifiedAt: "2026-06-23",',
    '      operator: "PKRTrainer Browser Review",',
    '      gameVariant: "MTT",',
    '      tableFormat: "FULL_RING_9",',
    '      street: "FLOP",',
    '      evModel: "CHIP_EV",',
    '      methodology: "Independent synthetic fixture review.",',
    '      licenseNote: "Synthetic review fixture.",',
    "    },",
    "  ],",
    '  assumptions: ["Synthetic source-free FLOP routing fixture."],',
    "  rules,",
    "} satisfies FlopProductionStrategyPack;",
    "",
    "function cbetRule(",
    '  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,',
    "  positionPattern: PostflopPositionPattern,",
    "  texture: BoardTexture,",
    "): FlopProductionStrategyRule {",
    '  const actionNode = potType === "SINGLE_RAISED"',
    '    ? "SINGLE_RAISED_POT_CBET"',
    '    : "THREE_BET_POT_CBET";',
    "  return {",
    '    id: `browser-cbet-${potType}-${positionPattern}-${texture}`,',
    "    actionNode, potType, positionPattern, boardTextures: [texture],",
    "    sprMin: 1, sprMax: 12,",
    '    actions: ["CHECK", "BET_SMALL", "BET_BIG"],',
    '    recommendedAction: "BET_SMALL",',
    "    rangeBuckets: rangeBuckets(),",
    '    explanation: "Synthetic production c-bet fixture.",',
    "  };",
    "}",
    "",
    "function facingBetRule(",
    '  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,',
    "  positionPattern: PostflopPositionPattern,",
    "  texture: BoardTexture,",
    "): FlopProductionStrategyRule {",
    "  return {",
    '    id: `browser-facing-${potType}-${positionPattern}-${texture}`,',
    '    actionNode: "FLOP_FACING_BET",',
    "    potType, positionPattern, boardTextures: [texture],",
    "    sprMin: 1, sprMax: 12,",
    '    actions: ["FOLD", "CALL", "RAISE"],',
    '    recommendedAction: "CALL",',
    "    rangeBuckets: [",
    '      { lane: "VALUE", label: "value", action: "RAISE", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"] },',
    '      { lane: "BLUFF", label: "bluff", action: "CALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["draw"] },',
    '      { lane: "CHECK", label: "fold", action: "FOLD", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"] },',
    "    ],",
    '    explanation: "Synthetic production facing-bet fixture.",',
    "  };",
    "}",
    "",
    "function rangeBuckets(): FlopProductionStrategyRule['rangeBuckets'] {",
    "  return [",
    '    { lane: "VALUE", label: "value", action: "BET_SMALL", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"] },',
    '    { lane: "BLUFF", label: "bluff", action: "BET_SMALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["draw"] },',
    '    { lane: "CHECK", label: "check", action: "CHECK", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"] },',
    "  ];",
    "}",
    "",
  ].join("\n");
}

function renderFixtureValidationModule(id: string): string {
  return [
    `import { browserE2eFlopProductionPack } from "../src/data/ranges/${id}";`,
    'import { buildFlopProductionCoverageReport } from "../src/data/ranges/flopProductionStrategyPack";',
    "",
    "const report = buildFlopProductionCoverageReport(browserE2eFlopProductionPack);",
    "if (!report.productionReady) {",
    '  throw new Error(`Invalid browser FLOP fixture:\\n${report.errors.join("\\n")}`);',
    "}",
    'console.log("Synthetic FLOP production fixture validation passed.");',
    "",
  ].join("\n");
}

async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a fixture preview port."));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

function runNode(
  args: readonly string[],
  env: Record<string, string> = {},
): void {
  const result = spawnSync(nodeExecutable, [...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): node ${args.join(" ")}`);
  }
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
