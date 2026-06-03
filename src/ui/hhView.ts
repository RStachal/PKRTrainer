/**
 * HH Import View — UI vrstva pro import hand history (Req 11.2, 11.4).
 *
 * Tento modul je tenká UI vrstva nad totálním {@link parseHandHistory}
 * (čisté jádro `core/hhParser.ts`). Poskytuje:
 *
 * - **Textarea** pro vložení textu hand history a **tlačítko "Analyzovat"**,
 *   po jehož stisku se vstup naparsuje (Req 11.2).
 * - **Zobrazení chyb** (`HHResult.errors`) a **nečitelných polí**
 *   (`HHResult.unreadableFields`) v češtině, bez pádu aplikace (Req 11.2).
 * - **Indikaci nekompatibility** (`HHResult.incompatible`) — Spot se nesestaví
 *   a předchozí vykreslený stůl se vyčistí (Req 11.5 z pohledu UI).
 * - **Vykreslení sestaveného Spotu** přes {@link renderTable} do vyhrazeného
 *   kontejneru, pokud parser vrátí `ok = true` se spotem (Req 11.4). Ante pro
 *   render se bere z `HHResult.fields.ante` (výchozí `OFF`).
 *
 * Celá obsluha kliknutí je obalena ochranou proti pádu: i kdyby vykreslení
 * stolu selhalo, view zobrazí chybu místo vyhození výjimky.
 *
 * ## Selektory / kontrakt pro DOM testy (task 18.2)
 *
 * - `.hh-view` — kořenový wrapper vykreslený do `root`.
 * - `.hh-input` — `textarea` pro vstupní text hand history.
 * - `.hh-analyze` — tlačítko spouštějící parsování.
 * - `.hh-errors` — kontejner chybových zpráv (`HHResult.errors`). Skrytý, není-li
 *   žádná chyba.
 * - `.hh-unreadable` — kontejner výpisu nečitelných polí
 *   (`HHResult.unreadableFields`). Skrytý, je-li seznam prázdný.
 * - `.hh-incompatible` — indikace nekompatibility dat s modelem trenažéru.
 *   Skrytá, není-li `HHResult.incompatible`.
 * - `.hh-table` — kontejner, do nějž se vykreslí stůl ({@link renderTable}).
 *   Při chybě / nekompatibilitě je vyprázdněn (Spot se nevykreslí).
 *
 * _Requirements: 11.2, 11.4_
 */

import type { AnteMode, Spot } from "../core/types";
import { parseHandHistory, type HHFieldName, type HHResult } from "../core/hhParser";
import { rangeStore } from "../data/rangeStore";
import { renderMatrix } from "./rangeMatrixView";
import { renderTable } from "./tableRenderer";

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

/** Volitelné zpětné volání HH import view. */
export interface HHViewCallbacks {
  /**
   * Zavolá se po úspěšném sestavení Spotu (Req 11.4), pokud chce volající
   * sestavený Spot dále využít (např. spustit trénink z importované situace).
   */
  onSpotBuilt?: (spot: Spot) => void;
}

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

