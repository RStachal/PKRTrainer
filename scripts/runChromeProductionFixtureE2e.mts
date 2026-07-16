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
// The current Core preflop pack is deliberately real. This fixture supplements
// only the unshipped FLOP/TURN/RIVER slots, then restores the generated registry.
const packId = "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1";
const flopPackId = "mtt-full-ring-9-regular-flop-chip-ev-ante-on-production-v1";
const turnPackId = "mtt-full-ring-9-regular-turn-chip-ev-ante-on-production-v1";
const riverPackId = "mtt-full-ring-9-regular-river-chip-ev-ante-on-production-v1";
const flopModulePath = resolve("src/data/ranges", `${flopPackId}.ts`);
const turnModulePath = resolve("src/data/ranges", `${turnPackId}.ts`);
const riverModulePath = resolve("src/data/ranges", `${riverPackId}.ts`);
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

assertInsideWorkspace(flopModulePath);
assertInsideWorkspace(turnModulePath);
assertInsideWorkspace(riverModulePath);
assertInsideWorkspace(validationPath);
assertInsideWorkspace(registryPath);
assertInsideWorkspace(fixtureDist);
assertInsideWorkspace(fixtureArtifacts);
if (existsSync(flopModulePath)) {
  throw new Error(`Synthetic fixture refuses to overwrite existing module: ${flopModulePath}`);
}
if (existsSync(turnModulePath)) {
  throw new Error(`Synthetic fixture refuses to overwrite existing module: ${turnModulePath}`);
}
if (existsSync(riverModulePath)) {
  throw new Error(`Synthetic fixture refuses to overwrite existing module: ${riverModulePath}`);
}
if (existsSync(validationPath)) {
  throw new Error(`Synthetic fixture refuses to overwrite validator: ${validationPath}`);
}

const registryBackup = readFileSync(registryPath, "utf8");

