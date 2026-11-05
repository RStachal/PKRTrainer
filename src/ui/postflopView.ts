import {
  POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS,
  PostflopStrategyUnavailableError,
  type PostflopAction,
  type PostflopPositionContext,
  type PostflopPotType,
  type PostflopSpot,
  type PostflopStreet,
  type PostflopStrategyResolver,
} from "../core/postflopGenerator";
import {
  generatePostflopLine,
  type PostflopLine,
  type PostflopLineActionPlan,
} from "../core/postflopLineSimulator";
import {
  postflopSpotToTrainingSpot,
  type PostflopActionNode,
  type PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import { createDefaultPostflopStrategyResolver } from "../data/ranges/postflopStrategyRegistry";
import {
  pickSolvedTurnSpot,
  solvedTurnSpotConfig,
  solvedTurnSpots,
} from "../data/ranges/solvedTurnSpotCatalogue";
import {
  pickSolvedRiverSpot,
  solvedRiversForTurnBoard,
} from "../data/ranges/solvedRiverSpotCatalogue";
import { selectedActionNode } from "../data/ranges/solvedSpotDealing";
import { primeRiverEvForPack } from "../data/ranges/riverEvPrefetch";
import {
  dealPostflopSpot,
  isResolvingPilotSpot,
  primePostflopDeal,
} from "../training/postflopDeal";
import { mulberry32 } from "../core/rng";
import { RANKS, SUITS } from "../core/poker";
import type { Card } from "../core/types";
import { CS, getAppLanguage } from "./cs";
import {
  createPostflopTrainerView,
  type PostflopTrainerView,
} from "./trainer/postflopTrainerView";
import { GTO_PLAYERS, type PlayerSettings } from "../core/villain/tableCast";
import { gradePostflopAction } from "../core/postflopScoring";

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
  /**
   * Příprava před rozdáním. Dostává i ulici, protože si ji hráč může v panelu
   * změnit a vyřešené packy se načítají po ulicích (deník 337).
   */
  beforeGenerate?: (mode: "single" | "line", street: PostflopStreet) => Promise<void> | void;
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
  /** Režim tréninku a soupeř ve hře pro stůl (plán GTO/REAL); bez nich GTO. */
  players?: PlayerSettings;
}

/** Nová obrazovka panelu; při dalším vykreslení panelu se odpojí. */
const NEXT_VIEWS = new WeakMap<HTMLElement, PostflopTrainerView>();

export interface PostflopRuntimeNotice {
  kind: "SCOPED_PILOT" | "SOLVED_BETA" | "LOCKED_PILOT" | "PRODUCTION" | "PREVIEW" | "DEEP_STACK_UNCOVERED";
  text: string;
}

const STREET_LABEL: Record<PostflopStreet, string> = {
  FLOP: "Flop",
  TURN: "Turn",
  RIVER: "River",
};

function focusElement(element: HTMLElement | null): void {
  if (!element || typeof element.focus !== "function") return;
  element.focus();
}

