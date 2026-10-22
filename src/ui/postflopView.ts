import { revealActionPriceLines } from "./actionPriceLines";
import { postflopDecisionPrices } from "../core/postflopDecisionPrice";
import {
  generatePostflopSpot,
  POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS,
  PostflopStrategyUnavailableError,
  type BoardTexture,
  type PostflopAction,
  type PostflopHeroRangeBucket,
  type PostflopPositionContext,
  type PostflopPotType,
  type PostflopSpot,
  type PostflopStreet,
  type PostflopStrategyResolver,
} from "../core/postflopGenerator";
import {
  generatePostflopLine,
  type PostflopLine,
  type PostflopLineAction,
  type PostflopLineActionPlan,
} from "../core/postflopLineSimulator";
import {
  postflopSpotToTrainingSpot,
  type PostflopActionNode,
  type PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import { createDefaultPostflopStrategyResolver } from "../data/ranges/postflopStrategyRegistry";
import {
  mttPostflopPilotScopeForInput,
  resolvingMttPostflopPilotScopes,
} from "../data/ranges/mttPostflopPilotRuntime";
import {
  pickSolvedTurnSpot,
  solvedTurnSpotConfig,
  solvedTurnSpots,
} from "../data/ranges/solvedTurnSpotCatalogue";
import {
  pickSolvedRiverSpot,
  solvedRiversForTurnBoard,
} from "../data/ranges/solvedRiverSpotCatalogue";
import {
  cataloguePatternFor,
  primeRiverEvForSeed,
  primeTurnEvForSeed,
  selectedActionNode,
  solvedFlopConfigForSeed,
  solvedRiverConfigForSeed,
  solvedTurnConfigForSeed,
} from "../data/ranges/solvedSpotDealing";
import { primeRiverEvForPack } from "../data/ranges/riverEvPrefetch";
import { mulberry32 } from "../core/rng";
import { RANKS, SUITS } from "../core/poker";
import { POSITION_ORDER, type Card, type Position, type Suit } from "../core/types";
import {
  classifyFlopHand,
  flopzillaLaneForCategory,
  flopzillaLaneLabel,
  flopzillaCategoryLabel,
  postflopHandClassFromCards,
  renderPostflopRangeMatrix,
  type FlopzillaLane,
} from "./postflopRangeMatrixView";
import { CS, getAppLanguage, localizedText } from "./cs";
import { solvedBetSizing, type SolvedBetSizing } from "../data/ranges/solvedBetSizing";
import { gradePostflopAction, type PostflopGrade } from "../core/postflopScoring";
import {
  formatActionEvBb,
  revealActionEvButtonBubbles,
  setActionEvButtonContent,
} from "./actionEvButtonBubbles";

const SEED_MAX = 0xffffffff;
const POSTFLOP_STRATEGY_RESOLVER = createDefaultPostflopStrategyResolver();

export interface PostflopViewOptions {
  initialStreet?: PostflopStreet;
  initialSeed?: number | null;
  initialPositionContext?: PostflopPositionContext | null;
  initialPotType?: PostflopPotType;
  initialActionNode?: PostflopActionNode;
  initialPotBB?: number;
  initialEffectiveStackBB?: number;
  autoGenerate?: boolean;
  strategyResolver?: PostflopStrategyResolver;
  allowFallback?: boolean;
  /**
   * Fallback uvnitř hrané linky, když má hráč vyřešený jen některé ulice.
   *
   * Jednotlivý spot může být přísný: hráč si vybral turn, obsah na turn máme, a
   * tiše mu podstrčit heuristiku by bylo přesně to, čemu `allowFallback: false`
   * brání. Linka ale prochází flop, turn i river a vyřešený je z nich jeden.
   * Stejná přísnost tam znamená, že se linka nespustí vůbec - a hráč, který si
   * obsah zaplatil, přijde o celý režim.
   */
  lineAllowFallback?: boolean;
  /** False when the runtime cannot serve turn and river, so a line cannot run. */
  lineModeAvailable?: boolean;
  runtimeNotice?: PostflopRuntimeNotice | null;
  beforeGenerate?: (mode: "single" | "line") => Promise<void> | void;
  onLineCompleted?: (
    line: PostflopLine,
    chosenByStreet: Partial<Record<PostflopStreet, PostflopAction>>,
    startedAt: number,
    completedAt: number,
  ) => void;
  onAnswered?: (
    spot: PostflopTrainingSpot,
    chosen: PostflopAction,
    responseMs?: number,
  ) => void;
}

export interface PostflopRuntimeNotice {
  kind: "SCOPED_PILOT" | "LOCKED_PILOT" | "PRODUCTION" | "PREVIEW" | "DEEP_STACK_UNCOVERED";
  text: string;
}

interface PostflopLineRenderMeta {
  mode: "line";
  streetIndex: number;
  streetTotal: number;
  priorActions: readonly PostflopLineAction[];
}

const STREET_LABEL: Record<PostflopStreet, string> = {
  FLOP: "Flop",
  TURN: "Turn",
  RIVER: "River",
};

const POT_TYPE_LABEL: Record<PostflopPotType, string> = {
  SINGLE_RAISED: "SRP",
  THREE_BET_POT: "3bet pot",
  LIMPED_POT: "limped pot",
};

const TEXTURE_LABEL: Record<BoardTexture, string> = {
  paired: "Paired",
  monotone: "Monotone",
  "two-tone": "Two-tone",
  rainbow: "Rainbow",
  connected: "Connected",
  dry: "Dry",
  "ace-high": "A-high",
  "broadway-high": "Broadway-high",
  low: "Low",
  medium: "Medium",
  "straight-possible": "Straight possible",
  "flush-draw-heavy": "Flush-draw heavy",
  disconnected: "Disconnected",
};

const SUIT_SYMBOL: Record<Suit, string> = {
  s: "\u2660",
  h: "\u2665",
  d: "\u2666",
  c: "\u2663",
};

const SUIT_CLASS: Record<Suit, string> = {
  s: "card--spade",
  h: "card--heart",
  d: "card--diamond",
  c: "card--club",
};

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startMs: number): number | undefined {
  if (!Number.isFinite(startMs) || startMs <= 0) return undefined;
  const value = Math.max(0, Math.round(nowMs() - startMs));
  return Number.isFinite(value) ? value : undefined;
}

function focusElement(element: HTMLElement | null): void {
  if (!element || typeof element.focus !== "function") return;
  element.focus();
}

