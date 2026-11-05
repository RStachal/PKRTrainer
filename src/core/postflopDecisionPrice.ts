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
/**
 * Proč hráč cenu nevidí - rozlišené, ne shrnuté do jedné nuly.
 *
 * Změřeno 6. 9. 2026: cena dojde na flopu ve **25,0 %** rozdaných spotů, na
 * turnu ve 36,3 % a na riveru v 51,7 %. Samotné to číslo vypadá jako ztráta,
 * protože na flopu a turnu je cena jediné číslo, které tam být může - EV se tam
 * spočítat nedá (bod 131).
 *
 * Rozpad ale říká opak: **75 % flopových spotů je `NEČELÍ_SÁZCE`**, tedy hrdina
 * jedná první a nemá co dorovnávat. Cena vlastní sázky by se počítala
 * z modelované velikosti a vypadala by stejně autoritativně jako ta spočítaná
 * ze skutečné - jedno prázdné místo je lepší než dvě čísla, ze kterých jedno
 * tiše lže. Hráč tam navíc bez čísla nezůstane: frekvence dojde ve 100 % spotů.
 *
 * `CHYBÍ_SÁZKA` a `CHYBÍ_POT` jsou proti tomu skutečné vady dat - spot je
 * vyřešený, hrdina před sázkou stojí, a přesto se cena nedá spočítat. Obojí je
 * dnes na nule a `mtt:post-answer` na ně má **přísnou nulu**, ne mez s rezervou.
 */
export type PostflopPriceGap =
  | "OCENĚNO"
  | "NENÍ_VYŘEŠENÝ"
  | "CHYBÍ_SÁZKA"
  | "CHYBÍ_POT"
  | "NEČELÍ_SÁZCE";

export function postflopPriceGap(spot: PostflopTrainingSpot): PostflopPriceGap {
  const source = spot.explanation.source;
  if (source.kind !== "STRATEGY_PACK") return "NENÍ_VYŘEŠENÝ";

  // **Pořadí je tady celá diagnóza, ne úprava.**
  //
  // `facingBetBB` vrací `undefined` i u spotu, kde hrdina žádné sázce nečelí -
  // je to jeho první podmínka. Ptát se na něj dřív než na nabídku `CALL` proto
  // spočítá legitimní případy jako vadu dat. Změřeno 6. 9. 2026: při obráceném
  // pořadí vyšlo „nečelí sázce" na **0 %** a „chybí sázka" na 75 % flopu, což
  // znělo jako rozbitý obsah - a bylo to jen tímhle. Ověřeno falsifikací 6. 9.
  // 2026: s obráceným pořadím vrátí brána exit 1.
  if (!spot.actions.some((option) => option.action === "CALL")) return "NEČELÍ_SÁZCE";

  // Teprve teď jsou obě příčiny skutečné vady, a každá vede jinam: chybějící
  // velikost sázky je vada linie pravidla, chybějící pot vada uzlu.
  if (source.facingBetBB === undefined) return "CHYBÍ_SÁZKA";
  if (source.nodePotBB === undefined) return "CHYBÍ_POT";
  return "OCENĚNO";
}

export function postflopDecisionPrices(spot: PostflopTrainingSpot): DecisionPrice[] {
  // Jedna definice pro cenu i pro její diagnostiku: dvě kopie téhle podmínky by
  // se rozešly tiše a měření by pak tvrdilo něco jiného než UI.
  if (postflopPriceGap(spot) !== "OCENĚNO") return [];
  const source = spot.explanation.source;
  // Zúžení pro překladač; rozhodnutí padlo o řádek výš. Přetypováním by se tahle
  // dvojice podmínek dala obejít, jenže pak by se chyba v `postflopPriceGap`
  // projevila až pádem na `undefined` uvnitř výpočtu.
  if (source.kind !== "STRATEGY_PACK") return [];
  const toCallBB = source.facingBetBB;
  const potBB = source.nodePotBB;
  if (toCallBB === undefined || potBB === undefined) return [];
  return decisionPrices({
    // Jen dorovnání: vlastní sázka je model, ne solverovo číslo. Viz hlavička.
    actions: ["CALL"] as never,
    potBB,
    toCallBB,
    riskByAction: {},
  });
}
