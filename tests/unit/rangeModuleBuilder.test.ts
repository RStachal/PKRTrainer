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
import type { RiverProductionStrategyPack } from "../../src/data/ranges/riverProductionStrategyPack";
import type { TurnProductionStrategyPack } from "../../src/data/ranges/turnProductionStrategyPack";
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
    id: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1",
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

function syntheticTurnPack(): TurnProductionStrategyPack {
  return {
    id: "builder-turn-synthetic-v1",
    version: "builder-fixture-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Synthetic fixture.",
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
        methodology: "Synthetic fixture.",
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
    assumptions: ["Synthetic turn fixture."],
    rules: [
      {
        id: "builder-turn-srp-btn-bb-bet-small-blank",
        actionNode: "TURN_BARREL",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorFlopAction: "BET_SMALL",
        turnCardClasses: ["BLANK"],
        sprMin: 2,
        sprMax: 10,
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
        explanation: "Synthetic turn builder fixture.",
      },
    ],
  };
}

function syntheticRiverPack(): RiverProductionStrategyPack {
  return {
    id: "builder-river-synthetic-v1",
    version: "builder-fixture-v1",
    createdAt: "2026-06-11",
    verifiedAt: "2026-06-11",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Synthetic fixture.",
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
        methodology: "Synthetic fixture.",
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
    assumptions: ["Synthetic river fixture."],
    rules: [
      {
        id: "builder-river-srp-btn-bb-bet-small-blank",
        actionNode: "RIVER_PRESSURE",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        priorTurnAction: "BET_SMALL",
        riverRunoutClasses: ["BLANK"],
        blockerRelevance: "HIGH",
        sprMin: 1,
        sprMax: 8,
        actions: ["CHECK", "BET_SMALL", "BET_BIG"],
        recommendedAction: "BET_BIG",
        rangeBuckets: [
          {
            lane: "VALUE",
            label: "value",
            action: "BET_BIG",
            handClasses: ["AA"],
            features: ["top value"],
            blockerRelevance: "LOW",
          },
          {
            lane: "BLUFF",
            label: "bluff",
            action: "BET_BIG",
            handClasses: ["QJs"],
            features: ["blocker bluff"],
            blockerRelevance: "HIGH",
          },
          {
            lane: "CHECK",
            label: "check",
            action: "CHECK",
            handClasses: ["72o"],
            features: ["air"],
            blockerRelevance: "LOW",
          },
        ],
        explanation: "Synthetic river builder fixture.",
      },
    ],
  };
}

