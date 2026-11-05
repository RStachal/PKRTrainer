import { bestActionsForActionEv } from "../../core/actionEv";
import type { ActionKey, RealVersusGto, Spot } from "../../core/types";
import { localizedText } from "../cs";
import { formatSignedBb } from "../kit/format";
import { formatSharePercent } from "../kit/strategyBar";
import { archetypeName, archetypeOpponent } from "../villainText";
import { el } from "./trainerFrame";

/**
 * Režim REAL ve vyhodnocení (Agents/plan-gto-real-2026-11.md, 3.3): co by platilo
 * v GTO, co proti tomuhle soupeři a proč, a že to stojí na modelu hráče.
 *
 * Hráč se má naučit, kdy a o kolik se od rovnováhy odchýlit, proto je GTO vidět vždy.
 * Heuristika se nesmí vydávat za solver, proto je u toho původ. Číslo v BB je jen
 * tam, kde se dá spočítat (all-in spoty); u open, 3-betu a callu model říká směr.
 */

/** Rozdíl pod zaokrouhlením se neukazuje: „složí 78 % místo 78 %“ nic neříká. */
function moved(value: RealVersusGto): boolean {
  return Math.round(value.real * 100) !== Math.round(value.gto * 100);
}

export function realComparison(doc: Document, spot: Spot): HTMLElement | null {
  const { real, actionEvs } = spot;
  if (real === undefined) return null;

  const label = (key: ActionKey): string => spot.answers.find((answer) => answer.key === key)?.label ?? key;
  const names = (keys: readonly ActionKey[]): string => keys.map(label).join(" / ");
  const gtoBest = real.gtoActions;
  const realBest = actionEvs === undefined ? spot.strictCorrect : bestActionsForActionEv(actionEvs);
  const same = gtoBest.length === realBest.length && gtoBest.every((key) => realBest.includes(key));

  const villain = real.villain;
  const against = villain === undefined
    ? localizedText("this table", "tomuhle stolu")
    : archetypeOpponent(villain);

  let comparison: string;
  if (same) {
    comparison = localizedText(
      `GTO and against ${against}: ${names(realBest)}.`,
      `GTO i proti ${against}: ${names(realBest)}.`,
    );
  } else {
    // O kolik se odchylka vyplácí proti tomuhle soupeři, ne proti rovnováze.
    const evOf = (key: ActionKey): number | undefined => actionEvs?.values.find((item) => item.action === key)?.evBb;
    const best = evOf(realBest[0]);
    const baseline = evOf(gtoBest[0]);
    const gain = best === undefined || baseline === undefined ? "" : `, ${formatSignedBb(best - baseline, 2)}`;
    comparison = localizedText(
      `GTO: ${names(gtoBest)}. Against ${against}: ${names(realBest)}${gain}.`,
      `GTO: ${names(gtoBest)}. Proti ${against}: ${names(realBest)}${gain}.`,
    );
  }

  const block = el(doc, "div", "dx-trainer__real");
  block.append(el(doc, "p", "dx-trainer__real-line", comparison));

  const whoEn = villain === undefined ? "The table" : `The ${archetypeName(villain).toLowerCase()}`;
  const whoCs = villain === undefined ? "Stůl" : archetypeName(villain);
  const why = (english: string, czech: string): void => {
    block.append(el(doc, "p", "dx-trainer__real-why", localizedText(`${whoEn} ${english}`, `${whoCs} ${czech}`)));
  };
  if (real.raiseShare !== undefined && moved(real.raiseShare)) {
    const share = formatSharePercent(real.raiseShare.real);
    const baseline = formatSharePercent(real.raiseShare.gto);
    if (real.raiseKind === "3BET") {
      why(`3-bets ${share} of hands instead of ${baseline}.`, `3-betuje ${share} rukou místo ${baseline}.`);
    } else {
      why(`opens ${share} of hands instead of ${baseline}.`, `otevírá ${share} rukou místo ${baseline}.`);
    }
  }
  if (real.foldFrequency !== undefined && moved(real.foldFrequency)) {
    const folds = formatSharePercent(real.foldFrequency.real);
    const baseline = formatSharePercent(real.foldFrequency.gto);
    const to = real.foldAgainst === undefined ? "" : real.foldAgainst === "3BET" ? "3-bet" : "4-bet";
    why(
      `folds ${folds}${to === "" ? "" : ` to a ${to}`} instead of ${baseline}.`,
      `${to === "" ? "" : `na ${to} `}složí ${folds} místo ${baseline}.`,
    );
  }
  if (real.shoveShare !== undefined && moved(real.shoveShare)) {
    const share = formatSharePercent(real.shoveShare.real);
    const baseline = formatSharePercent(real.shoveShare.gto);
    why(`goes all-in with ${share} of hands instead of ${baseline}.`, `jde all-in s ${share} rukou místo ${baseline}.`);
  }
  block.append(el(
    doc,
    "p",
    "dx-trainer__origin",
    localizedText("Player model (estimate)", "Model hráče (odhad)"),
  ));
  return block;
}
