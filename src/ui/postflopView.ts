import {
  generatePostflopSpot,
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
  type PostflopLineActionPlan,
} from "../core/postflopLineSimulator";
import {
  postflopSpotToTrainingSpot,
  type PostflopActionNode,
  type PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import { createDefaultPostflopStrategyResolver } from "../data/ranges/postflopStrategyRegistry";
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
import { CS } from "./cs";

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
  paired: "Párovaný",
  monotone: "Monotónní",
  "two-tone": "Dvoubarevný",
  rainbow: "Rainbow",
  connected: "Propojený",
  dry: "Suchý",
  "ace-high": "A-high",
  "broadway-high": "Broadway-high",
  low: "Nízký",
  medium: "Střední",
  "straight-possible": "Možná straight",
  "flush-draw-heavy": "Flush draw",
  disconnected: "Nepropojený",
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
  wrap.appendChild(styles(doc));

  const controls = doc.createElement("div");
  controls.className = "postflop-controls";

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
  modeSelect.appendChild(singleOption);
  modeSelect.appendChild(lineOption);
  modeLabel.appendChild(modeText);
  modeLabel.appendChild(modeSelect);

  const generate = doc.createElement("button");
  generate.type = "button";
  generate.className = "postflop-generate";
  generate.textContent = CS.postflop.generate;

  controls.appendChild(streetLabel);
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

  const showNewSpot = (): void => {
    const seed = parseSeed(seedInput.value) ?? randomSeed();
    // Seed je jednorázový vstup pro reprodukci konkrétní situace. Po použití
    // jej vyčistíme, aby další generování nebo nový spot nevytvořily znovu
    // tutéž situaci, ale sáhl po novém náhodném seedu.
    seedInput.value = "";
    try {
      if (modeSelect.value === "line") {
        const line = generatePostflopLine({
          seed,
          potType: options.initialPotType,
          actionNode: options.initialActionNode,
          potBB: options.initialPotBB,
          effectiveStackBB: options.initialEffectiveStackBB,
          positionContext: options.initialPositionContext ?? undefined,
          strategyResolver: options.strategyResolver ?? POSTFLOP_STRATEGY_RESOLVER,
          allowFallback: options.allowFallback,
        });
        controls.hidden = true;
        output.hidden = false;
        renderLineSpot(output, line, 0, {}, Date.now(), options, {
          onNewSpot: showNewSpot,
          onChangeSituation: showSituationInput,
        });
        return;
      }

      const street = parseStreet(streetSelect.value);
      const spot = generatePostflopSpot({
        seed,
        street,
        potType: options.initialPotType,
        actionNode: options.initialActionNode,
        potBB: options.initialPotBB,
        effectiveStackBB: options.initialEffectiveStackBB,
        positionContext: options.initialPositionContext ?? undefined,
        strategyResolver: options.strategyResolver ?? POSTFLOP_STRATEGY_RESOLVER,
        allowFallback: options.allowFallback,
      });
      controls.hidden = true;
      output.hidden = false;
      renderSpot(output, spot, options, {
        onNewSpot: showNewSpot,
        onChangeSituation: showSituationInput,
      });
    } catch {
      controls.hidden = false;
      output.hidden = false;
      renderUnavailable(output);
    }
  };

  generate.addEventListener("click", showNewSpot);
  root.appendChild(wrap);
  if (options.autoGenerate === true) {
    showNewSpot();
  }
}

