/**
 * Dashboard statistik â€” zobrazenĂ­ souhrnnĂ˝ch a rozÄŤlenÄ›nĂ˝ch statistik trĂ©ninku
 * (Req 9.3, 9.4, 9.5, 9.7).
 *
 * Tento modul je UI vrstva (DOM I/O). ÄŚte data vĂ˝hradnÄ› z `Stats_Store`
 * (`summary`, `breakdownBy`, `currentStreak`) a vykresluje je do `root`.
 * VeĹˇkerĂˇ vĂ˝poÄŤetnĂ­ logika (ĂşspÄ›Ĺˇnost, agregace, streak) zĹŻstĂˇvĂˇ ve
 * `Stats_Store`; dashboard pouze formĂˇtuje a zobrazuje (ÄŤeĹˇtina â€” Req 12.3).
 *
 * ## ZodpovÄ›dnosti
 *
 * - **Souhrn (Req 9.3).** CelkovĂ˝ poÄŤet zodpovÄ›zenĂ˝ch SpotĹŻ a ĂşspÄ›Ĺˇnost v %
 *   zaokrouhlenĂˇ na 1 desetinnĂ© mĂ­sto (z `store.summary()`).
 * - **RozÄŤlenÄ›nĂ­ (Req 9.4).** TĹ™i samostatnĂ© tabulky: podle kategorie akce
 *   (`context`), podle Pozice (`position`) a podle HloubkovĂ©ho_koĹˇu (`bucket`),
 *   kaĹľdĂˇ z `store.breakdownBy(dim)`.
 * - **Streak a poÄŤet spotĹŻ relace (Req 9.5).** AktuĂˇlnĂ­ sĂ©rie sprĂˇvnĂ˝ch
 *   odpovÄ›dĂ­ z `store.currentStreak()` a poÄŤet spotĹŻ zodpovÄ›zenĂ˝ch v aktuĂˇlnĂ­
 *   relaci (viz `sessionCount` nĂ­Ĺľe).
 * - **PrĂˇzdnĂ© skupiny (Req 9.7).** Skupina bez zĂˇznamu (`count = 0`) zobrazĂ­
 *   poÄŤet `0` a indikaci NEDOSTUPNĂ‰ ĂşspÄ›Ĺˇnosti (`rate = null`) jako `"â€”"`
 *   namĂ­sto procentnĂ­ hodnoty. `breakdownBy` uĹľ pro prĂˇzdnĂ© skupiny vracĂ­
 *   `rate = null`, takĹľe staÄŤĂ­ toto promĂ­tnout do UI.
 *
 * ## `sessionCount` (Req 9.5)
 *
 * `Stats_Store.summary().total` nese **celkovĂ˝** poÄŤet zodpovÄ›zenĂ˝ch SpotĹŻ
 * napĹ™Ă­ÄŤ vĹˇemi relacemi (perzistovĂˇno v localStorage). PoĹľadavek 9.5 vĹˇak mluvĂ­
 * o poÄŤtu spotĹŻ zodpovÄ›zenĂ˝ch v **aktuĂˇlnĂ­ relaci** (bÄ›hu). Tuto hodnotu
 * Stats_Store neznĂˇ â€” relace je ÄŤistÄ› bÄ›hovĂ˝ pojem. Proto ji dashboard pĹ™ijĂ­mĂˇ
 * jako **explicitnĂ­ parametr** `sessionCount`, kterĂ˝ udrĹľuje volajĂ­cĂ­ (napĹ™.
 * `main.ts` / orchestrĂˇtor relace) a inkrementuje po kaĹľdĂ© zodpovÄ›zenĂ© otĂˇzce
 * v rĂˇmci jednoho bÄ›hu. PĹ™i novĂ©m startu relace volajĂ­cĂ­ `sessionCount`
 * vynuluje. Dashboard zde ĹľĂˇdnĂ˝ stav relace neudrĹľuje.
 *
 * ## Selektory / data-atributy (kontrakt pro DOM testy 16.3)
 *
 * - `.dashboard` â€” koĹ™enovĂ˝ wrapper vykreslenĂ˝ do `root`.
 * - `.dashboard-summary` â€” blok souhrnu (Req 9.3); obsahuje:
 *     - `.summary-total` â€” celkovĂ˝ poÄŤet zodpovÄ›zenĂ˝ch (`data-total`),
 *     - `.summary-rate` â€” souhrnnĂˇ ĂşspÄ›Ĺˇnost; `data-rate` = hodnota nebo prĂˇzdnĂ©
 *       pĹ™i nedostupnosti; tĹ™Ă­da `.rate--unavailable` s textem `"â€”"` pĹ™i `null`.
 * - `.dashboard-streak` â€” aktuĂˇlnĂ­ streak (`data-streak`) â€” Req 9.5.
 * - `.dashboard-session-count` â€” poÄŤet spotĹŻ aktuĂˇlnĂ­ relace (`data-session-count`)
 *   â€” Req 9.5.
 * - `.breakdown` â€” kontejner jednĂ© rozÄŤlenÄ›nĂ© tabulky (Req 9.4); varianty:
 *     - `.breakdown--context`, `.breakdown--position`, `.breakdown--bucket`.
 * - `.breakdown-row` â€” jeden Ĺ™Ăˇdek skupiny; nese `data-group`, `data-total`,
 *   `data-rate` (prĂˇzdnĂ© pĹ™i nedostupnosti).
 * - `.rate--unavailable` â€” indikace nedostupnĂ© ĂşspÄ›Ĺˇnosti s textem `"â€”"`
 *   (Req 9.7); pouĹľita v souhrnu i v Ĺ™ĂˇdcĂ­ch breakdownu.
 *
 * _Requirements: 9.3, 9.4, 9.5, 9.7_
 */

