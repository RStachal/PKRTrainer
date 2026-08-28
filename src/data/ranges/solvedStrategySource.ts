import type {
  PostflopAction,
  PostflopActionFrequency,
  PostflopRangeBucket,
  PostflopRecommendationSource,
} from "../../core/postflopGenerator";
import type { Card, HandLabel } from "../../core/types";
import { bettingLaneForHand } from "../../core/flopHandCategory";

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
  /**
   * Co se dělá s každou třídou rukou, pro matici range.
   *
   * Prázdné pole se do zdroje **nezapíše**, aby se „nevíme" nedalo splést s
   * „všechny ruce se skládají". Sestavuje se `solvedRangeBuckets`.
   */
  rangeBuckets?: readonly PostflopRangeBucket[];
  /**
   * Kolik stojí dorovnat sázku, které hrdina čelí, v blindech.
   *
   * Ze **skutečné** linie, kterou solver hrál - ne z modelu. Chybí tam, kde
   * hrdina sázce nečelí, a chybět má: prázdno se pozná, odhad ne.
   */
  facingBetBB?: number;
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
    ...(input.rangeBuckets !== undefined && input.rangeBuckets.length > 0
      ? { rangeBuckets: [...input.rangeBuckets] }
      : {}),
    ...(input.facingBetBB !== undefined && input.facingBetBB > 0
      ? { facingBetBB: input.facingBetBB }
      : {}),
    // Pot **uzlu**, ne obecný pot podle typu potu. Spot nese 6 / 18 / 4 BB
    // podle toho, jestli je to SRP nebo tři-betovaný pot; vyřešené pravidlo
    // nese pot, který na stole doopravdy byl. Cena dorovnání musí sedět na
    // tenhle, jinak by se počítala sázka z jedné hry proti potu z jiné.
    ...(input.potBB !== undefined && input.potBB > 0 ? { nodePotBB: input.potBB } : {}),
  };
}

/**
 * Kbelík tak, jak ho drží vyřešené pravidlo: solverův popisek a třídy rukou.
 *
 * Tvar je společný turnu, riveru i flopu, protože je to tentýž `TurnRangeBucket`
 * - jen se sem kopíruje strukturálně, aby `solvedStrategySource` nezáviselo na
 * modulu jedné ulice.
 */
export interface SolvedBucketInput {
  /** Solverův vlastní popisek akce, např. "BET 75.000000". */
  action: string;
  handClasses: readonly HandLabel[];
  combos: number;
  mix: readonly { action: string; frequency: number }[];
}

/** Akce, u kterých má smysl dělit hodnotu od blafu. Zbytek peníze nepřidává. */
const AGGRESSIVE: readonly PostflopAction[] = ["BET_SMALL", "BET_BIG", "RAISE"];

/**
 * Popisek kbelíku, který uvidí hráč.
 *
 * Nesmí to být název akce z kódu: `uiNoSourceCitation` zakazuje vnitřní řetězce
 * v hráčském textu, a „BET_SMALL" by navíc nikomu nic neřeklo.
 */
function bucketLabel(action: PostflopAction, lane: "VALUE" | "BLUFF" | "CHECK"): string {
  if (lane === "BLUFF") return "Blaf";
  switch (action) {
    case "BET_SMALL":
    case "BET_BIG":
      return "Sázka pro hodnotu";
    case "RAISE":
      return "Zvýšení pro hodnotu";
    case "CALL":
      return "Dorovnání";
    case "FOLD":
      return "Složení";
    case "CHECK":
    default:
      return "Check";
  }
}