function renderUnavailable(root: HTMLElement): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";
  const notice = doc.createElement("div");
  notice.className = "postflop-unavailable";
  notice.setAttribute("role", "alert");
  notice.textContent = CS.postflop.unavailable;
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
  lineMeta?: {
    mode: "line";
    streetIndex: number;
    streetTotal: number;
  },
): void {
  const doc = root.ownerDocument ?? document;
  const trainingSpot = spot.trainingSpot ?? postflopSpotToTrainingSpot(spot);
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
    `bank ${spot.potBB} BB - ` +
    `efektivní stack ${spot.effectiveStackBB} BB - SPR ${trainingSpot.spr} - ` +
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

  const questionStartedAt = nowMs();
  const actions = doc.createElement("div");
  actions.className = "postflop-actions";
  for (const action of spot.actions) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "postflop-action";
    btn.dataset.action = action;
    btn.textContent = actionLabel(action);
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
  pot.textContent = `Bank ${spot.potBB} BB`;
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
      const betBB = roundedBetBB(spot.potBB * 0.33);
      return {
        ariaLabel: CS.postflop.sizing.recommendedSmall(betBB),
        betBB,
        chips: 2,
        kind: "small",
        label: CS.postflop.sizing.small(betBB),
        ratio: 0.33,
      };
    }
    case "BET_BIG": {
      const betBB = roundedBetBB(spot.potBB * 0.75);
      return {
        ariaLabel: CS.postflop.sizing.recommendedBig(betBB),
        betBB,
        chips: 4,
        kind: "big",
        label: CS.postflop.sizing.big(betBB),
        ratio: 0.75,
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
  const seat = doc.createElement("div");
  seat.className = [
    "postflop-seat",
    isHero ? "postflop-seat--hero" : "",
    isVillain ? "postflop-seat--villain" : "",
    active ? "postflop-seat--active" : "postflop-seat--folded",
    actionRole ? `postflop-seat--${actionRole}` : "",
    positionRole ? `postflop-seat--${positionRole.toLowerCase()}` : "",
  ].filter(Boolean).join(" ");
  seat.dataset.position = position;
  seat.dataset.actionRole = actionRole ?? "none";
  seat.dataset.positionRole = positionRole ?? "none";

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

  const stackWrap = doc.createElement("div");
  stackWrap.className = "postflop-seat__stack-wrap";
  const stack = doc.createElement("div");
  stack.className = "postflop-seat__stack";
  stack.textContent = `${spot.effectiveStackBB} BB`;
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
  result.hidden = false;
  result.className = `postflop-result ${correct ? "postflop-result--correct" : "postflop-result--wrong"}`;
  renderPracticalExplanation(result, spot, correct, chosen);
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
      chosenByStreet[street.street] === postflopSpotToTrainingSpot(street.spot).recommendedAction
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
    allowFallback: options.allowFallback,
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
  correct: boolean,
  chosen: PostflopAction,
): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const summary = doc.createElement("p");
  summary.className = "postflop-result__summary";
  summary.textContent =
    `${correct ? CS.postflop.correct : CS.postflop.incorrect} ${CS.postflop.recommended}: ` +
    `${actionLabel(spot.recommendedAction)}. ${spot.explanation.summary}`;
  root.appendChild(summary);

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
  lanes.appendChild(rangeLane(doc, "Value", "VALUE", spot.explanation.valueHands, "BET", spot, chosen));
  lanes.appendChild(rangeLane(doc, "Bluffs", "BLUFF", spot.explanation.bluffHands, "BET", spot, chosen));
  lanes.appendChild(rangeLane(doc, "Check", "CHECK", spot.explanation.checkHands, "CHECK", spot, chosen));
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
  insight.dataset.heroLaneLabel = flopzillaLaneLabel(heroLane);
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
    : `${heroHand} je na tomto flopu kategorie ${heroCategoryLabel} a obvykle patří do části ` +
      `${flopzillaLaneLabel(heroLane).toLowerCase()}. Porovnejte ji s value, bluff a check částí range.`;
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
  const choiceText = mix?.some((item) => item.action === chosen)
    ? "Vaše akce je součástí mixu tohoto bucketu."
    : chosen === bucket.action
      ? "Vaše akce odpovídá primární akci bucketu."
      : `Vaše akce je mimo primární ${actionLabel(bucket.action).toLowerCase()} line tohoto bucketu.`;
  const featureText = bucket.features.length > 0
    ? ` Hlavní vlastnosti: ${bucket.features.join(", ")}.`
    : "";
  return `${heroHand} je kategorie ${heroCategoryLabel} v range bucketu ${bucket.label}. ` +
    `Část bucketu: ${bucket.lane.toLowerCase()}. Primární akce: ${actionLabel(bucket.action)}. ` +
    `${actionMixText(bucket)} ${choiceText}${featureText}`;
}

