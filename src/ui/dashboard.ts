/**
 * Dashboard statistik — zobrazení souhrnných a rozčleněných statistik tréninku
 * (Req 9.3, 9.4, 9.5, 9.7).
 *
 * Tento modul je UI vrstva (DOM I/O). Čte data výhradně z `Stats_Store`
 * (`summary`, `breakdownBy`, `currentStreak`) a vykresluje je do `root`.
 * Veškerá výpočetní logika (úspěšnost, agregace, streak) zůstává ve
 * `Stats_Store`; dashboard pouze formátuje a zobrazuje (čeština — Req 12.3).
 *
 * ## Zodpovědnosti
 *
 * - **Souhrn (Req 9.3).** Celkový počet zodpovězených Spotů a úspěšnost v %
 *   zaokrouhlená na 1 desetinné místo (z `store.summary()`).
 * - **Rozčlenění (Req 9.4).** Tři samostatné tabulky: podle kategorie akce
 *   (`context`), podle Pozice (`position`) a podle Hloubkového_košu (`bucket`),
 *   každá z `store.breakdownBy(dim)`.
 * - **Streak a počet spotů relace (Req 9.5).** Aktuální série správných
 *   odpovědí z `store.currentStreak()` a počet spotů zodpovězených v aktuální
 *   relaci (viz `sessionCount` níže).
 * - **Prázdné skupiny (Req 9.7).** Skupina bez záznamu (`count = 0`) zobrazí
 *   počet `0` a indikaci NEDOSTUPNÉ úspěšnosti (`rate = null`) jako `"—"`
 *   namísto procentní hodnoty. `breakdownBy` už pro prázdné skupiny vrací
 *   `rate = null`, takže stačí toto promítnout do UI.
 *
 * ## `sessionCount` (Req 9.5)
 *
 * `Stats_Store.summary().total` nese **celkový** počet zodpovězených Spotů
 * napříč všemi relacemi (perzistováno v localStorage). Požadavek 9.5 však mluví
 * o počtu spotů zodpovězených v **aktuální relaci** (běhu). Tuto hodnotu
 * Stats_Store nezná — relace je čistě běhový pojem. Proto ji dashboard přijímá
 * jako **explicitní parametr** `sessionCount`, který udržuje volající (např.
 * `main.ts` / orchestrátor relace) a inkrementuje po každé zodpovězené otázce
 * v rámci jednoho běhu. Při novém startu relace volající `sessionCount`
 * vynuluje. Dashboard zde žádný stav relace neudržuje.
 *
 * ## Selektory / data-atributy (kontrakt pro DOM testy 16.3)
 *
 * - `.dashboard` — kořenový wrapper vykreslený do `root`.
 * - `.dashboard-summary` — blok souhrnu (Req 9.3); obsahuje:
 *     - `.summary-total` — celkový počet zodpovězených (`data-total`),
 *     - `.summary-rate` — souhrnná úspěšnost; `data-rate` = hodnota nebo prázdné
 *       při nedostupnosti; třída `.rate--unavailable` s textem `"—"` při `null`.
 * - `.dashboard-streak` — aktuální streak (`data-streak`) — Req 9.5.
 * - `.dashboard-session-count` — počet spotů aktuální relace (`data-session-count`)
 *   — Req 9.5.
 * - `.breakdown` — kontejner jedné rozčleněné tabulky (Req 9.4); varianty:
 *     - `.breakdown--context`, `.breakdown--position`, `.breakdown--bucket`.
 * - `.breakdown-row` — jeden řádek skupiny; nese `data-group`, `data-total`,
 *   `data-rate` (prázdné při nedostupnosti).
 * - `.rate--unavailable` — indikace nedostupné úspěšnosti s textem `"—"`
 *   (Req 9.7); použita v souhrnu i v řádcích breakdownu.
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
// Veřejné API
// ---------------------------------------------------------------------------

/** Vstupní data pro vykreslení dashboardu. */
export interface DashboardData {
  /** Zdroj statistik (souhrn, breakdown, streak). */
  store: StatsStore;
  /**
   * Počet Spotů zodpovězených v aktuální relaci (Req 9.5).
   * Udržuje volající — viz dokumentační blok modulu. Záporné/nečíselné hodnoty
   * jsou defenzivně normalizovány na 0.
  */
  sessionCount: number;
  postflopRecords?: readonly PostflopStatsV2BridgeRecord[];
  onPostflopRecordsImported?: (records: readonly PostflopStatsV2BridgeRecord[]) => void;
}

// ---------------------------------------------------------------------------
// Formátování (čeština, Req 9.3 / 9.7 / 12.3)
// ---------------------------------------------------------------------------

