import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { betActionFor, type BetActionRule } from "./lib/postflopBetActionMapping.mts";
import { SOLVER_PARAM_ROOT, SOLVER_PARAM_FILE, treeEconomicsFrom } from "./lib/solverFamilyParams.mts";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";

/**
 * Recover what each pilot family's bet buttons actually mean.
 *
 * The draft normalizer maps a TexasSolver bet onto BET_SMALL or BET_BIG by an
 * absolute chip threshold - `amount > 75`. The families do not share a pot, so
 * the same fraction lands on either side of it: with pot 50 every real bet
 * (33, 50 and 75 percent) is under the threshold and only the all-in clears it,
 * while with pot 157 a half-pot bet is 79 chips and becomes BET_BIG.
 *
 * The consequence reached the screen. The view renders BET_BIG as 75 percent of
 * pot and BET_SMALL as 33 percent, fixed constants with no connection to the
 * solve. So in ten of thirteen families the button reads "big bet 4 BB" while the
 * strategy behind it is the solver shoving 65 BB, and in the other three it reads
 * the same while meaning a half-pot bet. Grading is unaffected - it keys on the
 * action, not the size - but a player practising sizing is reading a label that
 * does not describe what they are being taught.
 *
 * This table records, per family, which solved sizes ended up behind each button,
 * so the view can say the true thing. It is recovered from the solve inputs for
 * the same reason `postflopRangeWeights` is: no pack rebuild, and a test
 * reconciles it against the parameter files.
 *
 *   npm run mtt:postflop-bet-sizing -- --write
 */

const PARAM_ROOT = SOLVER_PARAM_ROOT;
const OUTPUT = "src/data/ranges/postflopBetSizing.generated.ts";
const PARAM_FILE = SOLVER_PARAM_FILE;
/** The normalizer stamps this into a pack's assumptions when it used pot fractions. */
const POT_FRACTION_MARKER = "bet-action-rule=POT_FRACTION";



export interface FamilyBetSizing {
  potChips: number;
  effectiveStackChips: number;
  /** Solved bet sizes behind BET_SMALL, as percentages of the pot. */
  smallPct: number[];
  /** Solved bet sizes behind BET_BIG, as percentages of the pot. */
  bigPct: number[];
  /** True when the solver's all-in is one of the actions behind BET_BIG. */
  bigIsAllIn: boolean;
  /** Which mapping rule the shipped pack for this family was built with. */
  rule: BetActionRule;
}

/**
 * How a family's shipped pack was built, read from the pack rather than assumed.
 *
 * Families are corrected one at a time, so for a while some packs carry the old
 * absolute-chip split and others the pot-fraction one. Assuming a single rule
 * would make this table describe buttons half the packs do not have.
 */
export function ruleForShippedFamily(familyId: string): BetActionRule {
  const rules = generatedMttPostflopPilotPacks
    .flatMap((entry) => entry.pack.rules.map((rule) => ({ rule, pack: entry.pack })))
    .filter((item) => item.rule.id.split("-", 1)[0].toUpperCase() === familyId);
  // A family with no shipped pack still has drafts on disk, and those were built
  // by whatever rule was current when they were made. Anticipating the new one
  // would describe a split that does not exist yet.
  if (rules.length === 0) return "LEGACY_CHIP_THRESHOLD";
  return rules.every((item) => item.pack.assumptions.some((line) => line.includes(POT_FRACTION_MARKER)))
    ? "POT_FRACTION"
    : "LEGACY_CHIP_THRESHOLD";
}

export function heroBetSide(familyId: string): "oop" | "ip" {
  return familyId.includes("_OOP") ? "oop" : "ip";
}

export function familySizingFrom(
  text: string,
  familyId: string,
  rule: BetActionRule = "LEGACY_CHIP_THRESHOLD",
): FamilyBetSizing | null {
  const lines = text.split(/\r?\n/);
  const economics = treeEconomicsFrom(text);
  // A pot of zero or missing is not a pot; a fraction of it would be invented.
  if (economics === null) return null;
  const { potChips, effectiveStackChips } = economics;

  const side = heroBetSide(familyId);
  const betLine = lines.find((l) => l.startsWith(`set_bet_sizes ${side},flop,bet,`));
  const pcts = betLine === undefined
    ? []
    : betLine.split(",").slice(3).map(Number).filter((n) => Number.isFinite(n));
  const hasAllIn = lines.some((l) => l.startsWith(`set_bet_sizes ${side},flop,allin`));

  // The same rule the normalizer assigned actions by, imported rather than
  // restated, so the table can never describe a split the packs do not have.
  const action = (pct: number) => betActionFor(Math.round(potChips * pct / 100), potChips, rule);
  const smallPct = pcts.filter((p) => action(p) === "BET_SMALL");
  const bigPct = pcts.filter((p) => action(p) === "BET_BIG");
  // The all-in is a bet too, and at any of these stacks it is the biggest one.
  const bigIsAllIn = hasAllIn && betActionFor(effectiveStackChips, potChips, rule) === "BET_BIG";

  return { potChips, effectiveStackChips, smallPct, bigPct, bigIsAllIn, rule };
}

