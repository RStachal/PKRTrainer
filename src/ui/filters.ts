/**
 * Filtry & konfigurace tréninku — UI vrstva (DOM I/O).
 *
 * Komponenta vykreslí ovládací prvky pro výběr filtrů a sestaví z nich
 * `Filters` (viz `core/types.ts`), který se předává `Drill_Engine`. Veškerý
 * uživatelský text je v češtině (Req 12.3); strojové identifikátory (Pozice,
 * Akční_klíče, kontexty) zůstávají v ASCII.
 *
 * ## Pokrývané požadavky
 *
 * - **Req 13.1** — výběr 1–9 Pozic z `POSITION_ORDER` (UTG … BB).
 * - **Req 13.2** — výběr 1–13 Hloubkových_košů z `STACK_BUCKETS` (5 … 150 BB).
 * - **Req 13.3** — výběr akčních kontextů z uzavřené sady
 *   (RFI/Open, vs-limp/Iso, vs-open, vs-3bet, vs-4bet, Squeeze, Blind-vs-blind,
 *   Push/Fold, vs-all-in/Call-jam) s českými popisky.
 * - **Req 13.4 (stráž explicitního startu)** — generování spotů **nesmí**
 *   začít bez explicitní akce uživatele. Komponenta vystavuje callback
 *   `onStart`, který se zavolá **výhradně** po kliknutí na tlačítko Start
 *   (`.filter-start`) — **nikdy** automaticky při změně filtru. Změny filtrů
 *   pouze aktualizují vnitřní stav a vyčistí předchozí upozornění; samotný
 *   `Drill_Engine` se tak spustí jen přes tento explicitní start.
 * - **Req 13.6 (prázdný průnik)** — pokud zvolená kombinace filtrů neodpovídá
 *   žádnému spotu, volající (např. `main.ts`) vyhodnotí prázdný Pool a zavolá
 *   `showEmptyResult()`. Ta zobrazí upozornění (`.filter-empty-warning`) a
 *   **zachová** zvolený výběr filtrů (nic nevynuluje).
 * - **Req 13.7 (neomezená dimenze)** — prázdná dimenze (uživatel nic nevybral)
 *   se považuje za „vše". `getFilters()` proto vrací pro nevybranou dimenzi
 *   prázdné pole `[]`, které `Drill_Engine` interpretuje jako neomezené.
 * - **Req 5 (ante)** — přepínač ante ON/OFF; výchozí **ON** (Req 5.1).
 * - **Req 7 (scoring)** — volba režimu hodnocení LENIENT / STRICT; výchozí
 *   **LENIENT**.
 *
 * ## Výchozí stav (dokumentace UX)
 *
 * Při vykreslení nejsou zaškrtnuté žádné Pozice, koše ani kontexty — všechny
 * tři dimenze jsou tedy **neomezené** (Req 13.7), tj. trénink pokryje vše.
 * Ante je **ON**, scoring **LENIENT**, pole seedu je prázdné (⇒ `onStart`
 * dostane `seed = null` a engine vygeneruje a zpřístupní platný seed, Req 6.7).
 * Pro každou dimenzi jsou k dispozici přepínače „Vše" / „Žádné" pro rychlou
 * (de)selekci.
 *
 * ## Selektory / data-atributy (kontrakt pro DOM testy 16.3)
 *
 * - `.filters` — kořenový wrapper vykreslený do `root`.
 * - `.filter-position` — právě **9** ovládacích prvků (checkbox) pozic; každý
 *   nese `data-position` = `Position`.
 * - `.filter-bucket` — právě **13** ovládacích prvků košů; každý nese
 *   `data-bucket` = hodnota košu v BB.
 * - `.filter-context` — právě **9** ovládacích prvků kontextů; každý nese
 *   `data-context` = `ActionContext`.
 * - `.filter-ante` — checkbox ante (zaškrtnuto = ON).
 * - `.filter-scoring` — `<select>` režimu hodnocení (`LENIENT` / `STRICT`).
 * - `.filter-seed` — `<input>` pro seed (prázdné / neplatné ⇒ `null`).
 * - `.filter-start` — tlačítko Start (jediný spouštěč `onStart`, Req 13.4).
 * - `.filter-empty-warning` — upozornění na prázdný průnik (Req 13.6); ve
 *   výchozím stavu skryté (`hidden`), zobrazí je `showEmptyResult()`.
 *
 * _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_
 */