import type { ActionContext } from "../core/types";
import type {
  Breakdown,
  BreakdownDim,
  GroupStat,
  StatsStore,
  Summary,
} from "../persistence/statsStore";
import { migrateResultRecordsToV2 } from "../persistence/statsRecordV2";
import { buildStatsExportJson, importStatsJson } from "../persistence/statsTransfer";
import {
  availableStatsV2Dimensions,
  breakdownStatsV2,
  type StatsV2BreakdownDim,
  type StatsV2Group,
} from "../persistence/statsV2Analytics";
import {
  availablePostflopStatsDimensions,
  breakdownPostflopStats,
  type PostflopStatsBreakdownDim,
  type PostflopStatsGroup,
  type PostflopStatsV2BridgeRecord,
} from "../persistence/postflopResultRecord";

// ---------------------------------------------------------------------------
// VeĹ™ejnĂ© API
// ---------------------------------------------------------------------------

/** VstupnĂ­ data pro vykreslenĂ­ dashboardu. */
export interface DashboardData {
  /** Zdroj statistik (souhrn, breakdown, streak). */
  store: StatsStore;
  /**
   * PoÄŤet SpotĹŻ zodpovÄ›zenĂ˝ch v aktuĂˇlnĂ­ relaci (Req 9.5).
   * UdrĹľuje volajĂ­cĂ­ â€” viz dokumentaÄŤnĂ­ blok modulu. ZĂˇpornĂ©/neÄŤĂ­selnĂ© hodnoty
   * jsou defenzivnÄ› normalizovĂˇny na 0.
  */
  sessionCount: number;
  postflopRecords?: readonly PostflopStatsV2BridgeRecord[];
  onPostflopRecordsImported?: (records: readonly PostflopStatsV2BridgeRecord[]) => boolean | void;
}

// ---------------------------------------------------------------------------
// FormĂˇtovĂˇnĂ­ (ÄŤeĹˇtina, Req 9.3 / 9.7 / 12.3)
// ---------------------------------------------------------------------------

