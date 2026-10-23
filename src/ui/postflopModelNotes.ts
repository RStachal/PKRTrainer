import type { BoardTexture } from "../core/postflopGenerator";
import type { PostflopTrainingSpot } from "../core/postflopTrainingSpot";
import { getAppLanguage, localizedText } from "./cs";

/**
 * Poznámky k modelu za postflopovou odpovědí: odkud je, jak moc se mu dá věřit
 * a kde se od zobrazeného spotu liší.
 *
 * Vytaženo 23. 10. 2026 z `postflopView.ts`, aby je četl starý pohled i nová
 * obrazovka (Agents/ui-redesign-plan.md, fáze 1, krok 3b). Každá z vět tu je,
 * protože bez ní hráč dostal tvrzení, které se o nic neopíralo - vyřešené SPR
 * jinde, než je spot, dva různé stromy v jednom agregátu, heuristika vydávaná
 * za solver. Dvě kopie by se rozešly právě v tom.
 */

type StrategyPackSource = Extract<PostflopTrainingSpot["explanation"]["source"], { kind: "STRATEGY_PACK" }>;

const TEXTURE_LABEL: Record<BoardTexture, string> = {
  paired: "Paired",
  monotone: "Monotone",
  "two-tone": "Two-tone",
  rainbow: "Rainbow",
  connected: "Connected",
  dry: "Dry",
  "ace-high": "A-high",
  "broadway-high": "Broadway-high",
  low: "Low",
  medium: "Medium",
  "straight-possible": "Straight possible",
  "flush-draw-heavy": "Flush-draw heavy",
  disconnected: "Disconnected",
};

export function textureLabel(texture: BoardTexture): string {
  return TEXTURE_LABEL[texture] ?? texture;
}

/** Poznámky k modelu, jedna věta na položku. */
export function postflopModelNotes(spot: PostflopTrainingSpot): readonly string[] {
  const source = spot.explanation.source;
  if (source.kind === "STRATEGY_PACK") {
    return [
      localizedText(
        isPublicHeuristicStrategySource(source) ? "Heuristic model" : "Production model",
        isPublicHeuristicStrategySource(source) ? "Heuristický model" : "Produkční model",
      ),
      localizedText(`Confidence: ${confidenceLabel(source.confidence)}`, `Spolehlivost: ${confidenceLabel(source.confidence)}`),
      ...textureItems(source),
      localizedText(`SPR range: ${source.sprMin}-${source.sprMax}`, `Rozsah SPR: ${source.sprMin}-${source.sprMax}`),
      ...sprFidelityItems(source.sprFidelity),
      ...treeIntegrityItems(source.treeIntegrity),
      ...source.assumptions.map(
        (assumption, index) => localizedText(
          `Assumption ${index + 1}: ${userFacingAssumption(assumption)}`,
          `Předpoklad ${index + 1}: ${userFacingAssumption(assumption)}`,
        ),
      ),
    ];
  }
  return [localizedText("Basic heuristic", "Základní heuristika")];
}

/**
 * Show the SPR the strategy was actually solved at, and warn when the shown spot
 * sits far from it. A rule matches a wide SPR band while its content comes from a
 * solve at one point, so a spot can display strategy computed at a very different
 * stack depth - most visibly a shallow three-bet pot shown a deeper solve. The
 * band alone hides this; the solved point and the distance make it honest.
 */
function sprFidelityItems(fidelity: StrategyPackSource["sprFidelity"]): readonly string[] {
  if (!fidelity) return [];
  const solved = localizedText(
    `Solved at SPR ${fidelity.solvedSpr}`,
    `Solveno na SPR ${fidelity.solvedSpr}`,
  );
  if (fidelity.band === "MATCH") return [solved];

  const times = `${fidelity.ratio}x`;
  const warning = fidelity.band === "MISMATCH"
    ? localizedText(
      `Shown SPR is ${times} the solved SPR - the strategy may not transfer`,
      `Zobrazené SPR je ${times} solveného - strategie nemusí sedět`,
    )
    : localizedText(
      `Shown SPR is ${times} the solved SPR - treat as approximate`,
      `Zobrazené SPR je ${times} solveného - ber orientačně`,
    );
  return [solved, warning];
}

/**
 * Describe how the strategy relates to the board, without overstating it.
 *
 * "Texture match: paired, low, dry" reads as evidence that the strategy was
 * selected for this board. For the shipped library it is not: eighteen of the
 * nineteen rules declare every texture in the taxonomy and the nineteenth omits
 * one, so the reported match is the intersection of the board's own textures with
 * everything - which is just a description of the board that was dealt.
 *
 * These are family-level aggregates and their ids say so. A rule covering the
 * whole taxonomy says that plainly; anything narrower reports how much it covers,
 * because twelve of thirteen is not a match either and no threshold should have
 * to be invented to say so.
 */