/**
 * Kbelíky vyřešeného pravidla ve tvaru, kterému rozumí matice range.
 *
 * ## Proč to vzniklo
 *
 * `solvedStrategySource` vracelo zdroj **bez `rangeBuckets`**, takže matice
 * neměla jedinou buňku s akcí. Dokud vyřešený obsah odpovídal zřídka, odpovídal
 * chartový resolver, který je vyplňuje; katalogy ho vytlačily na 100 % rozdaných
 * spotů a akce v matici tím zmizely, aniž by to cokoli ohlásilo.
 *
 * **Změřeno 25. 8. 2026: 0 tříd ze 169 mělo přiřazenou akci** na všech třech
 * ulicích. Data přitom na disku ležela celou dobu - každé vyřešené pravidlo nese
 * `buckets[]` s akcí, třídami rukou i frekvenční směsí.
 *
 * ## Proč se kbelík dělí na hodnotu a blaf
 *
 * Solver drží jeden kbelík na akci, takže „sází" je jedna skupina, ve které jsou
 * vedle sebe dvě páry i naprosté nic. Hráč ale potřebuje vidět **obojí zvlášť** -
 * a vlastníkovy vlastní charty to tak dělají: legenda je „3 bet for value" a
 * „3b bluff" jako dvě položky téže akce. Agresivní kbelík se proto rozdělí podle
 * `bettingLaneForHand`, což je táž funkce, kterou používá zbytek produktu.
 *
 * Pasivní akce se nedělí: u checku ani u složení není co blafovat.
 */
export function solvedRangeBuckets(
  buckets: readonly SolvedBucketInput[],
  solverActions: readonly string[],
  translated: readonly { action: PostflopAction }[],
  board: readonly Card[],
): PostflopRangeBucket[] {
  // Bez desky se hodnota od blafu odlišit nedá, a hádat se to nebude: kbelíky se
  // v takovém případě nevydají vůbec. Na dnešních cestách to nenastává - všechny
  // tři vyřešené resolvery vybírají pravidlo shodou desky, takže ji mají - a je
  // to tatáž zásada jako u `matchedTextures`: co rodina neví, to netvrdí.
  if (board.length < 3) return [];
  // Popisek na akci. Překlad slévá - dvě velikosti sázky pod polovinou potu dají
  // obě `BET_SMALL` - takže mapa musí být z popisku, ne z akce.
  const byLabel = new Map<string, PostflopAction>();
  for (const [index, label] of solverActions.entries()) {
    const action = translated[index]?.action;
    if (action !== undefined) byLabel.set(label, action);
  }

  const out: PostflopRangeBucket[] = [];
  for (const bucket of buckets) {
    const action = byLabel.get(bucket.action);
    if (action === undefined) continue;
    const actionMix = translateMix(bucket.mix, byLabel);

    if (!AGGRESSIVE.includes(action)) {
      out.push({
        lane: "CHECK",
        label: bucketLabel(action, "CHECK"),
        action,
        handClasses: [...bucket.handClasses],
        // Vyřešené pravidlo neodpovídá na třídu textury, ale na jednu desku,
        // takže popisné rysy nemá čím naplnit. Prázdné je pravdivé.
        features: [],
        ...(actionMix.length > 0 ? { actionMix } : {}),
      });
      continue;
    }

    const value: HandLabel[] = [];
    const bluff: HandLabel[] = [];
    for (const hand of bucket.handClasses) {
      (bettingLaneForHand(hand, board) === "VALUE" ? value : bluff).push(hand);
    }
    for (const [lane, classes] of [["VALUE", value], ["BLUFF", bluff]] as const) {
      if (classes.length === 0) continue;
      out.push({
        lane,
        label: bucketLabel(action, lane),
        action,
        handClasses: classes,
        features: [],
        ...(actionMix.length > 0 ? { actionMix } : {}),
      });
    }
  }
  return out;
}

/**
 * Směs frekvencí v akcích produktu.
 *
 * Slévání se **sčítá**, ne přepisuje: když solver nabídl dvě velikosti pod
 * polovinou potu, hráč sází `BET_SMALL` součtem obou frekvencí. Přepsáním by
 * druhá velikost tiše zmizela a součet by nedal sto procent.
 */
function translateMix(
  mix: readonly { action: string; frequency: number }[],
  byLabel: ReadonlyMap<string, PostflopAction>,
): PostflopActionFrequency[] {
  const summed = new Map<PostflopAction, number>();
  for (const entry of mix) {
    const action = byLabel.get(entry.action);
    if (action === undefined || !Number.isFinite(entry.frequency)) continue;
    summed.set(action, (summed.get(action) ?? 0) + entry.frequency);
  }
  return [...summed]
    .filter(([, frequency]) => frequency > 0)
    .map(([action, frequency]) => ({
      action,
      frequencyPct: Math.round(frequency * 1000) / 10,
      // Čísla jsou solverova, ne odhad, takže se smí ukázat přesně.
      visibility: "EXACT" as const,
    }));
}
