import { renderMttPostflopImportSlots } from "../src/data/ranges/mttPostflopImportSlots.ts";
import { renderMttPreflopImportSlots } from "../src/data/ranges/mttPreflopImportSlots.ts";

type SlotKind = "all" | "preflop" | "postflop";

const kind = parseKind(process.argv.slice(2));

if (kind === null) {
  console.error([
    "Usage:",
    "  npm run mtt:slots",
    "  npm run mtt:slots -- --kind=preflop",
    "  npm run mtt:slots -- --kind=postflop",
  ].join("\n"));
  process.exitCode = 1;
} else {
  const sections: string[] = [];
  if (kind === "all" || kind === "preflop") {
    sections.push(renderMttPreflopImportSlots());
  }
  if (kind === "all" || kind === "postflop") {
    sections.push(renderMttPostflopImportSlots());
  }
  console.log(sections.join("\n\n"));
}

function parseKind(args: readonly string[]): SlotKind | null {
  if (args.length === 0) return "all";
  const kindArg = args.find((arg) => arg === "--kind" || arg.startsWith("--kind="));
  if (kindArg === undefined) return null;

  const value = kindArg === "--kind"
    ? args[args.indexOf(kindArg) + 1]
    : kindArg.slice("--kind=".length);
  if (value === "preflop" || value === "postflop" || value === "all") return value;
  return null;
}
