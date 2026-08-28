import { GRID_SIZE, RANKS, handLabel } from "../core/poker";
import type { Card, HandLabel } from "../core/types";
import type { PostflopActionNode, PostflopTrainingSpot } from "../core/postflopTrainingSpot";
import type { PostflopAction } from "../core/postflopGenerator";
import {
  classifyFlopHand,
  flopzillaLaneForCategory,
  type FlopzillaCategory,
  type FlopzillaLane,
} from "../core/flopHandCategory";
import { localizedText } from "./cs";

// Classification lives in core so the range matrix and the solver-content
// importer label hands the same way.
export {
  classifyFlopHand,
  flopzillaLaneForCategory,
  type FlopzillaCategory,
  type FlopzillaLane,
};

interface CategoryDef {
  label: string;
  color: string;
}

/**
 * Colours taken from the owner's own range charts, sampled from the images.
 *
 * The charts read at a glance because they use two families and a neutral tail
 * rather than a thirteen-step rainbow: a salmon-red for the hands you commit
 * with, greens for the hands still carrying equity, and near-white for the ones
 * you give up. The previous palette ran red-orange-yellow-green-blue-purple-grey
 * in category order, so a top pair was a brighter green than an overpair was
 * yellow and nothing about the colour told you how strong the hand was.
 *
 * Three of these are the chart colours exactly - #D87878 openraise, #304830 and
 * #90A890 the jam tiers, #F0F0F0 fold - with the rest interpolated inside those
 * families so the ramp stays monotonic in strength.
 */
const CATEGORY_DEFS: Record<FlopzillaCategory, CategoryDef> = {
  // Made hands: the salmon-red family, darkening with strength.
  SET_PLUS: { label: "Set+", color: "#a63a32" },
  // Barva sedí mezi setem a postupkou: silnější než postupka, slabší než set+
  // (do kterého padá i full house a lepší).
  MADE_FLUSH: { label: "Barva", color: "#b2423a" },
  MADE_STRAIGHT: { label: "Made straight", color: "#be4a3e" },
  TWO_PAIR: { label: "Two pair", color: "#cf5f50" },
  OVERPAIR: { label: "Overpair", color: "#d87878" },
  TOP_PAIR: { label: "Top pair", color: "#e29a8e" },
  PAIR: { label: "Pair", color: "#ebb9af" },
  UNDERPAIR: { label: "Underpair", color: "#f0d2cb" },
  // Draws: the jam greens, kept a distinct hue so equity reads apart from made
  // strength rather than blending into the same ramp.
  FLUSH_DRAW: { label: "Flush draw", color: "#304830" },
  OESD: { label: "OESD", color: "#4e7050" },
  GUTSHOT: { label: "Gutshot", color: "#90a890" },
  BACKDOOR_DRAW: { label: "Backdoor draw", color: "#b8c9b6" },
  // Nothing: the charts' fold shades.
  OVERCARDS: { label: "Overcards", color: "#d6d6ce" },
  AIR: { label: "Air", color: "#f0f0f0" },
};

/**
 * Black or white label, whichever the background can carry.
 *
 * The cells used to be uniformly white-on-dark. Half this palette is light, and
 * keeping white text would have made the widest part of every range - the air and
 * the folds - unreadable.
 */
function readableTextColor(hex: string): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? "#12161f" : "#ffffff";
}

/**
 * Skupiny, podle kterých se matice barví: **co se s rukou dělá**, ne co to je.
 *
 * ## Proč se osa změnila
 *
 * Buňky měly barvu z `CATEGORY_DEFS`, tedy podle síly ruky. Důsledek nahlásil
 * majitel: „zobrazují typy kombinací, které nás nezajímají" a „chybí blafovací
 * range". Obojí je totéž - **blaf a stejně silná ruka, která se vzdává, měly
 * identickou barvu**, takže blafovací část range nešla v matici najít.
 * Změřeno 25. 8. 2026: 983 ze 7 306 tříd (13,5 %) hraje obsah agresivně,
 * přestože je taxonomie nemá za hodnotu - přesně ty byly neviditelné.
 *
 * Paleta se z vlastníkových chartů brala už dřív, ale jen barvy, ne osa. Ty
 * charty mají legendu **akcí**: „3 bet for value", „3b bluff", „call", fold -
 * a blaf v nich má vždy vlastní barvu. Tohle je totéž o ulici dál.
 *
 * ## Proč se hodnota dělí podle velikosti a blaf ne
 *
 * Velikost sázky je u hodnoty rozhodnutí, které hráč dělá; u blafu je to spíš
 * důsledek. Legenda by se zdvojnásobila, aniž by přibyla informace - přesná akce
 * zůstává v popisku buňky i v detailu po kliknutí.
 */