function runBuilderCli(
  kind: "mtt-preflop" | "flop-production" | "turn-production" | "river-production",
  inputFile: string,
  manifestFile: string,
  extraArgs: readonly string[] = [],
) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const cliArgs = [
    `--kind=${kind}`,
    "--dry-run",
    "--permission-manifest",
    manifestFile,
    ...extraArgs,
    inputFile,
  ];
  const args = process.platform === "win32"
    ? [
      "/c",
      "npm",
      "run",
      "build:range-module",
      "--",
      ...cliArgs,
    ]
    : [
      "run",
      "build:range-module",
      "--",
      ...cliArgs,
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
    expect(result.matchedImportSlots).toHaveLength(1);
    expect(result.matchedImportSlots[0]).toMatchObject({
      slotId: "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON",
      packId: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1",
    });
    expect(result.moduleText).toContain("satisfies RangePack");
    expect(result.moduleText).toContain("export const builderFixtureRangePack");
    expect(result.moduleText).toContain('"records"');
  });

  it("blokuje production module pro MTT preflop import mimo legal slot packId", () => {
    const input = {
      ...validMttImport(),
      id: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-builder-fixture-v1",
    };
    const result = buildRangeModule({
      kind: "mtt-preflop",
      input,
      permissionManifest: permissionManifest(input.id),
    });

    expect(result.productionReady).toBe(true);
    expect(result.permissionReady).toBe(true);
    expect(result.writeReady).toBe(false);
    expect(result.matchedImportSlots).toHaveLength(1);
    expect(result.moduleText).toBeNull();
    expect(result.blockers).toContain(
      "MTT preflop import id must match legal slot packId mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1.",
    );
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
    const base = syntheticFlopPack();
    const pack = {
      ...base,
      rules: [
        {
          ...base.rules[0],
          sprMin: 4,
          sprMax: 7,
        },
      ],
    };
    const result = buildRangeModule({
      kind: "flop-production",
      input: pack,
      permissionManifest: permissionManifest(pack.id),
    });

    expect(result.permissionReady).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.matchedImportSlots).toHaveLength(4);
    expect(result.matchedImportSlots.map((slot) => slot.slotId)).toContain(
      "FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON",
    );
    expect(result.moduleText).toBeNull();
    expect(result.blockers).toContain("missing pot types: THREE_BET_POT");
    expect(result.blockers).toContain("missing SPR bands: LOW,HIGH");
    expect(result.blockers).not.toContain("Flop production pack must match at least one legal MTT postflop import slot.");
  });

  it("blokuje postflop production module mimo MTT slot registry", () => {
    const pack = {
      ...syntheticFlopPack(),
      dimensions: {
        ...syntheticFlopPack().dimensions,
        gameVariant: "CASH",
      },
    } satisfies FlopProductionStrategyPack;
    const result = buildRangeModule({
      kind: "flop-production",
      input: pack,
      permissionManifest: permissionManifest(pack.id),
    });

    expect(result.writeReady).toBe(false);
    expect(result.matchedImportSlots).toEqual([]);
    expect(result.moduleText).toBeNull();
    expect(result.blockers).toContain("Flop production module must target MTT gameVariant.");
  });

  it("reportuje turn coverage blockery v dry-run stylu", () => {
    const pack = syntheticTurnPack();
    const result = buildRangeModule({
      kind: "turn-production",
      input: pack,
      permissionManifest: permissionManifest(pack.id),
    });

    expect(result.kind).toBe("turn-production");
    expect(result.permissionReady).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.matchedImportSlots).toHaveLength(4);
    expect(result.moduleText).toBeNull();
    expect(result.blockers).toContain("missing pot types: THREE_BET_POT");
    expect(result.blockers).toContain("missing prior flop actions: CHECK,BET_BIG");
    expect(result.blockers).toContain(
      "missing turn card classes: LOW_BRICK,OVER_CARD,BROADWAY,BOARD_PAIRING,FLUSH_COMPLETING,STRAIGHT_COMPLETING,DYNAMIC",
    );
  });

  it("reportuje river coverage blockery v dry-run stylu", () => {
    const pack = syntheticRiverPack();
    const result = buildRangeModule({
      kind: "river-production",
      input: pack,
      permissionManifest: permissionManifest(pack.id),
    });

    expect(result.kind).toBe("river-production");
    expect(result.permissionReady).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.matchedImportSlots).toHaveLength(4);
    expect(result.moduleText).toBeNull();
    expect(result.blockers).toContain("missing pot types: THREE_BET_POT");
    expect(result.blockers).toContain("missing prior turn actions: CHECK,BET_BIG");
    expect(result.blockers).toContain(
      "missing river runout classes: OVER_CARD,BOARD_PAIRING,FLUSH_COMPLETING,STRAIGHT_COMPLETING,FOUR_FLUSH,FOUR_STRAIGHT,DYNAMIC",
    );
    expect(result.blockers).toContain("missing blocker relevance: MEDIUM");
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
      expect(result.stdout).toContain("matched import slots: 1");
      expect(result.stdout).toContain("FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("spusti build:range-module CLI dry-run jako JSON bez moduleText", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkr-range-builder-"));
    try {
      const input = validMttImport();
      const inputFile = join(dir, "input.json");
      const manifestFile = join(dir, "permission.json");
      writeFileSync(inputFile, JSON.stringify(input), "utf8");
      writeFileSync(manifestFile, JSON.stringify(permissionManifest(input.id)), "utf8");

      const result = runBuilderCli("mtt-preflop", inputFile, manifestFile, ["--json"]);

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"))) as {
        kind: string;
        packId: string;
        writeReady: boolean;
        matchedImportSlots: { slotId: string; packId: string }[];
        moduleText?: string;
      };
      expect(parsed).toMatchObject({
        kind: "mtt-preflop",
        packId: input.id,
        writeReady: true,
      });
      expect(parsed.matchedImportSlots).toContainEqual(expect.objectContaining({
        slotId: "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON",
        packId: input.id,
      }));
      expect(parsed.moduleText).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
