import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { ALL_HAND_CLASSES } from "../../src/core/poker";
import {
  STACK_BUCKETS,
  type ActionContext,
  type ActionKey,
  type HandLabel,
  type Position,
} from "../../src/core/types";
import type {
  BoardTexture,
  PostflopPositionPattern,
  PostflopPotType,
} from "../../src/core/postflopGenerator";
import {
  FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  FLOP_PRODUCTION_REQUIRED_POT_TYPES,
  FLOP_PRODUCTION_REQUIRED_TEXTURES,
  type FlopProductionStrategyPack,
  type FlopProductionStrategyRule,
} from "../../src/data/ranges/flopProductionStrategyPack";
import {
  TURN_PRODUCTION_REQUIRED_CARD_CLASSES,
  TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  TURN_PRODUCTION_REQUIRED_POT_TYPES,
  TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS,
  type TurnProductionStrategyPack,
  type TurnProductionStrategyRule,
  type TurnProductionTurnCardClass,
} from "../../src/data/ranges/turnProductionStrategyPack";
import {
  RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE,
  RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS,
  RIVER_PRODUCTION_REQUIRED_POT_TYPES,
  RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS,
  RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES,
  type RiverProductionBlockerRelevance,
  type RiverProductionRunoutClass,
  type RiverProductionStrategyPack,
  type RiverProductionStrategyRule,
} from "../../src/data/ranges/riverProductionStrategyPack";
import type { MttPreflopRangePackImportInput } from "../../src/data/ranges/mttPreflopRangePackImport";
import type { ProductionPermissionManifest } from "../../src/data/ranges/productionPermissionManifest";

const ACTION_CONTEXTS: readonly ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

const FULL_RING_POSITIONS: readonly Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];

const PRIMARY_ACTION_BY_CONTEXT: Record<ActionContext, ActionKey> = {
  RFI: "OPEN_2X",
  VS_LIMP: "ISO_3X",
  VS_OPEN: "3BET",
  VS_3BET: "4BET",
  VS_4BET: "CALL_JAM",
  SQUEEZE: "SQUEEZE",
  BVB: "OPEN_2X",
  PUSH_FOLD: "JAM",
  VS_ALLIN: "CALL_JAM",
};

function handMap(action: ActionKey): Record<HandLabel, ActionKey[]> {
  const out = {} as Record<HandLabel, ActionKey[]>;
  for (const hand of ALL_HAND_CLASSES) out[hand] = [hand === "AA" ? action : "FOLD"];
  return out;
}

function validMttImport(): MttPreflopRangePackImportInput {
  return {
    id: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1",
    version: "cli-fixture-v1",
    createdAt: "2026-06-05",
    verifiedAt: "2026-06-05",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned solver export fixture; no third-party chart values copied.",
    assumptions: [
      "MTT full-ring chipEV turbo fixture.",
      "Ante ON big blind ante structure.",
      "Source stacks map directly to PKRTrainer stack buckets.",
    ],
    searchQueries: [
      "MTT 9max turbo chipEV import validation",
      "full ring turbo ante stack mapping",
      "legal owned solver export poker ranges",
    ],
    sourceEvidence: [
      {
        title: "Owned solver export manifest",
        url: "https://example.test/owned-export",
        provider: "PKRTrainer",
        verifiedAt: "2026-06-05",
        licenseNote: "Owned export fixture.",
      },
      {
        title: "Independent review notes",
        url: "https://example.test/review",
        provider: "PKRTrainer Review",
        verifiedAt: "2026-06-05",
        licenseNote: "Review fixture.",
      },
    ],
    records: STACK_BUCKETS.map((bucket, index) => {
      const context = ACTION_CONTEXTS[index % ACTION_CONTEXTS.length];
      return {
        position: FULL_RING_POSITIONS[index % FULL_RING_POSITIONS.length],
        sourceStackBB: bucket,
        bucket,
        context,
        strict: handMap(PRIMARY_ACTION_BY_CONTEXT[context]),
        lenient: handMap(PRIMARY_ACTION_BY_CONTEXT[context]),
      };
    }),
  };
}

function flopRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  texture: BoardTexture,
): FlopProductionStrategyRule {
  const actionNode = potType === "SINGLE_RAISED"
    ? "SINGLE_RAISED_POT_CBET"
    : "THREE_BET_POT_CBET";
  return {
    id: `cli-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${texture}`,
    actionNode,
    potType,
    positionPattern,
    boardTextures: [texture],
    sprMin: 1,
    sprMax: 12,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    recommendedAction: "BET_SMALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value",
        action: "BET_SMALL",
        handClasses: ["AA", "AKs"],
        features: ["top pair+"],
      },
      {
        lane: "BLUFF",
        label: "bluff",
        action: "BET_SMALL",
        handClasses: ["QJs", "JTs"],
        features: ["draw"],
      },
      {
        lane: "CHECK",
        label: "check",
        action: "CHECK",
        handClasses: ["72o", "83o"],
        features: ["air"],
      },
    ],
    explanation: "CLI production fixture rule.",
  };
}

function flopFacingBetRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  texture: BoardTexture,
): FlopProductionStrategyRule {
  return {
    id: `cli-facing-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${texture}`,
    actionNode: "FLOP_FACING_BET",
    potType,
    positionPattern,
    boardTextures: [texture],
    sprMin: 1,
    sprMax: 12,
    actions: ["FOLD", "CALL", "RAISE"],
    recommendedAction: "CALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value continue",
        action: "RAISE",
        handClasses: ["AA", "AKs"],
        features: ["top pair+"],
      },
      {
        lane: "BLUFF",
        label: "bluff raise",
        action: "RAISE",
        handClasses: ["QJs", "JTs"],
        features: ["draw"],
      },
      {
        lane: "CHECK",
        label: "fold lane",
        action: "FOLD",
        handClasses: ["72o", "83o"],
        features: ["air"],
      },
    ],
    explanation: "CLI production facing-bet fixture rule.",
  };
}

function validFlopProductionPack(): FlopProductionStrategyPack {
  const rules: FlopProductionStrategyRule[] = [];
  for (const potType of FLOP_PRODUCTION_REQUIRED_POT_TYPES) {
    for (const positionPattern of FLOP_PRODUCTION_REQUIRED_POSITION_PATTERNS) {
      for (const texture of FLOP_PRODUCTION_REQUIRED_TEXTURES) {
        rules.push(flopRule(potType, positionPattern, texture));
        rules.push(flopFacingBetRule(potType, positionPattern, texture));
      }
    }
  }

  return {
    id: "mtt-full-ring-9-flop-production-cli-fixture-v1",
    version: "cli-fixture-v1",
    createdAt: "2026-06-05",
    verifiedAt: "2026-06-05",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned solver export fixture; no third-party chart values copied.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence: [
      {
        url: "https://example.test/flop-owned-export",
        verifiedAt: "2026-06-05",
        operator: "PKRTrainer",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Owned solver export fixture.",
        licenseNote: "Owned export fixture.",
      },
      {
        url: "https://example.test/flop-review",
        verifiedAt: "2026-06-05",
        operator: "PKRTrainer Review",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Independent review fixture.",
        licenseNote: "Review fixture.",
      },
    ],
    assumptions: [
      "MTT full-ring flop chipEV CLI fixture.",
      "SRP and 3bet pot coverage are intentionally complete for CLI smoke testing.",
    ],
    rules,
  };
}

function turnRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  priorFlopAction: "CHECK" | "BET_SMALL" | "BET_BIG",
  turnCardClass: TurnProductionTurnCardClass,
): TurnProductionStrategyRule {
  return {
    id: `cli-turn-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${priorFlopAction.toLowerCase()}-${turnCardClass.toLowerCase()}`,
    actionNode: "TURN_BARREL",
    potType,
    positionPattern,
    priorFlopAction,
    turnCardClasses: [turnCardClass],
    sprMin: 1,
    sprMax: 10,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    recommendedAction: turnCardClass === "DYNAMIC" ? "CHECK" : "BET_SMALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value",
        action: "BET_SMALL",
        handClasses: ["AA", "AKs"],
        features: ["top pair+"],
      },
      {
        lane: "BLUFF",
        label: "bluff",
        action: "BET_SMALL",
        handClasses: ["QJs", "JTs"],
        features: ["draw"],
      },
      {
        lane: "CHECK",
        label: "check",
        action: "CHECK",
        handClasses: ["72o", "83o"],
        features: ["air"],
      },
    ],
    explanation: "CLI turn production fixture rule.",
  };
}

function turnFacingBetRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  priorFlopAction: "CHECK" | "BET_SMALL" | "BET_BIG",
  turnCardClass: TurnProductionTurnCardClass,
): TurnProductionStrategyRule {
  return {
    id: `cli-turn-facing-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${priorFlopAction.toLowerCase()}-${turnCardClass.toLowerCase()}`,
    actionNode: "TURN_FACING_BET",
    potType,
    positionPattern,
    priorFlopAction,
    turnCardClasses: [turnCardClass],
    sprMin: 1,
    sprMax: 10,
    actions: ["FOLD", "CALL", "RAISE"],
    recommendedAction: "CALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value continue",
        action: "RAISE",
        handClasses: ["AA", "AKs"],
        features: ["top pair+"],
      },
      {
        lane: "BLUFF",
        label: "bluff raise",
        action: "RAISE",
        handClasses: ["QJs", "JTs"],
        features: ["draw"],
      },
      {
        lane: "CHECK",
        label: "fold lane",
        action: "FOLD",
        handClasses: ["72o", "83o"],
        features: ["air"],
      },
    ],
    explanation: "CLI turn facing-bet production fixture rule.",
  };
}

function validTurnProductionPack(): TurnProductionStrategyPack {
  const rules: TurnProductionStrategyRule[] = [];
  for (const potType of TURN_PRODUCTION_REQUIRED_POT_TYPES) {
    for (const positionPattern of TURN_PRODUCTION_REQUIRED_POSITION_PATTERNS) {
      for (const priorFlopAction of TURN_PRODUCTION_REQUIRED_PRIOR_FLOP_ACTIONS) {
        for (const turnCardClass of TURN_PRODUCTION_REQUIRED_CARD_CLASSES) {
          rules.push(turnRule(potType, positionPattern, priorFlopAction, turnCardClass));
          rules.push(turnFacingBetRule(potType, positionPattern, priorFlopAction, turnCardClass));
        }
      }
    }
  }

  return {
    id: "mtt-full-ring-9-turn-production-cli-fixture-v1",
    version: "cli-fixture-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned solver export fixture; no third-party chart values copied.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "TURN",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence: [
      {
        url: "https://example.test/turn-owned-export",
        verifiedAt: "2026-06-11",
        operator: "PKRTrainer",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "TURN",
        evModel: "CHIP_EV",
        methodology: "Owned solver export fixture.",
        licenseNote: "Owned export fixture.",
      },
      {
        url: "https://example.test/turn-review",
        verifiedAt: "2026-06-11",
        operator: "PKRTrainer Review",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "TURN",
        evModel: "CHIP_EV",
        methodology: "Independent review fixture.",
        licenseNote: "Review fixture.",
      },
    ],
    assumptions: [
      "MTT full-ring turn chipEV CLI fixture.",
      "Turn fixture covers pot types, positions, prior flop actions and turn card classes.",
    ],
    rules,
  };
}

function riverRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  priorTurnAction: "CHECK" | "BET_SMALL" | "BET_BIG",
  runoutClass: RiverProductionRunoutClass,
  blockerRelevance: RiverProductionBlockerRelevance,
): RiverProductionStrategyRule {
  return {
    id: `cli-river-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${priorTurnAction.toLowerCase()}-${runoutClass.toLowerCase()}-${blockerRelevance.toLowerCase()}`,
    actionNode: "RIVER_PRESSURE",
    potType,
    positionPattern,
    priorTurnAction,
    riverRunoutClasses: [runoutClass],
    blockerRelevance,
    sprMin: 0.5,
    sprMax: 8,
    actions: ["CHECK", "BET_SMALL", "BET_BIG"],
    recommendedAction: blockerRelevance === "HIGH" ? "BET_BIG" : "BET_SMALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value",
        action: blockerRelevance === "HIGH" ? "BET_BIG" : "BET_SMALL",
        handClasses: ["AA", "AKs"],
        features: ["top value"],
        blockerRelevance: "LOW",
      },
      {
        lane: "BLUFF",
        label: "bluff",
        action: blockerRelevance === "HIGH" ? "BET_BIG" : "BET_SMALL",
        handClasses: ["QJs", "JTs"],
        features: ["blocker candidate"],
        blockerRelevance,
      },
      {
        lane: "CHECK",
        label: "check",
        action: "CHECK",
        handClasses: ["72o", "83o"],
        features: ["showdown or give up"],
        blockerRelevance: "LOW",
      },
    ],
    explanation: "CLI river production fixture rule.",
  };
}

function riverFacingBetRule(
  potType: Extract<PostflopPotType, "SINGLE_RAISED" | "THREE_BET_POT">,
  positionPattern: PostflopPositionPattern,
  priorTurnAction: "CHECK" | "BET_SMALL" | "BET_BIG",
  runoutClass: RiverProductionRunoutClass,
  blockerRelevance: RiverProductionBlockerRelevance,
): RiverProductionStrategyRule {
  return {
    id: `cli-river-facing-${potType.toLowerCase()}-${positionPattern.toLowerCase()}-${priorTurnAction.toLowerCase()}-${runoutClass.toLowerCase()}-${blockerRelevance.toLowerCase()}`,
    actionNode: "RIVER_FACING_BET",
    potType,
    positionPattern,
    priorTurnAction,
    riverRunoutClasses: [runoutClass],
    blockerRelevance,
    sprMin: 0.5,
    sprMax: 8,
    actions: ["FOLD", "CALL", "RAISE"],
    recommendedAction: "CALL",
    rangeBuckets: [
      {
        lane: "VALUE",
        label: "value continue",
        action: "RAISE",
        handClasses: ["AA", "AKs"],
        features: ["top value"],
        blockerRelevance: "LOW",
      },
      {
        lane: "BLUFF",
        label: "bluff raise",
        action: "RAISE",
        handClasses: ["QJs", "JTs"],
        features: ["blocker candidate"],
        blockerRelevance,
      },
      {
        lane: "CHECK",
        label: "fold lane",
        action: "FOLD",
        handClasses: ["72o", "83o"],
        features: ["showdown or give up"],
        blockerRelevance: "LOW",
      },
    ],
    explanation: "CLI river facing-bet production fixture rule.",
  };
}

function validRiverProductionPack(): RiverProductionStrategyPack {
  const rules: RiverProductionStrategyRule[] = [];
  for (const potType of RIVER_PRODUCTION_REQUIRED_POT_TYPES) {
    for (const positionPattern of RIVER_PRODUCTION_REQUIRED_POSITION_PATTERNS) {
      for (const priorTurnAction of RIVER_PRODUCTION_REQUIRED_PRIOR_TURN_ACTIONS) {
        for (const runoutClass of RIVER_PRODUCTION_REQUIRED_RUNOUT_CLASSES) {
          for (const blockerRelevance of RIVER_PRODUCTION_REQUIRED_BLOCKER_RELEVANCE) {
            rules.push(riverRule(potType, positionPattern, priorTurnAction, runoutClass, blockerRelevance));
            rules.push(riverFacingBetRule(
              potType,
              positionPattern,
              priorTurnAction,
              runoutClass,
              blockerRelevance,
            ));
          }
        }
      }
    }
  }

  return {
    id: "mtt-full-ring-9-river-production-cli-fixture-v1",
    version: "cli-fixture-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Owned solver export fixture; no third-party chart values copied.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "RIVER",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence: [
      {
        url: "https://example.test/river-owned-export",
        verifiedAt: "2026-06-11",
        operator: "PKRTrainer",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "RIVER",
        evModel: "CHIP_EV",
        methodology: "Owned solver export fixture.",
        licenseNote: "Owned export fixture.",
      },
      {
        url: "https://example.test/river-review",
        verifiedAt: "2026-06-11",
        operator: "PKRTrainer Review",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "RIVER",
        evModel: "CHIP_EV",
        methodology: "Independent review fixture.",
        licenseNote: "Review fixture.",
      },
    ],
    assumptions: [
      "MTT full-ring river chipEV CLI fixture.",
      "River fixture covers pot types, positions, prior turn actions, runout classes and blocker relevance.",
    ],
    rules,
  };
}