/** Text indikace nedostupnĂ© ĂşspÄ›Ĺˇnosti (Req 9.7). */
const RATE_UNAVAILABLE = "\u2014"; // â€”

/**
 * NaformĂˇtuje ĂşspÄ›Ĺˇnost pro zobrazenĂ­.
 *
 * `Stats_Store` vracĂ­ `rate` jiĹľ zaokrouhlenĂ© na 1 desetinnĂ© mĂ­sto (Req 9.3),
 * nebo `null` pro skupinu bez zĂˇznamu (Req 9.7). Pro `null` vracĂ­ `"â€”"`,
 * jinak hodnotu na prĂˇvÄ› 1 desetinnĂ© mĂ­sto s jednotkou `%` (napĹ™. `"66.7 %"`).
 */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return RATE_UNAVAILABLE;
  return `${rate.toFixed(1)} %`;
}

/** BezpeÄŤnĂ© nezĂˇpornĂ© celĂ© ÄŤĂ­slo pro poÄŤet spotĹŻ relace. */
function normalizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// ÄŚeskĂ© popisky dimenzĂ­ a skupin (Req 12.3)
// ---------------------------------------------------------------------------

/** ÄŚeskĂ˝ nĂˇzev dimenze breakdownu (nadpis tabulky). */
const DIM_TITLE: Record<BreakdownDim, string> = {
  context: "Podle kategorie akce",
  position: "Podle pozice",
  bucket: "Podle hloubkov\u00e9ho ko\u0161e",
};

const PROFILE_DIM_TITLE: Record<StatsV2BreakdownDim, string> = {
  gameVariant: "Podle varianty hry",
  tableFormat: "Podle formatu stolu",
  blindSpeed: "Podle rychlosti blindu",
  street: "Podle streety",
  evModel: "Podle modelu",
  ante: "Podle ante",
  rakeMode: "Podle rake rezimu",
  rangePackId: "Podle preflop modelu",
  position: "Podle pozice",
  bucket: "Podle stacku",
  context: "Podle akcni situace",
};

/** ÄŚeskĂ˝ popisek akÄŤnĂ­ho kontextu (kategorie). */
const CONTEXT_LABEL: Record<ActionContext, string> = {
  RFI: "RFI / Open",
  VS_LIMP: "Proti limpu (iso-raise)",
  VS_OPEN: "Proti openu",
  VS_3BET: "Proti 3betu",
  VS_4BET: "Proti 4betu",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Proti all-inu",
};

/**
 * ÄŚeskĂ˝ popisek skupiny pro zobrazenĂ­ (raw `key` zĹŻstĂˇvĂˇ v `data-group`).
 * Pro `context` pĹ™eloĹľĂ­ AkÄŤnĂ­_kontext, pro `bucket` pĹ™idĂˇ jednotku BB,
 * pro `position` ponechĂˇ nĂˇzev pozice beze zmÄ›ny.
 */
const POSTFLOP_DIM_TITLE: Record<PostflopStatsBreakdownDim, string> = {
  street: "Podle streety",
  actionNode: "Podle postflop situace",
  boardTextureKey: "Podle textury boardu",
  strategyPackId: "Podle postflop modelu",
  confidence: "Podle jistoty",
};

function groupLabel(dim: BreakdownDim | PostflopStatsBreakdownDim, key: string): string {
  switch (dim) {
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "position":
      return key;
    case "strategyPackId":
      return "Postflop model";
    case "confidence":
      return confidenceLabel(key);
    case "actionNode":
      return postflopActionNodeLabel(key);
    case "boardTextureKey":
      return postflopBoardTextureKeyLabel(key);
    case "street":
      return streetLabel(key);
  }
}

