import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FlopProductionStrategyPack } from "../src/data/ranges/flopProductionStrategyPack.ts";
import {
  buildMttPostflopPilotGateReport,
  type MttPostflopPilotGateReport,
  type MttPostflopPilotScope,
} from "../src/data/ranges/mttPostflopPilotGate.ts";
import type { ProductionPermissionManifest } from "../src/data/ranges/productionPermissionManifest.ts";

const DEFAULT_OUTPUT = "artifacts/mtt-postflop-pilot-suite/report.json";

interface CliArgs {
  json: boolean;
  outputPath: string | null;
  summary: boolean;
}

interface PilotTarget {
  id: string;
  scope: MttPostflopPilotScope;
  normalizedPath: string;
  permissionPath: string;
  description: string;
  alternatives?: readonly {
    id: string;
    normalizedPath: string;
    permissionPath: string;
    description: string;
  }[];
}

type PilotTargetStatus = "READY" | "WAITING" | "INVALID";

interface PilotSuiteRow {
  id: string;
  scope: MttPostflopPilotScope;
  status: PilotTargetStatus;
  description: string;
  normalizedPath: string;
  permissionPath: string;
  report: MttPostflopPilotGateReport | null;
  selectedCandidate: PilotSuiteSelectedCandidate | null;
  blockers: readonly string[];
}

interface PilotSuiteSelectedCandidate {
  source: "BEST_CANDIDATE" | "MERGE_REPORT";
  nodeHistory: string | null;
  betAction: string | null;
  provenanceFingerprint: string | null;
  inputCount: number | null;
}

interface PilotSuiteReport {
  valid: boolean;
  generatedAt: string;
  counts: {
    targets: number;
    ready: number;
    waiting: number;
    invalid: number;
    rules: number;
    rangeBuckets: number;
  };
  rows: readonly PilotSuiteRow[];
}

