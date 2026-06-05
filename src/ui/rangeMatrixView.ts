/**
 * Range_Matrix_View — vizualizace doporučené range v mřížce 13×13.
 *
 * Tento modul je UI vrstva (DOM I/O). Vykreslí všech 169 tříd startovních rukou
 * (Req 10.1) ve standardním rozložení (páry na diagonále, suited nad, offsuit
 * pod — Req 10.4, zajišťuje `handLabel`/`buildHandGrid` z `core/poker.ts`),
 * obarví každé pole podle doporučeného Akčního_klíče z Range_Store (Req 10.2),
 * zvýrazní pole konkrétní ruky aktuálního spotu rámečkem odlišitelným od barvení
 * (Req 10.3), zobrazí legendu mapující vizuální kategorie na Akční_klíče včetně
 * foldu (Req 10.5) a při nedostupnosti dat zobrazí indikaci bez pádu (Req 10.6).
 *
 * ## Selektory / data-atributy (kontrakt pro DOM testy 15.4)
 *
 * - `.range-matrix-view` — kořenový wrapper vykreslený do `root`.
 * - `.matrix` — kontejner mřížky (CSS grid 14×14 vč. záhlaví).
 * - `.matrix-header` — buňky záhlaví (rohová + řádkové/sloupcové hodnoty); NEMAJÍ
 *   třídu `.matrix-cell`, takže `.matrix-cell` je přesně 169.
 * - `.matrix-cell` — právě 169 polí tříd rukou. Každé nese:
 *     - `data-hand` = `HandLabel` (např. `"AKs"`, `"77"`, `"T9o"`),
 *     - `data-action` = id vizuální kategorie (např. `"OPEN"`, `"3BET"`, `"FOLD"`).
 * - `.matrix-cell--hero` — právě 1 pole odpovídající `spot.hand` (Req 10.3),
 *   zvýrazněné rámečkem/outline (ne pouze barvou).
 * - `.matrix-cell--<category>` — vizuální kategorie pole (např. `.matrix-cell--FOLD`).
 * - `.matrix-legend` — kontejner legendy (Req 10.5).
 * - `.legend-item` — jedna položka legendy; nese `data-action` = id kategorie.
 * - `.legend-swatch` — barevný čtvereček položky legendy.
 * - `.matrix-unavailable` — indikace nedostupnosti dat (Req 10.6); vykreslena
 *   místo mřížky, když `!store.isLoaded()` nebo `lookup` vrátí `undefined`.
 *
 * ## Mapování Akční_klíč → vizuální kategorie (barva)
 *
 * Sizingové varianty se slučují do jedné kategorie (různé barvy mezi kategoriemi,
 * fold odlišen od všech akcí — Req 10.2):
 *
 *   FOLD                       → FOLD      (šedá)
 *   CALL                       → CALL      (modrá)
 *   LIMP                       → LIMP      (tyrkysová)
 *   OVERLIMP                   → OVERLIMP  (tmavě tyrkysová)
 *   OPEN_2X / OPEN_25X / OPEN_3X → OPEN    (zelená)
 *   ISO_2X / ISO_25X / ISO_3X  → ISO       (světle zelená)
 *   3BET                       → 3BET      (oranžová)
 *   SQUEEZE                    → SQUEEZE   (fialová)
 *   4BET                       → 4BET      (cihlová)
 *   JAM                        → JAM       (červená)
 *   CALL_JAM                   → CALL_JAM  (tmavě modrá)
 *
 * Má-li ruka více doporučených klíčů (LENIENT množina), vybere se kategorie
 * podle priority agresivity (viz `CATEGORY_PRIORITY`). Ruka bez klíče = FOLD.
 *
 * _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
 */

import type { ActionKey, HandLabel, Spot } from "../core/types";
import { GRID_SIZE, RANKS, handLabel } from "../core/poker";
import type { RangeEntry, RangeKey, RangeStore } from "../data/rangeStore";

// ---------------------------------------------------------------------------
// Vizuální kategorie
// ---------------------------------------------------------------------------

