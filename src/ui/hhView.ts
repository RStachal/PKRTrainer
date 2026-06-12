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

import type { ActionKey, AnteMode, Card, Spot } from "../core/types";
import { buildImportedFlopTrainingSpot } from "../core/hhPostflopBridge";
import { parseHandHistory, type HHFieldName, type HHResult } from "../core/hhParser";
import type { BoardTexture, PostflopAction, PostflopPotType, PostflopPositionPattern } from "../core/postflopGenerator";
import type { PostflopTrainingSpot } from "../core/postflopTrainingSpot";
import { grade } from "../core/scoring";
import { rangeStore } from "../data/rangeStore";
import { createDefaultPostflopStrategyResolver } from "../data/ranges/postflopStrategyRegistry";
import {
  buildHHPostflopReviewRecord,
  buildHHPreflopReviewRecord,
  type HHReviewRecord,
} from "../persistence/hhReviewStore";
import { renderMatrix } from "./rangeMatrixView";
import { renderTable } from "./tableRenderer";

const POSTFLOP_STRATEGY_RESOLVER = createDefaultPostflopStrategyResolver();

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
  onReviewBuilt?: (records: readonly HHReviewRecord[]) => boolean | void;
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
  title.textContent = "Could not read fields:";
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
      "The hand history was readable, but it is not compatible with the trainer model " +
      "(requires a 9-handed table and 5-150 BB effective depth). No spot was built.";
    setVisible(container, true);
  } else {
    container.textContent = "";
    setVisible(container, false);
  }
}

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

function actionLabel(key: ActionKey | undefined): string {
  return key ? ACTION_LABEL[key] : "Not mapped";
}

const POSTFLOP_ACTION_LABEL: Record<PostflopAction, string> = {
  CHECK: "Check",
  BET_SMALL: "Bet small",
  BET_BIG: "Bet big",
  CALL: "Call",
  RAISE: "Raise",
  FOLD: "Fold",
};

function postflopActionLabel(action: PostflopAction): string {
  return POSTFLOP_ACTION_LABEL[action];
}