export function renderPostflopView(root: HTMLElement, options: PostflopViewOptions = {}): void {
  const doc = root.ownerDocument ?? document;
  NEXT_VIEWS.get(root)?.destroy();
  NEXT_VIEWS.delete(root);
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

  // Rozdání čeká na přípravu ulice a tabulku EV. Každé rozdání i „Změnit
  // situaci“ si vezme nové pořadí a rozdání, které mezitím něco předběhlo, se
  // zahodí: pomalé „Další spot“ jinak po návratu přepsalo zadání situace nebo
  // novější spot.
  let dealTicket = 0;

  const showSituationInput = (): void => {
    dealTicket += 1;
    output.innerHTML = "";
    output.hidden = true;
    controls.hidden = false;
    focusElement(streetSelect);
  };

  // Nová obrazovka vzniká s prvním spotem a drží skóre relace, dokud se panel
  // nevykreslí znovu.
  let trainerView: PostflopTrainerView | null = null;
  const nextView = (): PostflopTrainerView => {
    if (trainerView === null) {
      trainerView = createPostflopTrainerView(doc, {
        onNext: () => void showNewSpot(),
        onChangeSituation: showSituationInput,
        onAnswered: (spot, chosen, responseMs) => options.onAnswered?.(spot, chosen, responseMs),
        players: () => options.players ?? GTO_PLAYERS,
      });
      NEXT_VIEWS.set(root, trainerView);
    }
    return trainerView;
  };

  /**
   * Linka v obrazovce tréninku (fáze 1, krok 3c): rozdání, větvení podle
   * zvolené akce (`branchPostflopLine`), počet správných ulic a zápis celé
   * linky na konci (`onLineCompleted`).
   */
  const showLineStreet = (
    line: PostflopLine,
    index: number,
    chosenByStreet: Partial<Record<PostflopStreet, PostflopAction>>,
    startedAt: number,
  ): void => {
    const view = nextView();
    output.replaceChildren(view.element);
    const step = line.streets[index];
    view.show(step.spot.trainingSpot ?? postflopSpotToTrainingSpot(step.spot, getAppLanguage()), {
      index,
      total: line.streets.length,
      priorActions: step.actionHistory,
      answer: (chosen) => {
        const chosenNow = { ...chosenByStreet, [step.street]: chosen };
        const branched = branchPostflopLine(line, chosenNow, options);
        if (index < branched.streets.length - 1) {
          return {
            kind: "NEXT_STREET",
            street: branched.streets[index + 1].street,
            go: () => showLineStreet(branched, index + 1, chosenNow, startedAt),
          };
        }
        options.onLineCompleted?.(branched, chosenNow, startedAt, Date.now());
        const grades = branched.streets.map((street) => gradePostflopAction(
          postflopSpotToTrainingSpot(street.spot, getAppLanguage()),
          chosenNow[street.street]!,
        ));
        return {
          kind: "COMPLETE",
          correct: grades.filter((grade) => grade.correct).length,
          judged: grades.filter((grade) => grade.unsolved !== true).length,
          total: grades.length,
          again: () => void showNewSpot(),
        };
      },
    });
  };

  const showNewSpot = async (): Promise<void> => {
    const ticket = ++dealTicket;
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
      const preparation = options.beforeGenerate?.(mode, street);
      if (preparation) await preparation;
      if (ticket !== dealTicket) return;
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
        if (ticket !== dealTicket) return;
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
        showLineStreet(line, 0, {}, Date.now());
        return;
      }

      // Jednotlivý spot rozdává `dealPostflopSpot` (src/training/postflopDeal.ts),
      // tentýž jako nové GUI: katalog vyřešených desek, záloha i rozlišení
      // pilota čekajícího na přesolvení jsou tam i s důvody.
      const request = { seed, street, actionNode };
      const context = {
        potType: options.initialPotType,
        potBB: options.initialPotBB,
        effectiveStackBB: options.initialEffectiveStackBB,
        positionContext: options.initialPositionContext,
        strategyResolver: options.strategyResolver ?? POSTFLOP_STRATEGY_RESOLVER,
        allowFallback: options.allowFallback,
      };
      const priming = primePostflopDeal(request, context);
      if (priming) await priming;
      if (ticket !== dealTicket) return;
      const dealt = dealPostflopSpot(request, context);
      output.hidden = false;
      if (dealt.kind === "UNAVAILABLE") {
        controls.hidden = false;
        renderUnavailable(output, dealt.resolvingPilot);
        return;
      }
      controls.hidden = true;
      const view = nextView();
      output.replaceChildren(view.element);
      view.show(dealt.spot.trainingSpot ?? postflopSpotToTrainingSpot(dealt.spot, getAppLanguage()));
    } catch (error) {
      // Odmítnutí linky; jednotlivý spot ho vrací z `dealPostflopSpot`.
      // Only a missing-strategy refusal means "no content for this spot". A bare
      // catch made every other failure look like that too, so a real defect would
      // have been reported by players as thin coverage and never as a bug.
      if (!(error instanceof PostflopStrategyUnavailableError)) throw error;
      if (ticket !== dealTicket) return;
      controls.hidden = false;
      output.hidden = false;
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