type MatrixGroup =
  | "VALUE_BIG"
  | "VALUE_SMALL"
  | "BLUFF"
  | "CALL"
  | "CHECK"
  | "FOLD"
  | "NONE";

interface GroupDef {
  label: string;
  color: string;
}

const GROUP_DEFS: Record<MatrixGroup, GroupDef> = {
  // Hodnota: sytá červená rodina z chartů, tmavší podle velikosti sázky.
  VALUE_BIG: { label: "Hodnota - velká sázka", color: "#a63a32" },
  VALUE_SMALL: { label: "Hodnota - malá sázka", color: "#d87878" },
  // Blaf: jantarová, tedy tatáž volba jako „3b bluff" na vlastníkových chartech.
  // Musí být čitelně jinde než hodnota, jinak se vrací původní vada.
  BLUFF: { label: "Blaf", color: "#e0a13c" },
  CALL: { label: "Dorovnání", color: "#4e7050" },
  CHECK: { label: "Check", color: "#90a890" },
  FOLD: { label: "Složení", color: "#f0f0f0" },
  // Ne bílá jako fold: „tuhle ruku bys složil" a „tuhle ruku tady vůbec nedržíš"
  // jsou dvě různá sdělení a splynout nesmí.
  NONE: { label: "Mimo řešenou range", color: "#e2e5ea" },
};

const GROUP_ORDER: readonly MatrixGroup[] = [
  "VALUE_BIG",
  "VALUE_SMALL",
  "BLUFF",
  "CALL",
  "CHECK",
  "FOLD",
  "NONE",
];

/**
 * Text skupiny pro popisek buňky, s akcí jen tam, kde něco přidá.
 *
 * U blafu je podstatné, **kterou** akcí se blafuje, a u hodnoty jak velká sázka
 * to je. U dorovnání, checku a složení je název skupiny už tou akcí.
 */
function cellGroupText(group: MatrixGroup, action: PostflopAction): string {
  const label = GROUP_DEFS[group].label;
  return group === "BLUFF" ? `${label} - ${MATRIX_ACTION_LABEL[action]}` : label;
}

function matrixGroup(cell: ProductionCell | undefined): MatrixGroup {
  if (cell === undefined) return "NONE";
  if (cell.lane === "BLUFF") return "BLUFF";
  switch (cell.action) {
    case "BET_BIG":
    case "RAISE":
      return "VALUE_BIG";
    case "BET_SMALL":
      return "VALUE_SMALL";
    case "CALL":
      return "CALL";
    case "FOLD":
      return "FOLD";
    case "CHECK":
    default:
      return "CHECK";
  }
}


/** Pořadí kategorií pro režim, ve kterém akci neznáme: od nejsilnější dolů. */
const CATEGORY_ORDER: readonly FlopzillaCategory[] = [
  "SET_PLUS",
  "MADE_STRAIGHT",
  "TWO_PAIR",
  "OVERPAIR",
  "TOP_PAIR",
  "PAIR",
  "UNDERPAIR",
  "FLUSH_DRAW",
  "OESD",
  "GUTSHOT",
  "BACKDOOR_DRAW",
  "OVERCARDS",
  "AIR",
];