function actionMixText(bucket: PostflopHeroRangeBucket): string {
  const mix = bucket.actionMix;
  if (!mix || mix.length === 0) return "Není připojen explicitní mixed-action poměr.";
  const exact = mix.every((item) => item.visibility === "EXACT");
  const items = mix.map((item) => (
    exact ? `${actionLabel(item.action)} ${formatPct(item.frequencyPct)}` : actionLabel(item.action)
  ));
  return exact
    ? `Mix akcí: ${items.join(" / ")}.`
    : `Mix akcí: ${items.join(" / ")}. Přesné frekvence jsou pro tento bucket skryté.`;
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
      return "Range malého c-betu kombinuje value s přirozenými bluffy; check range si ponechává slabší showdown a trapy.";
    case "BET_BIG":
      return "Range velkého betu je polarizovanější: silná value a nejlepší draw nebo blockery.";
    case "CALL":
      return "Call range pokračuje s handami, které mají dost equity, blockerů nebo showdown value.";
    case "RAISE":
      return "Raise range je polarizovaná: silná value a bluffy s blockery vytvářejí maximální tlak.";
    case "FOLD":
      return "Fold range zahazuje handy bez dostatečné equity, blockerů nebo pot odds.";
    case "CHECK":
      return "Check chrání realizaci equity: slabší showdown, pot-control a handy pro check-call nebo check-back plán.";
  }
}

function modelItems(spot: PostflopTrainingSpot): readonly string[] {
  const source = spot.explanation.source;
  if (source.kind === "STRATEGY_PACK") {
    return [
      isPublicHeuristicStrategySource(source) ? "Heuristický model" : "Produkční model",
      `Spolehlivost: ${confidenceLabel(source.confidence)}`,
      `Shoda textury: ${source.matchedTextures.map(textureLabel).join(", ")}`,
      `Rozsah SPR: ${source.sprMin}-${source.sprMax}`,
      ...source.assumptions.map(
        (assumption, index) => `Předpoklad ${index + 1}: ${userFacingAssumption(assumption)}`,
      ),
    ];
  }
  return ["Základní heuristika"];
}

function isPublicHeuristicStrategySource(
  source: Extract<PostflopTrainingSpot["explanation"]["source"], { kind: "STRATEGY_PACK" }>,
): boolean {
  return source.assumptions.some((assumption) => /^Public heuristic /i.test(assumption));
}

function userFacingAssumption(assumption: string): string {
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
      return "nízká";
    case "MEDIUM":
      return "střední";
    case "HIGH":
      return "vysoká";
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
.postflop-view{font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;color:#e8ecf7;max-width:960px;
  margin:0 auto;}
.postflop-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;
  background:linear-gradient(180deg,rgba(20,28,43,.96),rgba(12,17,27,.98));
  border:1px solid rgba(148,163,184,.18);border-radius:12px;
  padding:14px 16px;margin-bottom:16px;box-shadow:0 18px 44px rgba(0,0,0,.2);}