import {
  POSITION_ORDER,
  STACK_BUCKETS,
  type ActionContext,
  type AnteMode,
  type Filters,
  type Position,
  type ScoringMode,
  type StackBucket,
} from "../core/types";

// ---------------------------------------------------------------------------
// Uzavřená sada akčních kontextů + české popisky (Req 13.3, 12.3)
// ---------------------------------------------------------------------------

/**
 * Uzavřená sada akčních kontextů v kanonickém pořadí (shodném s deklarací
 * `ActionContext`). Pořadí určuje i pořadí vykreslení ovládacích prvků.
 */
const CONTEXT_ORDER: ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

/** Český popisek akčního kontextu pro UI (Req 13.3, 12.3). */
const CONTEXT_LABEL: Record<ActionContext, string> = {
  RFI: "RFI / Open",
  VS_LIMP: "Proti limpu (Iso-raise)",
  VS_OPEN: "Proti openu",
  VS_3BET: "Proti 3-betu",
  VS_4BET: "Proti 4-betu",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Proti all-inu (Call-jam)",
};

/** Mez 32-bit unsigned seedu (4 294 967 295), tj. 2^32 − 1 (Req 6.1). */
const SEED_MAX = 0xffffffff;

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

/** Callbacky, které komponenta filtrů volá směrem k aplikaci. */
export interface FiltersViewCallbacks {
  /**
   * Zavolá se **výhradně** po explicitním kliknutí na tlačítko Start
   * (Req 13.4). Nikdy se nevolá automaticky při změně filtru.
   *
   * @param filters Aktuálně zvolené filtry (prázdná dimenze = neomezeno,
   *   Req 13.7).
   * @param seed Uživatelem zadaný platný seed, nebo `null` (prázdné / neplatné
   *   pole) — v takovém případě si engine vygeneruje a zpřístupní vlastní seed
   *   (Req 6.7).
   */
  onStart: (filters: Filters, seed: number | null) => void;
}

/** Veřejné rozhraní vykreslené komponenty filtrů. */
export interface FiltersView {
  /**
   * Sestaví `Filters` z aktuálního stavu ovládacích prvků. Pro nevybranou
   * dimenzi vrací `[]` (neomezeno, Req 13.7).
   */
  getFilters(): Filters;
  /**
   * Vrátí aktuálně zadaný seed, nebo `null` pro prázdné / neplatné pole
   * (mimo rozsah 0–4 294 967 295 nebo necelé číslo).
   */
  getSeed(): number | null;
  /**
   * Zobrazí upozornění na prázdný průnik filtrů (Req 13.6) a **zachová**
   * zvolený výběr (nic nevynuluje). Volá ji aplikace, když pro zvolené filtry
   * nelze sestavit žádný Spot.
   *
   * @param message Volitelný vlastní text upozornění.
   */
  showEmptyResult(message?: string): void;
  /** Skryje upozornění na prázdný průnik (pokud je zobrazené). */
  clearWarning(): void;
  /** Zpřístupní seed v UI (např. po vygenerování enginem, Req 6.7). */
  setSeed(seed: number): void;
  /** Odstraní vykreslené DOM a posluchače. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

function el(doc: Document, tag: string, className?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Vytvoří checkbox zabalený v `<label>` s textem. Vrací jak obal (label), tak
 * samotný `<input>` (pro pozdější čtení stavu).
 */
function makeCheckbox(
  doc: Document,
  className: string,
  text: string,
  dataAttr: { name: string; value: string },
): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = doc.createElement("label");
  label.className = `${className}-item`;
  label.style.display = "inline-flex";
  label.style.alignItems = "center";
  label.style.gap = "4px";
  label.style.marginRight = "10px";
  label.style.fontSize = "13px";
  label.style.cursor = "pointer";

  const input = doc.createElement("input");
  input.type = "checkbox";
  input.className = className;
  input.dataset[dataAttr.name] = dataAttr.value;

  const span = doc.createElement("span");
  span.textContent = text;

