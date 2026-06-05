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
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";
import type { MttPreflopRangePackImportInput } from "../../src/data/ranges/mttPreflopRangePackImport";
import type { ProductionPermissionManifest } from "../../src/data/ranges/productionPermissionManifest";
import {
  buildRangeModule,
  renderRangeModuleBuildReport,
} from "../../src/data/ranges/rangeModuleBuilder";

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
    id: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-builder-fixture-v1",
    version: "builder-fixture-v1",
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
      "MTT 9max turbo chipEV builder validation",
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

function permissionManifest(packId: string): ProductionPermissionManifest {
  return {
    packId,
    version: "permission-fixture-v1",
    reviewedAt: "2026-06-05",
    reviewer: "PKRTrainer QA",
    rightsOwner: "PKRTrainer synthetic fixture",
    licenseKind: "OWNED_SOLVER_EXPORT",
    allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
    sourceMaterialLocation: `Agents/range-intake/raw/${packId}/`,
    evidence: [
      {
        referenceId: "owned-export-manifest",
        storedAt: `Agents/range-intake/raw/${packId}/manifest.txt`,
        reviewer: "PKRTrainer QA",
        description: "Synthetic owned export fixture.",
        containsRangeValues: true,
      },
    ],
    notes: ["No third-party chart values copied."],
  };
}

function syntheticFlopPack(): FlopProductionStrategyPack {
  return {
    id: "builder-flop-synthetic-v1",
    version: "builder-fixture-v1",
    createdAt: "2026-06-05",
    verifiedAt: "2026-06-05",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Synthetic fixture.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      street: "FLOP",
      evModel: "CHIP_EV",
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
        methodology: "Synthetic fixture.",
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
    assumptions: ["Synthetic flop fixture."],
    rules: [
      {
        id: "builder-flop-srp-btn-bb-dry",
        actionNode: "SINGLE_RAISED_POT_CBET",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        boardTextures: ["dry"],
        sprMin: 2,
        sprMax: 12,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_SMALL",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value",
            action: "BET_SMALL",
            handClasses: ["AA"],
            features: ["top pair+"],
          },
          {
            lane: "BLUFF",
            label: "bluff",
            action: "BET_SMALL",
            handClasses: ["QJs"],
            features: ["draw"],
          },
          {
            lane: "CHECK",
            label: "check",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["air"],
          },
        ],
        explanation: "Synthetic flop builder fixture.",
      },
    ],
  };
}

function runBuilderCli(kind: "mtt-preflop" | "flop-production", inputFile: string, manifestFile: string) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? [
      "/c",
      "npm",
      "run",
      "build:range-module",
      "--",
      `--kind=${kind}`,
      "--dry-run",
      "--permission-manifest",
      manifestFile,
      inputFile,
    ]
    : [
      "run",
      "build:range-module",
      "--",
      `--kind=${kind}`,
      "--dry-run",
      "--permission-manifest",
      manifestFile,
      inputFile,
    ];
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60000,
  });
}

describe("rangeModuleBuilder", () => {
  it("vytvori TypeScript modul pro production-ready MTT import s permission manifestem", () => {
    const input = validMttImport();
    const result = buildRangeModule({
      kind: "mtt-preflop",
      input,
      permissionManifest: permissionManifest(input.id),
      exportName: "builderFixtureRangePack",
    });

    expect(result.writeReady).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.moduleText).toContain("satisfies RangePack");
    expect(result.moduleText).toContain("export const builderFixtureRangePack");
    expect(result.moduleText).toContain('"records"');
  });

  it("blokuje module text bez permission manifestu", () => {
    const input = validMttImport();
    const result = buildRangeModule({
      kind: "mtt-preflop",
      input,
      permissionManifest: null,
    });

    expect(result.productionReady).toBe(true);
    expect(result.permissionReady).toBe(false);
    expect(result.writeReady).toBe(false);
    expect(result.moduleText).toBeNull();
    expect(renderRangeModuleBuildReport(result)).toContain("writeReady: false");
    expect(result.blockers).toContain("Production permission manifest is required for range promotion.");
  });

  it("reportuje flop coverage blockery v dry-run stylu", () => {
    const pack = syntheticFlopPack();
    const result = buildRangeModule({
      kind: "flop-production",
      input: pack,
      permissionManifest: permissionManifest(pack.id),
    });

    expect(result.permissionReady).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.moduleText).toBeNull();
    expect(result.blockers).toContain("missing pot types: THREE_BET_POT");
  });

  it("spusti build:range-module CLI dry-run bez zapisu souboru", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-builder-"));
    try {
      const input = validMttImport();
      const inputFile = join(dir, "input.json");
      const manifestFile = join(dir, "permission.json");
      writeFileSync(inputFile, JSON.stringify(input), "utf8");
      writeFileSync(manifestFile, JSON.stringify(permissionManifest(input.id)), "utf8");

      const result = runBuilderCli("mtt-preflop", inputFile, manifestFile);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("writeReady: true");
      expect(result.stdout).toContain("kind: mtt-preflop");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
