import { decisionPrices, type DecisionPrice } from "./decisionPrice";
import type { PostflopTrainingSpot } from "./postflopTrainingSpot";

/**
 * Cena akcí na postflopu, ze skutečné linie vyřešeného pravidla.
 *
 * ## Proč je to poctivější než preflopová cena
 *
 * Na preflopu si produkt velikost tří-betu zvolil, protože ji neučí. Tady se
 * nevolí nic: pravidlo nese, co solver hrál, a cena z toho vyjde přesně.
 *
 * Změřeno 28. 8. 2026: z 29 043 vyřešených pravidel jich **16 410 (56,5 %)**
 * staví hrdinu před sázku. Flop a turn přitom dnes nemají **žádné** číslo -
 * EV se tam spočítat nedá (bod 131), takže tohle je první cena, kterou tam
 * hráč uvidí.
 *
 * ## Co se nepočítá
 *
 * Vlastní sázka hrdiny (`BET_SMALL`, `BET_BIG`, `RAISE`). Její velikost je model
 * (třetina a tři čtvrtiny potu), ne solverovo číslo, a požadované složení
 * spočítané z modelované velikosti by vypadalo stejně přesně jako cena
 * dorovnání spočítaná ze skutečné. Jedno prázdné místo je lepší než dvě čísla,
 * ze kterých jedno tiše lže.
 */
export function postflopDecisionPrices(spot: PostflopTrainingSpot): DecisionPrice[] {
  const source = spot.explanation.source;
  if (source.kind !== "STRATEGY_PACK") return [];
  const toCallBB = source.facingBetBB;
  const potBB = source.nodePotBB;
  if (toCallBB === undefined || potBB === undefined) return [];

  const actions = spot.actions.map((option) => option.action);
  if (!actions.includes("CALL")) return [];
  return decisionPrices({
    // Jen dorovnání: vlastní sázka je model, ne solverovo číslo. Viz hlavička.
    actions: ["CALL"] as never,
    potBB,
    toCallBB,
    riskByAction: {},
  });
}