  label.appendChild(input);
  label.appendChild(span);
  return { label, input };
}

/** Vykreslí nadpis sekce filtru. */
function sectionTitle(doc: Document, text: string): HTMLElement {
  const h = el(doc, "div", "filter-section-title");
  h.textContent = text;
  h.style.fontWeight = "700";
  h.style.fontSize = "13px";
  h.style.margin = "12px 0 6px";
  return h;
}

/** Vykreslí dvojici přepínačů „Vše" / „Žádné" pro hromadnou (de)selekci. */
function makeBulkToggles(
  doc: Document,
  onAll: () => void,
  onNone: () => void,
): HTMLElement {
  const wrap = el(doc, "span", "filter-bulk");
  wrap.style.marginLeft = "8px";
  wrap.style.fontSize = "12px";

  const all = doc.createElement("button");
  all.type = "button";
  all.className = "filter-bulk-all";
  all.textContent = "Vše";
  all.style.marginRight = "4px";
  all.addEventListener("click", onAll);

  const none = doc.createElement("button");
  none.type = "button";
  none.className = "filter-bulk-none";
  none.textContent = "Žádné";
  none.addEventListener("click", onNone);

  wrap.appendChild(all);
  wrap.appendChild(none);
  return wrap;
}

// ---------------------------------------------------------------------------
// Seed parsing
// ---------------------------------------------------------------------------

/**
 * Naparsuje text seedu na platný 32-bit unsigned integer (0–4 294 967 295),
 * nebo vrátí `null` pro prázdný / neplatný vstup. Neplatný seed se mapuje na
 * `null`, takže engine vygeneruje vlastní (Req 6.7).
 */
function parseSeed(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > SEED_MAX) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Hlavní vykreslení
// ---------------------------------------------------------------------------

/**
 * Vykreslí komponentu filtrů do `root` a vrátí její ovládací rozhraní.
 *
 * Idempotentní: před vykreslením `root` vyprázdní. Tlačítko Start je jediný
 * spouštěč `onStart` (Req 13.4); změny filtrů pouze aktualizují vnitřní stav a
 * skryjí případné předchozí upozornění o prázdném průniku.
 *
 * @param root Cílový kontejner.
 * @param callbacks Callbacky aplikace (zejména `onStart`).
 * @returns `FiltersView` pro čtení filtrů a řízení upozornění.
 */
