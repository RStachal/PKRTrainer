import {
  generatePostflopSpot,
  type BoardTexture,
  type PostflopAction,
  type PostflopPositionContext,
  type PostflopPotType,
  type PostflopSpot,
  type PostflopStreet,
} from "../core/postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  type PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import { postflopPublicHeuristicStrategyPacks } from "../data/ranges/postflopStrategyPack";
import { createPostflopStrategyResolverChain } from "../data/ranges/postflopStrategyResolver";
import { POSITION_ORDER, type Card, type Position, type Suit } from "../core/types";

const SEED_MAX = 0xffffffff;
const POSTFLOP_STRATEGY_RESOLVER = createPostflopStrategyResolverChain(
  postflopPublicHeuristicStrategyPacks,
);

export interface PostflopViewOptions {
  initialStreet?: PostflopStreet;
  initialSeed?: number | null;
  initialPositionContext?: PostflopPositionContext | null;
  initialPotType?: PostflopPotType;
  initialPotBB?: number;
  initialEffectiveStackBB?: number;
  autoGenerate?: boolean;
  onAnswered?: (spot: PostflopTrainingSpot, chosen: PostflopAction) => void;
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
  paired: "Sp\u00e1rovan\u00fd",
  monotone: "Monotone",
  "two-tone": "Two-tone",
  rainbow: "Rainbow",
  connected: "Propojen\u00fd",
  dry: "Such\u00fd",
  "ace-high": "A-high",
  "broadway-high": "Broadway-high",
  low: "Low",
  medium: "Medium",
  "straight-possible": "Straight mo\u017en\u00fd",
  "flush-draw-heavy": "Flush draw",
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

export function renderPostflopView(root: HTMLElement, options: PostflopViewOptions = {}): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = doc.createElement("div");
  wrap.className = "postflop-view";
  wrap.appendChild(styles(doc));

  const controls = doc.createElement("div");
  controls.className = "postflop-controls";

  const streetLabel = doc.createElement("label");
  streetLabel.className = "postflop-field";
  const streetText = doc.createElement("span");
  streetText.textContent = "Street";
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

  const seedLabel = doc.createElement("label");
  seedLabel.className = "postflop-field";
  const seedText = doc.createElement("span");
  seedText.textContent = "Seed";
  const seedInput = doc.createElement("input");
  seedInput.className = "postflop-seed";
  seedInput.type = "text";
  seedInput.inputMode = "numeric";
  seedInput.placeholder = "n\u00e1hodn\u00fd";
  if (options.initialSeed !== undefined && options.initialSeed !== null) {
    seedInput.value = String(options.initialSeed);
  }
  seedLabel.appendChild(seedText);
  seedLabel.appendChild(seedInput);

  const generate = doc.createElement("button");
  generate.type = "button";
  generate.className = "postflop-generate";
  generate.textContent = "Generovat spot";

  controls.appendChild(streetLabel);
  controls.appendChild(seedLabel);
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
  };

  const showNewSpot = (): void => {
    const seed = parseSeed(seedInput.value) ?? randomSeed();
    seedInput.value = String(seed);
    const street = parseStreet(streetSelect.value);
    const spot = generatePostflopSpot({
      seed,
      street,
      potType: options.initialPotType,
      potBB: options.initialPotBB,
      effectiveStackBB: options.initialEffectiveStackBB,
      positionContext: options.initialPositionContext ?? undefined,
      strategyResolver: POSTFLOP_STRATEGY_RESOLVER,
    });
    controls.hidden = true;
    output.hidden = false;
    renderSpot(output, spot, options, {
      onNewSpot: showNewSpot,
      onChangeSituation: showSituationInput,
    });
  };

  generate.addEventListener("click", showNewSpot);
  root.appendChild(wrap);
  if (options.autoGenerate === true) {
    showNewSpot();
  }
}