export function renderPostflopView(root: HTMLElement, options: PostflopViewOptions = {}): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = doc.createElement("div");
  wrap.className = "postflop-view";

  const controls = doc.createElement("div");
  controls.className = "postflop-controls";

  const runtimeNotice = renderRuntimeNotice(doc, options.runtimeNotice ?? null);
  if (runtimeNotice) wrap.appendChild(runtimeNotice);

  const streetLabel = doc.createElement("label");
  streetLabel.className = "postflop-field";
  const streetText = doc.createElement("span");
  streetText.textContent = CS.postflop.street;
  const streetSelect = doc.createElement("select");
  streetSelect.className = "postflop-street";
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    const opt = doc.createElement("option");
    opt.value = street;
    opt.textContent = STREET_LABEL[street];
    streetSelect.appendChild(opt);
  }
  streetSelect.value = options.initialStreet ?? "FLOP";
  streetLabel.appendChild(streetText);
  streetLabel.appendChild(streetSelect);

  const situationLabel = doc.createElement("label");
  situationLabel.className = "postflop-field";
  const situationText = doc.createElement("span");
  situationText.textContent = CS.postflop.situation;
  const situationSelect = doc.createElement("select");
  situationSelect.className = "postflop-situation";
  const initiativeOption = doc.createElement("option");
  initiativeOption.value = "initiative";
  initiativeOption.textContent = CS.postflop.initiative;
  const facingBetOption = doc.createElement("option");
  facingBetOption.value = "facing-bet";
  facingBetOption.textContent = CS.postflop.facingBet;
  // The third turn decision: hero called the last raise, is out of position, and
  // acts first before anyone has bet. It is only offered on the turn, because
  // that is the only street the app has content for it on - a situation a player
  // can select and never get an answer for is worse than one they cannot select.
  const oopLeadOption = doc.createElement("option");
  oopLeadOption.value = "oop-lead";
  oopLeadOption.textContent = CS.postflop.oopLead;
  situationSelect.appendChild(initiativeOption);
  situationSelect.appendChild(facingBetOption);
  situationSelect.appendChild(oopLeadOption);
  const syncSituationOptions = (): void => {
    oopLeadOption.hidden = streetSelect.value !== "TURN";
    if (oopLeadOption.hidden && situationSelect.value === "oop-lead") {
      situationSelect.value = "initiative";
    }
  };
  situationSelect.value = options.initialActionNode === "TURN_OOP_LEAD"
    ? "oop-lead"
    : options.initialActionNode?.endsWith("_FACING_BET")
      ? "facing-bet"
      : "initiative";
  streetSelect.addEventListener("change", syncSituationOptions);
  syncSituationOptions();
  situationLabel.appendChild(situationText);
  situationLabel.appendChild(situationSelect);

  const seedLabel = doc.createElement("label");
  seedLabel.className = "postflop-field";
  const seedText = doc.createElement("span");
  seedText.textContent = CS.postflop.seed;
  const seedInput = doc.createElement("input");
  seedInput.className = "postflop-seed";
  seedInput.type = "text";
  seedInput.inputMode = "numeric";
  seedInput.placeholder = CS.postflop.random;
  if (options.initialSeed !== undefined && options.initialSeed !== null) {
    seedInput.value = String(options.initialSeed);
  }
  seedLabel.appendChild(seedText);
  seedLabel.appendChild(seedInput);

  const modeLabel = doc.createElement("label");
  modeLabel.className = "postflop-field";
  const modeText = doc.createElement("span");
  modeText.textContent = CS.postflop.mode;
  const modeSelect = doc.createElement("select");
  modeSelect.className = "postflop-mode";
  const singleOption = doc.createElement("option");
  singleOption.value = "single";
  singleOption.textContent = CS.postflop.singleSpot;
  const lineOption = doc.createElement("option");
  lineOption.value = "line";
  lineOption.textContent = CS.postflop.handLine;
  // A hand line needs strategy on all three streets. The scoped flop pilots have
  // only the flop, so for a paying pilot subscriber the line could never be
  // generated - it threw and the player was shown a bare "unavailable", while a
  // free preview user got a working line from the heuristic model. Offering it
  // there sold a mode that cannot run, so it is disabled and says why.
  if (options.lineModeAvailable === false) {
    lineOption.disabled = true;
    lineOption.textContent = `${CS.postflop.handLine} - ${CS.postflop.handLineNeedsAllStreets}`;
  }
  modeSelect.appendChild(singleOption);
  modeSelect.appendChild(lineOption);
  modeLabel.appendChild(modeText);
  modeLabel.appendChild(modeSelect);

  const generate = doc.createElement("button");
  generate.type = "button";
  generate.className = "postflop-generate";
  generate.textContent = CS.postflop.generate;

  controls.appendChild(streetLabel);
  controls.appendChild(situationLabel);
  controls.appendChild(seedLabel);
  controls.appendChild(modeLabel);
  controls.appendChild(generate);
  wrap.appendChild(controls);

  const output = doc.createElement("div");
  output.className = "postflop-output";
  output.hidden = true;
  wrap.appendChild(output);

  const showSituationInput = (): void => {
    output.innerHTML = "";
    output.hidden = true;
    controls.hidden = false;
    focusElement(streetSelect);
  };

  const showNewSpot = async (): Promise<void> => {
    const seed = parseSeed(seedInput.value) ?? randomSeed();
    // Seed je jednorázový vstup pro reprodukci konkrétní situace. Po použití
    // jej vyčistíme, aby další generování nebo nový spot nevytvořily znovu
    // tutéž situaci, ale sáhl po novém náhodném seedu.
    seedInput.value = "";
    // Vybraná situace se čte ještě před pokusem o rozdání: když se spot odmítne,
    // musí odmítnutí vědět, na kterou buňku hráč mířil, jinak by se pilot
    // čekající na přesolv nedal odlišit od chybějící produkce.
    const street = parseStreet(streetSelect.value);
    const actionNode = selectedActionNode(
      street,
      situationSelect.value,
      options.initialPotType,
    );
    try {
      const mode = modeSelect.value === "line" ? "line" : "single";
      const preparation = options.beforeGenerate?.(mode);
      if (preparation) await preparation;
      if (modeSelect.value === "line") {
        // Postavit linku kolem vyřešeného turnu, když nějaký je. Bez toho se
        // rozdá náhodná deska a resolver ji odmítne - měřeno 0 z 500 linek se
        // solverovým obsahem, přestože se dodává jedenáct rodin.
        const solved = solvedLineConfigForSeed(seed);
        // Tabulka EV pro riverový uzel linky, stejně jako u jednotlivého spotu.
        // Čeká se jen když je na co - viz `primeRiverEvForPack`.
        const linePriming = solved?.riverPackId !== undefined
          ? primeRiverEvForPack(solved.riverPackId)
          : undefined;
        if (linePriming) await linePriming;
        const line = generatePostflopLine({
          seed,
          potType: solved?.potType ?? options.initialPotType,
          actionNode: solved?.actionNode ?? selectedActionNode(
            "FLOP",
            situationSelect.value,
            options.initialPotType,
          ),
          ...(solved ? { board: solved.board } : {}),
          potBB: solved?.potBB ?? options.initialPotBB,
          effectiveStackBB: solved?.effectiveStackBB ?? options.initialEffectiveStackBB,
          positionContext: solved?.positionContext ?? options.initialPositionContext ?? undefined,
          strategyResolver: options.strategyResolver ?? POSTFLOP_STRATEGY_RESOLVER,
          allowFallback: options.lineAllowFallback ?? options.allowFallback,
        });
        controls.hidden = true;
        output.hidden = false;
        renderLineSpot(output, line, 0, {}, Date.now(), options, {
          onNewSpot: showNewSpot,
          onChangeSituation: showSituationInput,
        });
        return;
      }

      // `street` a `actionNode` se počítají nad `try` (viz tam): ví o nich
      // i větev, která spot odmítne.
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
      // Vzor pro katalog, ne vzor kontextu: filtry u obrany blindu dávají hrubé
      // `EP_VS_BB`, kdežto katalog vede jemné `SRP_CO_VS_BB` (viz
      // `cataloguePatternFor`). Kontext pro generátor a zálohu zůstává beze změny.
      const situation = options.initialPositionContext
        ? {
          positionPattern: cataloguePatternFor(options.initialPositionContext),
          stackBB: options.initialEffectiveStackBB,
        }
        : undefined;
      // `Partial`, protože katalog nemusí nabídnout nic a pak se nepřebíjí nic:
      // prázdný katalog nesmí znamenat, že se nedá hrát.
      const solvedTurn: Partial<Parameters<typeof generatePostflopSpot>[0]> = (
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
      // Tabulka EV se musí stihnout načíst, jinak ji resolver uprostřed rozdání
      // nenajde a spot se ukáže bez čísel. Viz `primeRiverEvForSeed`.
      //
      // Tvar je stejný jako u `beforeGenerate` o pár řádků výš a ze stejného
      // důvodu: **nečeká se, když není na co**. Bez téhle podmínky by `await`
      // udělal z každého rozdání asynchronní operaci - i tam, kde se žádná
      // tabulka nenačítá - a spot by se přestal vykreslovat synchronně.
      // Tentýž vzor jako u rozdání - jinak by se předčetla tabulka jiné rodiny
      // než té rozdané (viz `solvedSpotDealing.ts`).
      const priming = street === "RIVER"
        ? primeRiverEvForSeed(seed, actionNode, situation)
        : street === "TURN"
          ? primeTurnEvForSeed(seed, actionNode, situation)
          : undefined;
      if (priming) await priming;
      const spot = generatePostflopSpot({
        seed,
        street,
        potType: options.initialPotType,
        actionNode,
        potBB: options.initialPotBB,
        effectiveStackBB: options.initialEffectiveStackBB,
        positionContext: options.initialPositionContext ?? undefined,
        strategyResolver: options.strategyResolver ?? POSTFLOP_STRATEGY_RESOLVER,
        // Jednotlivý spot zůstává přísný. Hráč si vybral ulici, obsah pro ni
        // máme, a tiše mu podstrčit heuristiku je přesně to, čemu tenhle příznak
        // brání. Uvolňuje se jen linka, která prochází i ulice bez obsahu.
        allowFallback: options.allowFallback,
        ...(solvedTurn ?? {}),
      });
      controls.hidden = true;
      output.hidden = false;
      renderSpot(output, spot, options, {
        onNewSpot: showNewSpot,
        onChangeSituation: showSituationInput,
      });
    } catch (error) {
      // Only a missing-strategy refusal means "no content for this spot". A bare
      // catch made every other failure look like that too, so a real defect would
      // have been reported by players as thin coverage and never as a bug.
      if (!(error instanceof PostflopStrategyUnavailableError)) throw error;
      controls.hidden = false;
      output.hidden = false;
      // Dvě různá „tady nic nemám" se nesmějí slít do jedné věty. Pilot, jehož
      // strategii čtenář odmítl, se nerozdává schválně a čeká na přesolvení
      // (rozhodnutí vlastníka 9a a odpověď 4a, 22. 9. 2026); všude jinde jde
      // o chybějící produkční obsah. Hráč, který za pilota platí, má vědět,
      // které z toho se mu právě stalo.
      renderUnavailable(output, isResolvingPilotSpot(street, actionNode, {
        potType: options.initialPotType ?? "SINGLE_RAISED",
        positionPattern: options.initialPositionContext?.positionPattern,
      }));
    }
  };

  generate.addEventListener("click", showNewSpot);
  root.appendChild(wrap);
  if (options.autoGenerate === true) {
    void showNewSpot();
  }
}

function renderRuntimeNotice(
  doc: Document,
  notice: PostflopRuntimeNotice | null,
): HTMLElement | null {
  if (notice === null) return null;
  const element = doc.createElement("div");
  element.className = "postflop-runtime-notice";
  element.dataset.kind = notice.kind;
  const alerting = notice.kind === "LOCKED_PILOT" || notice.kind === "DEEP_STACK_UNCOVERED";
  element.setAttribute("role", alerting ? "alert" : "status");
  element.textContent = notice.text;
  return element;
}

/**
 * Míří tenhle spot na pilota, který se přesolvuje?
 *
 * Scope se skládá z toho, co hráč vybral (ulice, typ potu, dvojice sedaček,
 * uzel) - textury na něj vliv nemají, takže se posílá prázdné pole. Když
 * mapování scope nenajde, nejde o pilotní buňku a platí obecná hláška.
 */
function isResolvingPilotSpot(
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

function renderUnavailable(root: HTMLElement, resolvingPilot = false): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";
  const notice = doc.createElement("div");
  notice.className = "postflop-unavailable";
  notice.dataset.reason = resolvingPilot ? "PILOT_RESOLVING" : "NO_PRODUCTION_STRATEGY";
  notice.setAttribute("role", "alert");
  notice.textContent = resolvingPilot
    ? CS.postflop.unavailableResolvingPilot
    : CS.postflop.unavailable;
  root.appendChild(notice);
}

function renderLineSpot(
  root: HTMLElement,
  line: PostflopLine,
  streetIndex: number,
  chosenByStreet: Partial<Record<PostflopStreet, PostflopAction>>,
  lineStartedAt: number,
  options: PostflopViewOptions,
  controls: {
    onNewSpot: () => void;
    onChangeSituation: () => void;
  },
): void {
  const street = line.streets[streetIndex];
  renderSpot(root, street.spot, {
    ...options,
    onAnswered: (spot, chosen) => {
      chosenByStreet[spot.street] = chosen;
      const branchedLine = branchPostflopLine(line, chosenByStreet, options);
      appendLineControls(root, branchedLine, streetIndex, chosenByStreet, lineStartedAt, options, controls);
    },
  }, controls, {
    mode: "line",
    streetIndex,
    streetTotal: line.streets.length,
    priorActions: street.actionHistory,
  });
}

