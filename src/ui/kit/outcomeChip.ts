import type { ActionEvOutcome } from "../../core/actionEv";
import { localizedText } from "../cs";

/**
 * Verdikt, který umí čip ukázat: výsledek EV z domény, „správně“ u spotu bez
 * EV (hodnotí ho jen range, takže nejde říct, jestli šlo o nejlepší akci),
 * nebo „neposouzeno“ pro akci, kterou rozbor nepočítal. Špatná odpověď bez EV
 * je `MISTAKE` - jen bez ztráty v BB.
 *
 * Stupně si UI nevymýšlí. Návrh obrazovek měl původně i „hrubou chybu“, jenže
 * `evaluateActionEv` ji nepočítá - další stupeň by byl změnou domény a
 * statistik, ne vzhledu (Agents/ui-redesign-plan.md, směr bod 4).
 */
export type OutcomeChipKind = ActionEvOutcome | "CORRECT" | "UNSOLVED";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Každý verdikt má vlastní tvar, protože barvy jsou obsazené barvami akcí
 * a barvoslepý hráč by čtyři čipy jinak nerozlišil.
 */
const ICON_PATH: Record<OutcomeChipKind, string> = {
  BEST: "M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z",
  CORRECT: "M3 8.5l3 3 7-7",
  EQUIVALENT: "M3 6h10M3 10h10",
  ACCEPTABLE: "M2.5 9.5c2-3 3.5-3 5.5 0s3.5 3 5.5 0",
  MISTAKE: "M4 4l8 8M12 4l-8 8",
  UNSOLVED: "M5.5 6a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.6M8 12.5v.01",
};

export function outcomeLabel(kind: OutcomeChipKind): string {
  switch (kind) {
    case "BEST":
      return localizedText("Best", "Nejlepší");
    case "CORRECT":
      return localizedText("Correct", "Správně");
    case "EQUIVALENT":
      return localizedText("Equally good", "Stejně dobrá");
    case "ACCEPTABLE":
      return localizedText("Acceptable", "Přijatelná");
    case "MISTAKE":
      return localizedText("Mistake", "Chyba");
    case "UNSOLVED":
      return localizedText("Not judged", "Neposouzeno");
  }
}

export function outcomeChip(doc: Document, kind: OutcomeChipKind): HTMLSpanElement {
  const chip = doc.createElement("span");
  chip.className = `dx-chip dx-chip--${kind.toLowerCase()}`;
  chip.dataset.outcome = kind;

  const icon = doc.createElementNS(SVG_NS, "svg");
  icon.setAttribute("class", "dx-chip__icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATH[kind]);
  icon.appendChild(path);

  chip.append(icon, doc.createTextNode(outcomeLabel(kind)));
  return chip;
}