export function renderPostflopRangeMatrix(
  spot: PostflopTrainingSpot,
  root: HTMLElement,
): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = doc.createElement("div");
  wrap.className = "postflop-flopzilla";
  wrap.dataset.board = spot.board.map(cardLabel).join("-");
  wrap.dataset.heroHand = postflopHandClassFromCards(spot.heroCards);

  const boardText = spot.board.map(cardLabel).join(" ");
  const heroHand = postflopHandClassFromCards(spot.heroCards);
  const heroCategory = classifyFlopHand(heroHand, spot.board);
  const heroCategoryLabel = flopzillaCategoryLabel(heroCategory);
  wrap.dataset.heroCategory = heroCategory;
  wrap.dataset.heroCategoryLabel = heroCategoryLabel;

  const header = doc.createElement("div");
  header.className = "postflop-flopzilla__header";

  const title = doc.createElement("div");
  title.className = "postflop-flopzilla__title";
  title.textContent = localizedText("Range matrix", "Matice range");
  header.appendChild(title);

  const meta = doc.createElement("div");
  meta.className = "postflop-flopzilla__meta";
  meta.textContent = `Board ${boardText} | Hero ${heroHand}: ${heroCategoryLabel}`;
  header.appendChild(meta);

  wrap.appendChild(header);

  const hint = doc.createElement("div");
  hint.className = "postflop-flopzilla__hint";
  hint.textContent = "Scroll horizontally on mobile";
  wrap.appendChild(hint);

  const matrix = doc.createElement("div");
  matrix.className = "postflop-flopzilla__matrix";
  matrix.setAttribute("role", "grid");
  matrix.setAttribute("aria-label", localizedText(
    `Range matrix for board ${boardText}`,
    `Matice range pro board ${boardText}`,
  ));
  matrix.style.gridTemplateColumns = `repeat(${GRID_SIZE + 1}, minmax(0, 1fr))`;
  matrix.appendChild(headerCell(doc, "", "corner"));
  const detail = detailPanel(doc);
  const productionByHand = productionLaneMap(spot);

  for (let j = 0; j < GRID_SIZE; j += 1) {
    matrix.appendChild(headerCell(doc, RANKS[j], "column"));
  }

  /**
   * Barví se podle akce, když je co barvit.
   *
   * Když pravidlo kbelíky nemá - heuristická odpověď, spot mimo vyřešený obsah -
   * byla by matice celá jednobarevná, tedy k ničemu. V takovém případě se ukáže
   * to, co o rukou víme, tedy jejich síla, a **legenda to řekne**: dvě různé
   * osy pod jedním nadpisem jsou horší než jedna přiznaná.
   */
  const byAction = productionByHand.size > 0;
  const used = new Set<string>();
  const counts: Record<string, number> = {};
  const evByHand = comboEvsByHandClass(spot);
  const heroCombo = `${spot.heroCards[0].rank}${spot.heroCards[0].suit}`
    + `${spot.heroCards[1].rank}${spot.heroCards[1].suit}`;
  wrap.dataset.comboEvCount = String(spot.comboEvs?.length ?? 0);

  for (let i = 0; i < GRID_SIZE; i += 1) {
    matrix.appendChild(headerCell(doc, RANKS[i], "row"));
    for (let j = 0; j < GRID_SIZE; j += 1) {
      const hand = handLabel(i, j);
      const category = classifyFlopHand(hand, spot.board);
      const production = productionByHand.get(hand);
      const key = byAction ? matrixGroup(production) : category;
      used.add(key);
      counts[key] = (counts[key] ?? 0) + 1;
      const cell = matrixCell(
        doc, hand, category, hand === heroHand, production, spot.actionNode, byAction,
      );
      const handEvs = evByHand.get(hand);
      // Buňka s EV se pozná i bez kliknutí; bez toho by hráč musel proklikat
      // sto šedesát devět políček, aby zjistil, která čísla vůbec drží.
      if (handEvs !== undefined) cell.dataset.evCombos = String(handEvs.length);
      cell.addEventListener("click", () => showCellDetail(matrix, detail, cell, handEvs, heroCombo));
      cell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        cell.click();
      });
      matrix.appendChild(cell);
    }
  }

  wrap.appendChild(matrix);
  wrap.appendChild(legend(doc, used, counts, matrix, byAction));
  wrap.appendChild(detail);
  root.appendChild(wrap);
}