function profileGroupLabel(dim: StatsV2BreakdownDim, key: string): string {
  switch (dim) {
    case "gameVariant":
      return gameVariantLabel(key);
    case "tableFormat":
      return tableFormatLabel(key);
    case "blindSpeed":
      return blindSpeedLabel(key);
    case "street":
      return profileStreetLabel(key);
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "ante":
      return key === "ON" ? "Ante zapnute" : "Ante vypnute";
    case "evModel":
      return key === "CHIP_EV" ? "chipEV" : key;
    case "rakeMode":
      return rakeModeLabel(key);
    case "rangePackId":
      return "Preflop model";
    case "position":
      return key;
    default:
      return key;
  }
}

function gameVariantLabel(key: string): string {
  if (key === "CASH") return "Cash";
  return key;
}

function tableFormatLabel(key: string): string {
  switch (key) {
    case "FULL_RING_9":
      return "9-max full ring";
    case "SIX_MAX":
      return "6-max";
    default:
      return key;
  }
}

function blindSpeedLabel(key: string): string {
  switch (key) {
    case "REGULAR":
      return "Regular";
    case "TURBO":
      return "Turbo";
    default:
      return key;
  }
}

function profileStreetLabel(key: string): string {
  switch (key) {
    case "PREFLOP":
      return "Preflop";
    default:
      return streetLabel(key);
  }
}

function rakeModeLabel(key: string): string {
  switch (key) {
    case "NONE":
      return "N/A";
    case "RAKE":
      return "S rakem";
    case "NO_RAKE":
      return "Bez raku";
    default:
      return key;
  }
}

function confidenceLabel(key: string): string {
  switch (key) {
    case "LOW":
      return "nizka";
    case "MEDIUM":
      return "stredni";
    case "HIGH":
      return "vysoka";
    default:
      return key;
  }
}

function postflopActionNodeLabel(key: string): string {
  switch (key) {
    case "SINGLE_RAISED_POT_CBET":
      return "Flop c-bet v SRP";
    case "THREE_BET_POT_CBET":
      return "Flop c-bet ve 3bet potu";
    case "TURN_BARREL":
      return "Turn barrel";
    case "RIVER_PRESSURE":
      return "River tlak";
    default:
      return key;
  }
}

function postflopBoardTextureKeyLabel(key: string): string {
  return key
    .split("|")
    .filter(Boolean)
    .map(boardTextureLabel)
    .join(", ");
}

function boardTextureLabel(key: string): string {
  switch (key) {
    case "paired":
      return "sparovany";
    case "monotone":
      return "monotone";
    case "two-tone":
      return "two-tone";
    case "rainbow":
      return "rainbow";
    case "connected":
      return "propojeny";
    case "dry":
      return "dry";
    case "ace-high":
      return "A-high";
    case "broadway-high":
      return "broadway-high";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "straight-possible":
      return "straight mozny";
    case "flush-draw-heavy":
      return "flush draw";
    case "disconnected":
      return "disconnected";
    default:
      return key;
  }
}

function streetLabel(key: string): string {
  switch (key) {
    case "FLOP":
      return "Flop";
    case "TURN":
      return "Turn";
    case "RIVER":
      return "River";
    default:
      return key;
  }
}

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * VytvoĹ™Ă­ element zobrazujĂ­cĂ­ ĂşspÄ›Ĺˇnost. PĹ™i `null` nastavĂ­ tĹ™Ă­du
 * `.rate--unavailable` a text `"â€”"` (Req 9.7), jinak text `"<rate> %"`.
 * VĹľdy nastavĂ­ `data-rate` (prĂˇzdnĂ© pĹ™i nedostupnosti) pro testovatelnost.
 */
function rateElement(tag: string, baseClass: string, rate: number | null): HTMLElement {
  const node = el(tag, baseClass);
  if (rate === null || !Number.isFinite(rate)) {
    node.classList.add("rate--unavailable");
    node.dataset.rate = "";
    node.textContent = RATE_UNAVAILABLE;
  } else {
    node.dataset.rate = String(rate);
    node.textContent = formatRate(rate);
  }
  return node;
}