function renderSpot(
  root: HTMLElement,
  spot: PostflopSpot,
  options: PostflopViewOptions,
  controls: {
    onNewSpot: () => void;
    onChangeSituation: () => void;
  },
  lineMeta?: PostflopLineRenderMeta,
): void {
  const doc = root.ownerDocument ?? document;
  const trainingSpot = spot.trainingSpot ?? postflopSpotToTrainingSpot(spot, getAppLanguage());
  root.innerHTML = "";

  const questionBar = doc.createElement("div");
  questionBar.className = "postflop-question-bar";
  const questionTitle = doc.createElement("div");
  questionTitle.className = "postflop-question-title";
  questionTitle.textContent = lineMeta
    ? `Hand line ${lineMeta.streetIndex + 1}/${lineMeta.streetTotal}`
    : CS.postflop.question;
  const questionActions = doc.createElement("div");
  questionActions.className = "postflop-question-actions";

  const newSpot = doc.createElement("button");
  newSpot.type = "button";
  newSpot.className = "postflop-new-spot";
  newSpot.textContent = CS.postflop.newSpot;
  newSpot.addEventListener("click", controls.onNewSpot);

  const changeSituation = doc.createElement("button");
  changeSituation.type = "button";
  changeSituation.className = "postflop-change-situation";
  changeSituation.textContent = CS.postflop.changeSituation;
  changeSituation.addEventListener("click", controls.onChangeSituation);

  questionActions.appendChild(newSpot);
  questionActions.appendChild(changeSituation);
  questionBar.appendChild(questionTitle);
  questionBar.appendChild(questionActions);
  root.appendChild(questionBar);

  const meta = doc.createElement("div");
  meta.className = "postflop-meta";
  meta.dataset.seed = String(spot.seed);
  meta.dataset.street = spot.street;
  meta.dataset.actionNode = trainingSpot.actionNode;
  meta.dataset.potType = trainingSpot.potType;
  meta.dataset.positionPattern = trainingSpot.positionPattern;
  if (lineMeta) {
    meta.dataset.mode = "line";
    meta.dataset.streetIndex = String(lineMeta.streetIndex);
    meta.dataset.streetTotal = String(lineMeta.streetTotal);
  }
  meta.textContent =
    `${STREET_LABEL[spot.street]} - seed ${spot.seed} - ${POT_TYPE_LABEL[trainingSpot.potType]} - ` +
    `pot ${spot.potBB} BB - ` +
    `effective stack ${spot.effectiveStackBB} BB - SPR ${trainingSpot.spr} - ` +
    `${trainingSpot.heroPosition} vs ${trainingSpot.villainPosition} ` +
    `(${trainingSpot.inPosition ? "IP" : "OOP"})`;
  root.appendChild(meta);

  root.appendChild(renderActionHistory(doc, trainingSpot, lineMeta));
  root.appendChild(postflopTable(doc, trainingSpot));

  const textures = doc.createElement("div");
  textures.className = "postflop-textures";
  for (const texture of spot.textures) {
    const chip = doc.createElement("span");
    chip.className = "postflop-texture";
    chip.dataset.texture = texture;
    chip.textContent = TEXTURE_LABEL[texture];
    textures.appendChild(chip);
  }
  root.appendChild(textures);

  const questionStartedAt = nowMs();
  const actions = doc.createElement("div");
  actions.className = "postflop-actions";
  for (const action of spot.actions) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "postflop-action";
    btn.dataset.action = action;
    setActionEvButtonContent(btn, actionLabel(action));
    btn.addEventListener("click", () => (
      showResult(root, trainingSpot, action, questionStartedAt, options)
    ));
    actions.appendChild(btn);
  }
  wireActionKeyboard(actions);
  root.appendChild(actions);
  focusElement(actions.querySelector<HTMLButtonElement>(".postflop-action"));

  const result = doc.createElement("div");
  result.className = "postflop-result";
  result.hidden = true;
  result.setAttribute("role", "status");
  result.setAttribute("tabindex", "-1");
  root.appendChild(result);
}

function renderActionHistory(
  doc: Document,
  spot: PostflopTrainingSpot,
  lineMeta?: PostflopLineRenderMeta,
): HTMLElement {
  const history = inferredActionHistory(spot);
  const priorLineSteps = priorLineActionSteps(lineMeta?.priorActions ?? []);
  const steps = history.steps.length > 0
    ? [history.steps[0], ...priorLineSteps, ...history.steps.slice(1)]
    : priorLineSteps;
  const box = doc.createElement("section");
  box.className = "postflop-action-history";
  box.dataset.actionNode = spot.actionNode;
  box.dataset.previousActor = history.previousActor ?? "";
  box.dataset.previousAction = history.previousAction ?? "NONE";
  box.dataset.lineHistoryCount = String(lineMeta?.priorActions.length ?? 0);
  box.setAttribute("aria-label", "Action before the decision");

  const title = doc.createElement("div");
  title.className = "postflop-action-history__title";
  title.textContent = "Action before the decision";
  box.appendChild(title);

  const list = doc.createElement("ol");
  list.className = "postflop-action-history__steps";
  for (const step of steps) {
    const item = doc.createElement("li");
    item.className = "postflop-action-history__step";
    item.textContent = step;
    list.appendChild(item);
  }
  box.appendChild(list);

  const prompt = doc.createElement("div");
  prompt.className = "postflop-action-history__prompt";
  prompt.textContent = history.prompt;
  box.appendChild(prompt);

  return box;
}

function priorLineActionSteps(actions: readonly PostflopLineAction[]): string[] {
  return actions.map((action) => {
    const sequence = action.sequence?.length
      ? action.sequence.map((entry) => {
        const amount = entry.amountBB > 0 ? ` ${roundedBetBB(entry.amountBB)} BB` : "";
        return `${lineActorLabel(entry.actor)} ${linePolicyActionLabel(entry.action)}${amount}`;
      }).join(" → ")
      : `Hero ${actionLabel(action.action)}`;
    return localizedText(
      `Hand line so far - ${STREET_LABEL[action.street]}: ${sequence}. Pot after action ${roundedBetBB(action.potBBAfter)} BB.`,
      `Dosavadní hand line - ${STREET_LABEL[action.street]}: ${sequence}. Bank po akci ${roundedBetBB(action.potBBAfter)} BB.`,
    );
  });
}

function lineActorLabel(actor: "HERO" | "VILLAIN"): string {
  return actor === "HERO" ? "Hero" : "Villain";
}

function linePolicyActionLabel(action: string): string {
  switch (action) {
    case "CHECK":
      return "check";
    case "CALL":
      return "call";
    case "FOLD":
      return "fold";
    case "BET_SMALL":
    case "BET_BIG":
      return "bet";
    case "RAISE":
      return "raise";
    case "ALL_IN":
      return "all-in";
    default:
      return action.toLowerCase();
  }
}

function inferredActionHistory(spot: PostflopTrainingSpot): {
  previousActor: Position | null;
  previousAction: PostflopAction | "NONE" | null;
  steps: readonly string[];
  prompt: string;
} {
  const preflop = preflopActionSummary(spot);
  if (spot.actionNode.endsWith("_FACING_BET")) {
    return {
      previousActor: spot.villainPosition,
      previousAction: "BET_SMALL",
      steps: [
        preflop,
        localizedText(
          `${STREET_LABEL[spot.street]}: ${spot.villainPosition} bet, Hero is facing the bet.`,
          `${STREET_LABEL[spot.street]}: ${spot.villainPosition} betnul, Hero čelí sázce.`,
        ),
      ],
      prompt: localizedText(
        "Your turn: fold, call, or raise.",
        "Teď jste na tahu: fold, call nebo raise.",
      ),
    };
  }
  if (spot.inPosition) {
    return {
      previousActor: spot.villainPosition,
      previousAction: "CHECK",
      steps: [
        preflop,
        localizedText(
          `${STREET_LABEL[spot.street]}: ${spot.villainPosition} checked, Hero is next to act.`,
          `${STREET_LABEL[spot.street]}: ${spot.villainPosition} checknul, Hero je na tahu.`,
        ),
      ],
      prompt: localizedText(
        "Villain checked. Choose check behind or bet.",
        "Soupeř checknul. Teď zvolte check behind nebo bet.",
      ),
    };
  }
  return {
    previousActor: null,
    previousAction: "NONE",
    steps: [
      preflop,
      localizedText(
        `${STREET_LABEL[spot.street]}: Hero is OOP and acts first.`,
        `${STREET_LABEL[spot.street]}: Hero je OOP a jedná první.`,
      ),
    ],
    prompt: localizedText(
      "No action occurred before you on this street. You are first to act.",
      "Před vámi na této streetě nebyla žádná akce. Teď jste na tahu.",
    ),
  };
}

function preflopActionSummary(spot: PostflopTrainingSpot): string {
  if (spot.potType === "THREE_BET_POT") {
    return localizedText(
      `Preflop: ${spot.aggressorPosition} is the 3-bet aggressor, ${spot.callerPosition} called.`,
      `Preflop: ${spot.aggressorPosition} je 3bet agresor, ${spot.callerPosition} dorovnal.`,
    );
  }
  if (spot.potType === "LIMPED_POT") {
    return localizedText(
      `Preflop: ${spot.aggressorPosition} and ${spot.callerPosition} saw the flop in a limped pot.`,
      `Preflop: ${spot.aggressorPosition} a ${spot.callerPosition} viděli flop v limped potu.`,
    );
  }
  return localizedText(
    `Preflop: ${spot.aggressorPosition} open-raised, ${spot.callerPosition} called.`,
    `Preflop: ${spot.aggressorPosition} open raise, ${spot.callerPosition} call.`,
  );
}