function matrixCell(
  doc: Document,
  hand: HandLabel,
  category: FlopzillaCategory,
  hero: boolean,
  production?: ProductionCell,
  actionNode?: PostflopActionNode,
  byAction = true,
): HTMLElement {
  const productionLane = production?.lane;
  const cell = doc.createElement("div");
  cell.className = `postflop-flopzilla__cell postflop-flopzilla__cell--${category}`;
  if (productionLane) cell.classList.add("postflop-flopzilla__cell--production-lane");
  if (hero) cell.classList.add("postflop-flopzilla__cell--hero");
  const lane = productionLane ?? flopzillaLaneForCategory(category);
  cell.setAttribute("role", "gridcell");
  cell.setAttribute("tabindex", "0");
  cell.setAttribute("aria-selected", "false");
  cell.setAttribute("aria-label", `${hand}: ${flopzillaCategoryLabel(category)}${hero ? ", Hero hand" : ""}`);
  cell.dataset.hand = hand;
  cell.dataset.category = category;
  cell.dataset.categoryLabel = flopzillaCategoryLabel(category);
  cell.dataset.lane = lane;
  cell.dataset.laneLabel = flopzillaLaneLabel(lane, actionNode);
  cell.dataset.laneSource = productionLane ? "production" : "taxonomy";
  // Facing a bet, the lane cannot say whether to call or fold - both sit in the
  // same lane - so the solved action rides along with the cell.
  if (production?.action !== undefined) {
    cell.dataset.action = production.action;
    cell.setAttribute(
      "aria-label",
      `${hand}: ${flopzillaCategoryLabel(category)}, ${production.action}${hero ? ", Hero hand" : ""}`,
    );
  }
  // Akce první, kategorie za ní. Hráč se ptá „co s tím mám dělat", ne „co to je".
  //
  // Konkrétní akce se dopisuje jen tam, kde skupina sama neříká všechno: u blafu
  // (kterou akcí se blafuje) a u hodnoty (jak velká sázka). „Složení - složení"
  // by bylo zbytečné dvakrát.
  const group = matrixGroup(production);
  cell.title = production === undefined
    ? `${hand}: ${byAction ? "mimo řešenou range" : flopzillaCategoryLabel(category)}`
      + (byAction ? ` (${flopzillaCategoryLabel(category)})` : "")
    : `${hand}: ${cellGroupText(group, production.action)}`
      + ` (${flopzillaCategoryLabel(category)})`;
  cell.textContent = hand;
  // `dataset.group` je klíč, podle kterého legenda tlumí. V režimu podle síly
  // ruky je jím kategorie, takže tlumení funguje v obou režimech jednou cestou.
  cell.dataset.group = byAction ? group : category;
  cell.dataset.groupLabel = byAction
    ? GROUP_DEFS[group].label
    : flopzillaCategoryLabel(category);
  const background = byAction ? GROUP_DEFS[group].color : CATEGORY_DEFS[category].color;
  cell.style.background = background;
  cell.style.color = readableTextColor(background);
  // The shadow exists to lift white text off a dark fill; on a light fill it
  // only smears the label.
  cell.style.textShadow = readableTextColor(background) === "#ffffff"
    ? "0 1px 1px rgba(0,0,0,.55)"
    : "none";
  return cell;
}

interface ProductionCell {
  lane: FlopzillaLane;
  action: PostflopAction;
}

function productionLaneMap(spot: PostflopTrainingSpot): Map<HandLabel, ProductionCell> {
  const source = spot.explanation.source;
  const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets : undefined;
  const map = new Map<HandLabel, ProductionCell>();
  for (const bucket of buckets ?? []) {
    for (const hand of bucket.handClasses) {
      if (!map.has(hand)) map.set(hand, { lane: bucket.lane, action: bucket.action });
    }
  }
  return map;
}

function detailPanel(doc: Document): HTMLElement {
  const detail = doc.createElement("div");
  detail.className = "postflop-flopzilla__detail";
  detail.hidden = true;
  detail.setAttribute("role", "status");
  detail.setAttribute("tabindex", "-1");
  return detail;
}

/**
 * Kombinace jedné třídy s jejich EV, seřazené od nejlepší.
 *
 * Klíčem je třída ruky, protože matice ukazuje 169 buněk - ale uvnitř buňky se
 * vypisují **jednotlivé kombinace**, ne jejich průměr. Průměr přes třídu by
 * neodpovídal žádné konkrétní ruce: změřeno, uvnitř jedné třídy se EV rozchází
 * až o čtrnáct blindů, protože `76` se dvěma srdci na srdcové desce je jiná ruka
 * než `76` bez nich.
 */