try {
  writeFileSync(flopModulePath, renderFlopFixtureModule(flopPackId), "utf8");
  writeFileSync(turnModulePath, renderTurnFixtureModule(turnPackId), "utf8");
  writeFileSync(riverModulePath, renderRiverFixtureModule(riverPackId), "utf8");
  writeFileSync(
    validationPath,
    renderFixtureValidationModule(flopPackId, turnPackId, riverPackId),
    "utf8",
  );
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
    MTT_E2E_EXPECT_TURN_PACK_ID: turnPackId,
    MTT_E2E_EXPECT_RIVER_PACK_ID: riverPackId,
    MTT_E2E_EXPECT_ACTION_EV: "true",
    MTT_E2E_VIEWPORTS: "desktop",
  });
  console.log("Synthetic production fixture E2E passed.");
} finally {
  stopProcessTree(preview);
  writeFileSync(registryPath, registryBackup, "utf8");
  rmSync(flopModulePath, { force: true });
  rmSync(turnModulePath, { force: true });
  rmSync(riverModulePath, { force: true });
  rmSync(validationPath, { force: true });
  rmSync(fixtureDist, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function renderFlopFixtureModule(id: string): string {
  return [
    "// Synthetic source-free browser fixture. Never ship this module.",
    'import { LEGACY_POSTFLOP_POSITION_PATTERNS, type BoardTexture, type PostflopAction, type PostflopPositionPattern, type PostflopPotType } from "../../core/postflopGenerator";',
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
    '      { lane: "VALUE", label: "value", action: "RAISE", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"], actionEvs: actionEvs(["FOLD", "CALL", "RAISE"], ["CALL", "RAISE"]) },',
    '      { lane: "BLUFF", label: "bluff", action: "CALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["draw"], actionEvs: actionEvs(["FOLD", "CALL", "RAISE"], ["CALL", "RAISE"]) },',
    '      { lane: "CHECK", label: "fold", action: "FOLD", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"], actionEvs: actionEvs(["FOLD", "CALL", "RAISE"], ["CALL", "RAISE"]) },',
    "    ],",
    '    explanation: "Synthetic production facing-bet fixture.",',
    "  };",
    "}",
    "",
    "function rangeBuckets(): FlopProductionStrategyRule['rangeBuckets'] {",
    "  return [",
    '    { lane: "VALUE", label: "value", action: "BET_SMALL", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"], actionEvs: actionEvs(["CHECK", "BET_SMALL", "BET_BIG"], ["CHECK", "BET_SMALL"]) },',
    '    { lane: "BLUFF", label: "bluff", action: "BET_SMALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["draw"], actionEvs: actionEvs(["CHECK", "BET_SMALL", "BET_BIG"], ["CHECK", "BET_SMALL"]) },',
    '    { lane: "CHECK", label: "check", action: "CHECK", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"], actionEvs: actionEvs(["CHECK", "BET_SMALL", "BET_BIG"], ["CHECK", "BET_SMALL"]) },',
    "  ];",
    "}",
    "",
    "function actionEvs(actions: readonly PostflopAction[], bestActions: readonly PostflopAction[]) {",
    "  return {",
    '    source: "SOLVER" as const,',
    '    unit: "BB" as const,',
    "    values: actions.map((action) => ({",
    "      action,",
    "      evBb: bestActions.includes(action) ? 2 : 1.8,",
    "    })),",
    "    equivalentThresholdBb: 0.01,",
    "    acceptableThresholdBb: 0.05,",
    "  };",
    "}",
    "",
  ].join("\n");
}

function renderTurnFixtureModule(id: string): string {
  return [
    "// Synthetic source-free browser fixture. Never ship this module.",
    'import { LEGACY_POSTFLOP_POSITION_PATTERNS, type PostflopAction, type PostflopPositionPattern, type PostflopPotType } from "../../core/postflopGenerator";',
    'import { ALL_HAND_CLASSES } from "../../core/poker";',
    "import {",
    "  TURN_PRODUCTION_REQUIRED_CARD_CLASSES,",
    "  TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS,",
    "  TURN_PRODUCTION_REQUIRED_POT_TYPES,",
    "  TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS,",
    '  type TurnProductionStrategyPack,',
    '  type TurnProductionStrategyRule,',
    '} from "./turnProductionStrategyPack";',
    "",
    "const positionPatterns: readonly PostflopPositionPattern[] = [",
    "  ...TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS,",
    "  ...LEGACY_POSTFLOP_POSITION_PATTERNS,",
    "];",
    "const rules: TurnProductionStrategyRule[] = [];",
    "for (const potType of TURN_PRODUCTION_REQUIRED_POT_TYPES) {",
    "  for (const positionPattern of positionPatterns) {",
    "    for (const priorFlopAction of TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS) {",
    '      rules.push(turnRule(potType, positionPattern, priorFlopAction, priorFlopAction === "CALL"));',
    "    }",
    "  }",
    "}",
    "",
    "export const browserE2eTurnProductionPack = {",
    `  "id": ${JSON.stringify(id)},`,
    '  version: "browser-e2e-turn-production-v1",',
    '  createdAt: "2026-06-23", verifiedAt: "2026-06-23", confidence: "MEDIUM",',
    '  licenseKind: "OWNED_SOLVER_EXPORT", licenseNote: "Synthetic browser fixture.",',
    '  dimensions: { gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeeds: ["REGULAR"], street: "TURN", evModel: "CHIP_EV", antes: ["ON"] },',
    "  sourceEvidence: sourceEvidence(),",
    '  assumptions: ["Synthetic source-free TURN routing fixture."],',
    "  rules,",
    "} satisfies TurnProductionStrategyPack;",
    "",
    "function turnRule(",
    '  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,',
    "  positionPattern: PostflopPositionPattern,",
    "  priorFlopAction: PostflopAction,",
    "  facingBet: boolean,",
    "): TurnProductionStrategyRule {",
    '  const actionNode = facingBet ? "TURN_FACING_BET" : "TURN_BARREL";',
    '  const actions = facingBet ? ["FOLD", "CALL", "RAISE"] as const : ["CHECK", "BET_SMALL", "BET_BIG"] as const;',
    '  const recommendedAction = facingBet ? "CALL" : "BET_SMALL";',
    "  return {",
    '    id: `browser-turn-${actionNode}-${potType}-${positionPattern}-${priorFlopAction}`,',
    "    actionNode, potType, positionPattern, priorFlopAction,",
    "    turnCardClasses: TURN_PRODUCTION_REQUIRED_CARD_CLASSES,",
    "    sprMin: 0, sprMax: 20, actions, recommendedAction,",
    "    rangeBuckets: rangeBuckets(facingBet),",
    '    explanation: "Synthetic production turn fixture.",',
    "  };",
    "}",
    "",
    "function rangeBuckets(facingBet: boolean): TurnProductionStrategyRule['rangeBuckets'] {",
    "  return facingBet ? [",
    '    { lane: "VALUE", label: "value", action: "RAISE", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"] },',
    '    { lane: "BLUFF", label: "bluff", action: "CALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["draw"] },',
    '    { lane: "CHECK", label: "fold", action: "FOLD", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"] },',
    "  ] : [",
    '    { lane: "VALUE", label: "value", action: "BET_SMALL", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"] },',
    '    { lane: "BLUFF", label: "bluff", action: "BET_SMALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["draw"] },',
    '    { lane: "CHECK", label: "check", action: "CHECK", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"] },',
    "  ];",
    "}",
    "",
    "function sourceEvidence(): TurnProductionStrategyPack['sourceEvidence'] {",
    "  return [",
    '    { url: "https://example.test/browser-turn-owned", verifiedAt: "2026-06-23", operator: "PKRTrainer Browser Fixture", gameVariant: "MTT", tableFormat: "FULL_RING_9", street: "TURN", evModel: "CHIP_EV", methodology: "Synthetic source-free browser production fixture.", licenseNote: "Owned synthetic fixture." },',
    '    { url: "https://example.test/browser-turn-review", verifiedAt: "2026-06-23", operator: "PKRTrainer Browser Review", gameVariant: "MTT", tableFormat: "FULL_RING_9", street: "TURN", evModel: "CHIP_EV", methodology: "Independent synthetic fixture review.", licenseNote: "Synthetic review fixture." },',
    "  ];",
    "}",
    "",
  ].join("\n");
}

function renderRiverFixtureModule(id: string): string {
  return [
    "// Synthetic source-free browser fixture. Never ship this module.",
    'import { LEGACY_POSTFLOP_POSITION_PATTERNS, type PostflopAction, type PostflopPositionPattern, type PostflopPotType } from "../../core/postflopGenerator";',
    'import { ALL_HAND_CLASSES } from "../../core/poker";',
    "import {",
    "  RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE,",
    "  RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS,",
    "  RIVER_PRODUCTION_REQUIRED_POT_TYPES,",
    "  RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS,",
    "  RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES,",
    '  type RiverProductionBlockerRelevance,',
    '  type RiverProductionStrategyPack,',
    '  type RiverProductionStrategyRule,',
    '} from "./riverProductionStrategyPack";',
    "",
    "const positionPatterns: readonly PostflopPositionPattern[] = [",
    "  ...RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS,",
    "  ...LEGACY_POSTFLOP_POSITION_PATTERNS,",
    "];",
    "const rules: RiverProductionStrategyRule[] = [];",
    "for (const potType of RIVER_PRODUCTION_REQUIRED_POT_TYPES) {",
    "  for (const positionPattern of positionPatterns) {",
    "    for (const [actionIndex, priorTurnAction] of RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS.entries()) {",
    "      const relevance = RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE[",
    "        actionIndex % RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE.length",
    "      ];",
    '      rules.push(riverRule(potType, positionPattern, priorTurnAction, relevance, priorTurnAction === "CALL"));',
    "    }",
    "  }",
    "}",
    "",
    "export const browserE2eRiverProductionPack = {",
    `  "id": ${JSON.stringify(id)},`,
    '  version: "browser-e2e-river-production-v1",',
    '  createdAt: "2026-06-23", verifiedAt: "2026-06-23", confidence: "MEDIUM",',
    '  licenseKind: "OWNED_SOLVER_EXPORT", licenseNote: "Synthetic browser fixture.",',
    '  dimensions: { gameVariant: "MTT", tableFormat: "FULL_RING_9", blindSpeeds: ["REGULAR"], street: "RIVER", evModel: "CHIP_EV", antes: ["ON"] },',
    "  sourceEvidence: sourceEvidence(),",
    '  assumptions: ["Synthetic source-free RIVER routing fixture."],',
    "  rules,",
    "} satisfies RiverProductionStrategyPack;",
    "",
    "function riverRule(",
    '  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,',
    "  positionPattern: PostflopPositionPattern,",
    "  priorTurnAction: PostflopAction,",
    "  blockerRelevance: RiverProductionBlockerRelevance,",
    "  facingBet: boolean,",
    "): RiverProductionStrategyRule {",
    '  const actionNode = facingBet ? "RIVER_FACING_BET" : "RIVER_PRESSURE";',
    '  const actions = facingBet ? ["FOLD", "CALL", "RAISE"] as const : ["CHECK", "BET_SMALL", "BET_BIG"] as const;',
    '  const recommendedAction = facingBet ? "CALL" : "BET_BIG";',
    "  return {",
    '    id: `browser-river-${actionNode}-${potType}-${positionPattern}-${priorTurnAction}`,',
    "    actionNode, potType, positionPattern, priorTurnAction,",
    "    riverRunoutClasses: RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES, blockerRelevance,",
    "    sprMin: 0, sprMax: 20, actions, recommendedAction,",
    "    rangeBuckets: rangeBuckets(facingBet, blockerRelevance),",
    '    explanation: "Synthetic production river fixture.",',
    "  };",
    "}",
    "",
    "function rangeBuckets(",
    "  facingBet: boolean,",
    "  blockerRelevance: RiverProductionBlockerRelevance,",
    "): RiverProductionStrategyRule['rangeBuckets'] {",
    "  return facingBet ? [",
    '    { lane: "VALUE", label: "value", action: "RAISE", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"], blockerRelevance: "LOW" },',
    '    { lane: "BLUFF", label: "bluff", action: "CALL", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["blocker"], blockerRelevance },',
    '    { lane: "CHECK", label: "fold", action: "FOLD", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"], blockerRelevance: "LOW" },',
    "  ] : [",
    '    { lane: "VALUE", label: "value", action: "BET_BIG", handClasses: ALL_HAND_CLASSES.slice(0, 57), features: ["value"], blockerRelevance: "LOW" },',
    '    { lane: "BLUFF", label: "bluff", action: "BET_BIG", handClasses: ALL_HAND_CLASSES.slice(57, 113), features: ["blocker"], blockerRelevance },',
    '    { lane: "CHECK", label: "check", action: "CHECK", handClasses: ALL_HAND_CLASSES.slice(113), features: ["air"], blockerRelevance: "LOW" },',
    "  ];",
    "}",
    "",
    "function sourceEvidence(): RiverProductionStrategyPack['sourceEvidence'] {",
    "  return [",
    '    { url: "https://example.test/browser-river-owned", verifiedAt: "2026-06-23", operator: "PKRTrainer Browser Fixture", gameVariant: "MTT", tableFormat: "FULL_RING_9", street: "RIVER", evModel: "CHIP_EV", methodology: "Synthetic source-free browser production fixture.", licenseNote: "Owned synthetic fixture." },',
    '    { url: "https://example.test/browser-river-review", verifiedAt: "2026-06-23", operator: "PKRTrainer Browser Review", gameVariant: "MTT", tableFormat: "FULL_RING_9", street: "RIVER", evModel: "CHIP_EV", methodology: "Independent synthetic fixture review.", licenseNote: "Synthetic review fixture." },',
    "  ];",
    "}",
    "",
  ].join("\n");
}

function renderFixtureValidationModule(
  flopId: string,
  turnId: string,
  riverId: string,
): string {
  return [
    `import { browserE2eFlopProductionPack } from "../src/data/ranges/${flopId}";`,
    `import { browserE2eTurnProductionPack } from "../src/data/ranges/${turnId}";`,
    `import { browserE2eRiverProductionPack } from "../src/data/ranges/${riverId}";`,
    'import { buildFlopProductionCoverageReport } from "../src/data/ranges/flopProductionStrategyPack";',
    'import { buildTurnProductionCoverageReport } from "../src/data/ranges/turnProductionStrategyPack";',
    'import { buildRiverProductionCoverageReport } from "../src/data/ranges/riverProductionStrategyPack";',
    "",
    "const reports = [",
    '  ["FLOP", buildFlopProductionCoverageReport(browserE2eFlopProductionPack)],',
    '  ["TURN", buildTurnProductionCoverageReport(browserE2eTurnProductionPack)],',
    '  ["RIVER", buildRiverProductionCoverageReport(browserE2eRiverProductionPack)],',
    "] as const;",
    "for (const [street, report] of reports) {",
    "  if (!report.productionReady) {",
    '    throw new Error(`Invalid browser ${street} fixture:\\n${report.errors.join("\\n")}`);',
    "  }",
    "}",
    'console.log("Synthetic FLOP/TURN/RIVER production fixture validation passed.");',
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