function wireActionKeyboard(actions: HTMLElement): void {
  actions.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = [...actions.querySelectorAll<HTMLButtonElement>(".postflop-action")]
      .filter((button) => !button.disabled);
    if (buttons.length === 0) return;

    if (/^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const button = buttons[index];
      if (!button) return;
      event.preventDefault();
      button.focus();
      button.click();
      return;
    }

    const direction = actionNavigationDirection(event.key);
    if (direction === 0) return;
    event.preventDefault();
    const active = actions.ownerDocument.activeElement;
    const currentIndex = buttons.findIndex((button) => button === active);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (startIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
  });
}

function actionNavigationDirection(key: string): -1 | 0 | 1 {
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  return 0;
}

function postflopTable(doc: Document, spot: PostflopTrainingSpot): HTMLElement {
  const table = doc.createElement("div");
  table.className = "postflop-table";
  table.dataset.heroPosition = spot.heroPosition;
  table.dataset.villainPosition = spot.villainPosition;
  table.dataset.recommendedAction = spot.recommendedAction;

  const felt = doc.createElement("div");
  felt.className = "postflop-table__felt";
  table.appendChild(felt);

  const rail = doc.createElement("div");
  rail.className = "postflop-table__rail";
  table.appendChild(rail);

  const center = doc.createElement("div");
  center.className = "postflop-table__center";

  const centerLabel = doc.createElement("div");
  centerLabel.className = "postflop-table__center-label";
  centerLabel.textContent = `${spot.heroPosition} vs ${spot.villainPosition}`;
  center.appendChild(centerLabel);

  const pot = doc.createElement("div");
  pot.className = "postflop-table__pot";
  pot.textContent = `Pot ${spot.potBB} BB`;
  center.appendChild(pot);
  center.appendChild(betGeometry(doc, spot));

  const chipStack = doc.createElement("div");
  chipStack.className = "postflop-table__chip-stack";
  for (let i = 0; i < 3; i += 1) {
    chipStack.appendChild(doc.createElement("span"));
  }
  center.appendChild(chipStack);

  const board = doc.createElement("div");
  board.className = "postflop-table__board";
  for (const card of spot.board) board.appendChild(cardElement(doc, card));
  center.appendChild(board);

  const centerMeta = doc.createElement("div");
  centerMeta.className = "postflop-table__center-meta";
  centerMeta.textContent = `${POT_TYPE_LABEL[spot.potType]} - SPR ${spot.spr}`;
  center.appendChild(centerMeta);
  table.appendChild(center);

  for (const position of POSITION_ORDER) {
    const seat = postflopSeat(doc, spot, position);
    const slot = (
      POSITION_ORDER.indexOf(position) -
      POSITION_ORDER.indexOf(spot.heroPosition) +
      POSITION_ORDER.length
    ) % POSITION_ORDER.length;
    const pos = seatPosition(slot);
    const mobilePos = seatPositionMobile(slot);
    seat.style.setProperty("--seat-left", `${pos.left}%`);
    seat.style.setProperty("--seat-top", `${pos.top}%`);
    seat.style.setProperty("--seat-mobile-left", `${mobilePos.left}%`);
    seat.style.setProperty("--seat-mobile-top", `${mobilePos.top}%`);
    table.appendChild(seat);
  }

  return table;
}

function betGeometry(doc: Document, spot: PostflopTrainingSpot): HTMLElement {
  const geometry = doc.createElement("div");
  const sizing = betSizingVisual(spot);
  geometry.className = `postflop-table__bet-geometry postflop-table__bet-geometry--${sizing.kind}`;
  geometry.dataset.recommendedAction = spot.recommendedAction;
  geometry.dataset.betSizing = sizing.kind;
  geometry.dataset.betBB = String(sizing.betBB);
  geometry.style.setProperty("--bet-size", `${Math.round(sizing.ratio * 100)}%`);
  geometry.setAttribute("aria-label", sizing.ariaLabel);

  const track = doc.createElement("div");
  track.className = "postflop-table__bet-track";
  const fill = doc.createElement("span");
  fill.className = "postflop-table__bet-fill";
  track.appendChild(fill);
  geometry.appendChild(track);

  const chips = doc.createElement("div");
  chips.className = "postflop-table__bet-chips";
  for (let i = 0; i < sizing.chips; i += 1) {
    const chip = doc.createElement("span");
    chip.className = "postflop-table__bet-chip";
    chips.appendChild(chip);
  }
  geometry.appendChild(chips);

  const label = doc.createElement("div");
  label.className = "postflop-table__bet-label";
  label.textContent = sizing.label;
  geometry.appendChild(label);
  return geometry;
}

/**
 * What the solve actually put behind this button, when the family is known.
 *
 * Returns the largest solved fraction where several were merged, since the button
 * is one choice and understating it would repeat the original error in the other
 * direction. `allIn` is reported only when the shove is the ONLY action behind
 * the button, because it is not a fraction of pot at all - where a real bet sits
 * beside it, the bet is what the label should describe.
 */
function solvedSizing(
  spot: PostflopTrainingSpot,
  action: "BET_SMALL" | "BET_BIG",
): SolvedBetSizing | undefined {
  // Sdílené se simulátorem linky, aby tlačítko a „Bank po akci" četly tutéž
  // velikost (viz `solvedBetSizing.ts`).
  return solvedBetSizing(spot.explanation.source, action);
}

function betSizingVisual(spot: PostflopTrainingSpot): {
  ariaLabel: string;
  betBB: number;
  chips: number;
  kind: "check" | "small" | "big";
  label: string;
  ratio: number;
} {
  switch (spot.recommendedAction) {
    case "BET_SMALL": {
      const solved = solvedSizing(spot, "BET_SMALL");
      const ratio = solved?.ratio ?? 0.33;
      const betBB = roundedBetBB(spot.potBB * ratio);
      return {
        ariaLabel: CS.postflop.sizing.recommendedSmall(betBB),
        betBB,
        chips: 2,
        kind: "small",
        label: CS.postflop.sizing.small(betBB),
        ratio,
      };
    }
    case "BET_BIG": {
      const solved = solvedSizing(spot, "BET_BIG");
      // The solver's all-in is a bet like any other, and in most families it is
      // the only one behind this button. Showing 75 percent of pot for a shove
      // was the label describing something the strategy never contained.
      if (solved?.allIn === true) {
        const betBB = roundedBetBB(spot.effectiveStackBB);
        return {
          ariaLabel: CS.postflop.sizing.recommendedAllIn(betBB),
          betBB,
          chips: 4,
          kind: "big",
          label: CS.postflop.sizing.allIn(betBB),
          ratio: 1,
        };
      }
      const ratio = solved?.ratio ?? 0.75;
      const betBB = roundedBetBB(spot.potBB * ratio);
      return {
        ariaLabel: CS.postflop.sizing.recommendedBig(betBB),
        betBB,
        chips: 4,
        kind: "big",
        label: CS.postflop.sizing.big(betBB),
        ratio,
      };
    }
    case "RAISE": {
      const betBB = roundedBetBB(spot.potBB * 0.75);
      return {
        ariaLabel: CS.postflop.sizing.recommendedRaise(betBB),
        betBB,
        chips: 4,
        kind: "big",
        label: CS.postflop.sizing.raise(betBB),
        ratio: 0.75,
      };
    }
    case "CALL":
      return {
        ariaLabel: CS.postflop.sizing.recommendedCall,
        betBB: 0,
        chips: 1,
        kind: "check",
        label: "Call",
        ratio: 0,
      };
    case "FOLD":
      return {
        ariaLabel: CS.postflop.sizing.recommendedFold,
        betBB: 0,
        chips: 0,
        kind: "check",
        label: "Fold",
        ratio: 0,
      };
    case "CHECK":
    default:
      return {
        ariaLabel: CS.postflop.sizing.recommendedCheck,
        betBB: 0,
        chips: 0,
        kind: "check",
        label: "Check",
        ratio: 0,
      };
  }
}

function roundedBetBB(value: number): number {
  return Math.round(value * 10) / 10;
}