/** Text indikace nedostupné úspěšnosti (Req 9.7). */
const RATE_UNAVAILABLE = "\u2014"; // —

/**
 * Naformátuje úspěšnost pro zobrazení.
 *
 * `Stats_Store` vrací `rate` již zaokrouhlené na 1 desetinné místo (Req 9.3),
 * nebo `null` pro skupinu bez záznamu (Req 9.7). Pro `null` vrací `"—"`,
 * jinak hodnotu na právě 1 desetinné místo s jednotkou `%` (např. `"66.7 %"`).
 */
export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return RATE_UNAVAILABLE;
  return `${rate.toFixed(1)} %`;
}

/** Bezpečné nezáporné celé číslo pro počet spotů relace. */
function normalizeCount(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// České popisky dimenzí a skupin (Req 12.3)
// ---------------------------------------------------------------------------

/** Český název dimenze breakdownu (nadpis tabulky). */
const DIM_TITLE: Record<BreakdownDim, string> = {
  context: "Podle kategorie akce",
  position: "Podle pozice",
  bucket: "Podle hloubkového koše",
};

const PROFILE_DIM_TITLE: Record<StatsV2BreakdownDim, string> = {
  gameVariant: "Podle varianty hry",
  tableFormat: "Podle formátu stolu",
  blindSpeed: "Podle rychlosti blindů",
  street: "Podle streety",
  evModel: "Podle modelu",
  ante: "Podle ante",
  rakeMode: "Podle rake režimu",
  rangePackId: "Podle RangePacku",
  position: "Podle pozice",
  bucket: "Podle stacku",
  context: "Podle akčního node",
};

/** Český popisek akčního kontextu (kategorie). */
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
 * Český popisek skupiny pro zobrazení (raw `key` zůstává v `data-group`).
 * Pro `context` přeloží Akční_kontext, pro `bucket` přidá jednotku BB,
 * pro `position` ponechá název pozice beze změny.
 */
const POSTFLOP_DIM_TITLE: Record<PostflopStatsBreakdownDim, string> = {
  street: "Podle streety",
  actionNode: "Podle action node",
  boardTextureKey: "Podle textury boardu",
  strategyPackId: "Podle StrategyPacku",
  confidence: "Podle confidence",
};

function groupLabel(dim: BreakdownDim, key: string): string {
  switch (dim) {
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "position":
      return key;
  }
}

function profileGroupLabel(dim: StatsV2BreakdownDim, key: string): string {
  switch (dim) {
    case "context":
      return CONTEXT_LABEL[key as ActionContext] ?? key;
    case "bucket":
      return `${key} BB`;
    case "ante":
      return key === "ON" ? "Ante zapnuté" : "Ante vypnuté";
    case "evModel":
      return key === "CHIP_EV" ? "chipEV" : key;
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
 * Vytvoří element zobrazující úspěšnost. Při `null` nastaví třídu
 * `.rate--unavailable` a text `"—"` (Req 9.7), jinak text `"<rate> %"`.
 * Vždy nastaví `data-rate` (prázdné při nedostupnosti) pro testovatelnost.
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
// Dílčí sekce
// ---------------------------------------------------------------------------

/** Souhrnná úspěšnost a celkový počet zodpovězených (Req 9.3). */
function renderSummary(summary: Summary): HTMLElement {
  const box = el("section", "dashboard-summary");

  const heading = el("h3", "dashboard-summary__title");
  heading.textContent = "Souhrn";
  box.appendChild(heading);

  const total = el("div", "summary-total");
  total.dataset.total = String(summary.total);
  total.textContent = `Zodpovězeno celkem: ${summary.total}`;
  box.appendChild(total);

  const rateLine = el("div", "summary-rate-line");
  const rateLabel = el("span", "summary-rate-label");
  rateLabel.textContent = "Úspěšnost: ";
  const rate = rateElement("span", "summary-rate", summary.rate);
  rateLine.appendChild(rateLabel);
  rateLine.appendChild(rate);
  box.appendChild(rateLine);

  return box;
}

/** Aktuální streak a počet spotů relace (Req 9.5). */
function renderStreakSession(streak: number, sessionCount: number): HTMLElement {
  const box = el("section", "dashboard-session");

  const heading = el("h3", "dashboard-session__title");
  heading.textContent = "Aktuální relace";
  box.appendChild(heading);

  const streakNode = el("div", "dashboard-streak");
  streakNode.dataset.streak = String(streak);
  streakNode.textContent = `Série správných odpovědí: ${streak}`;
  box.appendChild(streakNode);

  const sessionNode = el("div", "dashboard-session-count");
  sessionNode.dataset.sessionCount = String(sessionCount);
  sessionNode.textContent = `Spotů v této relaci: ${sessionCount}`;
  box.appendChild(sessionNode);

  return box;
}

/** Jeden řádek skupiny breakdownu (Req 9.4, 9.7). */
function renderBreakdownRow(dim: BreakdownDim, g: GroupStat): HTMLElement {
  const row = el("div", "breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "breakdown-row__name");
  name.textContent = groupLabel(dim, g.key);
  row.appendChild(name);

  const count = el("span", "breakdown-row__count");
  count.textContent = `${g.total}\u00d7`; // např. "12×"
  row.appendChild(count);

  // Úspěšnost — prázdná skupina ⇒ "—" (Req 9.7).
  row.appendChild(rateElement("span", "breakdown-row__rate", g.rate));

  return row;
}

/** Jedna rozčleněná tabulka pro zadanou dimenzi (Req 9.4). */
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
    status.textContent = "Export statistik je připravený v poli JSON.";
  });

  importBtn.addEventListener("click", () => {
    const result = importStatsJson(textarea.value, data.store);
    status.hidden = false;
    if (result.ok) {
      data.onPostflopRecordsImported?.(result.postflopRecords);
      renderDashboard({
        ...data,
        postflopRecords: result.postflopRecords,
      }, root);
      const refreshedStatus = root.querySelector<HTMLElement>(".stats-transfer__status");
      if (refreshedStatus) {
        refreshedStatus.hidden = false;
        refreshedStatus.className = "stats-transfer__status stats-transfer__status--ok";
        refreshedStatus.textContent = `Importováno ${result.imported} záznamů statistik.`;
      }
      return;
    }
    status.className = "stats-transfer__status stats-transfer__status--error";
    status.textContent = result.error ?? "Import statistik se nepodařil.";
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
    empty.textContent = "Zatím bez záznamů.";
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
  heading.textContent = "Profilové rozčlenění";
  box.appendChild(heading);

  const eventsV2 = migrateResultRecordsToV2(store.events());
  for (const dim of availableStatsV2Dimensions()) {
    box.appendChild(renderProfileBreakdown(dim, breakdownStatsV2(eventsV2, dim)));
  }

  return box;
}

function renderPostflopBreakdownRow(g: PostflopStatsGroup): HTMLElement {
  const row = el("div", "postflop-breakdown-row");
  row.dataset.group = g.key;
  row.dataset.total = String(g.total);
  row.dataset.rate = g.rate === null ? "" : String(g.rate);

  const name = el("span", "postflop-breakdown-row__name");
  name.textContent = g.key;
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
      rows.appendChild(renderPostflopBreakdownRow(group));
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
// Styly (soběstačné, aby dashboard fungoval i bez externího CSS)
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
// Hlavní vykreslovací funkce (Req 9.3, 9.4, 9.5, 9.7)
// ---------------------------------------------------------------------------

/**
 * Vykreslí dashboard statistik do `root`.
 *
 * Idempotentní: před vykreslením vyprázdní `root`. Čte z `data.store`
 * (`summary`, `breakdownBy`, `currentStreak`) a zobrazí počet spotů relace
 * z `data.sessionCount`. Generuje DOM elementy se sémantickými třídami pro
 * testovatelnost (viz dokumentační blok modulu).
 *
 * @param data Zdroj statistik + počet spotů aktuální relace.
 * @param root Cílový kontejner.
 */
export function renderDashboard(data: DashboardData, root: HTMLElement): void {
  root.innerHTML = "";

  const { store } = data;
  const sessionCount = normalizeCount(data.sessionCount);

  const wrapper = el("div", "dashboard");
  wrapper.appendChild(dashboardStyles());

  // Souhrn (Req 9.3).
  wrapper.appendChild(renderSummary(store.summary()));

  // Streak + počet spotů relace (Req 9.5).
  wrapper.appendChild(renderStreakSession(store.currentStreak(), sessionCount));

  // Export/import JSON statistik (legacy parity gap).
  wrapper.appendChild(renderStatsTransfer(data, root));

  // Profilové rozčlenění nad migrovanými záznamy v2 (multi-format roadmap).
  wrapper.appendChild(renderProfileBreakdowns(store));
  wrapper.appendChild(renderPostflopBreakdowns(data.postflopRecords ?? []));

  // Rozčlenění podle tří dimenzí (Req 9.4, prázdné skupiny Req 9.7).
  const dims: BreakdownDim[] = ["context", "position", "bucket"];
  for (const dim of dims) {
    wrapper.appendChild(renderBreakdown(dim, store.breakdownBy(dim)));
  }

  root.appendChild(wrapper);
}
