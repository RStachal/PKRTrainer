import type { PostflopRecommendationSource } from "../../core/postflopGenerator";

/**
 * Zdroj odpovědi vyřešené rodiny, se všemi poli, která kontrakt vyžaduje.
 *
 * ## Proč to vzniklo
 *
 * Všechny tři vyřešené resolvery skládaly zdroj ze **šesti polí** a výsledek
 * protlačily přes `as PostflopRecommendation`. Kontrakt jich ale vyžaduje
 * šestnáct, takže přetypování umlčelo kompilátor a obrazovka s výsledkem pak
 * volala `.map()` nad `undefined`.
 *
 * **Změřeno 24. 8. 2026: 18 z 18 rozdaných spotů na všech třech ulicích mělo
 * nula bloků vysvětlení místo pěti.** Hráč odpověděl a celá část „proč" se
 * nevykreslila.
 *
 * Byla to latentní vada. Dokud se vyřešený obsah rozdával náhodnou deskou,
 * resolver skoro nikdy neodpověděl a tahle cesta se nespustila; katalogy ji
 * zpřístupnily a tím ji odkryly. Zpřístupnit obsah znamená projít cesty, po
 * kterých dosud nikdo nešel.
 *
 * ## Co se sem smí vyplnit a co ne
 *
 * Jen to, co vyřešená rodina doopravdy ví. `matchedTextures` zůstává prázdné
 * **schválně**: rodina odpovídá na jednu konkrétní desku, ne na třídu textur,
 * takže „shoda textury" pro ni nedává smysl a UI ji vynechá. Vyplnit tam něco
 * by bylo tvrzení, které se o nic neopírá.
 */
export interface SolvedSourceInput {
  packId: string;
  packVersion: string;
  packVerifiedAt: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  assumptions: readonly string[];
  positionPattern: string;
  ruleId: string;
  /** Pot a stack uzlu v blindech, pro pravdivé SPR. Chybí-li, SPR se neuvádí. */
  potBB?: number;
  stackBehindBB?: number;
}

export function solvedStrategySource(
  input: SolvedSourceInput,
): PostflopRecommendationSource {
  // SPR vyřešeného pravidla je **bod, ne pásmo**: rodina byla spočítaná na
  // jedné hloubce. Obě meze jsou proto stejné a odchylku hlásí `sprFidelity`,
  // ne šířka pásma.
  const spr = input.potBB !== undefined && input.potBB > 0 && input.stackBehindBB !== undefined
    ? Math.round((input.stackBehindBB / input.potBB) * 10) / 10
    : 0;
  return {
    kind: "STRATEGY_PACK",
    provenance: "SOLVER_BACKED",
    packId: input.packId,
    packVersion: input.packVersion,
    packVerifiedAt: input.packVerifiedAt,
    ruleId: input.ruleId,
    confidence: input.confidence,
    // Prázdné schválně - viz hlavička. UI textovou položku vynechá.
    matchedTextures: [],
    sprMin: spr,
    sprMax: spr,
    positionPattern: input.positionPattern as PostflopRecommendationSource extends
      { positionPattern: infer P } ? P : never,
    // Vyřešená rodina nemá externí zdroj: vznikla z vlastního solvu.
    sourceUrls: [],
    assumptions: [...input.assumptions],
    // Vyřešené pravidlo se vybírá shodou desky, ne skóre, takže není co seřadit.
    selectionScore: 0,
    tieBreak: "RULE_SCORE_THEN_PACK_ORDER",
  };
}