// ---------------------------------------------------------------------------
// DĂ­lÄŤĂ­ sekce
// ---------------------------------------------------------------------------

/** SouhrnnĂˇ ĂşspÄ›Ĺˇnost a celkovĂ˝ poÄŤet zodpovÄ›zenĂ˝ch (Req 9.3). */
function renderSummary(summary: Summary): HTMLElement {
  const box = el("section", "dashboard-summary");

  const heading = el("h3", "dashboard-summary__title");
  heading.textContent = "Souhrn";
  box.appendChild(heading);

  const total = el("div", "summary-total");
  total.dataset.total = String(summary.total);
  total.textContent = `Zodpov\u011bzeno celkem: ${summary.total}`;
  box.appendChild(total);

  const rateLine = el("div", "summary-rate-line");
  const rateLabel = el("span", "summary-rate-label");
  rateLabel.textContent = "\u00dasp\u011b\u0161nost: ";
  const rate = rateElement("span", "summary-rate", summary.rate);
  rateLine.appendChild(rateLabel);
  rateLine.appendChild(rate);
  box.appendChild(rateLine);

  return box;
}

/** AktuĂˇlnĂ­ streak a poÄŤet spotĹŻ relace (Req 9.5). */
function renderStreakSession(streak: number, sessionCount: number): HTMLElement {
  const box = el("section", "dashboard-session");

  const heading = el("h3", "dashboard-session__title");
  heading.textContent = "Aktu\u00e1ln\u00ed relace";
  box.appendChild(heading);

  const streakNode = el("div", "dashboard-streak");
  streakNode.dataset.streak = String(streak);
  streakNode.textContent = `S\u00e9rie spr\u00e1vn\u00fdch odpov\u011bd\u00ed: ${streak}`;
  box.appendChild(streakNode);

  const sessionNode = el("div", "dashboard-session-count");
  sessionNode.dataset.sessionCount = String(sessionCount);
  sessionNode.textContent = `Spot\u016f v t\u00e9to relaci: ${sessionCount}`;
  box.appendChild(sessionNode);

  return box;
}

/** Jeden Ĺ™Ăˇdek skupiny breakdownu (Req 9.4, 9.7). */
function renderBreakdownRow(dim: BreakdownDim, g: GroupStat): HTMLElement {
  const row = el("div", "breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "breakdown-row__name");
  name.textContent = groupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "breakdown-row__count");
  count.textContent = `${g.total}\u00d7`; // napĹ™. "12Ă—"
  row.appendChild(count);

  // ĂšspÄ›Ĺˇnost â€” prĂˇzdnĂˇ skupina â‡’ "â€”" (Req 9.7).
  row.appendChild(rateElement("span", "breakdown-row__rate", g.rate));

  return row;
}

