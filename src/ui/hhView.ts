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
import { buildImportedPostflopTrainingSpots } from "../core/hhPostflopBridge";
import {
  parseHandHistory,
  type HHFieldName,
  type HHParseOptions,
  type HHResult,
} from "../core/hhParser";
import type {
  BoardTexture,
  PostflopAction,
  PostflopPotType,
  PostflopStrategyResolver,
} from "../core/postflopGenerator";
import {
  PostflopStrategyUnavailableError,
  positionPatternLabel,
} from "../core/postflopGenerator";
import type { PostflopTrainingSpot } from "../core/postflopTrainingSpot";
import { positionsForFormat } from "../core/trainingProfile";
import { grade } from "../core/scoring";
import { buildPreflopExplanationForSpot } from "../core/preflopExplanation";
import { rangeStore } from "../data/rangeStore";
import type { RangeStore } from "../data/rangeStore";
import { createDefaultPostflopStrategyResolver } from "../data/ranges/postflopStrategyRegistry";
import {
  buildHHPostflopReviewRecord,
  buildHHPreflopReviewRecord,
  type HHReviewRecord,
} from "../persistence/hhReviewStore";
import { renderMatrix } from "./rangeMatrixView";
import { renderTable } from "./tableRenderer";
import { CS, getAppLanguage, localizedText } from "./cs";

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
  postflopStrategyResolver?: PostflopStrategyResolver;
  postflopAllowFallback?: boolean;
  postflopProfileGuard?: (result: HHResult) => string | null;
  parseOptions?: () => HHParseOptions;
  beforeAnalyze?: () => Promise<void>;
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
  title.textContent = CS.hh.unreadableTitle;
  container.appendChild(title);

  const list = el(doc, "ul", "hh-unreadable__list");
  for (const f of fields) {
    const item = el(doc, "li");
    item.dataset.field = f;
    item.textContent = CS.hh.fields[f];
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
    container.textContent = CS.hh.incompatible;
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
  return key ? ACTION_LABEL[key] : CS.hh.results.notMapped;
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
  strategyResolver: PostflopStrategyResolver = POSTFLOP_STRATEGY_RESOLVER,
  allowFallback = true,
  profileGuard?: (result: HHResult) => string | null,
  preflopRangeStore: RangeStore = rangeStore,
): readonly HHReviewRecord[] {
  container.innerHTML = "";
  container.className = "hh-analysis";
  container.dataset.spotId = spot.id;
  const chosen = importedActionKey(result.fields.actions, spot);
  const feedback = chosen ? grade(spot, chosen, "LENIENT") : undefined;
  const importedAt = Date.now();
  const preflopIdentity = {
    profile: result.fields.profile,
    strategyPack: result.fields.rangePack,
  };
  const reviewRecords: HHReviewRecord[] = [
    buildHHPreflopReviewRecord(
      spot,
      chosen,
      feedback?.correct,
      importedAt,
      preflopIdentity,
    ),
  ];
  container.dataset.reviewSavedToDrillStats = "false";
  if (chosen) container.dataset.chosen = chosen;
  if (feedback) container.dataset.correct = String(feedback.correct);

  const title = el(doc, "h3", "hh-analysis__title");
  title.textContent = CS.hh.decisionAnalysis;
  container.appendChild(title);

  const facts = el(doc, "div", "hh-analysis__facts");
  facts.dataset.position = spot.heroPos;
  facts.dataset.hand = spot.hand;
  facts.dataset.stack = String(spot.effStack);
  facts.dataset.context = spot.context;

  const items = [
    [CS.hh.facts.position, spot.heroPos],
    [CS.hh.facts.hand, spot.hand],
    [
      CS.hh.facts.stack,
      result.fields.effStackBB !== undefined
        ? localizedText(
            `${result.fields.effStackBB} BB -> nearest bucket ${spot.effStack} BB`,
            `${result.fields.effStackBB} BB -> nejbližší úroveň ${spot.effStack} BB`,
          )
        : `${spot.effStack} BB`,
    ],
    [CS.hh.facts.node, spot.context],
    [CS.hh.facts.yourAction, actionLabel(chosen)],
    [
      CS.hh.facts.result,
      feedback
        ? (feedback.correct ? CS.hh.results.accepted : CS.hh.results.review)
        : CS.hh.results.notScored,
    ],
    [CS.hh.facts.recommended, spot.correctKeys.join(" / ")],
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
  explanation.textContent = buildPreflopExplanationForSpot(spot, getAppLanguage());
  container.appendChild(explanation);

  const matrix = el(doc, "div", "hh-analysis__matrix");
  renderMatrix(spot, preflopRangeStore, matrix);
  container.appendChild(matrix);

  const blockedReason = profileGuard?.(result) ?? null;
  if (blockedReason !== null) {
    container.appendChild(renderPostflopUnavailable(doc, blockedReason));
  } else {
    try {
      const postflopSpots = buildImportedPostflopTrainingSpots(result, strategyResolver, {
        allowFallback,
        language: getAppLanguage(),
      });
      for (const postflopSpot of postflopSpots) {
        container.appendChild(renderImportedPostflopAnalysis(doc, postflopSpot));
        const source = postflopSpot.explanation.source;
        reviewRecords.push(buildHHPostflopReviewRecord(postflopSpot, importedAt, {
          profile: result.fields.profile
            ? { ...result.fields.profile, street: postflopSpot.street }
            : undefined,
          strategyPack: source.kind === "STRATEGY_PACK"
            ? {
              id: source.packId,
              version: source.packVersion,
              verifiedAt: source.packVerifiedAt,
            }
            : undefined,
        }));
      }
    } catch (error) {
      if (!(error instanceof PostflopStrategyUnavailableError)) throw error;
      container.appendChild(renderPostflopUnavailable(
        doc,
        CS.hh.postflopUnavailable,
      ));
    }
  }
  container.dataset.reviewRecordCount = String(reviewRecords.length);
  return reviewRecords;
}

function renderPostflopUnavailable(doc: Document, message: string): HTMLElement {
  const notice = el(doc, "div", "hh-postflop-unavailable");
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  return notice;
}

function renderImportedPostflopAnalysis(doc: Document, spot: PostflopTrainingSpot): HTMLElement {
  const section = el(doc, "section", "hh-postflop-analysis");
  section.dataset.reviewSavedToDrillStats = "false";
  section.dataset.street = spot.street;
  section.dataset.potType = spot.potType;
  section.dataset.positionPattern = spot.positionPattern;
  section.dataset.recommended = spot.recommendedAction;
  section.dataset.board = spot.board.map(cardLabel).join("-");

  const title = el(doc, "h3", "hh-postflop-analysis__title");
  title.textContent = `${streetLabel(spot.street)} review`;
  section.appendChild(title);

  const facts = el(doc, "div", "hh-postflop-analysis__facts");
  const items = [
    [CS.hh.facts.board, spot.board.map(cardLabel).join(" ")],
    [CS.hh.facts.pot, `${potTypeLabel(spot.potType)} | SPR ${spot.spr}`],
    [CS.hh.facts.position, positionPatternLabel(spot.positionPattern)],
    [CS.hh.facts.texture, spot.boardTextures.map(textureLabel).join(", ")],
    [CS.hh.facts.recommended, postflopActionLabel(spot.recommendedAction)],
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

function streetLabel(street: PostflopTrainingSpot["street"]): string {
  switch (street) {
    case "FLOP":
      return "Flop";
    case "TURN":
      return "Turn";
    case "RIVER":
      return "River";
  }
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
  parseOptions?: HHParseOptions,
): void {
  renderErrors(
    doc,
    regions.errors,
    result.errors,
  );
  renderUnreadable(doc, regions.unreadable, result.unreadableFields);
  renderIncompatible(regions.incompatible, result.incompatible === true);

  if (result.ok && result.spot) {
    // Req 11.4 — kompatibilní data: vykresli Spot do vyhrazeného kontejneru.
    const ante: AnteMode = result.fields.ante ?? "OFF";
    renderTable(
      result.spot,
      ante,
      regions.table,
      positionsForFormat(result.fields.tableFormat ?? "FULL_RING_9"),
    );
    const reviewRecords = renderAnalysis(
      doc,
      regions.analysis,
      result,
      result.spot,
      callbacks?.postflopStrategyResolver,
      callbacks?.postflopAllowFallback !== false,
      callbacks?.postflopProfileGuard,
      parseOptions?.rangeStore ?? rangeStore,
    );
    callbacks?.onReviewBuilt?.(reviewRecords);
    callbacks?.onSpotBuilt?.(result.spot);
  } else {
    // Chyba / nekompatibilita / částečná data: Spot nevykresluj, vyčisti stůl.
    regions.table.innerHTML = "";
    const placeholder = el(doc, "p", "hh-table__placeholder");
    placeholder.textContent = CS.hh.tablePlaceholder;
    placeholder.style.opacity = "0.7";
    placeholder.style.fontStyle = "italic";
    regions.table.appendChild(placeholder);
    regions.analysis.innerHTML = "";
    regions.analysis.removeAttribute("data-spot-id");
  }
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

  // Nadpis a nápověda.
  const title = el(doc, "h2", "hh-view__title");
  title.textContent = CS.hh.title;
  wrap.appendChild(title);

  const hint = el(doc, "p", "hh-view__hint");
  hint.textContent = CS.hh.hint;
  wrap.appendChild(hint);

  // Textarea pro vstup (Req 11.2).
  const textarea = doc.createElement("textarea");
  textarea.className = "hh-input";
  textarea.setAttribute("aria-label", CS.hh.inputLabel);
  textarea.placeholder = CS.hh.inputPlaceholder;
  wrap.appendChild(textarea);

  // Tlačítko "Analyzovat" (Req 11.2).
  const button = doc.createElement("button");
  button.className = "hh-analyze";
  button.type = "button";
  button.textContent = CS.hh.analyze;
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
  placeholder.textContent = CS.hh.tablePlaceholder;
  placeholder.style.opacity = "0.7";
  placeholder.style.fontStyle = "italic";
  table.appendChild(placeholder);
  wrap.appendChild(table);

  const analysis = el(doc, "section", "hh-analysis");
  analysis.setAttribute("aria-label", CS.hh.analysisLabel);
  analysis.setAttribute("tabindex", "-1");
  wrap.appendChild(analysis);

  const regions = { errors, unreadable, incompatible, table, analysis };
  let analyzeRequest = 0;

  // Obsluha kliknutí — totální parser + ochrana proti pádu při vykreslování.
  const analyze = (): void => {
    try {
      const parseOptions: HHParseOptions = {
        ...(callbacks?.parseOptions?.() ?? {}),
        language: getAppLanguage(),
      };
      const result = parseHandHistory(textarea.value, parseOptions);
      applyResult(doc, result, regions, callbacks, parseOptions);
      if (result.ok && result.spot) {
        analysis.focus();
      } else {
        const target = result.errors.length > 0 ? errors : incompatible;
        target.setAttribute("tabindex", "-1");
        target.focus();
      }
    } catch (err) {
      // Pojistka: parser je totální, ale ani neočekávaná chyba při vykreslování
      // nesmí shodit view (Req 11.2 — bez pádu aplikace).
      const msg = err instanceof Error ? err.message : String(err);
      renderErrors(doc, regions.errors, [
        CS.hh.unexpectedError(msg),
      ]);
      renderUnreadable(doc, regions.unreadable, []);
      renderIncompatible(regions.incompatible, false);
      regions.table.innerHTML = "";
      regions.analysis.innerHTML = "";
      regions.analysis.removeAttribute("data-spot-id");
      regions.errors.setAttribute("tabindex", "-1");
      regions.errors.focus();
    }
  };

  button.addEventListener("click", () => {
    const beforeAnalyze = callbacks?.beforeAnalyze;
    if (!beforeAnalyze) {
      analyze();
      return;
    }

    const request = ++analyzeRequest;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    void beforeAnalyze()
      .then(() => {
        if (request === analyzeRequest) analyze();
      })
      .catch((err) => {
        if (request !== analyzeRequest) return;
        void err;
        renderErrors(doc, regions.errors, [
          CS.hh.productionStrategyUnavailable,
        ]);
        regions.errors.setAttribute("tabindex", "-1");
        regions.errors.focus();
      })
      .finally(() => {
        if (request !== analyzeRequest) return;
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
  });

  root.appendChild(wrap);
}