function comboEvsByHandClass(
  spot: PostflopTrainingSpot,
): Map<HandLabel, { combo: string; values: readonly { action: PostflopAction; evBb: number }[] }[]> {
  const byClass = new Map<HandLabel, {
    combo: string; values: readonly { action: PostflopAction; evBb: number }[];
  }[]>();
  for (const row of spot.comboEvs ?? []) {
    const cards = comboToCards(row.combo);
    if (cards === undefined) continue;
    const hand = postflopHandClassFromCards(cards);
    const list = byClass.get(hand) ?? [];
    list.push(row);
    byClass.set(hand, list);
  }
  for (const list of byClass.values()) {
    list.sort((left, right) => bestEvOf(right.values) - bestEvOf(left.values));
  }
  return byClass;
}

function bestEvOf(values: readonly { evBb: number }[]): number {
  return values.reduce((best, item) => Math.max(best, item.evBb), Number.NEGATIVE_INFINITY);
}

/** `"AhKh"` na dvě karty, nebo `undefined`, když to není kombinace. */
function comboToCards(combo: string): [Card, Card] | undefined {
  if (combo.length !== 4) return undefined;
  return [
    { rank: combo[0] as Card["rank"], suit: combo[1] as Card["suit"] },
    { rank: combo[2] as Card["rank"], suit: combo[3] as Card["suit"] },
  ];
}

/**
 * EV na jedno desetinné místo.
 *
 * Ne na tři, jak to dělají bubliny u tlačítek: vyřešená EV se ukládá po
 * desetinách blindu, takže `+3,400` by předstíralo přesnost, kterou ta data
 * nemají.
 */