/**
 * Byla ta rodina doopravdy odsolvená?
 *
 * Parametry jsou vstup, ne obsah. Od chvíle, co se dají generovat odvozením z
 * preflop packů, jich může na disku ležet pět set - a všechny čekají na solve,
 * který třeba nikdy neproběhne. Tabulka sizingů popisuje, co produkt dodává,
 * takže nastagovaný vstup do ní nepatří: první ostré použití generátoru jinak
 * shodí sadu, protože se objeví rodiny bez jediného odsolvenoho boardu.
 */
function hasCheckpoint(family: string): boolean {
  return existsSync(join(
    "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver",
    family,
    "raw",
  ));
}

export function collectBetSizing(paramRoot = PARAM_ROOT): Map<string, FamilyBetSizing> {
  const found = new Map<string, FamilyBetSizing>();
  if (!existsSync(paramRoot)) return found;

  for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const dir = join(paramRoot, set.name);
    for (const file of readdirSync(dir)) {
      const match = PARAM_FILE.exec(file);
      if (match?.groups === undefined) continue;
      const family = match.groups.family;
      if (found.has(family) || !hasCheckpoint(family)) continue;
      const sizing = familySizingFrom(readFileSync(join(dir, file), "utf8"), family, ruleForShippedFamily(family));
      if (sizing !== null) found.set(family, sizing);
    }
  }
  return found;
}

function render(sizing: Map<string, FamilyBetSizing>): string {
  const body = [...sizing]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([family, item]) => [
      `  ${family}: {`,
      `    potChips: ${item.potChips},`,
      `    effectiveStackChips: ${item.effectiveStackChips},`,
      `    smallPct: [${item.smallPct.join(", ")}],`,
      `    bigPct: [${item.bigPct.join(", ")}],`,
      `    bigIsAllIn: ${item.bigIsAllIn},`,
      `    rule: ${JSON.stringify(item.rule)},`,
      `  },`,
    ].join("\n"))
    .join("\n");

  return `// Generated by \`npm run mtt:postflop-bet-sizing -- --write\`. Do not edit.
//
// Which solved bet sizes ended up behind each bet button, per pilot family.
//
// The draft normalizer separates BET_SMALL from BET_BIG on an absolute chip
// threshold, and the families do not share a pot, so the same fraction lands on
// either side of it. With pot 50 every real bet is under it and only the all-in
// clears it; with pot 157 a half-pot bet clears it. The view used to render a
// fixed 33 and 75 percent of pot regardless, which described neither.

export interface FamilyBetSizing {
  potChips: number;
  effectiveStackChips: number;
  smallPct: readonly number[];
  bigPct: readonly number[];
  bigIsAllIn: boolean;
  rule: "LEGACY_CHIP_THRESHOLD" | "POT_FRACTION";
}

export const MTT_POSTFLOP_BET_SIZING: Readonly<Record<string, FamilyBetSizing>> = {
${body}
};

export function familyBetSizing(familyId: string): FamilyBetSizing | undefined {
  return MTT_POSTFLOP_BET_SIZING[familyId];
}
`;
}

const write = process.argv.includes("--write");
const sizing = collectBetSizing();
if (write) {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, render(sizing), "utf8");
}

console.log("MTT postflop bet sizing");
console.log(`mode: ${write ? "WRITE" : "DRY_RUN"}`);
console.log(`families: ${sizing.size}`);
const allInBig = [...sizing].filter(([, item]) => item.bigIsAllIn && item.bigPct.length === 0);
const mergedSmall = [...sizing].filter(([, item]) => item.smallPct.length > 1);
console.log(`families where BET_BIG is only the all-in: ${allInBig.length}`);
console.log(`families where BET_SMALL merges more than one solved size: ${mergedSmall.length}`);
if (write) console.log(`written: ${OUTPUT}`);
