import {
  generatePostflopSpot,
  PostflopStrategyUnavailableError,
  type PostflopPositionContext,
  type PostflopPotType,
  type PostflopSpot,
  type PostflopStreet,
  type PostflopStrategyResolver,
} from "../core/postflopGenerator";
import type { PostflopActionNode } from "../core/postflopTrainingSpot";
import {
  mttPostflopPilotScopeForInput,
  resolvingMttPostflopPilotScopes,
} from "../data/ranges/mttPostflopPilotRuntime";
import {
  cataloguePatternFor,
  primeRiverEvForSeed,
  primeTurnEvForSeed,
  solvedFlopConfigForSeed,
  solvedRiverConfigForSeed,
  solvedTurnConfigForSeed,
} from "../data/ranges/solvedSpotDealing";

/**
 * Rozdání jednoho postflopového spotu - bez DOM.
 *
 * Do 23. 10. 2026 žilo uvnitř `renderPostflopView` (`postflopView.ts`). Nové
 * GUI (Agents/ui-redesign-plan.md, fáze 1, krok 3) rozdává totéž a druhá kopie
 * by se rozešla právě v tom, co tu stojí za nejvíc: který katalog vyřešených
 * desek se použije, kdy se čeká na tabulku EV a jak se odliší pilot čekající na
 * přesolvení od chybějícího obsahu.
 */

export interface PostflopDealRequest {
  seed: number;
  street: PostflopStreet;
  actionNode: PostflopActionNode;
}

/** Co si hráč vybral a čím se rozdává; v dnešním GUI z `PostflopViewOptions`. */
export interface PostflopDealContext {
  potType?: PostflopPotType;
  potBB?: number;
  effectiveStackBB?: number;
  positionContext?: PostflopPositionContext | null;
  strategyResolver: PostflopStrategyResolver;
  allowFallback?: boolean;
}

export type PostflopDeal =
  | { kind: "SPOT"; spot: PostflopSpot }
  /**
   * Pro vybranou situaci obsah není. `resolvingPilot` odliší pilota, který se
   * schválně nerozdává a čeká na přesolvení, od chybějícího produkčního obsahu.
   */
  | { kind: "UNAVAILABLE"; resolvingPilot: boolean };

/**
 * Je vybraná situace pilot, který se přesolvuje?
 *
 * Dvě různá „tady nic nemám" se nesmějí slít do jedné věty. Pilot, jehož
 * strategii čtenář odmítl, se nerozdává schválně a čeká na přesolvení
 * (rozhodnutí vlastníka 9a a odpověď 4a, 22. 9. 2026); všude jinde jde
 * o chybějící produkční obsah. Hráč, který za pilota platí, má vědět,
 * které z toho se mu právě stalo.
 *
 * Scope se skládá z toho, co hráč vybral (ulice, typ potu, dvojice sedaček,
 * uzel) - textury na něj vliv nemají, takže se posílá prázdné pole. Když
 * mapování scope nenajde, nejde o pilotní buňku a platí obecná hláška.
 */
export function isResolvingPilotSpot(
  street: PostflopStreet,
  actionNode: PostflopActionNode | undefined,
  options: { potType: PostflopPotType; positionPattern: string | undefined },
): boolean {
  if (actionNode === undefined || options.positionPattern === undefined) return false;
  const scope = mttPostflopPilotScopeForInput({
    street,
    textures: [],
    potType: options.potType,
    potBB: 1,
    effectiveStackBB: 1,
    positionPattern: options.positionPattern as never,
    actionNode,
  });
  return scope !== null && resolvingMttPostflopPilotScopes().includes(scope);
}

/** Situace pro katalog vyřešených desek; `undefined`, když si hráč nic nevybral. */
function catalogueSituation(context: PostflopDealContext) {
  // Vzor pro katalog, ne vzor kontextu: filtry u obrany blindu dávají hrubé
  // `EP_VS_BB`, kdežto katalog vede jemné `SRP_CO_VS_BB` (viz
  // `cataloguePatternFor`). Kontext pro generátor a zálohu zůstává beze změny.
  return context.positionContext
    ? {
      positionPattern: cataloguePatternFor(context.positionContext),
      stackBB: context.effectiveStackBB,
    }
    : undefined;
}

/**
 * Tabulka EV, na kterou se musí před rozdáním počkat; `undefined`, když není
 * na co.
 *
 * Tabulka se musí stihnout načíst, jinak ji resolver uprostřed rozdání nenajde
 * a spot se ukáže bez čísel. Viz `primeRiverEvForSeed`. Je to samostatný krok
 * a ne `await` uvnitř rozdání schválně: **nečeká se, když není na co**. Jinak
 * by se z každého rozdání stala asynchronní operace - i tam, kde se žádná
 * tabulka nenačítá - a spot by se přestal vykreslovat synchronně. Tentýž vzor
 * jako u rozdání, jinak by se předčetla tabulka jiné rodiny než té rozdané
 * (viz `solvedSpotDealing.ts`).
 */
