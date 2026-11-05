import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The pot and stack a family was solved at, read from its solver parameter file.
 *
 * Two callers need this and would otherwise each grow their own copy of the
 * directory walk: the draft normalizer, which needs the pot to decide whether a
 * solved bet is small or big as a fraction of it, and the bet-sizing table, which
 * needs the same numbers to describe the result. One reader means they cannot
 * disagree about which parameter set a family came from.
 */

export const SOLVER_PARAM_ROOT = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters";
export const SOLVER_PARAM_FILE = /^\d+_(?<family>[A-Z0-9_]+?)_[AKQJT98765432]{3}(?:r|tt|mono)\.txt$/;

export interface FamilyTreeEconomics {
  potChips: number;
  effectiveStackChips: number;
}

/** Numbers for one family, or null when no parameter file names it. */
export function familyTreeEconomics(
  familyId: string,
  paramRoot = SOLVER_PARAM_ROOT,
): FamilyTreeEconomics | null {
  const text = familyParamText(familyId, paramRoot);
  if (text === null) return null;
  return treeEconomicsFrom(text);
}

export function familyParamText(familyId: string, paramRoot = SOLVER_PARAM_ROOT): string | null {
  if (!existsSync(paramRoot)) return null;
  for (const set of readdirSync(paramRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const dir = join(paramRoot, set.name);
    const hit = readdirSync(dir).find((file) => SOLVER_PARAM_FILE.exec(file)?.groups?.family === familyId);
    if (hit !== undefined) return readFileSync(join(dir, hit), "utf8");
  }
  return null;
}

export function treeEconomicsFrom(text: string): FamilyTreeEconomics | null {
  const lines = text.split(/\r?\n/);
  const read = (key: string) => Number(lines.find((line) => line.startsWith(`${key} `))?.split(" ")[1] ?? Number.NaN);
  const potChips = read("set_pot");
  const effectiveStackChips = read("set_effective_stack");
  // A pot of zero or missing is not a pot. Returning it would let a caller divide
  // by it and call the result a fraction.
  if (!Number.isFinite(potChips) || potChips <= 0) return null;
  return { potChips, effectiveStackChips };
}