function renderSpot(
  root: HTMLElement,
  spot: PostflopSpot,
  options: PostflopViewOptions,
  controls: {
    onNewSpot: () => void;
    onChangeSituation: () => void;
  },
): void {
  const doc = root.ownerDocument ?? document;
  const trainingSpot = spot.trainingSpot ?? postflopSpotToTrainingSpot(spot);
  root.innerHTML = "";

  const questionBar = doc.createElement("div");
  questionBar.className = "postflop-question-bar";
  const questionTitle = doc.createElement("div");
  questionTitle.className = "postflop-question-title";
  questionTitle.textContent = "Otazka";
  const questionActions = doc.createElement("div");
  questionActions.className = "postflop-question-actions";

  const newSpot = doc.createElement("button");
  newSpot.type = "button";
  newSpot.className = "postflop-new-spot";
  newSpot.textContent = "Novy spot";
  newSpot.addEventListener("click", controls.onNewSpot);

  const changeSituation = doc.createElement("button");
  changeSituation.type = "button";
  changeSituation.className = "postflop-change-situation";
  changeSituation.textContent = "Zmenit situaci";
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
  meta.textContent =
    `${STREET_LABEL[spot.street]} - seed ${spot.seed} - ${POT_TYPE_LABEL[trainingSpot.potType]} - ` +
    `pot ${spot.potBB} BB - ` +
    `eff. stack ${spot.effectiveStackBB} BB - SPR ${trainingSpot.spr} - ` +
    `${trainingSpot.heroPosition} vs ${trainingSpot.villainPosition} ` +
    `(${trainingSpot.inPosition ? "IP" : "OOP"})`;
  root.appendChild(meta);

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

  const actions = doc.createElement("div");
  actions.className = "postflop-actions";
  for (const action of spot.actions) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "postflop-action";
    btn.dataset.action = action;
    btn.textContent = actionLabel(action);
    btn.addEventListener("click", () => showResult(root, trainingSpot, action, options));
    actions.appendChild(btn);
  }
  root.appendChild(actions);

  const result = doc.createElement("div");
  result.className = "postflop-result";
  result.hidden = true;
  result.setAttribute("role", "status");
  root.appendChild(result);
}

function postflopTable(doc: Document, spot: PostflopTrainingSpot): HTMLElement {
  const table = doc.createElement("div");
  table.className = "postflop-table";
  table.dataset.heroPosition = spot.heroPosition;
  table.dataset.villainPosition = spot.villainPosition;

  const felt = doc.createElement("div");
  felt.className = "postflop-table__felt";
  table.appendChild(felt);

  const center = doc.createElement("div");
  center.className = "postflop-table__center";

  const pot = doc.createElement("div");
  pot.className = "postflop-table__pot";
  pot.textContent = `Pot ${spot.potBB} BB`;
  center.appendChild(pot);

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
    seat.style.left = `${pos.left}%`;
    seat.style.top = `${pos.top}%`;
    table.appendChild(seat);
  }

  return table;
}

function postflopSeat(
  doc: Document,
  spot: PostflopTrainingSpot,
  position: Position,
): HTMLElement {
  const isHero = position === spot.heroPosition;
  const isVillain = position === spot.villainPosition;
  const active = isHero || isVillain;
  const seat = doc.createElement("div");
  seat.className = [
    "postflop-seat",
    isHero ? "postflop-seat--hero" : "",
    isVillain ? "postflop-seat--villain" : "",
    active ? "postflop-seat--active" : "postflop-seat--folded",
  ].filter(Boolean).join(" ");
  seat.dataset.position = position;

  const header = doc.createElement("div");
  header.className = "postflop-seat__header";
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
    folded.textContent = "slozil";
    seat.appendChild(folded);
    return seat;
  }

  const role = doc.createElement("div");
  role.className = "postflop-seat__role";
  role.textContent = seatRole(spot, position);
  seat.appendChild(role);

  const stack = doc.createElement("div");
  stack.className = "postflop-seat__stack";
  stack.textContent = `${spot.effectiveStackBB} BB`;
  seat.appendChild(stack);

  if (isHero) {
    const heroTag = doc.createElement("span");
    heroTag.className = "postflop-seat__tag";
    heroTag.textContent = "TY";
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

function seatRole(spot: PostflopTrainingSpot, position: Position): string {
  const parts: string[] = [];
  if (position === spot.aggressorPosition) parts.push("agresor");
  if (position === spot.callerPosition) parts.push("caller");
  if (position === spot.heroPosition) parts.push(spot.inPosition ? "IP" : "OOP");
  if (position === spot.villainPosition) parts.push(spot.inPosition ? "OOP" : "IP");
  return parts.join(" / ");
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
  options: PostflopViewOptions,
): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>(".postflop-action");
  buttons.forEach((button) => {
    button.disabled = true;
    button.classList.toggle("postflop-action--chosen", button.dataset.action === chosen);
    button.classList.toggle(
      "postflop-action--recommended",
      button.dataset.action === spot.recommendedAction,
    );
  });

  const result = root.querySelector<HTMLElement>(".postflop-result");
  if (!result) return;
  const correct = chosen === spot.recommendedAction;
  options.onAnswered?.(spot, chosen);
  result.hidden = false;
  result.className = `postflop-result ${correct ? "postflop-result--correct" : "postflop-result--wrong"}`;
  renderPracticalExplanation(result, spot, correct);
}

