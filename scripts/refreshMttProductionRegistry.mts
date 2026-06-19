import {
  refreshMttProductionRegistry,
} from "./mttProductionRegistryFile.mts";

interface CliArgs {
  check: boolean;
  json: boolean;
  write: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = refreshMttProductionRegistry({ write: args.write });
  const valid = args.check ? !result.changed : true;
  const report = {
    valid,
    changed: result.changed,
    written: args.write && result.changed,
    registryPath: result.registryPath,
    moduleCount: result.modules.length,
    counts: {
      preflop: result.modules.filter((item) => item.kind === "mtt-preflop").length,
      flop: result.modules.filter((item) => item.kind === "flop-production").length,
      turn: result.modules.filter((item) => item.kind === "turn-production").length,
      river: result.modules.filter((item) => item.kind === "river-production").length,
    },
    modules: result.modules,
  };

  console.log(args.json ? JSON.stringify(report, null, 2) : renderReport(report));
  process.exitCode = valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:refresh-registry -- --check",
    "  npm run mtt:refresh-registry -- --write",
    "  npm run mtt:refresh-registry -- --check --json",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let check = false;
  let json = false;
  let write = false;
  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--check") {
      check = true;
      continue;
    }
    if (item === "--json") {
      json = true;
      continue;
    }
    if (item === "--write") {
      write = true;
      continue;
    }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  if (check === write) {
    throw new Error(`Choose exactly one of --check or --write.\n\n${usage()}`);
  }
  return { check, json, write };
}

function renderReport(report: {
  valid: boolean;
  changed: boolean;
  written: boolean;
  registryPath: string;
  moduleCount: number;
  counts: {
    preflop: number;
    flop: number;
    turn: number;
    river: number;
  };
  modules: readonly {
    kind: string;
    packId: string;
    modulePath: string;
  }[];
}): string {
  const lines = [
    "MTT production registry refresh",
    `valid: ${report.valid}`,
    `changed: ${report.changed}`,
    `written: ${report.written}`,
    `registry: ${report.registryPath}`,
    `modules: ${report.moduleCount}`,
    `counts: preflop=${report.counts.preflop}, flop=${report.counts.flop}, ` +
      `turn=${report.counts.turn}, river=${report.counts.river}`,
  ];
  for (const module of report.modules) {
    lines.push(`${module.kind} | ${module.packId} | ${module.modulePath}`);
  }
  return lines.join("\n");
}