.postflop-field{display:flex;flex-direction:column;gap:4px;font-size:12px;
  color:#9aa6c2;font-weight:700;}
.postflop-street,.postflop-seed,.postflop-mode{box-sizing:border-box;min-width:130px;border:1px solid
  rgba(148,163,184,.28);border-radius:9px;background:#172033;color:#e8ecf7;
  font-size:14px;padding:9px 11px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.postflop-generate{appearance:none;border:0;border-radius:9px;
  background:linear-gradient(180deg,#45e58c,#20bd65);color:#082817;
  font-weight:950;font-size:14px;padding:10px 16px;cursor:pointer;
  box-shadow:0 12px 24px rgba(43,213,118,.22),inset 0 1px 0 rgba(255,255,255,.35);}
.postflop-generate:hover{filter:brightness(1.04);}
.postflop-output{background:linear-gradient(180deg,rgba(15,21,32,.98),rgba(8,13,22,.98));
  border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:16px;
  box-shadow:0 20px 60px rgba(0,0,0,.24);}
.postflop-question-bar{display:flex;align-items:center;justify-content:space-between;
  gap:10px;margin-bottom:12px;}
.postflop-question-title{font-size:14px;font-weight:900;color:#e8ecf7;}
.postflop-question-actions{display:flex;flex-wrap:wrap;gap:8px;}
.postflop-new-spot,.postflop-change-situation{appearance:none;border:1px solid
  rgba(148,163,184,.28);border-radius:9px;background:linear-gradient(180deg,#202a3e,#151d2d);
  color:#e8ecf7;font-size:12px;font-weight:900;padding:8px 12px;cursor:pointer;
  box-shadow:0 8px 18px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.06);}
.postflop-new-spot:hover,.postflop-change-situation:hover{border-color:#2bd576;}
.postflop-meta{font-size:13px;color:#9aa6c2;font-weight:700;margin-bottom:12px;
  overflow-wrap:anywhere;}
.postflop-table{position:relative;width:100%;max-width:900px;aspect-ratio:16/9;
  margin:10px auto 14px;min-height:390px;}
.postflop-table__felt{position:absolute;inset:9% 6%;border-radius:50%/48%;
  background:
    radial-gradient(ellipse at 50% 38%,rgba(61,220,132,.28),rgba(61,220,132,0) 42%),
    radial-gradient(ellipse at center,#197c4c 0%,#12633d 60%,#092f24 100%);
  box-shadow:inset 0 0 0 10px rgba(8,37,28,.92),inset 0 0 0 18px rgba(255,255,255,.035),
    inset 0 0 56px rgba(0,0,0,.46),0 24px 54px rgba(0,0,0,.32);}
.postflop-table__rail{position:absolute;inset:5% 2.5%;border-radius:50%/48%;z-index:1;
  background:linear-gradient(145deg,rgba(66,74,92,.72),rgba(10,15,24,.92));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),inset 0 0 28px rgba(0,0,0,.55),
    0 14px 34px rgba(0,0,0,.26);}
.postflop-table__center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  z-index:3;display:grid;gap:8px;justify-items:center;text-align:center;min-width:250px;
  padding:12px 14px;border-radius:16px;background:rgba(7,13,22,.28);
  border:1px solid rgba(255,255,255,.06);}
.postflop-table__center-label{font-size:11px;font-weight:950;color:#bfe9ff;text-transform:uppercase;}
.postflop-table__pot{font-size:16px;font-weight:950;color:#f2f7ff;
  text-shadow:0 1px 8px rgba(0,0,0,.45);}
.postflop-table__bet-geometry{width:min(210px,72vw);display:grid;gap:5px;justify-items:center;
  padding:7px 9px;border-radius:12px;background:rgba(15,21,32,.68);
  border:1px solid rgba(255,255,255,.1);}
.postflop-table__bet-track{position:relative;width:100%;height:7px;border-radius:999px;
  overflow:hidden;background:rgba(255,255,255,.13);}
.postflop-table__bet-fill{display:block;width:var(--bet-size);height:100%;border-radius:inherit;
  background:linear-gradient(90deg,#2bd576,#ffd15b);}
.postflop-table__bet-chips{display:flex;align-items:flex-end;justify-content:center;gap:3px;
  min-height:14px;}
.postflop-table__bet-chip{width:16px;height:7px;border-radius:999px;background:linear-gradient(180deg,#ffd15b,#da8b25);
  border:1px solid rgba(255,255,255,.42);box-shadow:0 4px 8px rgba(0,0,0,.22);}
.postflop-table__bet-chip:nth-child(2n){height:11px;background:linear-gradient(180deg,#7bd3ff,#2f87d8);}
.postflop-table__bet-chip:nth-child(3n){height:14px;background:linear-gradient(180deg,#f8fbff,#9fb2d5);}
.postflop-table__bet-label{font-size:11px;font-weight:950;color:#e8ecf7;text-transform:uppercase;}
.postflop-table__bet-geometry--check{opacity:.76;}
.postflop-table__bet-geometry--check .postflop-table__bet-fill{background:transparent;}
.postflop-table__bet-geometry--big{border-color:rgba(255,209,91,.32);
  box-shadow:0 0 0 1px rgba(255,209,91,.12),0 10px 24px rgba(255,209,91,.1);}
.postflop-table__bet-geometry--small{border-color:rgba(43,213,118,.28);}
.postflop-table__chip-stack{display:flex;align-items:flex-end;justify-content:center;gap:4px;
  height:22px;margin-top:-2px;}
.postflop-table__chip-stack span{display:block;width:24px;height:10px;border-radius:999px;
  background:linear-gradient(180deg,#f8fbff,#9fb2d5 48%,#53617a);
  border:1px solid rgba(255,255,255,.45);box-shadow:0 5px 10px rgba(0,0,0,.24),
    inset 0 1px 0 rgba(255,255,255,.8);}
.postflop-table__chip-stack span:nth-child(2){height:16px;
  background:linear-gradient(180deg,#7bd3ff,#2f87d8 52%,#174170);}
.postflop-table__chip-stack span:nth-child(3){height:13px;
  background:linear-gradient(180deg,#ffd15b,#da8b25 52%,#7d4117);}
.postflop-table__board{display:flex;gap:7px;justify-content:center;align-items:center;}
.postflop-table__center-meta{font-size:12px;font-weight:800;color:#b9c6df;
  background:rgba(15,21,32,.65);border:1px solid rgba(255,255,255,.12);
  border-radius:999px;padding:4px 9px;}
.postflop-seat{position:absolute;left:var(--seat-left);top:var(--seat-top);
  transform:translate(-50%,-50%);z-index:4;width:134px;
  min-height:88px;box-sizing:border-box;padding:8px 9px;border-radius:12px;
  background:linear-gradient(180deg,rgba(22,31,47,.98),rgba(10,16,27,.98));
  border:1px solid rgba(148,163,184,.22);box-shadow:0 14px 28px rgba(0,0,0,.32),
    inset 0 1px 0 rgba(255,255,255,.06);text-align:center;overflow:hidden;}
.postflop-seat--hero{border-color:#2bd576;background:linear-gradient(180deg,rgba(31,111,74,.98),rgba(11,55,38,.98));
  box-shadow:0 16px 34px rgba(43,213,118,.16),0 12px 28px rgba(0,0,0,.32);}
.postflop-seat--villain{border-color:#7bd3ff;background:linear-gradient(180deg,rgba(25,56,82,.98),rgba(12,31,50,.98));}
.postflop-seat--aggressor{outline:1px solid rgba(255,209,91,.42);outline-offset:2px;}
.postflop-seat--caller{outline:1px solid rgba(123,211,255,.38);outline-offset:2px;}
.postflop-seat--folded{opacity:.38;filter:saturate(.45);}
.postflop-seat__header{display:flex;align-items:center;justify-content:center;gap:5px;}
.postflop-seat__pos{font-size:13px;font-weight:950;color:#f8fbff;}
.postflop-seat__badge{display:inline-flex;align-items:center;justify-content:center;
  min-height:17px;margin-top:4px;border-radius:999px;padding:1px 7px;font-size:9px;
  font-weight:950;text-transform:uppercase;color:#081421;background:rgba(255,255,255,.84);}
.postflop-seat__role{display:flex;justify-content:center;flex-wrap:wrap;gap:4px;margin-top:4px;}
.postflop-seat__role-chip{display:inline-flex;align-items:center;justify-content:center;
  min-height:16px;border-radius:999px;padding:1px 6px;font-size:9px;font-weight:950;
  text-transform:uppercase;letter-spacing:0;border:1px solid rgba(255,255,255,.16);}
.postflop-seat__role-chip--aggressor{background:rgba(255,209,91,.18);color:#ffe39a;
  border-color:rgba(255,209,91,.34);}
.postflop-seat__role-chip--caller{background:rgba(123,211,255,.16);color:#bfe9ff;
  border-color:rgba(123,211,255,.34);}
.postflop-seat__role-chip--ip{background:rgba(43,213,118,.16);color:#9ff0bd;
  border-color:rgba(43,213,118,.34);}
.postflop-seat__role-chip--oop{background:rgba(155,108,240,.16);color:#d7c7ff;
  border-color:rgba(155,108,240,.34);}
.postflop-seat__stack-wrap{display:grid;gap:3px;margin-top:4px;}
.postflop-seat__stack{font-size:11px;font-weight:900;color:#d8e5f8;}
.postflop-seat__stack-bar{height:4px;border-radius:999px;background:rgba(255,255,255,.13);overflow:hidden;}
.postflop-seat__stack-bar span{display:block;height:100%;border-radius:inherit;
  background:linear-gradient(90deg,#7bd3ff,#2bd576);}
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
.postflop-card{width:42px;height:56px;border-radius:9px;background:linear-gradient(180deg,#fff,#eef2f8);display:flex;
  align-items:center;justify-content:center;font-weight:900;font-size:18px;
  box-shadow:0 8px 18px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.7);
  border:1px solid rgba(0,0,0,.06);}
.card--spade{color:#171b24}.card--heart{color:#d93030}.card--diamond{color:#246bd6}
.card--club{color:#15814b}
.postflop-textures{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
.postflop-texture{font-size:12px;font-weight:800;border-radius:999px;padding:5px 8px;
  background:rgba(123,211,255,.13);border:1px solid rgba(123,211,255,.35);
  color:#bfe9ff;}
.postflop-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.postflop-action{appearance:none;border:1px solid rgba(148,163,184,.26);
  border-radius:10px;background:linear-gradient(180deg,#202a3f,#141d2f);
  color:#e8ecf7;font-size:14px;font-weight:950;padding:10px 16px;min-width:96px;
  box-shadow:0 10px 20px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.06);}
.postflop-action:hover{border-color:#7bd3ff;transform:translateY(-1px);}
.postflop-action:disabled{opacity:.72;cursor:default;}
.postflop-action--chosen{outline:2px solid #e8ecf7;outline-offset:2px;}
.postflop-action--recommended{border-color:#2bd576;background:linear-gradient(180deg,rgba(43,213,118,.28),rgba(43,213,118,.14));}
.postflop-result{margin-top:12px;border-radius:12px;padding:12px 14px;font-size:13px;
  font-weight:700;line-height:1.45;}
.postflop-result__summary{margin:0 0 10px;overflow-wrap:anywhere;}
.postflop-line-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;
  border-top:1px solid rgba(255,255,255,.12);padding-top:10px;}
.postflop-line-next{appearance:none;border:1px solid rgba(43,213,118,.48);border-radius:10px;
  background:linear-gradient(180deg,#2bd576,#20bf69);color:#06120b;font-size:13px;
  font-weight:950;padding:9px 13px;cursor:pointer;box-shadow:0 10px 20px rgba(43,213,118,.16),
  inset 0 1px 0 rgba(255,255,255,.22);}
.postflop-line-next:hover{filter:brightness(1.04);}
.postflop-line-complete{font-size:13px;font-weight:950;color:#e8ecf7;}
.postflop-practical{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.postflop-practical__block{border:1px solid rgba(255,255,255,.12);border-radius:8px;
  background:rgba(255,255,255,.04);padding:8px 10px;min-width:0;}
.postflop-practical__block--wide{grid-column:1/-1;}
.postflop-practical__title{font-size:11px;letter-spacing:0;text-transform:uppercase;
  color:#e8ecf7;margin-bottom:5px;}
.postflop-practical__list{margin:0;padding-left:17px;color:#dce5f8;overflow-wrap:anywhere;}
.postflop-practical__text{margin:0;color:#dce5f8;overflow-wrap:anywhere;}
.postflop-range-summary{margin-top:10px;border:1px solid rgba(123,211,255,.22);
  border-radius:8px;background:rgba(10,22,32,.34);padding:10px;min-width:0;}
.postflop-range-summary__header{display:flex;align-items:flex-start;justify-content:space-between;
  gap:10px;margin-bottom:6px;}
.postflop-range-summary__title{font-size:12px;font-weight:900;text-transform:uppercase;
  color:#e8ecf7;}
.postflop-range-summary__meta{font-size:12px;color:#b9cff4;text-align:right;overflow-wrap:anywhere;}
.postflop-range-summary__note{margin:0 0 8px;color:#dce5f8;overflow-wrap:anywhere;}
.postflop-range-summary__hero-bucket{display:flex;align-items:center;gap:8px;
  border:1px solid rgba(123,211,255,.24);border-radius:8px;
  background:linear-gradient(180deg,rgba(123,211,255,.1),rgba(43,213,118,.06));
  color:#dce5f8;padding:8px 9px;margin-bottom:8px;overflow-wrap:anywhere;}
.postflop-range-summary__hero-bucket-label{flex:0 0 auto;border-radius:999px;
  background:rgba(43,213,118,.16);border:1px solid rgba(43,213,118,.38);
  color:#9ff0bd;font-size:10px;font-weight:950;text-transform:uppercase;padding:4px 7px;}
.postflop-range-summary__hero-bucket-text{font-size:12px;font-weight:850;color:#e8ecf7;}
.postflop-range-summary__lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.postflop-range-summary__lane{border:1px solid rgba(255,255,255,.12);border-radius:8px;
  background:rgba(255,255,255,.035);padding:8px;min-width:0;}
.postflop-range-summary__lane--recommended{border-color:rgba(43,213,118,.65);
  background:rgba(43,213,118,.1);}
.postflop-range-summary__lane--chosen{box-shadow:inset 0 0 0 1px rgba(232,236,247,.42);}
.postflop-range-summary__lane--active{border-color:rgba(123,211,255,.75);
  background:rgba(123,211,255,.12);}
.postflop-range-summary__lane-title{font-size:11px;font-weight:900;text-transform:uppercase;
  color:#e8ecf7;margin-bottom:6px;}
.postflop-range-summary__chips{display:flex;flex-wrap:wrap;gap:5px;}
.postflop-range-summary__chip{border:1px solid rgba(123,211,255,.22);border-radius:999px;
  background:rgba(123,211,255,.08);color:#dce5f8;font-size:12px;font-weight:800;
  line-height:1.2;padding:4px 7px;overflow-wrap:anywhere;}
.postflop-range-summary__matrix{margin-top:10px;}
.postflop-flopzilla{border:1px solid rgba(123,211,255,.18);border-radius:12px;
  background:linear-gradient(180deg,rgba(12,20,32,.94),rgba(8,13,22,.96));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 18px 40px rgba(0,0,0,.22);
  padding:12px;overflow-x:auto;overscroll-behavior-x:contain;
  scrollbar-color:#7bd3ff rgba(255,255,255,.08);}
.postflop-flopzilla__header{min-width:640px;display:flex;align-items:flex-start;
  justify-content:space-between;gap:12px;margin-bottom:8px;}
.postflop-flopzilla__title{font-size:12px;font-weight:950;text-transform:uppercase;
  color:#f4f7ff;}
.postflop-flopzilla__meta{font-size:11px;font-weight:850;color:#b9cff4;text-align:right;}
.postflop-flopzilla__hint{min-width:640px;margin:-2px 0 8px;color:#83a2d1;
  font-size:11px;font-weight:800;}
.postflop-flopzilla__matrix{display:grid;gap:2px;min-width:640px;
  padding:5px;border-radius:10px;background:rgba(2,7,13,.42);
  border:1px solid rgba(255,255,255,.08);}
.postflop-flopzilla__header-cell{min-height:22px;display:flex;align-items:center;
  justify-content:center;color:#aac0e5;font-size:11px;font-weight:950;}
.postflop-flopzilla__header-cell--corner,
.postflop-flopzilla__header-cell--row{position:sticky;left:0;z-index:2;
  background:rgba(11,18,29,.96);box-shadow:2px 0 0 rgba(255,255,255,.06);}
.postflop-flopzilla__header-cell--column{position:sticky;top:0;z-index:1;
  background:rgba(11,18,29,.96);}
.postflop-flopzilla__header-cell--corner{top:0;z-index:3;}
.postflop-flopzilla__cell{min-height:28px;border-radius:5px;display:flex;align-items:center;
  justify-content:center;color:#fff;font-size:10px;font-weight:950;text-shadow:0 1px 1px rgba(0,0,0,.55);
  border:1px solid rgba(255,255,255,.16);box-sizing:border-box;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -10px 18px rgba(0,0,0,.16);
  cursor:pointer;}
.postflop-flopzilla__cell:focus-visible{outline:2px solid #7bd3ff;outline-offset:1px;}
.postflop-flopzilla__cell--production-lane{box-shadow:inset 0 0 0 2px rgba(232,236,247,.58),
  inset 0 -10px 18px rgba(0,0,0,.16);}
.postflop-flopzilla__cell--hero{outline:3px solid #fff;outline-offset:-2px;
  box-shadow:0 0 0 2px rgba(43,213,118,.7),0 0 18px rgba(43,213,118,.42);}
.postflop-flopzilla__cell--selected{filter:brightness(1.16);
  box-shadow:0 0 0 2px rgba(123,211,255,.62),0 0 18px rgba(123,211,255,.24);}
.postflop-flopzilla__cell--muted{opacity:.28;filter:saturate(.55) contrast(.82);}
.postflop-flopzilla__legend{min-width:640px;display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}
.postflop-flopzilla__legend-item{display:inline-flex;align-items:center;gap:5px;
  font-size:11px;font-weight:850;color:#dce5f8;border:1px solid rgba(255,255,255,.1);
  border-radius:999px;background:rgba(255,255,255,.045);padding:5px 7px;cursor:pointer;
  transition:border-color .15s ease,box-shadow .15s ease,background .15s ease;}
.postflop-flopzilla__legend-item:focus-visible{outline:2px solid #7bd3ff;outline-offset:2px;}
.postflop-flopzilla__legend-item--active{border-color:rgba(43,213,118,.75);
  background:rgba(43,213,118,.14);box-shadow:0 0 0 1px rgba(43,213,118,.24),
    0 8px 20px rgba(43,213,118,.12);}
.postflop-flopzilla__legend-swatch{width:13px;height:13px;border-radius:3px;
  border:1px solid rgba(255,255,255,.24);}
.postflop-flopzilla__legend-count{color:#9fb2d5;font-size:10px;font-weight:900;}
.postflop-flopzilla__detail{min-width:640px;margin-top:10px;border:1px solid rgba(123,211,255,.24);
  border-radius:10px;background:linear-gradient(180deg,rgba(123,211,255,.08),rgba(43,213,118,.05));
  padding:10px 12px;color:#e8ecf7;font-size:12px;font-weight:850;line-height:1.4;
  overflow-wrap:anywhere;}
.postflop-flopzilla__detail-title{font-size:13px;font-weight:950;color:#f8fbff;margin-bottom:6px;}
.postflop-flopzilla__detail-grid{display:grid;gap:6px;}
.postflop-flopzilla__detail-line{display:grid;grid-template-columns:96px minmax(0,1fr);
  gap:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:6px;}
.postflop-flopzilla__detail-label{color:#9fb2d5;text-transform:uppercase;font-size:10px;
  font-weight:950;}
.postflop-flopzilla__detail-value{color:#f4f7ff;}
.postflop-result--correct{background:rgba(43,213,118,.13);border:1px solid rgba(43,213,118,.45);
  color:#9ff0bd;}
.postflop-result--wrong{background:rgba(226,59,59,.13);border:1px solid rgba(226,59,59,.45);
  color:#ffb4b4;}
@media (max-width:640px){
  .postflop-view{max-width:100%;}
  .postflop-controls{align-items:stretch;}
  .postflop-field,.postflop-generate{width:100%;}
  .postflop-street,.postflop-seed,.postflop-mode{width:100%;}
  .postflop-question-bar{align-items:stretch;flex-direction:column;}
  .postflop-question-actions{display:grid;grid-template-columns:1fr 1fr;}
  .postflop-table{aspect-ratio:auto;min-height:560px;max-width:390px;}
  .postflop-table__rail{inset:8% 0;border-radius:44%;}
  .postflop-table__felt{inset:12% 3%;border-radius:44%;}
  .postflop-table__center{min-width:194px;padding:10px;top:49%;}
  .postflop-table__chip-stack{height:18px;}
  .postflop-table__chip-stack span{width:20px;height:8px;}
  .postflop-table__chip-stack span:nth-child(2){height:13px;}
  .postflop-table__chip-stack span:nth-child(3){height:11px;}
  .postflop-seat{left:var(--seat-mobile-left);top:var(--seat-mobile-top);
    width:108px;min-height:82px;padding:6px;}
  .postflop-seat__badge{font-size:8px;}
  .postflop-seat__cards .postflop-card{width:30px;height:40px;font-size:14px;}
  .postflop-table__board .postflop-card{width:36px;height:48px;font-size:16px;}
  .postflop-actions{display:grid;grid-template-columns:1fr;gap:10px;}
  .postflop-action{width:100%;min-height:44px;}
  .postflop-line-actions{display:grid;grid-template-columns:1fr;}
  .postflop-line-next{width:100%;min-height:42px;}
  .postflop-cards{grid-template-columns:1fr;}
  .postflop-practical{grid-template-columns:1fr;}
  .postflop-range-summary__header{flex-direction:column;}
  .postflop-range-summary__meta{text-align:left;}
  .postflop-range-summary__hero-bucket{align-items:flex-start;flex-direction:column;}
  .postflop-range-summary__lanes{grid-template-columns:1fr;}
  .postflop-flopzilla{padding:9px;margin-left:-2px;margin-right:-2px;border-radius:10px;}
  .postflop-flopzilla__header,.postflop-flopzilla__hint,
  .postflop-flopzilla__matrix,.postflop-flopzilla__legend,.postflop-flopzilla__detail{min-width:560px;}
  .postflop-flopzilla__header{gap:8px;}
  .postflop-flopzilla__meta{font-size:10px;}
  .postflop-flopzilla__cell{min-height:25px;font-size:9px;}
  .postflop-flopzilla__detail-line{grid-template-columns:1fr;}
}
@media (prefers-reduced-motion:reduce){
  .postflop-view *,.postflop-view *::before,.postflop-view *::after{
    transition-duration:.01ms!important;animation-duration:.01ms!important;
    animation-iteration-count:1!important;scroll-behavior:auto!important;}
  .postflop-action:hover{transform:none;}
  .postflop-flopzilla__legend-item{transition:none;}
}
`;
  return style;
}