export function renderFilters(
  root: HTMLElement,
  callbacks: FiltersViewCallbacks,
): FiltersView {
  const doc = root.ownerDocument ?? document;
  root.innerHTML = "";

  const wrap = el(doc, "div", "filters");

  // Reference na vstupy pro pozdější čtení stavu.
  const positionInputs = new Map<Position, HTMLInputElement>();
  const bucketInputs = new Map<StackBucket, HTMLInputElement>();
  const contextInputs = new Map<ActionContext, HTMLInputElement>();

  /** Skryje upozornění na prázdný průnik (Req 13.6). */
  function hideWarning(): void {
    warning.hidden = true;
  }

  // --- Sekce: Pozice (Req 13.1) ---
  const posTitleRow = el(doc, "div", "filter-row");
  const posTitle = sectionTitle(doc, "Pozice");
  posTitleRow.appendChild(posTitle);
  posTitleRow.appendChild(
    makeBulkToggles(
      doc,
      () => {
        for (const inp of positionInputs.values()) inp.checked = true;
        hideWarning();
      },
      () => {
        for (const inp of positionInputs.values()) inp.checked = false;
        hideWarning();
      },
    ),
  );
  wrap.appendChild(posTitleRow);

  const posBox = el(doc, "div", "filter-group filter-group--positions");
  for (const pos of POSITION_ORDER) {
    const { label, input } = makeCheckbox(doc, "filter-position", pos, {
      name: "position",
      value: pos,
    });
    input.addEventListener("change", hideWarning);
    positionInputs.set(pos, input);
    posBox.appendChild(label);
  }
  wrap.appendChild(posBox);

  // --- Sekce: Hloubkové koše (Req 13.2) ---
  const bucketTitleRow = el(doc, "div", "filter-row");
  const bucketTitle = sectionTitle(doc, "Hloubkové koše (BB)");
  bucketTitleRow.appendChild(bucketTitle);
  bucketTitleRow.appendChild(
    makeBulkToggles(
      doc,
      () => {
        for (const inp of bucketInputs.values()) inp.checked = true;
        hideWarning();
      },
      () => {
        for (const inp of bucketInputs.values()) inp.checked = false;
        hideWarning();
      },
    ),
  );
  wrap.appendChild(bucketTitleRow);

  const bucketBox = el(doc, "div", "filter-group filter-group--buckets");
  for (const bucket of STACK_BUCKETS) {
    const { label, input } = makeCheckbox(doc, "filter-bucket", String(bucket), {
      name: "bucket",
      value: String(bucket),
    });
    input.addEventListener("change", hideWarning);
    bucketInputs.set(bucket, input);
    bucketBox.appendChild(label);
  }
  wrap.appendChild(bucketBox);

  // --- Sekce: Akční kontexty (Req 13.3) ---
  const ctxTitleRow = el(doc, "div", "filter-row");
  const ctxTitle = sectionTitle(doc, "Akční kontext");
  ctxTitleRow.appendChild(ctxTitle);
  ctxTitleRow.appendChild(
    makeBulkToggles(
      doc,
      () => {
        for (const inp of contextInputs.values()) inp.checked = true;
        hideWarning();
      },
      () => {
        for (const inp of contextInputs.values()) inp.checked = false;
        hideWarning();
      },
    ),
  );
  wrap.appendChild(ctxTitleRow);

  const ctxBox = el(doc, "div", "filter-group filter-group--contexts");
  for (const ctx of CONTEXT_ORDER) {
    const { label, input } = makeCheckbox(doc, "filter-context", CONTEXT_LABEL[ctx], {
      name: "context",
      value: ctx,
    });
    input.addEventListener("change", hideWarning);
    contextInputs.set(ctx, input);
    ctxBox.appendChild(label);
  }
  wrap.appendChild(ctxBox);

  // --- Sekce: Konfigurace (ante, scoring, seed) ---
  wrap.appendChild(sectionTitle(doc, "Konfigurace"));
  const configBox = el(doc, "div", "filter-group filter-group--config");
  configBox.style.display = "flex";
  configBox.style.flexWrap = "wrap";
  configBox.style.gap = "14px";
  configBox.style.alignItems = "center";

  // Ante (Req 5.1 — výchozí ON).
  const anteLabel = doc.createElement("label");
  anteLabel.className = "filter-ante-item";
  anteLabel.style.display = "inline-flex";
  anteLabel.style.alignItems = "center";
  anteLabel.style.gap = "4px";
  anteLabel.style.fontSize = "13px";
  const anteInput = doc.createElement("input");
  anteInput.type = "checkbox";
  anteInput.className = "filter-ante";
  anteInput.checked = true; // Req 5.1 — ante ON jako výchozí.
  anteInput.addEventListener("change", hideWarning);
  const anteText = doc.createElement("span");
  anteText.textContent = "Ante (big blind ante)";
  anteLabel.appendChild(anteInput);
  anteLabel.appendChild(anteText);
  configBox.appendChild(anteLabel);

  // Scoring mód (Req 7 — výchozí LENIENT).
  const scoringLabel = doc.createElement("label");
  scoringLabel.className = "filter-scoring-item";
  scoringLabel.style.display = "inline-flex";
  scoringLabel.style.alignItems = "center";
  scoringLabel.style.gap = "4px";
  scoringLabel.style.fontSize = "13px";
  const scoringText = doc.createElement("span");
  scoringText.textContent = "Hodnocení:";
  const scoringSelect = doc.createElement("select");
  scoringSelect.className = "filter-scoring";
  const optLenient = doc.createElement("option");
  optLenient.value = "LENIENT";
  optLenient.textContent = "Mírné (LENIENT)";
  const optStrict = doc.createElement("option");
  optStrict.value = "STRICT";
  optStrict.textContent = "Přísné (STRICT)";
  scoringSelect.appendChild(optLenient);
  scoringSelect.appendChild(optStrict);
  scoringSelect.value = "LENIENT"; // výchozí režim.
  scoringLabel.appendChild(scoringText);
  scoringLabel.appendChild(scoringSelect);
  configBox.appendChild(scoringLabel);

  // Seed (Req 6.7 — prázdné = engine vygeneruje).
  const seedLabel = doc.createElement("label");
  seedLabel.className = "filter-seed-item";
  seedLabel.style.display = "inline-flex";
  seedLabel.style.alignItems = "center";
  seedLabel.style.gap = "4px";
  seedLabel.style.fontSize = "13px";
  const seedText = doc.createElement("span");
  seedText.textContent = "Seed:";
  const seedInput = doc.createElement("input");
  seedInput.type = "text";
  seedInput.className = "filter-seed";
  seedInput.placeholder = "náhodný";
  seedInput.inputMode = "numeric";
  seedInput.style.width = "120px";
  seedLabel.appendChild(seedText);
  seedLabel.appendChild(seedInput);
  configBox.appendChild(seedLabel);

  wrap.appendChild(configBox);

  // --- Upozornění na prázdný průnik (Req 13.6) ---
  const warning = el(doc, "div", "filter-empty-warning");
  warning.setAttribute("role", "alert");
  warning.hidden = true; // výchozí skryté.
  warning.style.margin = "12px 0";
  warning.style.padding = "10px 12px";
  warning.style.borderRadius = "8px";
  warning.style.background = "rgba(255,209,91,.14)";
  warning.style.border = "1px solid rgba(255,209,91,.45)";
  warning.style.color = "#ffd15b";
  warning.style.fontSize = "13px";
  wrap.appendChild(warning);

  // --- Tlačítko Start (Req 13.4 — jediný spouštěč onStart) ---
  const startBtn = doc.createElement("button");
  startBtn.type = "button";
  startBtn.className = "filter-start";
  startBtn.textContent = "Start tréninku";
  startBtn.style.marginTop = "8px";
  startBtn.style.padding = "8px 18px";
  startBtn.style.fontWeight = "700";
  startBtn.style.fontSize = "14px";
  startBtn.style.cursor = "pointer";
  wrap.appendChild(startBtn);

  // ----- Čtení stavu -----

  /**
   * Vrátí zaškrtnuté hodnoty dané dimenze v kanonickém pořadí. Prázdné pole
   * znamená „nic nevybráno" = neomezeno (Req 13.7).
   */
  function collect<T>(order: readonly T[], inputs: Map<T, HTMLInputElement>): T[] {
    const out: T[] = [];
    for (const value of order) {
      const inp = inputs.get(value);
      if (inp?.checked) out.push(value);
    }
    return out;
  }

  function getFilters(): Filters {
    const ante: AnteMode = anteInput.checked ? "ON" : "OFF";
    const scoringMode: ScoringMode =
      scoringSelect.value === "STRICT" ? "STRICT" : "LENIENT";
    return {
      positions: collect(POSITION_ORDER, positionInputs),
      buckets: collect(STACK_BUCKETS, bucketInputs),
      contexts: collect(CONTEXT_ORDER, contextInputs),
      ante,
      scoringMode,
    };
  }

  function getSeed(): number | null {
    return parseSeed(seedInput.value);
  }

  // ----- Start gate (Req 13.4) -----
  function handleStart(): void {
    // Před spuštěním skryjeme předchozí upozornění (uživatel zkouší znovu).
    hideWarning();
    callbacks.onStart(getFilters(), getSeed());
  }
  startBtn.addEventListener("click", handleStart);

  root.appendChild(wrap);

  // ----- Veřejné API -----
  return {
    getFilters,
    getSeed,
    showEmptyResult(message?: string): void {
      // Req 13.6: zobraz upozornění, NEVYNULUJ výběr filtrů.
      warning.hidden = false;
      warning.textContent =
        message ??
        "Zvolená kombinace filtrů neodpovídá žádnému spotu. Upravte prosím výběr " +
          "(pozice, hloubkové koše nebo akční kontext).";
    },
    clearWarning(): void {
      hideWarning();
    },
    setSeed(seed: number): void {
      seedInput.value = String(seed);
    },
    destroy(): void {
      startBtn.removeEventListener("click", handleStart);
      root.innerHTML = "";
    },
  };
}