/** Id vizuální kategorie pole mřížky (slučuje sizingové varianty). */
export type ActionCategory =
  | "FOLD"
  | "CALL"
  | "LIMP"
  | "OVERLIMP"
  | "OPEN"
  | "ISO"
  | "3BET"
  | "SQUEEZE"
  | "4BET"
  | "JAM"
  | "CALL_JAM";

/** Definice kategorie: český popisek (legenda) + barva pozadí pole. */
interface CategoryDef {
  /** Český text pro legendu (Req 12.3). */
  label: string;
  /** Barva pozadí pole (inline, aby modul byl soběstačný bez externího CSS). */
  color: string;
}

/**
 * Mapa kategorií na popisek + barvu. Fold je záměrně neutrální (šedá) a
 * vizuálně odlišený od všech akčních kategorií (Req 10.2).
 */
const CATEGORIES: Record<ActionCategory, CategoryDef> = {
  FOLD: { label: "Fold", color: "#3a3f4b" },
  CALL: { label: "Call", color: "#3d7eb8" },
  LIMP: { label: "Limp", color: "#2bb1a8" },
  OVERLIMP: { label: "Over-limp", color: "#1c7d77" },
  OPEN: { label: "Open / RFI", color: "#2bd576" },
  ISO: { label: "Iso-raise", color: "#7bd86a" },
  "3BET": { label: "3bet", color: "#f0922b" },
  SQUEEZE: { label: "Squeeze", color: "#9b6cf0" },
  "4BET": { label: "4bet", color: "#d9512b" },
  JAM: { label: "All-in (jam)", color: "#e23b3b" },
  CALL_JAM: { label: "Call all-in", color: "#274b9b" },
};

/**
 * Priorita kategorií pro výběr zobrazené barvy, má-li ruka více doporučených
 * klíčů. Vyšší číslo = agresivnější akce, vybírá se přednostně.
 */
const CATEGORY_PRIORITY: Record<ActionCategory, number> = {
  JAM: 10,
  CALL_JAM: 9,
  "4BET": 8,
  SQUEEZE: 7,
  "3BET": 6,
  ISO: 5,
  OPEN: 4,
  OVERLIMP: 3,
  LIMP: 2,
  CALL: 1,
  FOLD: 0,
};

/** Pořadí kategorií v legendě (fold první, pak dle logiky akcí). */
const LEGEND_ORDER: ActionCategory[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN",
  "ISO",
  "3BET",
  "SQUEEZE",
  "4BET",
  "JAM",
  "CALL_JAM",
];

type CategoryCounts = Partial<Record<ActionCategory, number>>;

const ACTION_LABEL: Record<ActionKey, string> = {
  FOLD: "Fold",
  CALL: "Call",
  LIMP: "Limp / Check",
  OVERLIMP: "Over-limp",
  OPEN_2X: "Raise 2x",
  OPEN_25X: "Raise 2.5x",
  OPEN_3X: "Raise 3x",
  ISO_2X: "Iso-raise 2x",
  ISO_25X: "Iso-raise 2.5x",
  ISO_3X: "Iso-raise 3x",
  "3BET": "3-bet",
  "4BET": "4-bet",
  SQUEEZE: "Squeeze",
  JAM: "All-in",
  CALL_JAM: "Call all-in",
};

// ---------------------------------------------------------------------------
// Kategorizace Akčních_klíčů
// ---------------------------------------------------------------------------

/**
 * Převede Akční_klíč na vizuální kategorii (slučuje sizingové varianty
 * `OPEN_*` → `OPEN`, `ISO_*` → `ISO`).
 */
export function categoryForActionKey(key: ActionKey): ActionCategory {
  switch (key) {
    case "OPEN_2X":
    case "OPEN_25X":
    case "OPEN_3X":
      return "OPEN";
    case "ISO_2X":
    case "ISO_25X":
    case "ISO_3X":
      return "ISO";
    case "CALL":
      return "CALL";
    case "LIMP":
      return "LIMP";
    case "OVERLIMP":
      return "OVERLIMP";
    case "3BET":
      return "3BET";
    case "SQUEEZE":
      return "SQUEEZE";
    case "4BET":
      return "4BET";
    case "JAM":
      return "JAM";
    case "CALL_JAM":
      return "CALL_JAM";
    case "FOLD":
    default:
      return "FOLD";
  }
}