/** Jedna rozÄŤlenÄ›nĂˇ tabulka pro zadanou dimenzi (Req 9.4). */
function renderBreakdown(dim: BreakdownDim, breakdown: Breakdown): HTMLElement {
  const box = el("section", `breakdown breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h3", "breakdown__title");
  heading.textContent = DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "breakdown__rows");
  for (const g of breakdown) {
    rows.appendChild(renderBreakdownRow(dim, g));
  }
  box.appendChild(rows);

  return box;
}

function renderStatsTransfer(data: DashboardData, root: HTMLElement): HTMLElement {
  const box = el("section", "stats-transfer");

  const heading = el("h3", "stats-transfer__title");
  heading.textContent = "Export / import statistik";
  box.appendChild(heading);

  const actions = el("div", "stats-transfer__actions");
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "stats-export";
  exportBtn.textContent = "Export JSON";

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "stats-import";
  importBtn.textContent = "Import JSON";

  actions.appendChild(exportBtn);
  actions.appendChild(importBtn);
  box.appendChild(actions);

  const textarea = document.createElement("textarea");
  textarea.className = "stats-json-box";
  textarea.placeholder = "Export / import JSON statistik";
  textarea.rows = 8;
  box.appendChild(textarea);

  const status = el("div", "stats-transfer__status");
  status.setAttribute("role", "status");
  status.hidden = true;
  box.appendChild(status);

  exportBtn.addEventListener("click", () => {
    textarea.value = buildStatsExportJson(data.store, new Date(), {
      postflopRecords: data.postflopRecords ?? [],
    });
    status.hidden = false;
    status.className = "stats-transfer__status stats-transfer__status--ok";
    status.textContent = "Export statistik je p\u0159ipraven\u00fd v poli JSON.";
  });

  importBtn.addEventListener("click", () => {
    const result = importStatsJson(textarea.value, data.store);
    status.hidden = false;
    if (result.ok) {
      const postflopSaved = data.onPostflopRecordsImported?.(result.postflopRecords) ?? true;
      if (!postflopSaved) {
        status.className = "stats-transfer__status stats-transfer__status--error";
        status.textContent = "Preflop statistiky byly importovany, ale postflop log se nepodarilo ulozit.";
        return;
      }
      renderDashboard({
        ...data,
        postflopRecords: result.postflopRecords,
      }, root);
      const refreshedStatus = root.querySelector<HTMLElement>(".stats-transfer__status");
      if (refreshedStatus) {
        refreshedStatus.hidden = false;
        refreshedStatus.className = "stats-transfer__status stats-transfer__status--ok";
        refreshedStatus.textContent = `Importov\u00e1no ${result.imported} z\u00e1znam\u016f statistik.`;
      }
      return;
    }
    status.className = "stats-transfer__status stats-transfer__status--error";
    status.textContent = result.error ?? "Import statistik se nepoda\u0159il.";
  });

  return box;
}

function renderProfileBreakdownRow(dim: StatsV2BreakdownDim, g: StatsV2Group): HTMLElement {
  const row = el("div", "profile-breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "profile-breakdown-row__name");
  name.textContent = profileGroupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "profile-breakdown-row__count");
  count.textContent = `${g.total}\u00d7`;
  row.appendChild(count);

  row.appendChild(rateElement("span", "profile-breakdown-row__rate", g.rate));

  return row;
}

function renderProfileBreakdown(dim: StatsV2BreakdownDim, groups: StatsV2Group[]): HTMLElement {
  const box = el("section", `profile-breakdown profile-breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h4", "profile-breakdown__title");
  heading.textContent = PROFILE_DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "profile-breakdown__rows");
  if (groups.length === 0) {
    const empty = el("div", "profile-breakdown__empty");
    empty.textContent = "Zat\u00edm bez z\u00e1znam\u016f.";
    rows.appendChild(empty);
  } else {
    for (const g of groups) {
      rows.appendChild(renderProfileBreakdownRow(dim, g));
    }
  }
  box.appendChild(rows);

  return box;
}

function renderProfileBreakdowns(store: StatsStore): HTMLElement {
  const box = el("section", "profile-breakdowns");

  const heading = el("h3", "profile-breakdowns__title");
  heading.textContent = "Profilov\u00e9 roz\u010dlen\u011bn\u00ed";
  box.appendChild(heading);

  const eventsV2 = migrateResultRecordsToV2(store.events());
  for (const dim of availableStatsV2Dimensions()) {
    box.appendChild(renderProfileBreakdown(dim, breakdownStatsV2(eventsV2, dim)));
  }

  return box;
}

function renderPostflopBreakdownRow(
  dim: PostflopStatsBreakdownDim,
  g: PostflopStatsGroup,
): HTMLElement {
  const row = el("div", "postflop-breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "postflop-breakdown-row__name");
  name.textContent = groupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "postflop-breakdown-row__count");
  count.textContent = `${g.total}\u00d7`;
  row.appendChild(count);

  row.appendChild(rateElement("span", "postflop-breakdown-row__rate", g.rate));

  return row;
}