function validPermissionManifest(packId: string): ProductionPermissionManifest {
  return {
    packId,
    version: "permission-fixture-v1",
    reviewedAt: "2026-06-05",
    reviewer: "PKRTrainer QA",
    rightsOwner: "PKRTrainer synthetic fixture",
    licenseKind: "OWNED_SOLVER_EXPORT",
    allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
    sourceMaterialLocation: "Agents/range-intake/raw/synthetic-fixture/",
    evidence: [
      {
        referenceId: "owned-export-manifest",
        storedAt: "Agents/range-intake/raw/synthetic-fixture/manifest.txt",
        reviewer: "PKRTrainer QA",
        description: "Synthetic owned export fixture.",
        containsRangeValues: true,
      },
    ],
    notes: [
      "No third-party chart values copied.",
    ],
    reusePolicy: {
      allowedDimensions: ["BLIND_SPEED"],
      reviewedAt: "2026-06-05",
      reviewer: "PKRTrainer QA",
      rationale: "Synthetic owned export fixture is reviewed for reuse across supported blind speeds.",
      sourceMaterialReferenceIds: ["owned-export-manifest"],
    },
  };
}

function runImportCli(
  kind: "mtt-preflop" | "flop-production" | "turn-production" | "river-production",
  file: string,
  permissionManifest?: string,
  extraArgs: readonly string[] = [],
) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const cliArgs = permissionManifest
    ? [`--kind=${kind}`, "--permission-manifest", permissionManifest, ...extraArgs, file]
    : [`--kind=${kind}`, ...extraArgs, file];
  const args = process.platform === "win32"
    ? ["/c", "npm", "run", "validate:range-import", "--", ...cliArgs]
    : ["run", "validate:range-import", "--", ...cliArgs];

  return spawnSync(
    command,
    args,
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 60000,
    },
  );
}