function renderPracticalExplanation(
  root: HTMLElement,
  spot: PostflopTrainingSpot,
  correct: boolean,
): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const summary = doc.createElement("p");
  summary.className = "postflop-result__summary";
  summary.textContent =
    `${correct ? "Spr\u00e1vn\u011b." : "Je\u0161t\u011b ne."} Doporu\u010deno: ` +
    `${actionLabel(spot.recommendedAction)}. ${spot.explanation.summary}`;
  root.appendChild(summary);

  const grid = doc.createElement("div");
  grid.className = "postflop-practical";
  grid.appendChild(explanationBlock(doc, "Value range", spot.explanation.valueHands));
  grid.appendChild(explanationBlock(doc, "Bluffy", spot.explanation.bluffHands));
  grid.appendChild(explanationBlock(doc, "Check range", spot.explanation.checkHands));
  grid.appendChild(explanationBlock(doc, "Model", modelItems(spot)));

  const plan = doc.createElement("div");
  plan.className = "postflop-practical__block postflop-practical__block--wide";
  const planTitle = doc.createElement("div");
  planTitle.className = "postflop-practical__title";
  planTitle.textContent = "Pl\u00e1n";
  const planText = doc.createElement("p");
  planText.className = "postflop-practical__text";
  planText.textContent = spot.explanation.nextStreetPlan;
  plan.appendChild(planTitle);
  plan.appendChild(planText);
  grid.appendChild(plan);

  root.appendChild(grid);
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
  const visibleItems = items.length > 0 ? items : ["Bez prirozenych kandidatu"];
  for (const item of visibleItems) {
    const li = doc.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  block.appendChild(list);

  return block;
}

function modelItems(spot: PostflopTrainingSpot): readonly string[] {
  const source = spot.explanation.source;
  if (source.kind === "STRATEGY_PACK") {
    return [
      "Heuristicky model",
      `Jistota: ${confidenceLabel(source.confidence)}`,
      `Shoda textur: ${source.matchedTextures.map(textureLabel).join(", ")}`,
      `SPR okno: ${source.sprMin}-${source.sprMax}`,
      ...source.assumptions.map(
        (assumption, index) => `Predpoklad ${index + 1}: ${userFacingAssumption(assumption)}`,
      ),
    ];
  }
  return ["Zakladni heuristika"];
}

function userFacingAssumption(assumption: string): string {
  return assumption
    .replace(
      /^Public heuristic .* StrategyPack only; no paid chart values or exact solver frequencies are copied\.$/,
      "Jde o verejnou vyukovou heuristiku bez presnych solverovych frekvenci.",
    )
    .replace(/\bStrategyPack\b/g, "model")
    .replace(/\bRangePack\b/g, "model")
    .replace(/\bLOW confidence\b/g, "nizka jistota");
}

