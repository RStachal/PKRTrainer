import { evaluateActionEv, type ActionEvEvaluation } from "./actionEv";
import type { PostflopAction } from "./postflopGenerator";
import type { PostflopTrainingSpot } from "./postflopTrainingSpot";

export interface PostflopGrade {
  correct: boolean;
  recommended: readonly PostflopAction[];
  actionEv?: ActionEvEvaluation<PostflopAction>;
  /**
   * Hráč zvolil akci, kterou vyřešený obsah vůbec nemodeluje.
   *
   * Není to totéž co chyba a nesmí se to tak počítat. Solver na tom uzlu žádnou
   * takovou větev nepočítal - typicky zvýšení na riveru, kde měl strom jen
   * dorovnání a složení - takže tvrzení „je to špatně" se **neopírá o nic**.
   * Změřeno 23. 8. 2026: na 300 rozdaných riverových spotech se to týkalo 104 z
   * nich, a hráč u všech dostal „špatně".
   */
  unsolved?: boolean;
}

export function gradePostflopAction(
  spot: Pick<PostflopTrainingSpot, "recommendedAction" | "actionEvs">,
  chosen: PostflopAction,
): PostflopGrade {
  const actionEv = spot.actionEvs ? evaluateActionEv(spot.actionEvs, chosen) : null;
  if (!actionEv) {
    // Sada existuje, ale zvolenou akci nezná: obsah ji nemodeluje. Známkovat ji
    // proti doporučení by znamenalo tvrdit, že je horší, a to nikdo nespočítal.
    const modelled = spot.actionEvs?.values.some((item) => item.action === chosen);
    if (modelled === false) {
      // `correct: false`, protože to není správná odpověď - ale `unsolved` říká,
      // že to není ani chyba hráče. Rozlišit to musí ten, kdo z toho počítá
      // statistiku, jinak by se hráči do chybovosti počítalo, co neumíme posoudit.
      return { correct: false, unsolved: true, recommended: [spot.recommendedAction] };
    }
    return {
      correct: chosen === spot.recommendedAction,
      recommended: [spot.recommendedAction],
    };
  }

  return {
    correct: actionEv.outcome === "BEST" || actionEv.outcome === "EQUIVALENT",
    recommended: actionEv.bestActions,
    actionEv,
  };
}
