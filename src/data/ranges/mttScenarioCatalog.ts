import type { TrainingFlowMode } from "../../core/trainingCapability";
import type { TrainingProfile } from "../../core/trainingProfile";
import { trainingCapabilityForProfile } from "./trainingCapability";
import {
  MTT_POSTFLOP_PILOT_CATALOG,
  readyMttPostflopPilotsForProfile,
  type MttPostflopPilotCatalogEntry,
} from "./mttPostflopPilotCatalog";

export type MttLearningPathStatus =
  | "READY"
  | "PREVIEW"
  | "WAITING"
  | "UNSUPPORTED";

export interface MttLearningPathPreset {
  id: string;
  label: string;
  description: string;
  profile: TrainingProfile;
  preferredFlow: TrainingFlowMode;
  curriculumTags: readonly string[];
  requiredPilotScopes?: readonly MttPostflopPilotCatalogEntry["scope"][];
  estimatedSpotPool: number;
}

export interface MttLearningPathReportRow {
  id: string;
  label: string;
  status: MttLearningPathStatus;
  profile: TrainingProfile;
  preferredFlow: TrainingFlowMode;
  estimatedSpotPool: number;
  readyPilotScopes: readonly MttPostflopPilotCatalogEntry["scope"][];
  waitingPilotScopes: readonly MttPostflopPilotCatalogEntry["scope"][];
  blockers: readonly string[];
}

export interface MttLearningPathCatalogReport {
  valid: boolean;
  rows: readonly MttLearningPathReportRow[];
  counts: {
    total: number;
    ready: number;
    preview: number;
    waiting: number;
    unsupported: number;
    estimatedPlayableSpots: number;
  };
  errors: readonly string[];
}

export const MTT_LEARNING_PATH_PRESETS = [
  {
    id: "mtt-9max-regular-chip-ev-preflop-core",
    label: "9-max regular chipEV preflop core",
    description: "Production full-ring chipEV preflop decisions for the MTT ChipEV Core release.",
    profile: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
    preferredFlow: "PREFLOP_DRILL",
    curriculumTags: ["early-stage", "chip-ev", "full-ring", "core"],
    estimatedSpotPool: 13 * 9 * 169,
  },
  {
    id: "mtt-9max-regular-chip-ev-flop-pilots",
    label: "9-max regular chipEV flop pilot lab",
    description: "Scoped solver-backed FLOP pilots only; not full postflop production coverage.",
    profile: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "FLOP",
      evModel: "CHIP_EV",
      ante: "OFF",
      rakeMode: "NONE",
    },
    preferredFlow: "POSTFLOP_SINGLE_SPOT",
    curriculumTags: ["postflop", "solver-pilot", "chip-ev", "single-raised-pot", "three-bet-pot"],
    requiredPilotScopes: [
      "BTN_vs_BB_SRP_FLOP_CBET",
      "UTG_vs_BB_SRP_FLOP_CBET",
      "CO_vs_BB_SRP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_CBET",
      "BTN_vs_CO_3BP_FLOP_FACING_BET",
      "BTN_vs_BB_SRP_FLOP_FACING_BET",
      "SB_vs_BB_SRP_OOP_FLOP_CBET",
    ],
    estimatedSpotPool: 794,
  },
  {
    id: "mtt-9max-turbo-chip-ev-preflop",
    label: "9-max turbo chipEV preflop",
    description: "Production full-ring turbo chipEV preflop decisions for the MTT ChipEV Core release.",
    profile: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
    preferredFlow: "PREFLOP_DRILL",
    curriculumTags: ["turbo", "short-stack", "chip-ev"],
    estimatedSpotPool: 13 * 9 * 169,
  },
  {
    id: "mtt-9max-icm-bubble",
    label: "9-max ICM bubble/final-table",
    description: "ICM and final-table paths are intentionally outside the current v1 release contract.",
    profile: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      street: "PREFLOP",
      evModel: "ICM",
      ante: "ON",
      rakeMode: "NONE",
    },
    preferredFlow: "PREFLOP_DRILL",
    curriculumTags: ["bubble", "final-table", "icm"],
    estimatedSpotPool: 0,
  },
] as const satisfies readonly MttLearningPathPreset[];

export function buildMttLearningPathCatalogReport(
  presets: readonly MttLearningPathPreset[] = MTT_LEARNING_PATH_PRESETS,
): MttLearningPathCatalogReport {
  const rows = presets.map(reportRowForPreset);
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const row of rows) {
    if (ids.has(row.id)) errors.push(`Duplicate learning path id: ${row.id}.`);
    ids.add(row.id);
    if (row.blockers.length === 0 && (row.status === "WAITING" || row.status === "UNSUPPORTED")) {
      errors.push(`${row.id}: non-playable status requires at least one blocker.`);
    }
    if (row.status === "READY" && row.estimatedSpotPool <= 0) {
      errors.push(`${row.id}: ready learning path requires a positive estimated spot pool.`);
    }
  }
  return {
    valid: errors.length === 0,
    rows,
    counts: {
      total: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      preview: rows.filter((row) => row.status === "PREVIEW").length,
      waiting: rows.filter((row) => row.status === "WAITING").length,
      unsupported: rows.filter((row) => row.status === "UNSUPPORTED").length,
      estimatedPlayableSpots: rows
        .filter((row) => row.status === "READY" || row.status === "PREVIEW")
        .reduce((sum, row) => sum + row.estimatedSpotPool, 0),
    },
    errors,
  };
}

function reportRowForPreset(preset: MttLearningPathPreset): MttLearningPathReportRow {
  const capability = trainingCapabilityForProfile(preset.profile);
  const readyPilots = readyMttPostflopPilotsForProfile(preset.profile);
  const readyPilotScopes = readyPilots.map((pilot) => pilot.scope);
  const requiredScopes = preset.requiredPilotScopes ?? [];
  const pilotCatalog: readonly MttPostflopPilotCatalogEntry[] = MTT_POSTFLOP_PILOT_CATALOG;
  const waitingPilotScopes = requiredScopes.filter((scope) => (
    !readyPilotScopes.includes(scope) &&
    pilotCatalog.some((pilot) => pilot.scope === scope && pilot.status === "WAITING")
  ));
  const missingPilotScopes = requiredScopes.filter((scope) => (
    !readyPilotScopes.includes(scope) &&
    !waitingPilotScopes.includes(scope)
  ));
  const blockers = [
    ...(capability.status === "UNSUPPORTED" ? [capability.reason] : []),
    ...(capability.status === "BLOCKED" ? [capability.reason] : []),
    ...waitingPilotScopes.map((scope) => `${scope} is waiting for complete reviewed solver coverage.`),
    ...missingPilotScopes.map((scope) => `${scope} is not present in the pilot catalog.`),
  ];

  return {
    id: preset.id,
    label: preset.label,
    status: learningPathStatus(capability.status, blockers),
    profile: preset.profile,
    preferredFlow: preset.preferredFlow,
    estimatedSpotPool: preset.estimatedSpotPool,
    readyPilotScopes,
    waitingPilotScopes,
    blockers,
  };
}

function learningPathStatus(
  capabilityStatus: ReturnType<typeof trainingCapabilityForProfile>["status"],
  blockers: readonly string[],
): MttLearningPathStatus {
  if (capabilityStatus === "UNSUPPORTED") return "UNSUPPORTED";
  if (blockers.length > 0) return "WAITING";
  if (capabilityStatus === "PRODUCTION") return "READY";
  return "PREVIEW";
}