/** Vytvoří element s volitelnou CSS třídou. */
function el(doc: Document, tag: string, className?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Skryje nebo zobrazí element (přes `display`). */
function setVisible(node: HTMLElement, visible: boolean): void {
  node.style.display = visible ? "" : "none";
}

// ---------------------------------------------------------------------------
// Zobrazení výsledku parsování
// ---------------------------------------------------------------------------

/** Český nadpis sekce nečitelných polí + jejich výčet. */
function renderUnreadable(doc: Document, container: HTMLElement, fields: HHFieldName[]): void {
  container.innerHTML = "";
  if (fields.length === 0) {
    setVisible(container, false);
    return;
  }

  const title = el(doc, "div", "hh-unreadable__title");
  title.textContent = "Nepodařilo se přečíst pole:";
  container.appendChild(title);

  const list = el(doc, "ul", "hh-unreadable__list");
  for (const f of fields) {
    const item = el(doc, "li");
    item.dataset.field = f;
    item.textContent = f;
    list.appendChild(item);
  }
  container.appendChild(list);

  setVisible(container, true);
}

/** Vypíše chybové / informační zprávy parseru (`HHResult.errors`). */
function renderErrors(doc: Document, container: HTMLElement, errors: string[]): void {
  container.innerHTML = "";
  if (errors.length === 0) {
    setVisible(container, false);
    return;
  }

  for (const msg of errors) {
    const line = el(doc, "p", "hh-error");
    line.textContent = msg;
    container.appendChild(line);
  }

  setVisible(container, true);
}

/** Zobrazí / skryje indikaci nekompatibility dat s modelem (Req 11.5). */
function renderIncompatible(container: HTMLElement, incompatible: boolean): void {
  if (incompatible) {
    container.textContent =
      "Data byla přečtena, ale nejsou kompatibilní s modelem trenažéru " +
      "(vyžaduje se 9-handed stůl a efektivní hloubka 5–150 BB). Spot nebyl sestaven.";
    setVisible(container, true);
  } else {
    container.textContent = "";
    setVisible(container, false);
  }
}

function renderAnalysis(doc: Document, container: HTMLElement, spot: Spot): void {
  container.innerHTML = "";
  container.className = "hh-analysis";
  container.dataset.spotId = spot.id;

  const title = el(doc, "h3", "hh-analysis__title");
  title.textContent = "Analýza rozhodnutí";
  container.appendChild(title);

  const facts = el(doc, "div", "hh-analysis__facts");
  facts.dataset.position = spot.heroPos;
  facts.dataset.hand = spot.hand;
  facts.dataset.stack = String(spot.effStack);
  facts.dataset.context = spot.context;

  const items = [
    ["Pozice", spot.heroPos],
    ["Ruka", spot.hand],
    ["Stack", `${spot.effStack} BB`],
    ["Node", spot.context],
    ["Doporučeno", spot.correctKeys.join(" / ")],
  ];

  for (const [label, value] of items) {
    const item = el(doc, "div", "hh-analysis__fact");
    const name = el(doc, "span", "hh-analysis__fact-name");
    name.textContent = label;
    const text = el(doc, "span", "hh-analysis__fact-value");
    text.textContent = value;
    item.appendChild(name);
    item.appendChild(text);
    facts.appendChild(item);
  }
  container.appendChild(facts);

  const explanation = el(doc, "p", "hh-analysis__explanation");
  explanation.textContent = spot.explanation;
  container.appendChild(explanation);

  const matrix = el(doc, "div", "hh-analysis__matrix");
  renderMatrix(spot, rangeStore, matrix);
  container.appendChild(matrix);
}

/**
 * Zpracuje `HHResult` a aktualizuje všechny výstupní oblasti view.
 *
 * - Vykreslí chyby a nečitelná pole vždy (i při úspěchu mohou být prázdné).
 * - Při `ok = true` se spotem vykreslí stůl (Req 11.4) a spustí `onSpotBuilt`.
 * - Při nekompatibilitě nebo chybách stůl vyčistí a Spot nevykreslí.
 */
function applyResult(
  doc: Document,
  result: HHResult,
  regions: {
    errors: HTMLElement;
    unreadable: HTMLElement;
    incompatible: HTMLElement;
    table: HTMLElement;
    analysis: HTMLElement;
  },
  callbacks?: HHViewCallbacks,
): void {
  renderErrors(doc, regions.errors, result.errors);
  renderUnreadable(doc, regions.unreadable, result.unreadableFields);
  renderIncompatible(regions.incompatible, result.incompatible === true);

  if (result.ok && result.spot) {
    // Req 11.4 — kompatibilní data: vykresli Spot do vyhrazeného kontejneru.
    const ante: AnteMode = result.fields.ante ?? "OFF";
    renderTable(result.spot, ante, regions.table);
    renderAnalysis(doc, regions.analysis, result.spot);
    callbacks?.onSpotBuilt?.(result.spot);
  } else {
    // Chyba / nekompatibilita / částečná data: Spot nevykresluj, vyčisti stůl.
    regions.table.innerHTML = "";
    const placeholder = el(doc, "p", "hh-table__placeholder");
    placeholder.textContent = "Stůl se zobrazí po úspěšném importu kompatibilní hand history.";
    placeholder.style.opacity = "0.7";
    placeholder.style.fontStyle = "italic";
    regions.table.appendChild(placeholder);
    regions.analysis.innerHTML = "";
    regions.analysis.removeAttribute("data-spot-id");
  }
}

// ---------------------------------------------------------------------------
// Minimální vložené styly (soběstačnost bez externího CSS)
// ---------------------------------------------------------------------------

function viewStyles(doc: Document): HTMLStyleElement {
  const style = doc.createElement("style");
  style.textContent = `
.hh-view{font-family:system-ui,Arial,sans-serif;color:#e8ecf7;max-width:760px;margin:0 auto;}
.hh-view__title{font-weight:800;font-size:18px;margin:0 0 6px;}
.hh-view__hint{font-size:13px;color:#9aa6c2;margin:0 0 10px;}
.hh-view .hh-input{width:100%;min-height:180px;box-sizing:border-box;resize:vertical;
  font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.4;
  padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);
  background:#11151f;color:#e8ecf7;}
.hh-view .hh-analyze{margin-top:10px;padding:8px 18px;border-radius:8px;border:0;
  font-weight:800;font-size:14px;cursor:pointer;background:#2bd576;color:#0c3526;}
.hh-view .hh-analyze:hover{filter:brightness(1.05);}
.hh-view .hh-errors{margin-top:12px;padding:10px 12px;border-radius:8px;
  background:rgba(226,59,59,.12);border:1px solid rgba(226,59,59,.4);}
.hh-view .hh-error{margin:0 0 6px;font-size:13px;color:#ffb4b4;}
.hh-view .hh-error:last-child{margin-bottom:0;}
.hh-view .hh-unreadable{margin-top:10px;padding:10px 12px;border-radius:8px;
  background:rgba(255,209,91,.12);border:1px solid rgba(255,209,91,.4);font-size:13px;}
.hh-view .hh-unreadable__title{font-weight:700;margin-bottom:4px;}
.hh-view .hh-unreadable__list{margin:0;padding-left:18px;}
.hh-view .hh-incompatible{margin-top:10px;padding:10px 12px;border-radius:8px;
  background:rgba(155,108,240,.14);border:1px solid rgba(155,108,240,.45);
  font-size:13px;color:#d8c7ff;}
.hh-view .hh-table{margin-top:16px;min-height:40px;}
.hh-view .hh-analysis{margin-top:16px;display:grid;gap:10px;}
.hh-view .hh-analysis__title{margin:0;font-size:16px;font-weight:900;color:#e8ecf7;}
.hh-view .hh-analysis__facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));
  gap:8px;}
.hh-view .hh-analysis__fact{display:grid;gap:2px;padding:8px;border-radius:8px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);}
.hh-view .hh-analysis__fact-name{font-size:11px;text-transform:uppercase;color:#9aa6c2;
  font-weight:800;}
.hh-view .hh-analysis__fact-value{font-size:13px;color:#e8ecf7;font-weight:800;
  overflow-wrap:anywhere;}
.hh-view .hh-analysis__explanation{margin:0;font-size:13px;line-height:1.4;color:#d5deef;
  overflow-wrap:anywhere;}
.hh-view .hh-analysis__matrix{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.hh-view .hh-analysis__matrix .matrix{min-width:560px;}
`;
  return style;
}

// ---------------------------------------------------------------------------
// Hlavní vykreslení (Req 11.2, 11.4)
// ---------------------------------------------------------------------------

/**
 * Vykreslí HH import view do `root`.
 *
 * Idempotentní: před vykreslením `root` vyprázdní. Sestaví statickou strukturu
 * (textarea + tlačítko + oblasti výsledků + kontejner stolu) a na tlačítko
 * "Analyzovat" naváže obsluhu, která zavolá {@link parseHandHistory} a podle
 * výsledku buď vykreslí stůl ({@link renderTable}), nebo zobrazí chyby /
 * nečitelná pole / indikaci nekompatibility (Req 11.2). Spot se vykresluje jen
 * pro kompatibilní úplná data (Req 11.4).
 *
 * Obsluha kliknutí je odolná proti pádu: parser je totální a navíc je celé
 * zpracování obaleno `try/catch`, takže výjimka při vykreslování nikdy
 * neshodí view.
 *
 * @param root Cílový kontejner (bude vyprázdněn).
 * @param callbacks Volitelná zpětná volání (např. `onSpotBuilt`).
 */
export function renderHHView(root: HTMLElement, callbacks?: HHViewCallbacks): void {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = el(doc, "div", "hh-view");
  wrap.appendChild(viewStyles(doc));

  // Nadpis a nápověda.
  const title = el(doc, "h2", "hh-view__title");
  title.textContent = "Import hand history";
  wrap.appendChild(title);

  const hint = el(doc, "p", "hh-view__hint");
  hint.textContent =
    "Vložte text rozdání (formát PokerStars) a klikněte na Analyzovat. " +
    "Podporován je 9-handed stůl s efektivní hloubkou 5–150 BB.";
  wrap.appendChild(hint);

  // Textarea pro vstup (Req 11.2).
  const textarea = doc.createElement("textarea");
  textarea.className = "hh-input";
  textarea.setAttribute("aria-label", "Text hand history");
  textarea.placeholder = "Sem vložte hand history…";
  wrap.appendChild(textarea);

  // Tlačítko "Analyzovat" (Req 11.2).
  const button = doc.createElement("button");
  button.className = "hh-analyze";
  button.type = "button";
  button.textContent = "Analyzovat";
  wrap.appendChild(button);

  // Výstupní oblasti.
  const errors = el(doc, "div", "hh-errors");
  errors.setAttribute("role", "alert");
  setVisible(errors, false);
  wrap.appendChild(errors);

  const unreadable = el(doc, "div", "hh-unreadable");
  unreadable.setAttribute("role", "status");
  setVisible(unreadable, false);
  wrap.appendChild(unreadable);

  const incompatible = el(doc, "div", "hh-incompatible");
  incompatible.setAttribute("role", "status");
  setVisible(incompatible, false);
  wrap.appendChild(incompatible);

  // Kontejner stolu (Req 11.4) + výchozí placeholder.
  const table = el(doc, "div", "hh-table");
  const placeholder = el(doc, "p", "hh-table__placeholder");
  placeholder.textContent = "Stůl se zobrazí po úspěšném importu kompatibilní hand history.";
  placeholder.style.opacity = "0.7";
  placeholder.style.fontStyle = "italic";
  table.appendChild(placeholder);
  wrap.appendChild(table);

  const analysis = el(doc, "section", "hh-analysis");
  analysis.setAttribute("aria-label", "Analýza importované hand history");
  wrap.appendChild(analysis);

  const regions = { errors, unreadable, incompatible, table, analysis };

  // Obsluha kliknutí — totální parser + ochrana proti pádu při vykreslování.
  button.addEventListener("click", () => {
    try {
      const result = parseHandHistory(textarea.value);
      applyResult(doc, result, regions, callbacks);
    } catch (err) {
      // Pojistka: parser je totální, ale ani neočekávaná chyba při vykreslování
      // nesmí shodit view (Req 11.2 — bez pádu aplikace).
      const msg = err instanceof Error ? err.message : String(err);
      renderErrors(doc, regions.errors, [
        `Při zpracování hand history došlo k neočekávané chybě: ${msg}`,
      ]);
      renderUnreadable(doc, regions.unreadable, []);
      renderIncompatible(regions.incompatible, false);
      regions.table.innerHTML = "";
      regions.analysis.innerHTML = "";
      regions.analysis.removeAttribute("data-spot-id");
    }
  });

  root.appendChild(wrap);
}
