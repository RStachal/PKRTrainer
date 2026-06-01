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

import type { ActionKey, Spot } from "../core/types";
import { GRID_SIZE, RANKS, handLabel } from "../core/poker";
import type { RangeKey, RangeStore } from "../data/rangeStore";

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
  FOLD: { label: "Fold (složit)", color: "#3a3f4b" },
  CALL: { label: "Call (dorovnat)", color: "#3d7eb8" },
  LIMP: { label: "Limp", color: "#2bb1a8" },
  OVERLIMP: { label: "Over-limp", color: "#1c7d77" },
  OPEN: { label: "Open / RFI (navýšení)", color: "#2bd576" },
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
function renderLegend(doc: Document, used: Set<ActionCategory>): HTMLElement {
  // Fold je vždy přítomen (Req 10.5).
  used.add("FOLD");

  const legend = doc.createElement("div");
  legend.className = "matrix-legend";
  legend.style.display = "flex";
  legend.style.flexWrap = "wrap";
  legend.style.gap = "8px";
  legend.style.marginTop = "10px";

  for (const cat of LEGEND_ORDER) {
    if (!used.has(cat)) continue;
    const def = CATEGORIES[cat];

    const item = doc.createElement("div");
    item.className = "legend-item";
    item.dataset.action = cat;
    item.style.display = "inline-flex";
    item.style.alignItems = "center";
    item.style.gap = "6px";
    item.style.fontSize = "12px";

    const swatch = doc.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.display = "inline-block";
    swatch.style.width = "14px";
    swatch.style.height = "14px";
    swatch.style.borderRadius = "3px";
    swatch.style.background = def.color;

    const text = doc.createElement("span");
    text.textContent = def.label;

    item.appendChild(swatch);
    item.appendChild(text);
    legend.appendChild(item);
  }

  return legend;
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
      renderUnavailable(doc, root, "Data ranges nejsou k dispozici.");
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
        "Pro tento spot nejsou k dispozici data ranges.",
      );
      return;
    }

    root.innerHTML = "";

    const wrap = doc.createElement("div");
    wrap.className = "range-matrix-view";

    // --- Mřížka 13×13 + záhlaví (Req 10.1, 10.4) ---
    const matrix = doc.createElement("div");
    matrix.className = "matrix";
    matrix.style.display = "grid";
    matrix.style.gridTemplateColumns = `repeat(${GRID_SIZE + 1}, 1fr)`;
    matrix.style.gap = "1px";

    // Rohová buňka záhlaví.
    matrix.appendChild(makeHeaderCell(doc, ""));
    // Sloupcová záhlaví (hodnoty karet).
    for (let j = 0; j < GRID_SIZE; j++) {
      matrix.appendChild(makeHeaderCell(doc, RANKS[j]));
    }

    const usedCategories = new Set<ActionCategory>();

    for (let i = 0; i < GRID_SIZE; i++) {
      // Řádkové záhlaví.
      matrix.appendChild(makeHeaderCell(doc, RANKS[i]));

      for (let j = 0; j < GRID_SIZE; j++) {
        const hand = handLabel(i, j); // Req 10.4: pár/suited/offsuit dle (i,j)
        const keys = entry.actions[hand];
        const category = categoryForHand(keys); // Req 10.2
        usedCategories.add(category);

        const cell = doc.createElement("div");
        cell.className = `matrix-cell matrix-cell--${category}`;
        cell.dataset.hand = hand;
        cell.dataset.action = category;
        cell.textContent = hand;
        cell.style.background = CATEGORIES[category].color;
        cell.style.textAlign = "center";
        cell.style.fontSize = "10px";
        cell.style.padding = "2px 0";
        cell.style.color = "#fff";
        cell.style.borderRadius = "2px";

        // Req 10.3: zvýraznění ruky aktuálního spotu — rámeček/outline,
        // odlišitelný od barvení akcí (nikoli pouze barva).
        if (hand === spot.hand) {
          cell.classList.add("matrix-cell--hero");
          cell.style.outline = "3px solid #ffffff";
          cell.style.outlineOffset = "-1px";
          cell.style.fontWeight = "900";
          cell.style.zIndex = "1";
        }

        matrix.appendChild(cell);
      }
    }

    wrap.appendChild(matrix);

    // --- Legenda (Req 10.5) ---
    wrap.appendChild(renderLegend(doc, usedCategories));

    root.appendChild(wrap);
  } catch {
    // Req 10.6: za žádných okolností neprovést pád aplikace.
    renderUnavailable(doc, root, "Range matici se nepodařilo zobrazit.");
  }
}