const TARGETS: readonly PilotTarget[] = [
  {
    id: "btn-bb-srp-flop-cbet-low-mid-high",
    scope: "BTN_vs_BB_SRP_FLOP_CBET",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_CBET_PILOT-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_CBET_PILOT-CHECK/permission.candidate.json",
    description: "Merged BTN vs BB SRP flop c-bet pilot across available SPR bands.",
  },
  {
    id: "utg-bb-srp-flop-cbet",
    scope: "UTG_vs_BB_SRP_FLOP_CBET",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_40BB_UTG_BB_SRP-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_40BB_UTG_BB_SRP-CHECK/permission.candidate.json",
    description: "UTG vs BB SRP flop c-bet pilot from coverage-v2.",
  },
  {
    id: "sb-bb-srp-oop-flop-cbet-low-mid-high",
    scope: "SB_vs_BB_SRP_OOP_FLOP_CBET",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/SB_BB_SRP_OOP_FLOP_CBET_PILOT-ROOT/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/SB_BB_SRP_OOP_FLOP_CBET_PILOT-ROOT/permission.candidate.json",
    description: "Merged SB vs BB SRP OOP flop c-bet pilot across available SPR bands.",
    alternatives: [
      {
        id: "sb-bb-srp-oop-flop-cbet-lowspr",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR-ROOT/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR-ROOT/permission.candidate.json",
        description: "SB vs BB SRP OOP low-SPR flop c-bet pilot from ROOT TexasSolver node.",
      },
    ],
  },
  {
    id: "btn-co-3bp-flop-cbet",
    scope: "BTN_vs_CO_3BP_FLOP_CBET",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_CBET_PILOT-CHECK/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_CBET_PILOT-CHECK/permission.candidate.json",
    description: "Merged BTN vs CO 3bet-pot flop c-bet pilot across available SPR bands.",
    alternatives: [
      {
        id: "btn-co-3bp-flop-cbet-repair",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_35BB_CO_BTN_3BP_REPAIR-CHECK/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_35BB_CO_BTN_3BP_REPAIR-CHECK/permission.candidate.json",
        description: "BTN vs CO 3bet-pot repair pilot with wider IP bluff-candidate range.",
      },
      {
        id: "btn-co-3bp-flop-cbet-coverage-v2",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_35BB_CO_BTN_3BP-CHECK/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_35BB_CO_BTN_3BP-CHECK/permission.candidate.json",
        description: "BTN vs CO 3bet-pot flop c-bet pilot from coverage-v2.",
      },
    ],
  },
  {
    id: "btn-co-3bp-flop-facing-bet-low-mid-high",
    scope: "BTN_vs_CO_3BP_FLOP_FACING_BET",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_FACING_BET_PILOT/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_CO_3BP_FLOP_FACING_BET_PILOT/permission.candidate.json",
    description: "Merged BTN vs CO 3bet-pot flop facing-bet response pilot across LOW/MID/HIGH SPR bands.",
    alternatives: [
      {
        id: "btn-co-3bp-flop-facing-bet-highspr",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_150BB_CO_BTN_3BP_HIGHSPR-FACING-BET_39/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_150BB_CO_BTN_3BP_HIGHSPR-FACING-BET_39/permission.candidate.json",
        description: "BTN vs CO 3bet-pot high-SPR flop facing-bet response pilot from CHECK>BET_39 TexasSolver node.",
      },
      {
        id: "btn-co-3bp-flop-facing-bet-lowspr",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR-FACING-BET_39/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_45BB_CO_BTN_3BP_FACING_LOWSPR-FACING-BET_39/permission.candidate.json",
        description: "BTN vs CO 3bet-pot low-SPR flop facing-bet response pilot from expansion-v1 CHECK>BET_39 node.",
      },
    ],
  },
  {
    id: "btn-bb-srp-flop-facing-bet-low-mid-high",
    scope: "BTN_vs_BB_SRP_FLOP_FACING_BET",
    normalizedPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_FACING_BET_PILOT/normalized.candidate.json",
    permissionPath:
      "artifacts/texas-solver-review-integration/normalized-drafts/BTN_BB_SRP_FLOP_FACING_BET_PILOT/permission.candidate.json",
    description: "Merged BTN vs BB SRP flop facing-bet response pilot across LOW/MID/HIGH SPR bands.",
    alternatives: [
      {
        id: "btn-bb-srp-flop-facing-bet-lowspr",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR-FACING-BET-BEST/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_25BB_BTN_BB_SRP_FACING_LOWSPR-FACING-BET-BEST/permission.candidate.json",
        description: "BTN vs BB SRP low-SPR flop facing-bet response pilot from SRP lowspr-v1.",
      },
      {
        id: "btn-bb-srp-flop-facing-bet-midspr",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR-FACING-BET-BEST/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_50BB_BTN_BB_SRP_FACING_MIDSPR-FACING-BET-BEST/permission.candidate.json",
        description: "BTN vs BB SRP mid-SPR flop facing-bet response pilot from SRP expansion-v1.",
      },
      {
        id: "btn-bb-srp-flop-facing-bet-highspr",
        normalizedPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR-FACING-BET-BEST/normalized.candidate.json",
        permissionPath:
          "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR-FACING-BET-BEST/permission.candidate.json",
        description: "BTN vs BB SRP high-SPR flop facing-bet response pilot from SRP expansion-v1.",
      },
    ],
  },
];

try {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport();
  if (args.outputPath !== null) {
    mkdirSync(dirname(args.outputPath), { recursive: true });
    writeFileSync(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report, args.summary));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let json = false;
  let outputPath: string | null = null;
  let summary = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--summary") {
      summary = true;
      continue;
    }
    if (item === "--output") {
      outputPath = resolve(requiredValue(argv, index, "--output"));
      index += 1;
      continue;
    }
    if (item.startsWith("--output=")) {
      outputPath = resolve(inlineValue(item, "--output"));
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }

  return { json, outputPath, summary };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:postflop-pilot-suite",
    "  npm run mtt:postflop-pilot-suite -- --summary",
    "  npm run mtt:postflop-pilot-suite -- --json",
    "  npm run mtt:postflop-pilot-suite -- --output=artifacts/mtt-postflop-pilot-suite/report.json",
    "",
    "Runs all known scoped MTT postflop pilot gates for available TexasSolver draft candidates.",
    "Missing draft candidates are reported as WAITING, not as production failures.",
  ].join("\n");
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]?.trim() ?? "";
  if (value.length === 0 || value.startsWith("--")) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function inlineValue(item: string, flag: string): string {
  const value = item.slice(`${flag}=`.length).trim();
  if (value.length === 0) throw new Error(`${flag} requires a value.\n\n${usage()}`);
  return value;
}