function renderPostflopBreakdown(
  dim: PostflopStatsBreakdownDim,
  groups: PostflopStatsGroup[],
): HTMLElement {
  const box = el("section", `postflop-breakdown postflop-breakdown--${dim}`);
  box.dataset.dim = dim;

  const heading = el("h4", "postflop-breakdown__title");
  heading.textContent = POSTFLOP_DIM_TITLE[dim];
  box.appendChild(heading);

  const rows = el("div", "postflop-breakdown__rows");
  if (groups.length === 0) {
    const empty = el("div", "postflop-breakdown__empty");
    empty.textContent = "Zat\u00edm bez postflop odpov\u011bd\u00ed.";
    rows.appendChild(empty);
  } else {
    for (const group of groups) {
      rows.appendChild(renderPostflopBreakdownRow(dim, group));
    }
  }
  box.appendChild(rows);

  return box;
}

function renderPostflopBreakdowns(
  records: readonly PostflopStatsV2BridgeRecord[],
): HTMLElement {
  const box = el("section", "postflop-breakdowns");
  box.dataset.total = String(records.length);

  const heading = el("h3", "postflop-breakdowns__title");
  heading.textContent = "Postflop roz\u010dlen\u011bn\u00ed";
  box.appendChild(heading);

  for (const dim of availablePostflopStatsDimensions()) {
    box.appendChild(renderPostflopBreakdown(dim, breakdownPostflopStats(records, dim)));
  }

  return box;
}

// ---------------------------------------------------------------------------
// Styly (sobÄ›staÄŤnĂ©, aby dashboard fungoval i bez externĂ­ho CSS)
// ---------------------------------------------------------------------------

function dashboardStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
.dashboard{font-family:system-ui,Arial,sans-serif;color:#1b1f2a;display:flex;
  flex-direction:column;gap:16px;max-width:720px;}