describe("range import CLI", () => {
  it("vrati exit 0 pro production-ready MTT preflop import fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "valid.json");
      const input = validMttImport();
      const manifestFile = join(dir, "permission.json");
      writeFileSync(file, JSON.stringify(input), "utf8");
      writeFileSync(manifestFile, JSON.stringify(validPermissionManifest(input.id)), "utf8");

      const result = runImportCli("mtt-preflop", file, manifestFile);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("productionReady: true");
      expect(result.stdout).toContain("legal import slot: true");
      expect(result.stdout).toContain("FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON");
      expect(result.stdout).toContain("permissionReady: true");
      expect(result.stdout).toContain("missing positions: none");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("umi vypsat production-ready MTT preflop import jako JSON pro tooling", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "valid.json");
      const input = validMttImport();
      const manifestFile = join(dir, "permission.json");
      writeFileSync(file, JSON.stringify(input), "utf8");
      writeFileSync(manifestFile, JSON.stringify(validPermissionManifest(input.id)), "utf8");

      const result = runImportCli("mtt-preflop", file, manifestFile, ["--json"]);

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
        kind: string;
        packId: string;
        valid: boolean;
        productionReady: boolean;
        legalImportSlot: boolean;
        permissionReady: boolean;
        slotReport: { matchedSlots: { slotId: string; packId: string }[] };
        permissionReport: { targetPackId: string };
      };
      expect(parsed).toMatchObject({
        kind: "mtt-preflop",
        packId: input.id,
        valid: true,
        productionReady: true,
        legalImportSlot: true,
        permissionReady: true,
      });
      expect(parsed.slotReport.matchedSlots).toContainEqual(expect.objectContaining({
        slotId: "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON",
        packId: input.id,
      }));
      expect(parsed.permissionReport.targetPackId).toBe(input.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blokuje production-ready MTT preflop import mimo legal slot packId", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "wrong-id.json");
      const input = {
        ...validMttImport(),
        id: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-cli-fixture-v1",
      };
      const manifestFile = join(dir, "permission.json");
      writeFileSync(file, JSON.stringify(input), "utf8");
      writeFileSync(manifestFile, JSON.stringify(validPermissionManifest(input.id)), "utf8");

      const result = runImportCli("mtt-preflop", file, manifestFile);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("productionReady: true");
      expect(result.stdout).toContain("legal import slot: false");
      expect(result.stdout).toContain(
        "MTT preflop import id must match legal slot packId mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1.",
      );
      expect(result.stdout).toContain("permissionReady: true");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blokuje production-ready MTT preflop import bez permission manifestu", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "valid.json");
      writeFileSync(file, JSON.stringify(validMttImport()), "utf8");

      const result = runImportCli("mtt-preflop", file);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("productionReady: true");
      expect(result.stdout).toContain("legal import slot: true");
      expect(result.stdout).toContain("permissionManifest: missing");
      expect(result.stdout).toContain("Production permission manifest is required for range promotion.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("vrati nenulovy exit pro nekompletni MTT preflop import", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "invalid.json");
      writeFileSync(file, JSON.stringify({
        ...validMttImport(),
        records: [],
      }), "utf8");

      const result = runImportCli("mtt-preflop", file);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("productionReady: false");
      expect(result.stdout).toContain("MTT preflop import must contain at least one normalized record.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("vrati exit 0 pro production-ready flop StrategyPack fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "flop.json");
      const pack = validFlopProductionPack();
      const manifestFile = join(dir, "permission.json");
      writeFileSync(file, JSON.stringify(pack), "utf8");
      writeFileSync(manifestFile, JSON.stringify(validPermissionManifest(pack.id)), "utf8");

      const result = runImportCli("flop-production", file, manifestFile);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("productionReady: true");
      expect(result.stdout).toContain("legal import slot: true");
      expect(result.stdout).toContain("matched slots: 4");
      expect(result.stdout).toContain("permissionReady: true");
      expect(result.stdout).toContain("missing pot types: none");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("vrati exit 0 pro production-ready turn StrategyPack fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "turn.json");
      const pack = validTurnProductionPack();
      const manifestFile = join(dir, "permission.json");
      writeFileSync(file, JSON.stringify(pack), "utf8");
      writeFileSync(manifestFile, JSON.stringify(validPermissionManifest(pack.id)), "utf8");

      const result = runImportCli("turn-production", file, manifestFile);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("productionReady: true");
      expect(result.stdout).toContain("legal import slot: true");
      expect(result.stdout).toContain("matched slots: 4");
      expect(result.stdout).toContain("permissionReady: true");
      expect(result.stdout).toContain("missing prior flop actions: none");
      expect(result.stdout).toContain("missing turn card classes: none");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("vrati exit 0 pro production-ready river StrategyPack fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-import-"));
    try {
      const file = join(dir, "river.json");
      const pack = validRiverProductionPack();
      const manifestFile = join(dir, "permission.json");
      writeFileSync(file, JSON.stringify(pack), "utf8");
      writeFileSync(manifestFile, JSON.stringify(validPermissionManifest(pack.id)), "utf8");

      const result = runImportCli("river-production", file, manifestFile);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("productionReady: true");
      expect(result.stdout).toContain("legal import slot: true");
      expect(result.stdout).toContain("matched slots: 4");
      expect(result.stdout).toContain("permissionReady: true");
      expect(result.stdout).toContain("missing prior turn actions: none");
      expect(result.stdout).toContain("missing river runout classes: none");
      expect(result.stdout).toContain("missing blocker relevance: none");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
