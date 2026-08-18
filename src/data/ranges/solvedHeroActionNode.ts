import type { PostflopStreet } from "../../core/postflopGenerator";
import type { PostflopActionNode } from "../../core/postflopTrainingSpot";
import type { TurnStrategyRule } from "./turnStrategyRuleBuilder";

export type SolvedHero = NonNullable<NonNullable<TurnStrategyRule["spot"]>["hero"]>;

/**
 * Které rozhodnutí produktu vyřešený uzel odpovídá, přečtené z uzlu samotného.
 *
 * Jméno rodiny tu zdrojem není a verze, která ho použila, byla špatně:
 * `..._CO_BB_SRP_CBET_...` pojmenovává flopový c-bet, který rodinu definuje,
 * kdežto turnový uzel uvnitř drží rozhodnutí big blindu po dorovnání toho
 * c-betu. Mapovat `CBET` na „barrel" tedy říkalo cutoffu, že drží iniciativu, a
 * servírovalo mu přitom strategii big blindu.
 *
 * Pravidlo místo toho nese tvar uzlu: na které straně stolu leží a jestli je
 * před ním sázka. Ty dva fakty rozhodnutí pojmenují bez toho, aby se šlo přes
 * jméno adresáře.
 *
 * ## Proč je to společné pro turn i river
 *
 * Protože je to tatáž úvaha o ulici dál a druhá kopie by znamenala druhé místo,
 * kde se opravuje jedna chyba. Riverový resolver vznikl bez téhle kontroly úplně
 * a odpovídal na kterékoli riverové rozhodnutí strategií pro hraní první - tedy
 * hráči, který čelí sázce, ukázal, jak sázet. S cedulkou, že to spočítal solver.
 */
export function actionNodeForSolvedHero(
  hero: SolvedHero | undefined,
  street: Extract<PostflopStreet, "FLOP" | "TURN" | "RIVER">,
  potType?: string,
): PostflopActionNode | undefined {
  // Uzel, který neví, čí strategii drží, nepojmenuje žádné rozhodnutí. Tvářit
  // se, že ano, je horší než neodpovědět.
  if (hero === undefined) return undefined;
  if (street === "FLOP") {
    if (hero.facingBet) return "FLOP_FACING_BET";
    // Kdo drží iniciativu, pokračuje v ní; jméno uzlu se liší podle typu potu,
    // protože c-bet ve tříbetovém potu je jiná situace než v jednou zvýšeném.
    if (hero.isAggressor) {
      return potType === "THREE_BET_POT" ? "THREE_BET_POT_CBET" : "SINGLE_RAISED_POT_CBET";
    }
    // Bez iniciativy a na tahu první: lead. Produkt ho zná jen mimo pozici -
    // hráč v pozici, který hraje po checku bez iniciativy, jméno nemá, a
    // vyrobit mu ho by znamenalo dodat obsah, který trenažér nikdy nerozdá.
    return hero.side === "OOP" ? "FLOP_OOP_LEAD" : undefined;
  }
  if (hero.facingBet) return street === "TURN" ? "TURN_FACING_BET" : "RIVER_FACING_BET";
  // Na tahu první s iniciativou je pokračování v agresi; na tahu první bez ní je
  // lead do hráče, který ji má. Role, ne sedačka: small blind, který otevřel, je
  // mimo pozici celou ruku, a nazvat jeho turnovou sázku donkem by učilo opak
  // toho, co udělal.
  if (street === "TURN") return hero.isAggressor ? "TURN_BARREL" : "TURN_OOP_LEAD";
  return hero.isAggressor ? "RIVER_PRESSURE" : "RIVER_OOP_LEAD";
}