function postflopSeat(
  doc: Document,
  spot: PostflopTrainingSpot,
  position: Position,
): HTMLElement {
  const isHero = position === spot.heroPosition;
  const isVillain = position === spot.villainPosition;
  const active = isHero || isVillain;
  const actionRole = seatActionRole(spot, position);
  const positionRole = seatPositionRole(spot, position);
  const decisionState = seatDecisionState(spot, position);
  const seat = doc.createElement("div");
  seat.className = [
    "postflop-seat",
    isHero ? "postflop-seat--hero" : "",
    isVillain ? "postflop-seat--villain" : "",
    active ? "postflop-seat--active" : "postflop-seat--folded",
    actionRole ? `postflop-seat--${actionRole}` : "",
    positionRole ? `postflop-seat--${positionRole.toLowerCase()}` : "",
    decisionState ? `postflop-seat--${decisionState.kind}` : "",
  ].filter(Boolean).join(" ");
  seat.dataset.position = position;
  seat.dataset.actionRole = actionRole ?? "none";
  seat.dataset.positionRole = positionRole ?? "none";
  seat.dataset.currentAction = decisionState?.action ?? "none";

  const header = doc.createElement("div");
  header.className = "postflop-seat__header";
  const status = doc.createElement("span");
  status.className = "postflop-seat__status";
  status.dataset.state = active ? "active" : "folded";
  status.setAttribute("aria-hidden", "true");
  header.appendChild(status);
  const pos = doc.createElement("span");
  pos.className = "postflop-seat__pos";
  pos.textContent = position;
  header.appendChild(pos);
  const marker = positionMarker(doc, position);
  if (marker) header.appendChild(marker);
  seat.appendChild(header);

  if (!active) {
    const folded = doc.createElement("div");
    folded.className = "postflop-seat__folded";
    folded.textContent = CS.postflop.folded;
    seat.appendChild(folded);
    return seat;
  }

  const badge = doc.createElement("div");
  badge.className = "postflop-seat__badge";
  badge.textContent = isHero ? CS.postflop.hero : CS.postflop.villain;
  seat.appendChild(badge);

  const role = doc.createElement("div");
  role.className = "postflop-seat__role";
  for (const badge of seatRoleBadges(spot, position)) {
    const chip = doc.createElement("span");
    chip.className = `postflop-seat__role-chip postflop-seat__role-chip--${badge.kind}`;
    chip.textContent = badge.label;
    role.appendChild(chip);
  }
  seat.appendChild(role);

  if (decisionState) {
    const currentAction = doc.createElement("div");
    currentAction.className = `postflop-seat__current-action postflop-seat__current-action--${decisionState.kind}`;
    currentAction.textContent = decisionState.label;
    seat.appendChild(currentAction);
  }

  const stackWrap = doc.createElement("div");
  stackWrap.className = "postflop-seat__stack-wrap";
  const stack = doc.createElement("div");
  stack.className = "postflop-seat__stack";
  const stackChip = doc.createElement("span");
  stackChip.className = "postflop-seat__stack-chip";
  stackChip.setAttribute("aria-hidden", "true");
  const stackValue = doc.createElement("span");
  stackValue.textContent = `${spot.effectiveStackBB} BB`;
  stack.appendChild(stackChip);
  stack.appendChild(stackValue);
  const stackBar = doc.createElement("div");
  stackBar.className = "postflop-seat__stack-bar";
  const stackFill = doc.createElement("span");
  stackFill.style.width = `${Math.max(18, Math.min(100, (spot.effectiveStackBB / 150) * 100))}%`;
  stackBar.appendChild(stackFill);
  stackWrap.appendChild(stack);
  stackWrap.appendChild(stackBar);
  seat.appendChild(stackWrap);

  if (isHero) {
    const heroTag = doc.createElement("span");
    heroTag.className = "postflop-seat__tag";
    heroTag.textContent = CS.postflop.you;
    seat.appendChild(heroTag);

    const cards = doc.createElement("div");
    cards.className = "postflop-seat__cards";
    for (const card of spot.heroCards) cards.appendChild(cardElement(doc, card));
    seat.appendChild(cards);
  } else {
    const cards = doc.createElement("div");
    cards.className = "postflop-seat__cards postflop-seat__cards--hidden";
    cards.appendChild(cardBack(doc));
    cards.appendChild(cardBack(doc));
    seat.appendChild(cards);
  }

  return seat;
}

function seatActionRole(
  spot: PostflopTrainingSpot,
  position: Position,
): "aggressor" | "caller" | null {
  if (position === spot.aggressorPosition) return "aggressor";
  if (position === spot.callerPosition) return "caller";
  return null;
}

function seatPositionRole(spot: PostflopTrainingSpot, position: Position): "IP" | "OOP" | null {
  if (position === spot.heroPosition) return spot.inPosition ? "IP" : "OOP";
  if (position === spot.villainPosition) return spot.inPosition ? "OOP" : "IP";
  return null;
}

function seatDecisionState(
  spot: PostflopTrainingSpot,
  position: Position,
): { action: string; kind: "acted" | "to-act"; label: string } | null {
  if (position === spot.heroPosition) {
    return { action: "TO_ACT", kind: "to-act", label: "To act" };
  }
  const history = inferredActionHistory(spot);
  if (history.previousActor !== position) return null;
  switch (history.previousAction) {
    case "CHECK":
      return { action: "CHECK", kind: "acted", label: "Check" };
    case "BET_SMALL":
    case "BET_BIG":
      return { action: "BET", kind: "acted", label: "Bet" };
    case "RAISE":
      return { action: "RAISE", kind: "acted", label: "Raise" };
    case "CALL":
      return { action: "CALL", kind: "acted", label: "Call" };
    case "FOLD":
      return { action: "FOLD", kind: "acted", label: "Fold" };
    case "NONE":
    case null:
      return null;
  }
}

function seatRoleBadges(
  spot: PostflopTrainingSpot,
  position: Position,
): Array<{ kind: string; label: string }> {
  const badges: Array<{ kind: string; label: string }> = [];
  const actionRole = seatActionRole(spot, position);
  const positionRole = seatPositionRole(spot, position);
  if (actionRole) {
    badges.push({
      kind: actionRole,
      label: actionRole === "aggressor" ? CS.postflop.aggressor : CS.postflop.caller,
    });
  }
  if (positionRole) badges.push({ kind: positionRole.toLowerCase(), label: positionRole });
  return badges;
}

function positionMarker(doc: Document, position: Position): HTMLElement | null {
  if (position !== "BTN" && position !== "SB" && position !== "BB") return null;
  const marker = doc.createElement("span");
  marker.className = `postflop-position-mark postflop-position-mark--${position.toLowerCase()}`;
  marker.textContent = position;
  return marker;
}

function seatPosition(slot: number): { left: number; top: number } {
  const angle = Math.PI / 2 + slot * ((2 * Math.PI) / POSITION_ORDER.length);
  return {
    left: 50 + 44 * Math.cos(angle),
    top: 50 + 41 * Math.sin(angle),
  };
}

function seatPositionMobile(slot: number): { left: number; top: number } {
  const angle = Math.PI / 2 + slot * ((2 * Math.PI) / POSITION_ORDER.length);
  return {
    left: 50 + 34 * Math.cos(angle),
    top: 50 + 40 * Math.sin(angle),
  };
}

function cardBack(doc: Document): HTMLElement {
  const back = doc.createElement("div");
  back.className = "postflop-card-back";
  return back;
}

function cardElement(doc: Document, card: Card): HTMLElement {
  const el = doc.createElement("div");
  el.className = `postflop-card ${SUIT_CLASS[card.suit]}`;
  el.dataset.card = `${card.rank}${card.suit}`;
  el.textContent = `${card.rank}${SUIT_SYMBOL[card.suit]}`;
  return el;
}

function showResult(
  root: HTMLElement,
  spot: PostflopTrainingSpot,
  chosen: PostflopAction,
  questionStartedAt: number,
  options: PostflopViewOptions,
): void {
  const grade = gradePostflopAction(spot, chosen);
  const buttons = root.querySelectorAll<HTMLButtonElement>(".postflop-action");
  buttons.forEach((button) => {
    button.disabled = true;
    button.classList.toggle("postflop-action--chosen", button.dataset.action === chosen);
    button.classList.toggle(
      "postflop-action--recommended",
      grade.recommended.includes(button.dataset.action as PostflopAction),
    );
  });
  revealActionEvButtonBubbles(buttons, spot.actionEvs, grade.actionEv, chosen);
  // Cena dorovnání ze skutečné linie, kterou solver hrál. Na flopu a turnu je
  // to jediné číslo, které tam být může: EV se tam spočítat nedá (bod 131).
  revealActionPriceLines(buttons, postflopDecisionPrices(spot));

  const result = root.querySelector<HTMLElement>(".postflop-result");
  if (!result) return;
  const correct = grade.correct;
  // Tři stavy, ne dva. Akci, kterou rozbor nemodeluje, nelze označit za chybu:
  // solver na tom uzlu žádnou takovou větev nepočítal, takže „špatně" je
  // tvrzení bez opory. Změřeno: týkalo se to 104 z 300 riverových spotů.
  const verdict = grade.unsolved
    ? "postflop-result--unsolved"
    : correct ? "postflop-result--correct" : "postflop-result--wrong";
  result.hidden = false;
  result.className = `postflop-result ${verdict}`;
  renderPracticalExplanation(result, spot, grade, chosen);
  options.onAnswered?.(spot, chosen, elapsedMs(questionStartedAt));
  focusElement(result);
}

function appendLineControls(
  root: HTMLElement,
  line: PostflopLine,
  streetIndex: number,
  chosenByStreet: Partial<Record<PostflopStreet, PostflopAction>>,
  lineStartedAt: number,
  options: PostflopViewOptions,
  controls: {
    onNewSpot: () => void;
    onChangeSituation: () => void;
  },
): void {
  const doc = root.ownerDocument ?? document;
  const result = root.querySelector<HTMLElement>(".postflop-result");
  if (!result) return;

  const actions = doc.createElement("div");
  actions.className = "postflop-line-actions";

  if (streetIndex < line.streets.length - 1) {
    const next = doc.createElement("button");
    next.type = "button";
    next.className = "postflop-line-next";
    next.textContent = CS.postflop.next(STREET_LABEL[line.streets[streetIndex + 1].street]);
    next.addEventListener("click", () => {
      renderLineSpot(
        root,
        branchPostflopLine(line, chosenByStreet, options),
        streetIndex + 1,
        { ...chosenByStreet },
        lineStartedAt,
        options,
        controls,
      );
    });
    actions.appendChild(next);
  } else {
    const completedAt = Date.now();
    options.onLineCompleted?.(line, { ...chosenByStreet }, lineStartedAt, completedAt);
    const done = doc.createElement("div");
    done.className = "postflop-line-complete";
    const correct = line.streets.filter((street) => (
      gradePostflopAction(
        postflopSpotToTrainingSpot(street.spot, getAppLanguage()),
        chosenByStreet[street.street]!,
      ).correct
    )).length;
    done.dataset.correctStreets = String(correct);
    done.dataset.totalStreets = String(line.streets.length);
    done.textContent = CS.postflop.lineComplete(correct, line.streets.length);
    actions.appendChild(done);
  }

  result.appendChild(actions);
}

function branchPostflopLine(
  line: PostflopLine,
  chosenActionsByStreet: PostflopLineActionPlan,
  options: PostflopViewOptions,
): PostflopLine {
  const firstStreet = line.streets[0]?.spot;
  const firstAction = line.actionHistory[0];
  return generatePostflopLine({
    seed: line.seed,
    heroCards: line.heroCards,
    board: line.board,
    potType: firstStreet?.potType,
    potBB: firstAction?.potBBBefore ?? firstStreet?.potBB,
    effectiveStackBB: firstAction?.effectiveStackBBBefore ?? firstStreet?.effectiveStackBB,
    positionContext: firstStreet ? positionContextFromSpot(firstStreet) : undefined,
    actionNode: firstStreet?.actionNode,
    strategyResolver: options.strategyResolver ?? POSTFLOP_STRATEGY_RESOLVER,
    allowFallback: options.lineAllowFallback ?? options.allowFallback,
    chosenActionsByStreet,
  });
}