function formatEvBB(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} BB`;
}

const MATRIX_ACTION_LABEL: Record<PostflopAction, string> = {
  CHECK: "check",
  BET_SMALL: "malá sázka",
  BET_BIG: "velká sázka",
  CALL: "dorovnání",
  RAISE: "zvýšení",
  FOLD: "složení",
};

function comboEvSection(
  doc: Document,
  rows: { combo: string; values: readonly { action: PostflopAction; evBb: number }[] }[],
  heroCombo: string,
): HTMLElement {
  const section = doc.createElement("div");
  section.className = "postflop-flopzilla__detail-ev";

  const title = doc.createElement("div");
  title.className = "postflop-flopzilla__detail-ev-title";
  title.textContent = rows.length === 1
    ? "EV této kombinace"
    : `EV jednotlivých kombinací (${rows.length})`;
  section.appendChild(title);

  for (const row of rows) {
    const line = doc.createElement("div");
    line.className = "postflop-flopzilla__detail-ev-row";
    if (row.combo === heroCombo) line.classList.add("postflop-flopzilla__detail-ev-row--hero");
    line.dataset.combo = row.combo;

    const name = doc.createElement("span");
    name.className = "postflop-flopzilla__detail-ev-combo";
    name.textContent = `${row.combo.slice(0, 2)} ${row.combo.slice(2)}`;
    line.appendChild(name);

    const best = bestEvOf(row.values);
    for (const value of [...row.values].sort((left, right) => right.evBb - left.evBb)) {
      const item = doc.createElement("span");
      item.className = "postflop-flopzilla__detail-ev-action";
      if (value.evBb >= best) item.classList.add("postflop-flopzilla__detail-ev-action--best");
      item.dataset.action = value.action;
      item.dataset.evBb = String(value.evBb);
      item.textContent = `${MATRIX_ACTION_LABEL[value.action]} ${formatEvBB(value.evBb)}`;
      line.appendChild(item);
    }
    section.appendChild(line);
  }
  return section;
}

function showCellDetail(
  matrix: HTMLElement,
  detail: HTMLElement,
  cell: HTMLElement,
  comboEvs?: { combo: string; values: readonly { action: PostflopAction; evBb: number }[] }[],
  heroCombo = "",
): void {
  matrix.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell--selected")
    .forEach((selected) => {
      selected.classList.remove("postflop-flopzilla__cell--selected");
      selected.setAttribute("aria-selected", "false");
    });

  cell.classList.add("postflop-flopzilla__cell--selected");
  cell.setAttribute("aria-selected", "true");

  const doc = detail.ownerDocument ?? document;
  const hand = cell.dataset.hand ?? "";
  const category = cell.dataset.category as FlopzillaCategory;
  const lane = cell.dataset.lane as FlopzillaLane;
  const categoryLabel = cell.dataset.categoryLabel ?? flopzillaCategoryLabel(category);
  const laneLabel = cell.dataset.laneLabel ?? flopzillaLaneLabel(lane);
  const hero = cell.classList.contains("postflop-flopzilla__cell--hero");

  detail.hidden = false;
  detail.dataset.hand = hand;
  detail.dataset.category = category;
  detail.dataset.categoryLabel = categoryLabel;
  detail.dataset.lane = lane;
  detail.dataset.laneLabel = laneLabel;
  detail.innerHTML = "";

  const title = doc.createElement("div");
  title.className = "postflop-flopzilla__detail-title";
  title.textContent = `${hand}${hero ? " - Hero hand" : ""}`;
  detail.appendChild(title);

  const grid = doc.createElement("div");
  grid.className = "postflop-flopzilla__detail-grid";
  grid.appendChild(detailLine(doc, "Category", categoryLabel));
  grid.appendChild(detailLine(doc, "Lane", laneLabel));
  grid.appendChild(detailLine(doc, "Plan", laneExplanation(lane)));
  detail.appendChild(grid);
  if (comboEvs !== undefined && comboEvs.length > 0) {
    detail.appendChild(comboEvSection(doc, comboEvs, heroCombo));
  }
  detail.focus();
}

function detailLine(doc: Document, label: string, value: string): HTMLElement {
  const line = doc.createElement("div");
  line.className = "postflop-flopzilla__detail-line";

  const labelEl = doc.createElement("span");
  labelEl.className = "postflop-flopzilla__detail-label";
  labelEl.textContent = label;

  const valueEl = doc.createElement("span");
  valueEl.className = "postflop-flopzilla__detail-value";
  valueEl.textContent = value;

  line.appendChild(labelEl);
  line.appendChild(valueEl);
  return line;
}

function laneExplanation(lane: FlopzillaLane): string {
  switch (lane) {
    case "VALUE":
      return localizedText(
        "Bet primarily for value and protection; these hands can build the pot.",
        "Sázejte primárně pro value a ochranu; tyto handy mohou budovat pot.",
      );
    case "BLUFF":
      return localizedText(
        "Use natural bluffs with equity, blockers, or backdoors when the line requires pressure.",
        "Použijte jako přirozené bluffy s equity, blockery nebo backdoory, když line vyžaduje tlak.",
      );
    case "CHECK":
      return localizedText(
        "Keep these in the check range for showdown value, traps, or give-ups without sufficient equity.",
        "Ponechte v check range pro showdown value, trapy nebo give-up bez dostatečné equity.",
      );
  }
}

function headerCell(
  doc: Document,
  text: string,
  axis: "corner" | "column" | "row" = "column",
): HTMLElement {
  const cell = doc.createElement("div");
  cell.className = `postflop-flopzilla__header-cell postflop-flopzilla__header-cell--${axis}`;
  cell.dataset.axis = axis;
  cell.textContent = text;
  return cell;
}

/**
 * Legenda akcí, ne kategorií.
 *
 * Klikem se zvýrazní jedna skupina - to je ta nejrychlejší cesta k otázce
 * „kterými koly tady blafuju": jeden klik na „Blaf" a matice ukáže právě je.
 * Dřív se takhle vybírala kategorie ruky, což na tuhle otázku odpovědět neumělo.
 */
function legend(
  doc: Document,
  used: ReadonlySet<string>,
  counts: Record<string, number>,
  matrix: HTMLElement,
  byAction = true,
): HTMLElement {
  const legendRoot = doc.createElement("div");
  legendRoot.className = "postflop-flopzilla__legend";
  legendRoot.dataset.axis = byAction ? "action" : "handStrength";
  let activeGroup: string | null = null;

  const entries: readonly { key: string; label: string; color: string }[] = byAction
    ? GROUP_ORDER.map((group) => ({
      key: group, label: GROUP_DEFS[group].label, color: GROUP_DEFS[group].color,
    }))
    : CATEGORY_ORDER.map((category) => ({
      key: category,
      label: flopzillaCategoryLabel(category),
      color: CATEGORY_DEFS[category].color,
    }));

  for (const entry of entries) {
    const group = entry.key;
    if (!used.has(group)) continue;
    const label = entry.label;
    const item = doc.createElement("div");
    item.className = "postflop-flopzilla__legend-item";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-pressed", "false");
    item.setAttribute("aria-label", `Zvýraznit ruce: ${label}`);
    item.dataset.group = group;
    item.dataset.count = String(counts[group] ?? 0);
    item.dataset.share = categoryShare(counts[group] ?? 0);

    const swatch = doc.createElement("span");
    swatch.className = "postflop-flopzilla__legend-swatch";
    swatch.style.background = entry.color;

    const text = doc.createElement("span");
    text.textContent = label;

    const count = doc.createElement("span");
    count.className = "postflop-flopzilla__legend-count";
    count.textContent = `${counts[group] ?? 0}/169 (${categoryShare(counts[group] ?? 0)})`;

    item.appendChild(swatch);
    item.appendChild(text);
    item.appendChild(count);
    item.addEventListener("click", () => {
      activeGroup = activeGroup === group ? null : group;
      applyLegendHighlight(legendRoot, matrix, activeGroup);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      item.click();
    });
    legendRoot.appendChild(item);
  }

  return legendRoot;
}

function applyLegendHighlight(
  legendRoot: HTMLElement,
  matrix: HTMLElement,
  activeGroup: string | null,
): void {
  legendRoot.querySelectorAll<HTMLElement>(".postflop-flopzilla__legend-item")
    .forEach((item) => {
      const active = item.dataset.group === activeGroup;
      item.classList.toggle("postflop-flopzilla__legend-item--active", active);
      item.setAttribute("aria-pressed", active ? "true" : "false");
    });

  matrix.querySelectorAll<HTMLElement>(".postflop-flopzilla__cell")
    .forEach((cell) => {
      const muted = activeGroup !== null && cell.dataset.group !== activeGroup;
      cell.classList.toggle("postflop-flopzilla__cell--muted", muted);
    });
}

function categoryShare(count: number): string {
  return `${Math.round((count / (GRID_SIZE * GRID_SIZE)) * 100)}%`;
}

export function flopzillaCategoryLabel(category: FlopzillaCategory): string {
  return CATEGORY_DEFS[category].label;
}

/**
 * A lane's user-facing name at a given decision node.
 *
 * The three lanes are named for a betting node, where checking is what you do
 * when you are not betting. Facing a bet, checking is not a legal action at all,
 * so calling that lane "Check" told the player about a move they cannot make -
 * and it covers both calling and folding, which is the whole decision in that
 * spot. The lane vocabulary stays as it is; only the words change with the node,
 * and the per-hand action carries the call-or-fold distinction.
 */
export function flopzillaLaneLabel(lane: FlopzillaLane, actionNode?: PostflopActionNode): string {
  const facingBet = actionNode !== undefined && FACING_BET_NODES.has(actionNode);
  switch (lane) {
    case "VALUE":
      return facingBet ? "Value raise" : "Value";
    case "BLUFF":
      return facingBet ? "Bluff raise" : "Bluffy";
    case "CHECK":
      return facingBet ? "Call or fold" : "Check";
  }
}

const FACING_BET_NODES = new Set<PostflopActionNode>([
  "FLOP_FACING_BET",
  "TURN_FACING_BET",
  "RIVER_FACING_BET",
]);

export function postflopHandClassFromCards(cards: readonly [Card, Card]): HandLabel {
  const [a, b] = cards;
  const ai = RANKS.indexOf(a.rank);
  const bi = RANKS.indexOf(b.rank);
  if (ai === bi) return `${a.rank}${b.rank}`;
  const high = ai < bi ? a : b;
  const low = ai < bi ? b : a;
  return `${high.rank}${low.rank}${high.suit === low.suit ? "s" : "o"}`;
}

function cardLabel(card: Card): string {
  return `${card.rank}${card.suit}`;
}
