import type { ActionKey } from "./types";

/**
 * Jak se akce jmenuje směrem k hráči. **Jedno místo pro celý produkt.**
 *
 * ## Proč to vzniklo
 *
 * Tenhle popisek existoval třikrát: v `drillEngine` (tlačítka), v `hhParser`
 * (rozbor historie) a v `preflopExplanation` (zdůvodnění po odpovědi). První dva
 * byly znak po znaku stejné, třetí se lišil v šesti položkách - a ten rozdíl
 * viděl hráč.
 *
 * Změřeno 27. 8. 2026 na celém poolu: **8 366 z 78 585 spotů (10,65 %)** radilo
 * jiným slovem, než jaké stálo na tlačítku.
 *
 * | zdůvodnění radilo | tlačítko se jmenovalo | spotů |
 * |---|---|---|
 * | Open 2.5x | Raise 2.5x | 3 502 |
 * | Jam | All-in | 1 861 |
 * | Open 2x | Raise 2x | 1 260 |
 * | Limp / check | Limp / Check | 1 041 |
 * | Call jam | Call all-in | 702 |
 *
 * Hráč si tedy po odpovědi přečetl „Doporučení: Jam" a hledal tlačítko, které
 * se jmenovalo „All-in". Není to špatná rada, je to **dvojí slovník na jedné
 * obrazovce** - a ten stojí hráče přesně tolik úsilí, kolik má trénink ušetřit.
 *
 * Vyhrálo znění tlačítek, protože na ně hráč kliká: rada má jmenovat věc, na
 * kterou se dá ukázat.
 */
export const ACTION_KEY_LABEL: Record<ActionKey, string> = {
  FOLD: "Fold",
  CALL: "Call",
  LIMP: "Limp / Check",
  OVERLIMP: "Over-limp",
  OPEN_2X: "Raise 2x",
  OPEN_25X: "Raise 2.5x",
  OPEN_3X: "Raise 3x",
  ISO_2X: "Iso-raise 2x",
  ISO_25X: "Iso-raise 2.5x",
  ISO_3X: "Iso-raise 3x",
  "3BET": "3-bet",
  "4BET": "4-bet",
  SQUEEZE: "Squeeze",
  JAM: "All-in",
  CALL_JAM: "Call all-in",
};
