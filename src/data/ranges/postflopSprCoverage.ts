import type { PostflopPotType } from "../../core/postflopGenerator";
import { generatedMttPostflopPilotPacks } from "./mttPostflopPilotPacks.generated";

/**
 * Which SPRs the shipped postflop pilots actually cover, per pot type.
 *
 * A pilot rule only applies inside its SPR band, and the bands stop where the
 * solved families stop. A single-raised pot at 150BB over a 6BB pot sits at
 * SPR 25, past every band, so nothing solver-backed matches and the trainer can
 * only refuse it. This exposes that edge as data so the runtime can say "this
 * depth is not solver-backed" instead of letting a player reach it and hit an
 * unexplained blank.
 *
 * Derived from the shipped pilots rather than hard-coded, so it cannot drift out
 * of step with what actually ships: add a deeper family and its band widens the
 * covered range automatically.
 *
 * Note this answers only whether *some* band contains the SPR. Whether that band
 * was solved near the SPR is a separate, finer question answered by
 * `assessSprFidelity`; a shallow three-bet pot is inside a band but far from the
 * solved point, and that is a fidelity warning, not a coverage gap.
 */
export interface SprBand {
  min: number;
  max: number;
}

const COVERAGE = buildCoverage();

function buildCoverage(): Map<PostflopPotType, SprBand[]> {
  const byPotType = new Map<PostflopPotType, SprBand[]>();
  for (const entry of generatedMttPostflopPilotPacks) {
    for (const rule of entry.pack.rules) {
      const bands = byPotType.get(rule.potType) ?? [];
      bands.push({ min: rule.sprMin, max: rule.sprMax });
      byPotType.set(rule.potType, bands);
    }
  }
  return byPotType;
}

/** True when some shipped pilot band for this pot type contains the SPR. */
export function isPostflopSprCovered(potType: PostflopPotType, spr: number): boolean {
  if (!Number.isFinite(spr)) return false;
  const bands = COVERAGE.get(potType);
  if (bands === undefined) return false;
  return bands.some((band) => spr >= band.min && spr <= band.max);
}

/** The deepest SPR any shipped pilot covers for this pot type, or null if none. */
export function maxCoveredSprForPotType(potType: PostflopPotType): number | null {
  const bands = COVERAGE.get(potType);
  if (bands === undefined || bands.length === 0) return null;
  return Math.max(...bands.map((band) => band.max));
}

/** The shallowest SPR any shipped pilot covers for this pot type, or null. */
export function minCoveredSprForPotType(potType: PostflopPotType): number | null {
  const bands = COVERAGE.get(potType);
  if (bands === undefined || bands.length === 0) return null;
  return Math.min(...bands.map((band) => band.min));
}