function positionContextFromSpot(spot: PostflopSpot): PostflopPositionContext {
  return {
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    aggressorPosition: spot.aggressorPosition,
    callerPosition: spot.callerPosition,
    inPosition: spot.inPosition,
    callerType: spot.callerType,
    positionPattern: spot.positionPattern,
  };
}

function renderPracticalExplanation(
  root: HTMLElement,
  spot: PostflopTrainingSpot,
  grade: PostflopGrade,
  chosen: PostflopAction,
): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const summary = doc.createElement("p");
  summary.className = "postflop-result__summary";
  const resultLabel = grade.actionEv?.outcome === "EQUIVALENT"
    ? CS.postflop.equivalent
    : grade.actionEv?.outcome === "ACCEPTABLE"
      ? CS.postflop.acceptable
      : grade.unsolved
        ? CS.postflop.unsolved
        : grade.correct
          ? CS.postflop.correct
          : CS.postflop.incorrect;
  summary.textContent =
    `${resultLabel} ${CS.postflop.recommended}: ` +
    `${grade.recommended.map(actionLabel).join(" / ")}. ${spot.explanation.summary}`;
  root.appendChild(summary);
  root.appendChild(renderPostflopActionEv(doc, spot, chosen, grade));

  const grid = doc.createElement("div");
  grid.className = "postflop-practical";
  grid.appendChild(explanationBlock(doc, CS.postflop.blocks.value, spot.explanation.valueHands));
  grid.appendChild(explanationBlock(doc, CS.postflop.blocks.bluffs, spot.explanation.bluffHands));
  grid.appendChild(explanationBlock(doc, CS.postflop.blocks.check, spot.explanation.checkHands));
  grid.appendChild(explanationBlock(doc, CS.postflop.blocks.model, modelItems(spot)));

  const plan = doc.createElement("div");
  plan.className = "postflop-practical__block postflop-practical__block--wide";
  const planTitle = doc.createElement("div");
  planTitle.className = "postflop-practical__title";
  planTitle.textContent = CS.postflop.blocks.plan;
  const planText = doc.createElement("p");
  planText.className = "postflop-practical__text";
  planText.textContent = spot.explanation.nextStreetPlan;
  plan.appendChild(planTitle);
  plan.appendChild(planText);
  grid.appendChild(plan);

  root.appendChild(grid);
  if (spot.street === "FLOP") {
    root.appendChild(renderFlopRangeSummary(doc, spot, chosen));
  }
}

function renderPostflopActionEv(
  doc: Document,
  spot: PostflopTrainingSpot,
  chosen: PostflopAction,
  grade: PostflopGrade,
): HTMLElement {
  const section = doc.createElement("section");
  section.className = "action-ev";
  section.dataset.available = grade.actionEv ? "true" : "false";

  const title = doc.createElement("div");
  title.className = "action-ev__title";
  title.textContent = CS.postflop.actionEv.title;
  section.appendChild(title);

  if (!grade.actionEv || !spot.actionEvs) {
    const unavailable = doc.createElement("p");
    unavailable.className = "action-ev__unavailable";
    unavailable.textContent = CS.postflop.actionEv.unavailable;
    section.appendChild(unavailable);
    return section;
  }

  const list = doc.createElement("div");
  list.className = "action-ev__list";
  const sorted = [...spot.actionEvs.values].sort((left, right) => right.evBb - left.evBb);
  for (const item of sorted) {
    const row = doc.createElement("div");
    const lossBb = Math.max(0, grade.actionEv.bestEvBb - item.evBb);
    row.className = "action-ev__row";
    row.classList.toggle("action-ev__row--chosen", item.action === chosen);
    row.classList.toggle("action-ev__row--best", grade.actionEv.bestActions.includes(item.action));
    row.dataset.action = item.action;
    row.dataset.evBb = String(item.evBb);

    const action = doc.createElement("span");
    action.className = "action-ev__action";
    action.textContent = actionLabel(item.action);
    const value = doc.createElement("span");
    value.className = "action-ev__value";
    value.textContent = `${formatActionEvBb(item.evBb)} BB`;
    const delta = doc.createElement("span");
    delta.className = "action-ev__delta";
    delta.textContent = lossBb <= 1e-9
      ? CS.postflop.actionEv.best
      : `${formatActionEvBb(-lossBb)} BB`;

    row.append(action, value, delta);
    list.appendChild(row);
  }
  section.appendChild(list);

  const note = doc.createElement("p");
  note.className = "action-ev__note";
  note.textContent = CS.postflop.actionEv.note;
  section.appendChild(note);
  return section;
}

function explanationBlock(
  doc: Document,
  title: string,
  items: readonly string[],
): HTMLElement {
  const block = doc.createElement("div");
  block.className = "postflop-practical__block";

  const heading = doc.createElement("div");
  heading.className = "postflop-practical__title";
  heading.textContent = title;
  block.appendChild(heading);

  const list = doc.createElement("ul");
  list.className = "postflop-practical__list";
  const visibleItems = items.length > 0 ? items : [CS.postflop.noCandidates];
  for (const item of visibleItems) {
    const li = doc.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  block.appendChild(list);

  return block;
}

function renderFlopRangeSummary(
  doc: Document,
  spot: PostflopTrainingSpot,
  chosen: PostflopAction,
): HTMLElement {
  const section = doc.createElement("section");
  section.className = "postflop-range-summary";
  section.dataset.street = "FLOP";
  section.dataset.recommendedAction = spot.recommendedAction;
  section.dataset.chosenAction = chosen;

  const header = doc.createElement("div");
  header.className = "postflop-range-summary__header";
  const title = doc.createElement("div");
  title.className = "postflop-range-summary__title";
  title.textContent = CS.postflop.flopRange;
  const meta = doc.createElement("div");
  meta.className = "postflop-range-summary__meta";
  meta.textContent =
    `${CS.postflop.recommended}: ${actionLabel(spot.recommendedAction)} | ` +
    `${CS.postflop.yourAction}: ${actionLabel(chosen)}`;
  header.appendChild(title);
  header.appendChild(meta);
  section.appendChild(header);

  const note = doc.createElement("p");
  note.className = "postflop-range-summary__note";
  note.textContent = rangeFocusText(spot);
  section.appendChild(note);

  section.appendChild(heroBucketInsight(doc, spot, chosen));

  const lanes = doc.createElement("div");
  lanes.className = "postflop-range-summary__lanes";
  // Facing a bet these lanes are raise / raise / call-or-fold, so their headings
  // follow the node. The betting-node wording is left exactly as it was.
  const facingBet = FACING_BET_ACTION_NODES.has(spot.actionNode);
  lanes.appendChild(rangeLane(doc, facingBet ? "Value raise" : "Value", "VALUE", spot.explanation.valueHands, "BET", spot, chosen));
  lanes.appendChild(rangeLane(doc, facingBet ? "Bluff raise" : "Bluffs", "BLUFF", spot.explanation.bluffHands, "BET", spot, chosen));
  lanes.appendChild(rangeLane(doc, facingBet ? "Call or fold" : "Check", "CHECK", spot.explanation.checkHands, "CHECK", spot, chosen));
  section.appendChild(lanes);

  const matrixMount = doc.createElement("div");
  matrixMount.className = "postflop-range-summary__matrix";
  renderPostflopRangeMatrix(spot, matrixMount);
  section.appendChild(matrixMount);
  wireRangeLaneFilters(section, matrixMount);

  return section;
}

function heroBucketInsight(
  doc: Document,
  spot: PostflopTrainingSpot,
  chosen: PostflopAction,
): HTMLElement {
  const heroHand = postflopHandClassFromCards(spot.heroCards);
  const heroCategory = classifyFlopHand(heroHand, spot.board);
  const heroCategoryLabel = flopzillaCategoryLabel(heroCategory);
  const heroLane = flopzillaLaneForCategory(heroCategory);
  const sourceBucket = spot.explanation.source.kind === "STRATEGY_PACK"
    ? spot.explanation.source.heroRangeBucket
    : undefined;

  const insight = doc.createElement("div");
  insight.className = "postflop-range-summary__hero-bucket";
  insight.dataset.heroHand = heroHand;
  insight.dataset.heroCategory = heroCategory;
  insight.dataset.heroCategoryLabel = heroCategoryLabel;
  insight.dataset.heroLane = heroLane;
  insight.dataset.heroLaneLabel = flopzillaLaneLabel(heroLane, spot.actionNode);
  if (sourceBucket) {
    insight.dataset.rangeBucketLane = sourceBucket.lane;
    insight.dataset.rangeBucketAction = sourceBucket.action;
    insight.dataset.rangeBucketLabel = sourceBucket.label;
    insight.dataset.rangeBucketMixed = sourceBucket.actionMix ? "true" : "false";
  }

  const label = doc.createElement("span");
  label.className = "postflop-range-summary__hero-bucket-label";
  label.textContent = CS.postflop.heroBucket;
  insight.appendChild(label);

  const text = doc.createElement("span");
  text.className = "postflop-range-summary__hero-bucket-text";
  text.textContent = sourceBucket
    ? sourceBucketFeedback(heroHand, heroCategoryLabel, sourceBucket, chosen)
    : localizedText(
        `${heroHand} is ${heroCategoryLabel} on this flop and usually belongs to the ` +
          `${flopzillaLaneLabel(heroLane, spot.actionNode).toLowerCase()} section. Compare it with the value, bluff, and check ranges.`,
        `${heroHand} je na tomto flopu kategorie ${heroCategoryLabel} a obvykle patří do části ` +
          `${flopzillaLaneLabel(heroLane, spot.actionNode).toLowerCase()}. Porovnejte ji s value, bluff a check částí range.`,
      );
  insight.appendChild(text);

  return insight;
}

function sourceBucketFeedback(
  heroHand: string,
  heroCategoryLabel: string,
  bucket: PostflopHeroRangeBucket,
  chosen: PostflopAction,
): string {
  const mix = bucket.actionMix;
  const inMix = mix?.some((item) => item.action === chosen) === true;
  const featureTextEn = bucket.features.length > 0
    ? ` Main features: ${bucket.features.join(", ")}.`
    : "";
  const featureTextCs = bucket.features.length > 0
    ? ` Hlavní vlastnosti: ${bucket.features.join(", ")}.`
    : "";
  const choiceTextEn = inMix
    ? "Your action is part of this bucket's mix."
    : chosen === bucket.action
      ? "Your action matches the bucket's primary action."
      : `Your action is outside this bucket's primary ${actionLabel(bucket.action).toLowerCase()} line.`;
  const choiceTextCs = inMix
    ? "Vaše akce je součástí mixu tohoto bucketu."
    : chosen === bucket.action
      ? "Vaše akce odpovídá primární akci bucketu."
      : `Vaše akce je mimo primární ${actionLabel(bucket.action).toLowerCase()} line tohoto bucketu.`;
  return localizedText(
    `${heroHand} is ${heroCategoryLabel} in range bucket ${bucket.label}. ` +
      `Bucket section: ${bucket.lane.toLowerCase()}. Primary action: ${actionLabel(bucket.action)}. ` +
      `${actionMixText(bucket)} ${choiceTextEn}${featureTextEn}`,
    `${heroHand} je kategorie ${heroCategoryLabel} v range bucketu ${bucket.label}. ` +
      `Část bucketu: ${bucket.lane.toLowerCase()}. Primární akce: ${actionLabel(bucket.action)}. ` +
      `${actionMixText(bucket)} ${choiceTextCs}${featureTextCs}`,
  );
}

function actionMixText(bucket: PostflopHeroRangeBucket): string {
  const mix = bucket.actionMix;
  if (!mix || mix.length === 0) {
    return localizedText(
      "No explicit mixed-action ratio is attached.",
      "Není připojen explicitní mixed-action poměr.",
    );
  }
  const exact = mix.every((item) => item.visibility === "EXACT");
  const items = mix.map((item) => (
    exact ? `${actionLabel(item.action)} ${formatPct(item.frequencyPct)}` : actionLabel(item.action)
  ));
  return exact
    ? localizedText(`Action mix: ${items.join(" / ")}.`, `Mix akcí: ${items.join(" / ")}.`)
    : localizedText(
        `Action mix: ${items.join(" / ")}. Exact frequencies are hidden for this bucket.`,
        `Mix akcí: ${items.join(" / ")}. Přesné frekvence jsou pro tento bucket skryté.`,
      );
}

function formatPct(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

function rangeLane(
  doc: Document,
  title: string,
  laneName: FlopzillaLane,
  items: readonly string[],
  laneAction: "BET" | "CHECK",
  spot: PostflopTrainingSpot,
  chosen: PostflopAction,
): HTMLElement {
  const lane = doc.createElement("div");
  lane.className = "postflop-range-summary__lane";
  lane.dataset.lane = laneName;
  lane.setAttribute("role", "button");
  lane.setAttribute("tabindex", "0");
  lane.setAttribute("aria-pressed", "false");
  lane.setAttribute("aria-label", CS.postflop.laneHighlight(title));
  const recommendedLane = actionBelongsToLane(spot.recommendedAction, laneAction);
  const chosenLane = actionBelongsToLane(chosen, laneAction);
  lane.classList.toggle("postflop-range-summary__lane--recommended", recommendedLane);
  lane.classList.toggle("postflop-range-summary__lane--chosen", chosenLane);

  const heading = doc.createElement("div");
  heading.className = "postflop-range-summary__lane-title";
  heading.textContent = title;
  lane.appendChild(heading);

  const chips = doc.createElement("div");
  chips.className = "postflop-range-summary__chips";
  const visibleItems = items.length > 0 ? items : [CS.postflop.noCandidates];
  for (const item of visibleItems) {
    const chip = doc.createElement("span");
    chip.className = "postflop-range-summary__chip";
    chip.textContent = item;
    chips.appendChild(chip);
  }
  lane.appendChild(chips);

  return lane;
}

function wireRangeLaneFilters(section: HTMLElement, matrixMount: HTMLElement): void {
  let activeLane: FlopzillaLane | null = null;
  const lanes = [...section.querySelectorAll<HTMLElement>(".postflop-range-summary__lane")];
  const apply = (): void => {
    section.dataset.activeLane = activeLane ?? "";
    for (const lane of lanes) {
      const active = lane.dataset.lane === activeLane;
      lane.classList.toggle("postflop-range-summary__lane--active", active);
      lane.setAttribute("aria-pressed", active ? "true" : "false");
    }
    matrixMount.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")
      .forEach((cell) => {
        const muted = activeLane !== null && cell.dataset.lane !== activeLane;
        cell.classList.toggle("postflop-flopzilla__cell--muted", muted);
      });
  };

  for (const lane of lanes) {
    lane.addEventListener("click", () => {
      const laneName = lane.dataset.lane as FlopzillaLane;
      activeLane = activeLane === laneName ? null : laneName;
      apply();
    });
    lane.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      lane.click();
    });
  }
}