.dashboard h3{margin:0 0 8px;font-size:14px;font-weight:800;color:#2b3550;}
.dashboard h4{margin:0 0 6px;font-size:12px;font-weight:800;color:#48526b;}
.dashboard-summary,.dashboard-session,.breakdown,.stats-transfer,.profile-breakdowns,.postflop-breakdowns{background:#f5f7fb;
  border:1px solid #e2e7f0;border-radius:10px;padding:12px 14px;}
.dashboard-summary .summary-total{font-size:13px;color:#48526b;}
.dashboard-summary .summary-rate-line{margin-top:4px;font-size:18px;font-weight:800;}
.dashboard-summary .summary-rate-label{font-size:13px;font-weight:600;color:#48526b;}
.dashboard-session{display:flex;flex-direction:column;gap:4px;}
.dashboard-streak{font-size:15px;font-weight:800;color:#1f9d57;}
.dashboard-session-count{font-size:13px;color:#48526b;}
.profile-breakdowns,.postflop-breakdowns{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.profile-breakdowns__title,.postflop-breakdowns__title{grid-column:1/-1;}
.profile-breakdown,.postflop-breakdown{background:#fff;border:1px solid #e7ebf4;border-radius:8px;padding:8px;}
.breakdown__rows,.profile-breakdown__rows,.postflop-breakdown__rows{display:flex;flex-direction:column;gap:2px;}
.breakdown-row,.profile-breakdown-row,.postflop-breakdown-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;
  align-items:center;padding:4px 6px;border-radius:6px;font-size:13px;}
.breakdown-row:nth-child(odd),.profile-breakdown-row:nth-child(odd),.postflop-breakdown-row:nth-child(odd){background:rgba(43,53,80,.04);}
.breakdown-row__name,.profile-breakdown-row__name,.postflop-breakdown-row__name{font-weight:600;min-width:0;overflow-wrap:anywhere;}
.breakdown-row__count,.profile-breakdown-row__count,.postflop-breakdown-row__count{color:#6b7488;font-variant-numeric:tabular-nums;}
.breakdown-row__rate,.profile-breakdown-row__rate,.postflop-breakdown-row__rate{font-weight:800;text-align:right;font-variant-numeric:tabular-nums;}
.profile-breakdown__empty,.postflop-breakdown__empty{font-size:12px;color:#6b7488;}
.rate--unavailable{color:#9aa6c2;font-weight:600;}
.stats-transfer__actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;}
.stats-export,.stats-import{appearance:none;border:1px solid #c8d1e3;border-radius:8px;
  background:#fff;color:#1b1f2a;font-weight:800;font-size:13px;padding:8px 12px;
  cursor:pointer;}
.stats-export:hover,.stats-import:hover{border-color:#2bd576;}
.stats-json-box{box-sizing:border-box;width:100%;min-height:140px;resize:vertical;
  border:1px solid #c8d1e3;border-radius:8px;padding:8px 10px;font-family:ui-monospace,
  SFMono-Regular,Consolas,monospace;font-size:12px;color:#1b1f2a;background:#fff;}
.stats-transfer__status{margin-top:8px;font-size:12px;font-weight:700;}
.stats-transfer__status--ok{color:#1f9d57;}
.stats-transfer__status--error{color:#c93333;}
@media (max-width:640px){.profile-breakdowns,.postflop-breakdowns{grid-template-columns:1fr;}}
`;
  return style;
}

// ---------------------------------------------------------------------------
// HlavnĂ­ vykreslovacĂ­ funkce (Req 9.3, 9.4, 9.5, 9.7)
// ---------------------------------------------------------------------------

/**
 * VykreslĂ­ dashboard statistik do `root`.
 *
 * IdempotentnĂ­: pĹ™ed vykreslenĂ­m vyprĂˇzdnĂ­ `root`. ÄŚte z `data.store`
 * (`summary`, `breakdownBy`, `currentStreak`) a zobrazĂ­ poÄŤet spotĹŻ relace
 * z `data.sessionCount`. Generuje DOM elementy se sĂ©mantickĂ˝mi tĹ™Ă­dami pro
 * testovatelnost (viz dokumentaÄŤnĂ­ blok modulu).
 *
 * @param data Zdroj statistik + poÄŤet spotĹŻ aktuĂˇlnĂ­ relace.
 * @param root CĂ­lovĂ˝ kontejner.
 */
export function renderDashboard(data: DashboardData, root: HTMLElement): void {
  root.innerHTML = "";

  const { store } = data;
  const sessionCount = normalizeCount(data.sessionCount);

  const wrapper = el("div", "dashboard");
  wrapper.appendChild(dashboardStyles());

  // Souhrn (Req 9.3).
  wrapper.appendChild(renderSummary(store.summary()));

  // Streak + poÄŤet spotĹŻ relace (Req 9.5).
  wrapper.appendChild(renderStreakSession(store.currentStreak(), sessionCount));

  // Export/import JSON statistik (legacy parity gap).
  wrapper.appendChild(renderStatsTransfer(data, root));

  // ProfilovĂ© rozÄŤlenÄ›nĂ­ nad migrovanĂ˝mi zĂˇznamy v2 (multi-format roadmap).
  wrapper.appendChild(renderProfileBreakdowns(store));
  wrapper.appendChild(renderPostflopBreakdowns(data.postflopRecords ?? []));

  // RozÄŤlenÄ›nĂ­ podle tĹ™Ă­ dimenzĂ­ (Req 9.4, prĂˇzdnĂ© skupiny Req 9.7).
  const dims: BreakdownDim[] = ["context", "position", "bucket"];
  for (const dim of dims) {
    wrapper.appendChild(renderBreakdown(dim, store.breakdownBy(dim)));
  }

  root.appendChild(wrapper);
}