function textureItems(source: StrategyPackSource): readonly string[] {
  const coverage = source.textureCoverage;
  // Prázdný seznam znamená, že odpověď na texturách nestojí - vyřešená rodina
  // odpovídá na jednu konkrétní desku, ne na třídu textur. Říct „shoda textury:"
  // a nechat za dvojtečkou prázdno by bylo tvrzení, které se o nic neopírá.
  if (source.matchedTextures.length === 0) return [];
  const matched = source.matchedTextures.map(textureLabel).join(", ");
  if (coverage === undefined) {
    return [localizedText(`Texture match: ${matched}`, `Shoda textury: ${matched}`)];
  }
  if (coverage.covered >= coverage.total) {
    return [localizedText(
      "One aggregate for every board texture in this band, not tuned to this board",
      "Jeden agregát pro všechny textury desky v tomto pásmu, není laděný na tuhle desku",
    )];
  }
  // Stated as a fraction so a rule covering twelve of thirteen cannot pass for a
  // selective one, and a genuinely narrow rule reads as narrow, with no threshold
  // anywhere for someone to argue about.
  return [
    localizedText(
      `Covers ${coverage.covered} of ${coverage.total} board textures`,
      `Pokrývá ${coverage.covered} z ${coverage.total} textur desky`,
    ),
    localizedText(`This board matches: ${matched}`, `Tahle deska odpovídá: ${matched}`),
  ];
}

/**
 * Say when a rule's content was aggregated over two different solver trees.
 *
 * Some families were solved partly on the authoritative full tree and partly on
 * a reduced one that has no turn or river raise, no donk and no all-in. That is a
 * different game, not a coarser description of the same one, so an aggregate over
 * both blends two of them. The release gate has named these families to operators
 * since the mixing was found, and the player training the spot was told nothing -
 * while being told plainly when the shown SPR sits far from the solved one.
 */
function treeIntegrityItems(integrity: StrategyPackSource["treeIntegrity"]): readonly string[] {
  if (integrity !== "MIXED_TREES") return [];
  return [localizedText(
    "Built from two solver trees - one without turn and river raises, so treat the turn and river plan as approximate",
    "Postaveno ze dvou solverových stromů - jeden bez raisů na turnu a riveru, takže plán na turnu a riveru ber orientačně",
  )];
}

/**
 * Never present a heuristic answer as solver-backed. This reads the structural
 * provenance the resolver records, not the wording of an assumption: matching
 * free text meant that rephrasing one sentence would silently relabel the public
 * heuristic model as production content.
 */
function isPublicHeuristicStrategySource(source: StrategyPackSource): boolean {
  return source.provenance === "PUBLIC_HEURISTIC";
}

function userFacingAssumption(assumption: string): string {
  if (getAppLanguage() === "EN") {
    return assumption
      .replace(/\bStrategyPack\b/g, "strategy model")
      .replace(/\bRangePack\b/g, "strategy model");
  }
  return assumption
    .replace(
      /^Public heuristic(?: .*?)? StrategyPack only; no paid chart values or exact solver frequencies are copied\.$/,
      "Veřejná tréninková heuristika bez přesných solverových frekvencí.",
    )
    .replace(
      "Flop first: board texture, position pattern, pot type, SPR and effective stack are explicit dimensions.",
      "Flop model explicitně rozlišuje texturu boardu, pozice, typ potu, SPR a efektivní stack.",
    )
    .replace(
      "Turn and river packs should be added only after the flop model is stable.",
      "Turn a river model se přidává až po stabilizaci flop modelu.",
    )
    .replace(
      "Rules are texture-level training prompts, not production equilibrium strategy.",
      "Pravidla jsou tréninkové podněty podle textury, nikoli produkční rovnovážná strategie.",
    )
    .replace(
      "River decisions are simplified to check, small value/block bet, or large polarized pressure.",
      "River rozhodnutí jsou zjednodušena na check, malý value/block bet nebo velký polarizovaný tlak.",
    )
    .replace(
      "Specific blocker/card-removal selection remains future solver/import work.",
      "Přesný výběr podle blockerů a card removal zůstává úkolem solver/import pipeline.",
    )
    .replace(/\bStrategyPack\b/g, "model")
    .replace(/\bRangePack\b/g, "model")
    .replace(/\bLOW confidence\b/g, "nízká spolehlivost");
}

function confidenceLabel(confidence: "LOW" | "MEDIUM" | "HIGH"): string {
  switch (confidence) {
    case "LOW":
      return localizedText("low", "nízká");
    case "MEDIUM":
      return localizedText("medium", "střední");
    case "HIGH":
      return localizedText("high", "vysoká");
    default:
      return confidence;
  }
}