function actionBelongsToLane(action: PostflopAction, laneAction: "BET" | "CHECK"): boolean {
  if (laneAction === "CHECK") return action === "CHECK";
  return action === "BET_SMALL" || action === "BET_BIG" || action === "RAISE";
}

function rangeFocusText(spot: PostflopTrainingSpot): string {
  switch (spot.recommendedAction) {
    case "BET_SMALL":
      return localizedText(
        "The small c-bet range combines value with natural bluffs; the check range retains weaker showdown value and traps.",
        "Range malého c-betu kombinuje value s přirozenými bluffy; check range si ponechává slabší showdown a trapy.",
      );
    case "BET_BIG":
      return localizedText(
        "The big-bet range is more polarized: strong value and the best draws or blockers.",
        "Range velkého betu je polarizovanější: silná value a nejlepší draw nebo blockery.",
      );
    case "CALL":
      return localizedText(
        "The calling range continues with hands that have enough equity, blockers, or showdown value.",
        "Call range pokračuje s handami, které mají dost equity, blockerů nebo showdown value.",
      );
    case "RAISE":
      return localizedText(
        "The raising range is polarized: strong value and blocker-driven bluffs apply maximum pressure.",
        "Raise range je polarizovaná: silná value a bluffy s blockery vytvářejí maximální tlak.",
      );
    case "FOLD":
      return localizedText(
        "The folding range releases hands without sufficient equity, blockers, or pot odds.",
        "Fold range zahazuje handy bez dostatečné equity, blockerů nebo pot odds.",
      );
    case "CHECK":
      return localizedText(
        "Checking protects equity realization: weaker showdown value, pot control, and hands for check-call or check-back plans.",
        "Check chrání realizaci equity: slabší showdown, pot-control a handy pro check-call nebo check-back plán.",
      );
  }
}

function modelItems(spot: PostflopTrainingSpot): readonly string[] {
  const source = spot.explanation.source;
  if (source.kind === "STRATEGY_PACK") {
    return [
      localizedText(
        isPublicHeuristicStrategySource(source) ? "Heuristic model" : "Production model",
        isPublicHeuristicStrategySource(source) ? "Heuristický model" : "Produkční model",
      ),
      localizedText(`Confidence: ${confidenceLabel(source.confidence)}`, `Spolehlivost: ${confidenceLabel(source.confidence)}`),
      ...textureItems(source),
      localizedText(`SPR range: ${source.sprMin}-${source.sprMax}`, `Rozsah SPR: ${source.sprMin}-${source.sprMax}`),
      ...sprFidelityItems(source.sprFidelity),
      ...treeIntegrityItems(source.treeIntegrity),
      ...source.assumptions.map(
        (assumption, index) => localizedText(
          `Assumption ${index + 1}: ${userFacingAssumption(assumption)}`,
          `Předpoklad ${index + 1}: ${userFacingAssumption(assumption)}`,
        ),
      ),
    ];
  }
  return [localizedText("Basic heuristic", "Základní heuristika")];
}

/**
 * Show the SPR the strategy was actually solved at, and warn when the shown spot
 * sits far from it. A rule matches a wide SPR band while its content comes from a
 * solve at one point, so a spot can display strategy computed at a very different
 * stack depth - most visibly a shallow three-bet pot shown a deeper solve. The
 * band alone hides this; the solved point and the distance make it honest.
 */
function sprFidelityItems(
  fidelity: Extract<PostflopTrainingSpot["explanation"]["source"], { kind: "STRATEGY_PACK" }>["sprFidelity"],
): readonly string[] {
  if (!fidelity) return [];
  const solved = localizedText(
    `Solved at SPR ${fidelity.solvedSpr}`,
    `Solveno na SPR ${fidelity.solvedSpr}`,
  );
  if (fidelity.band === "MATCH") return [solved];

  const times = `${fidelity.ratio}x`;
  const warning = fidelity.band === "MISMATCH"
    ? localizedText(
      `Shown SPR is ${times} the solved SPR - the strategy may not transfer`,
      `Zobrazené SPR je ${times} solveného - strategie nemusí sedět`,
    )
    : localizedText(
      `Shown SPR is ${times} the solved SPR - treat as approximate`,
      `Zobrazené SPR je ${times} solveného - ber orientačně`,
    );
  return [solved, warning];
}

/**
 * Describe how the strategy relates to the board, without overstating it.
 *
 * "Texture match: paired, low, dry" reads as evidence that the strategy was
 * selected for this board. For the shipped library it is not: eighteen of the
 * nineteen rules declare every texture in the taxonomy and the nineteenth omits
 * one, so the reported match is the intersection of the board's own textures with
 * everything - which is just a description of the board that was dealt.
 *
 * These are family-level aggregates and their ids say so. A rule covering the
 * whole taxonomy says that plainly; anything narrower reports how much it covers,
 * because twelve of thirteen is not a match either and no threshold should have
 * to be invented to say so.
 */