function cardLabel(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function potTypeLabel(potType: PostflopPotType): string {
  switch (potType) {
    case "SINGLE_RAISED":
      return "Single-raised pot";
    case "THREE_BET_POT":
      return "3bet pot";
    case "LIMPED_POT":
      return "Limped pot";
  }
}

function positionPatternLabel(pattern: PostflopPositionPattern): string {
  switch (pattern) {
    case "EP_VS_BB":
      return "Early position vs BB (IP)";
    case "BTN_VS_BB":
      return "Button vs BB (IP)";
    case "SB_VS_BB":
      return "Small blind vs BB (OOP)";
    case "OOP_RAISER_VS_IP_CALLER":
      return "OOP raiser vs IP caller";
    case "OOP_CALLER_VS_IP_3BETTOR":
      return "OOP caller vs IP 3bettor";
  }
}

function textureLabel(texture: BoardTexture): string {
  return texture.replace(/-/g, " ");
}

function answerKey(spot: Spot, key: ActionKey): ActionKey | undefined {
  return spot.answers.some((answer) => answer.key === key) ? key : undefined;
}

function firstAnswerKey(spot: Spot, predicate: (key: ActionKey) => boolean): ActionKey | undefined {
  return spot.answers.find((answer) => predicate(answer.key))?.key;
}

function importedActionKey(actions: readonly string[] | undefined, spot: Spot): ActionKey | undefined {
  const raw = actions?.[0]?.toLowerCase() ?? "";
  if (raw.length === 0) return undefined;
  if (raw.startsWith("fold")) return answerKey(spot, "FOLD");
  if (raw.startsWith("check")) return answerKey(spot, "LIMP") ?? answerKey(spot, "CALL");
  if (raw.startsWith("call")) {
    return /all-in/.test(raw)
      ? answerKey(spot, "CALL_JAM") ?? answerKey(spot, "CALL")
      : answerKey(spot, "CALL") ?? answerKey(spot, "CALL_JAM");
  }
  if (!raw.startsWith("raise") && !raw.startsWith("bet")) return undefined;
  if (/all-in/.test(raw)) return answerKey(spot, "JAM") ?? answerKey(spot, "CALL_JAM");

  switch (spot.context) {
    case "RFI":
    case "BVB":
      return firstAnswerKey(spot, (key) => key.startsWith("OPEN_"));
    case "VS_LIMP":
      return firstAnswerKey(spot, (key) => key.startsWith("ISO_"));
    case "VS_OPEN":
      return answerKey(spot, "3BET");
    case "VS_3BET":
      return answerKey(spot, "4BET");
    case "VS_4BET":
    case "PUSH_FOLD":
      return answerKey(spot, "JAM");
    case "SQUEEZE":
      return answerKey(spot, "SQUEEZE");
    case "VS_ALLIN":
      return answerKey(spot, "CALL_JAM");
  }
}

function renderAnalysis(
  doc: Document,
  container: HTMLElement,
  result: HHResult,
  spot: Spot,
): readonly HHReviewRecord[] {
  container.innerHTML = "";
  container.className = "hh-analysis";
  container.dataset.spotId = spot.id;
  const chosen = importedActionKey(result.fields.actions, spot);
  const feedback = chosen ? grade(spot, chosen, "LENIENT") : undefined;
  const importedAt = Date.now();
  const reviewRecords: HHReviewRecord[] = [
    buildHHPreflopReviewRecord(spot, chosen, feedback?.correct, importedAt),
  ];
  container.dataset.reviewSavedToDrillStats = "false";
  if (chosen) container.dataset.chosen = chosen;
  if (feedback) container.dataset.correct = String(feedback.correct);

  const title = el(doc, "h3", "hh-analysis__title");
  title.textContent = "Decision analysis";
  container.appendChild(title);

  const facts = el(doc, "div", "hh-analysis__facts");
  facts.dataset.position = spot.heroPos;
  facts.dataset.hand = spot.hand;
  facts.dataset.stack = String(spot.effStack);
  facts.dataset.context = spot.context;

  const items = [
    ["Position", spot.heroPos],
    ["Hand", spot.hand],
    ["Stack", `${spot.effStack} BB`],
    ["Node", spot.context],
    ["Your action", actionLabel(chosen)],
    ["Result", feedback ? (feedback.correct ? "Accepted" : "Review") : "Not scored"],
    ["Recommended", spot.correctKeys.join(" / ")],
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

  const flopSpot = buildImportedFlopTrainingSpot(result, POSTFLOP_STRATEGY_RESOLVER);
  if (flopSpot) {
    container.appendChild(renderImportedFlopAnalysis(doc, flopSpot));
    reviewRecords.push(buildHHPostflopReviewRecord(flopSpot, importedAt));
  }
  container.dataset.reviewRecordCount = String(reviewRecords.length);
  return reviewRecords;
}

function renderImportedFlopAnalysis(doc: Document, spot: PostflopTrainingSpot): HTMLElement {
  const section = el(doc, "section", "hh-postflop-analysis");
  section.dataset.reviewSavedToDrillStats = "false";
  section.dataset.street = spot.street;
  section.dataset.potType = spot.potType;
  section.dataset.positionPattern = spot.positionPattern;
  section.dataset.recommended = spot.recommendedAction;
  section.dataset.board = spot.board.map(cardLabel).join("-");

  const title = el(doc, "h3", "hh-postflop-analysis__title");
  title.textContent = "Flop review";
  section.appendChild(title);

  const facts = el(doc, "div", "hh-postflop-analysis__facts");
  const items = [
    ["Board", spot.board.map(cardLabel).join(" ")],
    ["Pot", `${potTypeLabel(spot.potType)} | SPR ${spot.spr}`],
    ["Position", positionPatternLabel(spot.positionPattern)],
    ["Texture", spot.boardTextures.map(textureLabel).join(", ")],
    ["Recommended", postflopActionLabel(spot.recommendedAction)],
  ];

  for (const [label, value] of items) {
    const item = el(doc, "div", "hh-postflop-analysis__fact");
    const name = el(doc, "span", "hh-postflop-analysis__fact-name");
    name.textContent = label;
    const text = el(doc, "span", "hh-postflop-analysis__fact-value");
    text.textContent = value;
    item.appendChild(name);
    item.appendChild(text);
    facts.appendChild(item);
  }
  section.appendChild(facts);

  const explanation = el(doc, "p", "hh-postflop-analysis__explanation");
  explanation.textContent = spot.explanation.summary;
  section.appendChild(explanation);

  return section;
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
    const reviewRecords = renderAnalysis(doc, regions.analysis, result, result.spot);
    callbacks?.onReviewBuilt?.(reviewRecords);
    callbacks?.onSpotBuilt?.(result.spot);
  } else {
    // Chyba / nekompatibilita / částečná data: Spot nevykresluj, vyčisti stůl.
    regions.table.innerHTML = "";
    const placeholder = el(doc, "p", "hh-table__placeholder");
    placeholder.textContent = "The table appears after importing a compatible hand history.";
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
.hh-view{font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;color:#e8ecf7;max-width:960px;margin:0 auto;
  background:linear-gradient(180deg,rgba(18,25,38,.98),rgba(10,15,24,.98));
  border:1px solid rgba(148,163,184,.16);border-radius:16px;padding:16px 18px;
  box-shadow:0 24px 70px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);}
.hh-view__title{font-weight:950;font-size:20px;margin:0 0 6px;color:#f8fbff;}
.hh-view__hint{font-size:13px;color:#a8b7d5;margin:0 0 12px;line-height:1.45;}
.hh-view .hh-input{width:100%;min-height:180px;box-sizing:border-box;resize:vertical;
  font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.4;
  padding:11px;border-radius:12px;border:1px solid rgba(148,163,184,.24);
  background:#101827;color:#e8ecf7;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);}
.hh-view .hh-input:focus{outline:2px solid rgba(43,213,118,.42);outline-offset:1px;border-color:#2bd576;}
.hh-view .hh-analyze{margin-top:11px;padding:10px 18px;border-radius:12px;border:0;
  font-weight:950;font-size:14px;cursor:pointer;background:linear-gradient(180deg,#45e58c,#20bd65);
  color:#082817;box-shadow:0 14px 28px rgba(43,213,118,.22),inset 0 1px 0 rgba(255,255,255,.35);}
.hh-view .hh-analyze:hover{filter:brightness(1.05);transform:translateY(-1px);}
.hh-view .hh-errors{margin-top:12px;padding:10px 12px;border-radius:10px;
  background:rgba(226,59,59,.12);border:1px solid rgba(226,59,59,.4);}
.hh-view .hh-error{margin:0 0 6px;font-size:13px;color:#ffb4b4;}
.hh-view .hh-error:last-child{margin-bottom:0;}
.hh-view .hh-unreadable{margin-top:10px;padding:10px 12px;border-radius:10px;
  background:rgba(255,209,91,.12);border:1px solid rgba(255,209,91,.4);font-size:13px;}
.hh-view .hh-unreadable__title{font-weight:700;margin-bottom:4px;}
.hh-view .hh-unreadable__list{margin:0;padding-left:18px;}
.hh-view .hh-incompatible{margin-top:10px;padding:10px 12px;border-radius:10px;
  background:rgba(155,108,240,.14);border:1px solid rgba(155,108,240,.45);
  font-size:13px;color:#d8c7ff;}
.hh-view .hh-table{margin-top:16px;min-height:40px;}
.hh-view .hh-table__placeholder{color:#a8b7d5;}
.hh-view .hh-analysis{margin-top:16px;display:grid;gap:10px;}
.hh-view .hh-analysis__title{margin:0;font-size:16px;font-weight:900;color:#e8ecf7;}
.hh-view .hh-analysis__facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));
  gap:8px;}
.hh-view .hh-analysis__fact{display:grid;gap:2px;padding:9px;border-radius:10px;
  background:rgba(255,255,255,.045);border:1px solid rgba(148,163,184,.14);}
.hh-view .hh-analysis__fact-name{font-size:11px;text-transform:uppercase;color:#9aa6c2;
  font-weight:900;}
.hh-view .hh-analysis__fact-value{font-size:13px;color:#e8ecf7;font-weight:800;
  overflow-wrap:anywhere;}
.hh-view .hh-analysis__explanation{margin:0;font-size:13px;line-height:1.4;color:#d5deef;
  overflow-wrap:anywhere;}
.hh-view .hh-analysis__matrix{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px;
  border:1px solid rgba(148,163,184,.14);background:rgba(6,12,22,.34);padding:8px;}
.hh-view .hh-analysis__matrix .matrix{min-width:560px;}
.hh-view .hh-postflop-analysis{display:grid;gap:10px;padding:11px;border-radius:12px;
  border:1px solid rgba(123,211,255,.18);background:rgba(123,211,255,.06);}
.hh-view .hh-postflop-analysis__title{margin:0;font-size:15px;font-weight:900;color:#e8ecf7;}
.hh-view .hh-postflop-analysis__facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));
  gap:8px;}
.hh-view .hh-postflop-analysis__fact{display:grid;gap:2px;padding:8px;border-radius:9px;
  background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.12);}
.hh-view .hh-postflop-analysis__fact-name{font-size:11px;text-transform:uppercase;color:#9aa6c2;
  font-weight:900;}
.hh-view .hh-postflop-analysis__fact-value{font-size:13px;color:#e8ecf7;font-weight:800;
  overflow-wrap:anywhere;}
.hh-view .hh-postflop-analysis__explanation{margin:0;font-size:13px;line-height:1.4;color:#d5deef;
  overflow-wrap:anywhere;}
@media (max-width:640px){
  .hh-view{max-width:100%;padding:13px 12px;border-radius:14px;}
  .hh-view__title{font-size:18px;}
  .hh-view .hh-input{min-height:220px;}
  .hh-view .hh-analyze{width:100%;min-height:44px;}
  .hh-view .hh-analysis__facts{grid-template-columns:1fr;}
  .hh-view .hh-postflop-analysis__facts{grid-template-columns:1fr;}
  .hh-view .hh-analysis__matrix{margin-left:-2px;margin-right:-2px;}
}
@media (prefers-reduced-motion:reduce){
  .hh-view *,.hh-view *::before,.hh-view *::after{
    transition-duration:.01ms!important;animation-duration:.01ms!important;
    animation-iteration-count:1!important;scroll-behavior:auto!important;}
  .hh-view .hh-analyze:hover{filter:none;transform:none;}
}
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
    "Paste a PokerStars hand history and run analysis. " +
    "Supported model: 9-handed table, 5-150 BB effective depth.";
  wrap.appendChild(hint);

  // Textarea pro vstup (Req 11.2).
  const textarea = doc.createElement("textarea");
  textarea.className = "hh-input";
  textarea.setAttribute("aria-label", "Text hand history");
  textarea.placeholder = "Paste hand history here...";
  wrap.appendChild(textarea);

  // Tlačítko "Analyzovat" (Req 11.2).
  const button = doc.createElement("button");
  button.className = "hh-analyze";
  button.type = "button";
  button.textContent = "Analyze";
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
  placeholder.textContent = "The table appears after importing a compatible hand history.";
  placeholder.style.opacity = "0.7";
  placeholder.style.fontStyle = "italic";
  table.appendChild(placeholder);
  wrap.appendChild(table);

  const analysis = el(doc, "section", "hh-analysis");
  analysis.setAttribute("aria-label", "Imported hand history analysis");
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
        `Unexpected error while processing hand history: ${msg}`,
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