function buildReport(): PilotSuiteReport {
  const rows = TARGETS.map(buildRow);
  return {
    valid: rows.every((row) => row.status !== "INVALID"),
    generatedAt: new Date().toISOString(),
    counts: {
      targets: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      waiting: rows.filter((row) => row.status === "WAITING").length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
      rules: rows.reduce((sum, row) => sum + (row.report?.counts.rules ?? 0), 0),
      rangeBuckets: rows.reduce((sum, row) => sum + (row.report?.counts.rangeBuckets ?? 0), 0),
    },
    rows,
  };
}

function buildRow(target: PilotTarget): PilotSuiteRow {
  const selected = selectAvailableTarget(target);
  const blockers = [
    ...(existsSync(selected.normalizedPath) ? [] : [`Missing normalized candidate: ${selected.normalizedPath}`]),
    ...(existsSync(selected.permissionPath) ? [] : [`Missing permission candidate: ${selected.permissionPath}`]),
  ];
  if (blockers.length > 0) {
    return {
      id: selected.id,
      scope: target.scope,
      status: "WAITING",
      description: selected.description,
      normalizedPath: selected.normalizedPath,
      permissionPath: selected.permissionPath,
      report: null,
      selectedCandidate: selectedCandidateFor(selected.normalizedPath),
      blockers,
    };
  }

  const report = buildMttPostflopPilotGateReport(
    readJson<FlopProductionStrategyPack>(selected.normalizedPath),
    readJson<ProductionPermissionManifest>(selected.permissionPath),
    target.scope,
  );

  return {
    id: selected.id,
    scope: target.scope,
    status: report.valid ? "READY" : "INVALID",
    description: selected.description,
    normalizedPath: selected.normalizedPath,
    permissionPath: selected.permissionPath,
    report,
    selectedCandidate: selectedCandidateFor(selected.normalizedPath),
    blockers: report.errors,
  };
}

function selectedCandidateFor(normalizedPath: string): PilotSuiteSelectedCandidate | null {
  const dir = dirname(normalizedPath);
  const bestCandidatePath = join(dir, "best-candidate.json");
  if (existsSync(bestCandidatePath)) {
    const best = readJson<{
      nodeHistory?: string;
      betAction?: string;
    }>(bestCandidatePath);
    return {
      source: "BEST_CANDIDATE",
      nodeHistory: best.nodeHistory ?? null,
      betAction: best.betAction ?? null,
      provenanceFingerprint: null,
      inputCount: null,
    };
  }

  const mergeReportPath = join(dir, "merge-report.json");
  if (existsSync(mergeReportPath)) {
    const merge = readJson<{
      provenanceFingerprint?: string;
      inputs?: unknown[];
    }>(mergeReportPath);
    return {
      source: "MERGE_REPORT",
      nodeHistory: null,
      betAction: null,
      provenanceFingerprint: merge.provenanceFingerprint ?? null,
      inputCount: Array.isArray(merge.inputs) ? merge.inputs.length : null,
    };
  }
  return null;
}

function selectAvailableTarget(target: PilotTarget): {
  id: string;
  normalizedPath: string;
  permissionPath: string;
  description: string;
} {
  if (existsSync(target.normalizedPath) || existsSync(target.permissionPath)) {
    return target;
  }
  for (const alternative of target.alternatives ?? []) {
    if (existsSync(alternative.normalizedPath) || existsSync(alternative.permissionPath)) return alternative;
  }
  return target;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function renderReport(report: PilotSuiteReport, summaryOnly: boolean): string {
  const lines = [
    "MTT postflop pilot suite",
    `valid: ${report.valid}`,
    `ready: ${report.counts.ready}`,
    `waiting: ${report.counts.waiting}`,
    `invalid: ${report.counts.invalid}`,
    `rules: ${report.counts.rules}`,
    `range buckets: ${report.counts.rangeBuckets}`,
  ];
  for (const row of report.rows) {
    const counts = row.report === null
      ? ""
      : ` rules=${row.report.counts.rules} buckets=${row.report.counts.rangeBuckets}`;
    const candidate = row.selectedCandidate?.nodeHistory
      ? ` node=${row.selectedCandidate.nodeHistory}`
      : row.selectedCandidate?.inputCount !== null && row.selectedCandidate?.inputCount !== undefined
        ? ` inputs=${row.selectedCandidate.inputCount}`
        : "";
    lines.push(`${row.status} ${row.id}: ${row.scope}${counts}${candidate}`);
    if ((row.status === "INVALID" || !summaryOnly) && row.blockers.length > 0) {
      for (const blocker of row.blockers) lines.push(`  - ${blocker}`);
    }
  }
  return lines.join("\n");
}
