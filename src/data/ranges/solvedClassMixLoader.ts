import type { PostflopActionFrequency } from "../../core/postflopGenerator";
import type { HandLabel } from "../../core/types";
import { loadSolvedFlopClassMix } from "./flopSolvedStrategyPacks";
import { loadSolvedRiverClassMix } from "./riverSolvedStrategyPacks";
import { classMixForRule, type SolvedClassMixFile, type SolvedClassMixRef } from "./solvedClassMix";
import { loadSolvedTurnClassMix } from "./turnSolvedStrategyPacks";

/**
 * Soubory s frekvencemi podle packu. Matice se nad toutéž rodinou otevírá
 * opakovaně, soubor se stahuje jednou.
 */
const files = new Map<string, Promise<SolvedClassMixFile | undefined>>();

function loadFile(ref: SolvedClassMixRef): Promise<SolvedClassMixFile | undefined> {
  const load = ref.street === "TURN"
    ? loadSolvedTurnClassMix
    : ref.street === "RIVER" ? loadSolvedRiverClassMix : loadSolvedFlopClassMix;
  return load(ref.packId).catch(() => {
    // Bez sítě nebo bez chunku: matice zůstane u převažující akce a příští
    // otevření to zkusí znovu.
    files.delete(ref.packId);
    return undefined;
  });
}

/**
 * Směs každé třídy vybraného pravidla, nebo `undefined`, když ji rodina
 * nenese nebo soubor k packu nepatří (`classMixForRule`).
 */
export async function loadClassMix(
  ref: SolvedClassMixRef,
): Promise<Map<HandLabel, PostflopActionFrequency[]> | undefined> {
  let pending = files.get(ref.packId);
  if (pending === undefined) {
    pending = loadFile(ref);
    files.set(ref.packId, pending);
  }
  const file = await pending;
  return file === undefined ? undefined : classMixForRule(file, ref);
}