/**
 * Vybere vizuální kategorii pole z množiny doporučených Akčních_klíčů ruky.
 * Prázdná množina ⇒ FOLD (ruka bez doporučené akce, Req 10.2). Při více klíčích
 * se vybere kategorie s nejvyšší prioritou agresivity.
 */
export function categoryForHand(keys: ActionKey[] | undefined): ActionCategory {
  if (!keys || keys.length === 0) return "FOLD";
  let best: ActionCategory = "FOLD";
  for (const key of keys) {
    const cat = categoryForActionKey(key);
    if (CATEGORY_PRIORITY[cat] > CATEGORY_PRIORITY[best]) best = cat;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pomocné vykreslovací funkce
// ---------------------------------------------------------------------------

/** Vytvoří buňku záhlaví (rohová nebo s hodnotou karty). */
function makeHeaderCell(doc: Document, text: string): HTMLElement {
  const el = doc.createElement("div");
  el.className = "matrix-header";
  el.textContent = text;
  el.style.fontWeight = "700";
  el.style.textAlign = "center";
  el.style.opacity = "0.7";
  el.style.fontSize = "11px";
  el.style.minHeight = "22px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  return el;
}

/** Vykreslí indikaci nedostupnosti dat (Req 10.6) bez pádu. */
function renderUnavailable(doc: Document, root: HTMLElement, message: string): void {
  root.innerHTML = "";
  const wrap = doc.createElement("div");
  wrap.className = "range-matrix-view";

  const notice = doc.createElement("div");
  notice.className = "matrix-unavailable";
  notice.setAttribute("role", "status");
  notice.textContent = message;
  notice.style.padding = "16px";
  notice.style.textAlign = "center";
  notice.style.color = "#ffd15b";

  wrap.appendChild(notice);
  root.appendChild(wrap);
}

/** Vykreslí legendu pro množinu použitých kategorií (fold vždy zahrnut). */
function renderLegend(
  doc: Document,
  used: Set<ActionCategory>,
  counts: CategoryCounts,
  matrix: HTMLElement,
): HTMLElement {
  // Fold je vždy přítomen (Req 10.5).
  used.add("FOLD");

  const legend = doc.createElement("div");
  legend.className = "matrix-legend";
  legend.style.display = "flex";
  legend.style.flexWrap = "wrap";
  legend.style.gap = "8px";
  legend.style.marginTop = "10px";
  let activeCategory: ActionCategory | null = null;

  for (const cat of LEGEND_ORDER) {
    if (!used.has(cat)) continue;
    const def = CATEGORIES[cat];

    const item = doc.createElement("div");
    item.className = "legend-item";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-pressed", "false");
    item.setAttribute("aria-label", `Show only ${def.label} hands`);
    item.dataset.action = cat;
    item.dataset.count = String(counts[cat] ?? 0);
    item.dataset.share = categoryShare(counts[cat] ?? 0);
    item.style.display = "inline-flex";
    item.style.alignItems = "center";
    item.style.gap = "6px";
    item.style.fontSize = "11px";
    item.style.fontWeight = "850";
    item.style.color = "#dce5f8";
    item.style.border = "1px solid rgba(255,255,255,.1)";
    item.style.borderRadius = "999px";
    item.style.background = "rgba(255,255,255,.045)";
    item.style.padding = "5px 7px";
    item.style.cursor = "pointer";

    const swatch = doc.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.display = "inline-block";
    swatch.style.width = "14px";
    swatch.style.height = "14px";
    swatch.style.borderRadius = "3px";
    swatch.style.background = def.color;

    const text = doc.createElement("span");
    text.textContent = def.label;

    const count = doc.createElement("span");
    count.className = "legend-count";
    count.textContent = `${counts[cat] ?? 0}/169 (${categoryShare(counts[cat] ?? 0)})`;
    count.style.color = "#9fb2d5";
    count.style.fontSize = "10px";
    count.style.fontWeight = "900";

    item.appendChild(swatch);
    item.appendChild(text);
    item.appendChild(count);
    item.addEventListener("click", () => {
      activeCategory = activeCategory === cat ? null : cat;
      applyLegendFilter(legend, matrix, activeCategory);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      item.click();
    });
    legend.appendChild(item);
  }

  return legend;
}

function applyLegendFilter(
  legend: HTMLElement,
  matrix: HTMLElement,
  activeCategory: ActionCategory | null,
): void {
  legend.querySelectorAll<HTMLElement>(".legend-item").forEach((item) => {
    const active = item.dataset.action === activeCategory;
    item.classList.toggle("legend-item--active", active);
    item.setAttribute("aria-pressed", active ? "true" : "false");
    item.style.borderColor = active ? "rgba(43,213,118,.75)" : "rgba(255,255,255,.1)";
    item.style.background = active ? "rgba(43,213,118,.14)" : "rgba(255,255,255,.045)";
  });

  matrix.querySelectorAll<HTMLElement>(".matrix-cell").forEach((cell) => {
    const muted = activeCategory !== null && cell.dataset.action !== activeCategory;
    cell.classList.toggle("matrix-cell--muted", muted);
    cell.style.opacity = muted ? ".24" : "";
    cell.style.filter = cell.classList.contains("matrix-cell--selected")
      ? "brightness(1.12)"
      : (muted ? "saturate(.55) contrast(.82)" : "");
  });
}

function categoryShare(count: number): string {
  return `${Math.round((count / (GRID_SIZE * GRID_SIZE)) * 100)}%`;
}

function actionListLabel(keys: readonly ActionKey[] | undefined): string {
  if (!keys || keys.length === 0) return "Fold";
  return keys.map((key) => ACTION_LABEL[key] ?? key).join(" / ");
}

function detailPanel(doc: Document): HTMLElement {
  const detail = doc.createElement("div");
  detail.className = "matrix-cell-detail";
  detail.hidden = true;
  detail.setAttribute("role", "status");
  detail.setAttribute("tabindex", "-1");
  detail.style.marginTop = "10px";
  detail.style.border = "1px solid rgba(123,211,255,.24)";
  detail.style.borderRadius = "10px";
  detail.style.background = "linear-gradient(180deg,rgba(123,211,255,.08),rgba(43,213,118,.05))";
  detail.style.padding = "10px 12px";
  detail.style.fontSize = "12px";
  detail.style.fontWeight = "850";
  detail.style.lineHeight = "1.4";
  detail.style.overflowWrap = "anywhere";
  return detail;
}

function renderDetailLine(doc: Document, label: string, value: string): HTMLElement {
  const line = doc.createElement("div");
  line.className = "matrix-cell-detail__line";
  line.style.display = "flex";
  line.style.gap = "8px";
  line.style.justifyContent = "space-between";
  line.style.borderTop = "1px solid rgba(255,255,255,.08)";
  line.style.paddingTop = "6px";
  line.style.marginTop = "6px";

  const labelEl = doc.createElement("span");
  labelEl.className = "matrix-cell-detail__label";
  labelEl.textContent = label;
  labelEl.style.color = "#9fb2d5";
  labelEl.style.textTransform = "uppercase";
  labelEl.style.fontSize = "10px";
  labelEl.style.fontWeight = "950";

  const valueEl = doc.createElement("span");
  valueEl.className = "matrix-cell-detail__value";
  valueEl.textContent = value;
  valueEl.style.color = "#f4f7ff";
  valueEl.style.textAlign = "right";

  line.appendChild(labelEl);
  line.appendChild(valueEl);
  return line;
}

function showCellDetail(
  matrix: HTMLElement,
  detail: HTMLElement,
  entry: RangeEntry,
  hand: HandLabel,
  category: ActionCategory,
  hero: boolean,
): void {
  matrix.querySelectorAll<HTMLElement>(".matrix-cell--selected").forEach((cell) => {
    cell.classList.remove("matrix-cell--selected");
    cell.style.filter = "";
  });

  const selected = matrix.querySelector<HTMLElement>(`.matrix-cell[data-hand="${hand}"]`);
  if (selected) {
    selected.classList.add("matrix-cell--selected");
    selected.style.filter = "brightness(1.12)";
  }

  const doc = detail.ownerDocument ?? document;
  detail.hidden = false;
  detail.dataset.hand = hand;
  detail.dataset.action = category;
  detail.innerHTML = "";

  const title = doc.createElement("div");
  title.className = "matrix-cell-detail__title";
  title.textContent = `${hand}${hero ? " - hero hand" : ""}`;
  title.style.fontSize = "13px";
  title.style.fontWeight = "950";
  title.style.color = "#f8fbff";
  detail.appendChild(title);

  detail.appendChild(renderDetailLine(doc, "Range class", CATEGORIES[category].label));
  detail.appendChild(renderDetailLine(doc, "Strict action", actionListLabel(entry.strict[hand])));
  detail.appendChild(renderDetailLine(doc, "Lenient actions", actionListLabel(entry.actions[hand])));
  detail.focus();
}

// ---------------------------------------------------------------------------
// Hlavní vykreslení (Req 10)
// ---------------------------------------------------------------------------

/**
 * Vykreslí Range_Matrix_View pro daný spot do `root`.
 *
 * Postup: vyčistí `root`, dohledá záznam ranges pro klíč spotu
 * (`position=spot.heroPos`, `bucket=spot.effStack`, `context=spot.context`,
 * `ante=spot.ante`). Pokud data nejsou načtena jako celek (`!isLoaded()`) nebo
 * pro spot neexistuje záznam (`lookup === undefined`), zobrazí indikaci
 * nedostupnosti (Req 10.6). Jinak vykreslí mřížku 13×13 obarvenou podle
 * doporučených akcí, zvýrazní ruku spotu a doplní legendu.
 *
 * Celá funkce je obalena ochranou proti pádu (Req 10.6): jakákoli neočekávaná
 * chyba vyústí v indikaci nedostupnosti, nikoli ve výjimku ven.
 *
 * @param spot Aktuální tréninkový spot (zdroj klíče i zvýrazněné ruky).
 * @param store Range_Store pro lookup doporučených akcí.
 * @param root Kořenový element, do nějž se vykresluje (bude vyprázdněn).
 */
export function renderMatrix(spot: Spot, store: RangeStore, root: HTMLElement): void {
  const doc = root.ownerDocument ?? document;

  try {
    // Req 10.6: data nejsou konzistentně načtena jako celek.
    if (!store.isLoaded()) {
      renderUnavailable(doc, root, "Range data is not available.");
      return;
    }

    const key: RangeKey = {
      position: spot.heroPos,
      bucket: spot.effStack,
      context: spot.context,
      ante: spot.ante,
    };

    const entry = store.lookup(key);

    // Req 10.6: pro daný spot nejsou dostupná data ranges.
    if (entry === undefined) {
      renderUnavailable(
        doc,
        root,
        "Range data is not available for this spot.",
      );
      return;
    }

    root.innerHTML = "";

    const wrap = doc.createElement("div");
    wrap.className = "range-matrix-view";
    wrap.dataset.heroHand = spot.hand;
    wrap.style.border = "1px solid rgba(123,211,255,.18)";
    wrap.style.borderRadius = "12px";
    wrap.style.background = "linear-gradient(180deg,rgba(12,20,32,.94),rgba(8,13,22,.96))";
    wrap.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,.06),0 18px 40px rgba(0,0,0,.22)";
    wrap.style.padding = "12px";
    wrap.style.color = "#e8ecf7";

    const header = doc.createElement("div");
    header.className = "range-matrix-header";
    header.style.display = "flex";
    header.style.alignItems = "flex-start";
    header.style.justifyContent = "space-between";
    header.style.gap = "12px";
    header.style.marginBottom = "8px";

    const title = doc.createElement("div");
    title.className = "range-matrix-title";
    title.textContent = "Preflop range matrix";
    title.style.fontSize = "12px";
    title.style.fontWeight = "950";
    title.style.textTransform = "uppercase";
    title.style.color = "#f4f7ff";

    const meta = doc.createElement("div");
    meta.className = "range-matrix-meta";
    meta.textContent = `${spot.context} | ${spot.heroPos} | ${spot.effStack} BB | Hero ${spot.hand}`;
    meta.style.fontSize = "11px";
    meta.style.fontWeight = "850";
    meta.style.color = "#b9cff4";
    meta.style.textAlign = "right";

    header.appendChild(title);
    header.appendChild(meta);
    wrap.appendChild(header);

    // --- Mřížka 13×13 + záhlaví (Req 10.1, 10.4) ---
    const matrix = doc.createElement("div");
    matrix.className = "matrix";
    matrix.style.display = "grid";
    matrix.style.gridTemplateColumns = `repeat(${GRID_SIZE + 1}, 1fr)`;
    matrix.style.gap = "2px";
    matrix.style.padding = "5px";
    matrix.style.borderRadius = "10px";
    matrix.style.background = "rgba(2,7,13,.42)";
    matrix.style.border = "1px solid rgba(255,255,255,.08)";

    // Rohová buňka záhlaví.
    matrix.appendChild(makeHeaderCell(doc, ""));
    // Sloupcová záhlaví (hodnoty karet).
    for (let j = 0; j < GRID_SIZE; j++) {
      matrix.appendChild(makeHeaderCell(doc, RANKS[j]));
    }

    const usedCategories = new Set<ActionCategory>();
    const counts: CategoryCounts = {};
    const cellDetail = detailPanel(doc);

    for (let i = 0; i < GRID_SIZE; i++) {
      // Řádkové záhlaví.
      matrix.appendChild(makeHeaderCell(doc, RANKS[i]));

      for (let j = 0; j < GRID_SIZE; j++) {
        const hand = handLabel(i, j); // Req 10.4: pár/suited/offsuit dle (i,j)
        const keys = entry.actions[hand];
        const category = categoryForHand(keys); // Req 10.2
        usedCategories.add(category);
        counts[category] = (counts[category] ?? 0) + 1;

        const cell = doc.createElement("div");
        cell.className = `matrix-cell matrix-cell--${category}`;
        cell.dataset.hand = hand;
        cell.dataset.action = category;
        cell.setAttribute("role", "button");
        cell.setAttribute("tabindex", "0");
        cell.setAttribute(
          "aria-label",
          `${hand}: ${CATEGORIES[category].label}; show strict and lenient actions`,
        );
        cell.textContent = hand;
        cell.style.background = CATEGORIES[category].color;
        cell.style.textAlign = "center";
        cell.style.fontSize = "10px";
        cell.style.minHeight = "28px";
        cell.style.padding = "2px 0";
        cell.style.color = "#fff";
        cell.style.borderRadius = "5px";
        cell.style.border = "1px solid rgba(255,255,255,.16)";
        cell.style.boxSizing = "border-box";
        cell.style.textShadow = "0 1px 1px rgba(0,0,0,.55)";
        cell.style.boxShadow =
          "inset 0 1px 0 rgba(255,255,255,.18),inset 0 -10px 18px rgba(0,0,0,.16)";
        cell.style.fontWeight = "900";
        cell.style.cursor = "pointer";

        // Req 10.3: zvýraznění ruky aktuálního spotu — rámeček/outline,
        // odlišitelný od barvení akcí (nikoli pouze barva).
        if (hand === spot.hand) {
          cell.classList.add("matrix-cell--hero");
          cell.style.outline = "3px solid #ffffff";
          cell.style.outlineOffset = "-2px";
          cell.style.boxShadow =
            "0 0 0 2px rgba(43,213,118,.7),0 0 18px rgba(43,213,118,.42)";
          cell.style.zIndex = "1";
        }

        cell.addEventListener("click", () => {
          showCellDetail(matrix, cellDetail, entry, hand, category, hand === spot.hand);
        });
        cell.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          cell.click();
        });

        matrix.appendChild(cell);
      }
    }

    wrap.appendChild(matrix);

    // --- Legenda (Req 10.5) ---
    wrap.appendChild(renderLegend(doc, usedCategories, counts, matrix));
    wrap.appendChild(cellDetail);

    root.appendChild(wrap);
  } catch {
    // Req 10.6: za žádných okolností neprovést pád aplikace.
    renderUnavailable(doc, root, "Range matrix could not be displayed.");
  }
}
