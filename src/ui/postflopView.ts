import {
  generatePostflopSpot,
  type BoardTexture,
  type PostflopAction,
  type PostflopSpot,
  type PostflopStreet,
} from "../core/postflopGenerator";
import {
  postflopSpotToTrainingSpot,
  type PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import { flopSingleRaisedPrototypeStrategyPack } from "../data/ranges/postflopStrategyPack";
import { createPostflopStrategyResolver } from "../data/ranges/postflopStrategyResolver";
import type { Card, Suit } from "../core/types";

const SEED_MAX = 0xffffffff;
const POSTFLOP_STRATEGY_RESOLVER = createPostflopStrategyResolver(
  flopSingleRaisedPrototypeStrategyPack,
);

const STREET_LABEL: Record<PostflopStreet, string> = {
  FLOP: "Flop",
  TURN: "Turn",
  RIVER: "River",
};

const TEXTURE_LABEL: Record<BoardTexture, string> = {
  paired: "Sp\u00e1rovan\u00fd",
  monotone: "Monotone",
  "two-tone": "Two-tone",
  rainbow: "Rainbow",
  connected: "Propojen\u00fd",
  dry: "Such\u00fd",
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

export function renderPostflopView(root: HTMLElement): void {
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
  streetSelect.value = "FLOP";
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
  wrap.appendChild(output);

  const showNewSpot = (): void => {
    const seed = parseSeed(seedInput.value) ?? randomSeed();
    seedInput.value = String(seed);
    const street = parseStreet(streetSelect.value);
    const spot = generatePostflopSpot({
      seed,
      street,
      strategyResolver: POSTFLOP_STRATEGY_RESOLVER,
    });
    renderSpot(output, spot);
  };

  generate.addEventListener("click", showNewSpot);
  root.appendChild(wrap);
  showNewSpot();
}

function renderSpot(root: HTMLElement, spot: PostflopSpot): void {
  const doc = root.ownerDocument ?? document;
  const trainingSpot = spot.trainingSpot ?? postflopSpotToTrainingSpot(spot);
  root.innerHTML = "";

  const meta = doc.createElement("div");
  meta.className = "postflop-meta";
  meta.dataset.seed = String(spot.seed);
  meta.dataset.street = spot.street;
  meta.dataset.actionNode = trainingSpot.actionNode;
  meta.textContent =
    `${STREET_LABEL[spot.street]} - seed ${spot.seed} - pot ${spot.potBB} BB - ` +
    `eff. stack ${spot.effectiveStackBB} BB - SPR ${trainingSpot.spr}`;
  root.appendChild(meta);

  const cards = doc.createElement("div");
  cards.className = "postflop-cards";
  cards.appendChild(cardGroup(doc, "Hero", spot.heroCards));
  cards.appendChild(cardGroup(doc, "Board", spot.board));
  root.appendChild(cards);

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
    btn.addEventListener("click", () => showResult(root, trainingSpot, action));
    actions.appendChild(btn);
  }
  root.appendChild(actions);

  const result = doc.createElement("div");
  result.className = "postflop-result";
  result.hidden = true;
  result.setAttribute("role", "status");
  root.appendChild(result);
}

function cardGroup(doc: Document, title: string, cards: readonly Card[]): HTMLElement {
  const group = doc.createElement("div");
  group.className = "postflop-card-group";
  const label = doc.createElement("div");
  label.className = "postflop-card-group__label";
  label.textContent = title;
  group.appendChild(label);
  const row = doc.createElement("div");
  row.className = "postflop-card-row";
  for (const card of cards) row.appendChild(cardElement(doc, card));
  group.appendChild(row);
  return group;
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
  grid.appendChild(explanationBlock(doc, "Zdroj", sourceItems(spot)));

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

function sourceItems(spot: PostflopTrainingSpot): readonly string[] {
  const source = spot.explanation.source;
  if (source.kind === "STRATEGY_PACK") {
    return [
      `Pack: ${source.packId}`,
      `Rule: ${source.ruleId}`,
      `Confidence: ${source.confidence}`,
    ];
  }
  return [`Fallback: ${source.ruleId}`];
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
.postflop-meta{font-size:13px;color:#9aa6c2;font-weight:700;margin-bottom:12px;}
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
.postflop-result__summary{margin:0 0 10px;}
.postflop-practical{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.postflop-practical__block{border:1px solid rgba(255,255,255,.12);border-radius:8px;
  background:rgba(255,255,255,.04);padding:8px 10px;}
.postflop-practical__block--wide{grid-column:1/-1;}
.postflop-practical__title{font-size:11px;letter-spacing:0;text-transform:uppercase;
  color:#e8ecf7;margin-bottom:5px;}
.postflop-practical__list{margin:0;padding-left:17px;color:#dce5f8;}
.postflop-practical__text{margin:0;color:#dce5f8;}
.postflop-result--correct{background:rgba(43,213,118,.13);border:1px solid rgba(43,213,118,.45);
  color:#9ff0bd;}
.postflop-result--wrong{background:rgba(226,59,59,.13);border:1px solid rgba(226,59,59,.45);
  color:#ffb4b4;}
@media (max-width:640px){
  .postflop-controls{align-items:stretch;}
  .postflop-field,.postflop-generate{width:100%;}
  .postflop-street,.postflop-seed{width:100%;}
  .postflop-cards{grid-template-columns:1fr;}
  .postflop-practical{grid-template-columns:1fr;}
}
`;
  return style;
}