function textureItems(
  source: Extract<PostflopTrainingSpot["explanation"]["source"], { kind: "STRATEGY_PACK" }>,
): readonly string[] {
  const coverage = source.textureCoverage;
  // Prázdný seznam znamená, že odpověď na texturách nestojí - vyřešená rodina
  // odpovídá na jednu konkrétní desku, ne na třídu textur. Říct „shoda textury:"
  // a nechat za dvojtečkou prázdno by bylo tvrzení, které se o nic neopírá.
  if (source.matchedTextures.length === 0) return [];
  const matched = source.matchedTextures.map(textureLabel).join(", ");
  if (coverage === undefined) {
    return [localizedText(`Texture match: ${matched}`, `Shoda textury: ${matched}`)];
  }
  if (coverage.covered >= coverage.total) {
    return [localizedText(
      "One aggregate for every board texture in this band, not tuned to this board",
      "Jeden agregát pro všechny textury desky v tomto pásmu, není laděný na tuhle desku",
    )];
  }
  // Stated as a fraction so a rule covering twelve of thirteen cannot pass for a
  // selective one, and a genuinely narrow rule reads as narrow, with no threshold
  // anywhere for someone to argue about.
  return [
    localizedText(
      `Covers ${coverage.covered} of ${coverage.total} board textures`,
      `Pokrývá ${coverage.covered} z ${coverage.total} textur desky`,
    ),
    localizedText(`This board matches: ${matched}`, `Tahle deska odpovídá: ${matched}`),
  ];
}

/**
 * Say when a rule's content was aggregated over two different solver trees.
 *
 * Some families were solved partly on the authoritative full tree and partly on
 * a reduced one that has no turn or river raise, no donk and no all-in. That is a
 * different game, not a coarser description of the same one, so an aggregate over
 * both blends two of them. The release gate has named these families to operators
 * since the mixing was found, and the player training the spot was told nothing -
 * while being told plainly when the shown SPR sits far from the solved one.
 */
function treeIntegrityItems(
  integrity: Extract<PostflopTrainingSpot["explanation"]["source"], { kind: "STRATEGY_PACK" }>["treeIntegrity"],
): readonly string[] {
  if (integrity !== "MIXED_TREES") return [];
  return [localizedText(
    "Built from two solver trees - one without turn and river raises, so treat the turn and river plan as approximate",
    "Postaveno ze dvou solverových stromů - jeden bez raisů na turnu a riveru, takže plán na turnu a riveru ber orientačně",
  )];
}

/**
 * Never present a heuristic answer as solver-backed. This reads the structural
 * provenance the resolver records, not the wording of an assumption: matching
 * free text meant that rephrasing one sentence would silently relabel the public
 * heuristic model as production content.
 */
/** Nodes where the hero is facing a bet, so checking is not a legal action. */
const FACING_BET_ACTION_NODES = new Set<PostflopActionNode>([
  "FLOP_FACING_BET",
  "TURN_FACING_BET",
  "RIVER_FACING_BET",
]);

function isPublicHeuristicStrategySource(
  source: Extract<PostflopTrainingSpot["explanation"]["source"], { kind: "STRATEGY_PACK" }>,
): boolean {
  return source.provenance === "PUBLIC_HEURISTIC";
}

function userFacingAssumption(assumption: string): string {
  if (getAppLanguage() === "EN") {
    return assumption
      .replace(/\bStrategyPack\b/g, "strategy model")
      .replace(/\bRangePack\b/g, "strategy model");
  }
  return assumption
    .replace(
      /^Public heuristic(?: .*?)? StrategyPack only; no paid chart values or exact solver frequencies are copied\.$/,
      "Veřejná tréninková heuristika bez přesných solverových frekvencí.",
    )
    .replace(
      "Flop first: board texture, position pattern, pot type, SPR and effective stack are explicit dimensions.",
      "Flop model explicitně rozlišuje texturu boardu, pozice, typ potu, SPR a efektivní stack.",
    )
    .replace(
      "Turn and river packs should be added only after the flop model is stable.",
      "Turn a river model se přidává až po stabilizaci flop modelu.",
    )
    .replace(
      "Rules are texture-level training prompts, not production equilibrium strategy.",
      "Pravidla jsou tréninkové podněty podle textury, nikoli produkční rovnovážná strategie.",
    )
    .replace(
      "River decisions are simplified to check, small value/block bet, or large polarized pressure.",
      "River rozhodnutí jsou zjednodušena na check, malý value/block bet nebo velký polarizovaný tlak.",
    )
    .replace(
      "Specific blocker/card-removal selection remains future solver/import work.",
      "Přesný výběr podle blockerů a card removal zůstává úkolem solver/import pipeline.",
    )
    .replace(/\bStrategyPack\b/g, "model")
    .replace(/\bRangePack\b/g, "model")
    .replace(/\bLOW confidence\b/g, "nízká spolehlivost");
}

function confidenceLabel(confidence: "LOW" | "MEDIUM" | "HIGH"): string {
  switch (confidence) {
    case "LOW":
      return localizedText("low", "nízká");
    case "MEDIUM":
      return localizedText("medium", "střední");
    case "HIGH":
      return localizedText("high", "vysoká");
    default:
      return confidence;
  }
}

function textureLabel(texture: BoardTexture): string {
  return TEXTURE_LABEL[texture] ?? texture;
}

function actionLabel(action: PostflopAction): string {
  switch (action) {
    case "CHECK":
      return "Check";
    case "BET_SMALL":
      return "Bet small";
    case "BET_BIG":
      return "Bet big";
    case "CALL":
      return "Call";
    case "RAISE":
      return "Raise";
    case "FOLD":
      return "Fold";
  }
}

/**
 * A solved turn to deal for this seed, or nothing when none is loaded.
 *
 * The seed picks the spot, so the same seed reproduces the same board - which is
 * what the seed box is for, and would stop working if the catalogue drew from
 * anywhere else. The rng is stepped once before use because mulberry32's first
 * value is close to linear in its seed, and consecutive seeds would otherwise
 * walk the catalogue in order rather than sample it.
 */
/**
 * Konfigurace linky postavená kolem vyřešeného turnu.
 *
 * Linka rozdávala náhodnou pětikartovou desku a resolver ji - správně - odmítal:
 * změřeno 0 z 500 linek se solverovým obsahem na kterékoli ulici, přestože se
 * dodává jedenáct vyřešených rodin. Stejná situace, v jaké byl jednotlivý spot,
 * než vznikl katalog: obsah existuje a je nedosažitelný, a zvenku to vypadá
 * úplně stejně jako by neexistoval.
 *
 * Linka se proto staví od turnu, který někdo vyřešil. Flop a turn jsou z
 * katalogu, river se dolosuje - ten vyřešený stejně není a předstírat opak by
 * bylo horší než heuristika, protože heuristika se aspoň jako heuristika
 * označuje.
 *
 * Když katalog nic nenabídne, vrací se `undefined` a linka se rozdá jako dřív.
 * Prázdný katalog nesmí znamenat, že se nedá hrát.
 */
function solvedLineConfigForSeed(seed: number): {
  board: [Card, Card, Card, Card, Card];
  potType: PostflopPotType;
  potBB: number;
  effectiveStackBB: number;
  positionContext: PostflopPositionContext;
  actionNode: PostflopActionNode;
  /**
   * Pack vyřešeného riveru, když se pátou kartu podařilo vybrat z obsahu.
   *
   * Vrací se ven kvůli přednačtení tabulky EV: bez něj se resolver ptá na
   * tabulku uprostřed rozdání a první linka z každé rodiny čísla neukáže -
   * tatáž vada, jaká byla u jednotlivého riverového drilu.
   */
  riverPackId?: string;
} | undefined {
  const rng = mulberry32(seed);
  rng();
  const spot = pickSolvedTurnSpot(rng(), solvedTurnSpots());
  if (spot === undefined) return undefined;
  const config = solvedTurnSpotConfig(spot, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng());
  if (config === undefined || config.board.length !== 4) return undefined;

  // Pátá karta se dolosuje mimo ty čtyři, které už na stole jsou.
  const used = new Set(config.board.map((card) => `${card.rank}${card.suit}`));
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      if (!used.has(`${rank}${suit}`)) deck.push({ rank, suit });
    }
  }
  // Pátá karta z vyřešeného riveru, když pro tuhle desku nějaký je.
  //
  // Dřív se dolosovala vždycky, a to bylo správně jen dokud vyřešený river
  // neexistoval. Jakmile existuje, znamená losování, že se hráč na něj trefí s
  // pravděpodobností jedna ku čtyřiceti čtyřem - tedy že se obsah dodává,
  // stahuje a nikdo ho nepotká. Bez shody se dolosuje dál: vyrobit river, který
  // nikdo nespočítal, by bylo horší než heuristika.
  const solvedRivers = solvedRiversForTurnBoard(config.board);
  const picked = pickSolvedRiverSpot(rng(), solvedRivers);
  const solvedRiver = picked?.board[4];
  const river = solvedRiver
    ?? deck[Math.min(Math.floor(rng() * deck.length), deck.length - 1)];
  if (river === undefined) return undefined;

  return {
    board: [config.board[0], config.board[1], config.board[2], config.board[3], river],
    potType: config.potType,
    potBB: config.potBB,
    effectiveStackBB: config.effectiveStackBB,
    positionContext: config.positionContext,
    // Linka začíná na flopu, takže uzel je flopový; turnový uzel si simulátor
    // odvodí sám z toho, jak se na flopu zahrálo.
    actionNode: config.potType === "THREE_BET_POT" ? "THREE_BET_POT_CBET" : "SINGLE_RAISED_POT_CBET",
    ...(picked !== undefined ? { riverPackId: picked.packId } : {}),
  };
}

function parseStreet(value: string): PostflopStreet {
  return value === "TURN" || value === "RIVER" ? value : "FLOP";
}

function parseSeed(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > SEED_MAX) return null;
  return n;
}

function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * (SEED_MAX + 1));
}