function confidenceLabel(confidence: "LOW" | "MEDIUM" | "HIGH"): string {
  switch (confidence) {
    case "LOW":
      return "nizka";
    case "MEDIUM":
      return "stredni";
    case "HIGH":
      return "vysoka";
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
      return "Bet mal\u00fd";
    case "BET_BIG":
      return "Bet velk\u00fd";
  }
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

function styles(doc: Document): HTMLStyleElement {
  const style = doc.createElement("style");
  style.textContent = `
.postflop-view{font-family:system-ui,Arial,sans-serif;color:#e8ecf7;max-width:860px;
  margin:0 auto;}
.postflop-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;
  background:#11151f;border:1px solid rgba(255,255,255,.08);border-radius:10px;
  padding:12px 14px;margin-bottom:14px;}
.postflop-field{display:flex;flex-direction:column;gap:4px;font-size:12px;
  color:#9aa6c2;font-weight:700;}
.postflop-street,.postflop-seed{box-sizing:border-box;min-width:130px;border:1px solid
  rgba(255,255,255,.18);border-radius:8px;background:#1b2333;color:#e8ecf7;
  font-size:14px;padding:8px 10px;}
.postflop-generate{appearance:none;border:0;border-radius:8px;background:#2bd576;
  color:#0c3526;font-weight:900;font-size:14px;padding:9px 14px;cursor:pointer;}
.postflop-output{background:#0f1520;border:1px solid rgba(255,255,255,.08);
  border-radius:10px;padding:14px;}
.postflop-question-bar{display:flex;align-items:center;justify-content:space-between;
  gap:10px;margin-bottom:12px;}
.postflop-question-title{font-size:14px;font-weight:900;color:#e8ecf7;}
.postflop-question-actions{display:flex;flex-wrap:wrap;gap:8px;}
.postflop-new-spot,.postflop-change-situation{appearance:none;border:1px solid
  rgba(255,255,255,.18);border-radius:8px;background:#1b2333;color:#e8ecf7;
  font-size:12px;font-weight:800;padding:7px 10px;cursor:pointer;}
.postflop-new-spot:hover,.postflop-change-situation:hover{border-color:#2bd576;}
.postflop-meta{font-size:13px;color:#9aa6c2;font-weight:700;margin-bottom:12px;
  overflow-wrap:anywhere;}
.postflop-table{position:relative;width:100%;max-width:820px;aspect-ratio:16/9;
  margin:8px auto 12px;min-height:360px;}
.postflop-table__felt{position:absolute;inset:9% 6%;border-radius:50%/48%;
  background:radial-gradient(ellipse at center,#1d7b4d 0%,#17643f 58%,#0d3b2b 100%);
  box-shadow:inset 0 0 0 10px rgba(7,34,25,.85),inset 0 0 42px rgba(0,0,0,.45),
    0 18px 40px rgba(0,0,0,.24);}
.postflop-table__center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  z-index:3;display:grid;gap:8px;justify-items:center;text-align:center;min-width:230px;}
.postflop-table__pot{font-size:14px;font-weight:900;color:#e8ecf7;
  text-shadow:0 1px 8px rgba(0,0,0,.45);}
.postflop-table__board{display:flex;gap:7px;justify-content:center;align-items:center;}
.postflop-table__center-meta{font-size:12px;font-weight:800;color:#b9c6df;
  background:rgba(15,21,32,.65);border:1px solid rgba(255,255,255,.12);
  border-radius:999px;padding:4px 9px;}
.postflop-seat{position:absolute;transform:translate(-50%,-50%);z-index:4;width:126px;
  min-height:74px;box-sizing:border-box;padding:7px 8px;border-radius:10px;
  background:rgba(16,23,35,.96);border:1px solid rgba(255,255,255,.13);
  box-shadow:0 8px 22px rgba(0,0,0,.26);text-align:center;}
.postflop-seat--hero{border-color:#2bd576;background:rgba(25,88,59,.96);}
.postflop-seat--villain{border-color:#7bd3ff;background:rgba(20,42,62,.96);}
.postflop-seat--folded{opacity:.38;filter:saturate(.45);}
.postflop-seat__header{display:flex;align-items:center;justify-content:center;gap:5px;}
.postflop-seat__pos{font-size:12px;font-weight:900;color:#e8ecf7;}
.postflop-seat__role{font-size:10px;font-weight:900;color:#b9c6df;margin-top:2px;
  text-transform:uppercase;letter-spacing:0;}
.postflop-seat__stack{font-size:11px;font-weight:800;color:#d8e5f8;margin-top:2px;}
.postflop-seat__folded{font-size:10px;font-style:italic;color:#94a0b8;margin-top:5px;}
.postflop-seat__tag{display:inline-block;margin-top:3px;border-radius:999px;background:#2bd576;
  color:#0c3526;font-size:9px;font-weight:900;padding:1px 7px;}
.postflop-seat__cards{display:flex;gap:4px;justify-content:center;margin-top:5px;}
.postflop-card-back{width:28px;height:38px;border-radius:6px;
  background:linear-gradient(135deg,#263550,#101827);border:1px solid rgba(255,255,255,.22);
  box-shadow:inset 0 0 0 2px rgba(123,211,255,.16);}
.postflop-position-mark{display:inline-grid;place-items:center;min-width:20px;height:20px;
  border-radius:999px;font-size:8px;font-weight:900;color:#0c1522;padding:0 3px;}
.postflop-position-mark--btn{background:#f5f5f5;}
.postflop-position-mark--sb{background:#7bd3ff;}
.postflop-position-mark--bb{background:#ffd15b;}
.postflop-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
.postflop-card-group__label{font-size:12px;color:#9aa6c2;font-weight:800;margin-bottom:6px;}
.postflop-card-row{display:flex;flex-wrap:wrap;gap:6px;}
.postflop-card{width:42px;height:56px;border-radius:8px;background:#fff;display:flex;
  align-items:center;justify-content:center;font-weight:900;font-size:18px;
  box-shadow:0 3px 12px rgba(0,0,0,.22);}
.card--spade{color:#171b24}.card--heart{color:#d93030}.card--diamond{color:#246bd6}
.card--club{color:#15814b}
.postflop-textures{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
.postflop-texture{font-size:12px;font-weight:800;border-radius:999px;padding:5px 8px;
  background:rgba(123,211,255,.13);border:1px solid rgba(123,211,255,.35);
  color:#bfe9ff;}
.postflop-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.postflop-action{appearance:none;border:1px solid rgba(255,255,255,.18);
  border-radius:8px;background:#1b2333;color:#e8ecf7;font-size:13px;font-weight:800;
  padding:8px 12px;}
.postflop-action:disabled{opacity:.72;cursor:default;}
.postflop-action--chosen{outline:2px solid #e8ecf7;outline-offset:1px;}
.postflop-action--recommended{border-color:#2bd576;background:rgba(43,213,118,.16);}
.postflop-result{margin-top:12px;border-radius:8px;padding:10px 12px;font-size:13px;
  font-weight:700;line-height:1.45;}
.postflop-result__summary{margin:0 0 10px;overflow-wrap:anywhere;}
.postflop-practical{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.postflop-practical__block{border:1px solid rgba(255,255,255,.12);border-radius:8px;
  background:rgba(255,255,255,.04);padding:8px 10px;min-width:0;}
.postflop-practical__block--wide{grid-column:1/-1;}
.postflop-practical__title{font-size:11px;letter-spacing:0;text-transform:uppercase;
  color:#e8ecf7;margin-bottom:5px;}
.postflop-practical__list{margin:0;padding-left:17px;color:#dce5f8;overflow-wrap:anywhere;}
.postflop-practical__text{margin:0;color:#dce5f8;overflow-wrap:anywhere;}
.postflop-result--correct{background:rgba(43,213,118,.13);border:1px solid rgba(43,213,118,.45);
  color:#9ff0bd;}
.postflop-result--wrong{background:rgba(226,59,59,.13);border:1px solid rgba(226,59,59,.45);
  color:#ffb4b4;}
@media (max-width:640px){
  .postflop-controls{align-items:stretch;}
  .postflop-field,.postflop-generate{width:100%;}
  .postflop-street,.postflop-seed{width:100%;}
  .postflop-question-bar{align-items:stretch;flex-direction:column;}
  .postflop-question-actions{display:grid;grid-template-columns:1fr 1fr;}
  .postflop-table{aspect-ratio:auto;min-height:520px;max-width:360px;}
  .postflop-table__felt{inset:12% 3%;border-radius:44%;}
  .postflop-table__center{min-width:190px;}
  .postflop-seat{width:104px;min-height:66px;padding:6px;}
  .postflop-seat__cards .postflop-card{width:30px;height:40px;font-size:14px;}
  .postflop-table__board .postflop-card{width:36px;height:48px;font-size:16px;}
  .postflop-cards{grid-template-columns:1fr;}
  .postflop-practical{grid-template-columns:1fr;}
}
`;
  return style;
}