export function primePostflopDeal(
  request: PostflopDealRequest,
  context: PostflopDealContext,
): Promise<unknown> | undefined {
  const { seed, street, actionNode } = request;
  const situation = catalogueSituation(context);
  return street === "RIVER"
    ? primeRiverEvForSeed(seed, actionNode, situation)
    : street === "TURN"
      ? primeTurnEvForSeed(seed, actionNode, situation)
      : undefined;
}

/** Rozdá spot; předtím se má počkat na `primePostflopDeal`, když něco vrátí. */
export function dealPostflopSpot(
  request: PostflopDealRequest,
  context: PostflopDealContext,
): PostflopDeal {
  const { seed, street, actionNode } = request;
  // A solved turn answers one board and refuses every other, so dealing at
  // random reaches it about never - the content being unreachable and the
  // resolver being broken look identical from the player's side. When solved
  // turns are loaded and the player has not pinned the situation themselves,
  // deal one of them.
  //
  // Only one that answers the decision the player asked for. Overriding the
  // situation selector to reach solved content would answer a question they
  // did not ask, which is a worse failure than falling back to a heuristic on
  // the question they did.
  /*
   * Katalog se používá **vždy**, i když si hráč situaci vybral.
   *
   * Do 14. 10. 2026 tu stálo `dealsSolved = initialPositionContext == null`,
   * tedy katalog se obcházel, jakmile si hráč něco vybral - a deska se
   * losovala. Změřeno (`npm run mtt:picked-situation`, 300 spotů na ulici):
   * matice se tím barvila podle akce v **0,0 %** spotů proti 100 % na
   * katalogové cestě, a cena akce na flopu klesla z 31,3 % na nulu.
   * Odpovídal texturový pilot, který `rangeBuckets` nenese, takže matice
   * přepnula na sílu ruky - správné chování, ale jiná osa, než na jakou se
   * hráč ptá.
   *
   * Vyřešený obsah přitom pro **35 z 61** nabízených situací existuje
   * (`npm run mtt:catalogue-situations`). Stačí tedy katalog filtrovat
   * podle vybraného vzoru místo obcházení; když pro ten vzor nic nemá,
   * vrátí `undefined` a spadne se na dosavadní chování s losovanou deskou.
   */
  const situation = catalogueSituation(context);
  // `Partial`, protože katalog nemusí nabídnout nic a pak se nepřebíjí nic:
  // prázdný katalog nesmí znamenat, že se nedá hrát.
  const solved: Partial<Parameters<typeof generatePostflopSpot>[0]> = (
    street === "TURN"
      ? solvedTurnConfigForSeed(seed, actionNode, situation)
      // Flop ze stejného důvodu a od 21. 8. 2026: rodin se dodává 47 a bez
      // katalogu se na vyřešenou desku trefil hráč v 0,0 % rozdání.
      //
      // Pozn. k tomu číslu: platí pro turn a river, kde vyřešený pack
      // odpovídá jen na desku, kterou solvil. U flopu je to 18,8 %,
      // protože chartové packy odpovídají na třídu textury. Původní
      // měření hlásilo nulu všude, protože se ptalo na neexistující pole
      // `spot.recommendation` - opraveno 26. 8. 2026.
      : street === "FLOP"
        ? solvedFlopConfigForSeed(seed, actionNode, situation)
        // A river, poslední ulice, která katalog pro jednotlivý spot neměla.
        : street === "RIVER"
          ? solvedRiverConfigForSeed(seed, actionNode, situation)
          : undefined
  ) ?? {};
  try {
    const spot = generatePostflopSpot({
      seed,
      street,
      potType: context.potType,
      actionNode,
      potBB: context.potBB,
      effectiveStackBB: context.effectiveStackBB,
      positionContext: context.positionContext ?? undefined,
      strategyResolver: context.strategyResolver,
      // Jednotlivý spot zůstává přísný. Hráč si vybral ulici, obsah pro ni
      // máme, a tiše mu podstrčit heuristiku je přesně to, čemu tenhle příznak
      // brání. Uvolňuje se jen linka, která prochází i ulice bez obsahu.
      allowFallback: context.allowFallback,
      ...solved,
    });
    return { kind: "SPOT", spot };
  } catch (error) {
    // Only a missing-strategy refusal means "no content for this spot". A bare
    // catch made every other failure look like that too, so a real defect would
    // have been reported by players as thin coverage and never as a bug.
    if (!(error instanceof PostflopStrategyUnavailableError)) throw error;
    return {
      kind: "UNAVAILABLE",
      resolvingPilot: isResolvingPilotSpot(street, actionNode, {
        potType: context.potType ?? "SINGLE_RAISED",
        positionPattern: context.positionContext?.positionPattern,
      }),
    };
  }
}
