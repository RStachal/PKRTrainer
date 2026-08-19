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
  STACK_BUCKETS,
  type ActionContext,
  type AnteMode,
  type Filters,
  type Position,
  type ScoringMode,
  type StackBucket,
} from "../core/types";
import type { OpponentStyleId } from "../core/opponentStyle";
import {
  positionsForFormat,
  type TableFormat,
  type TrainingProfile,
} from "../core/trainingProfile";
import { renderProfileSelector, type ProfileSelectorView } from "./profileSelector";
import { CS } from "./cs";

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
  VS_LIMP: "Vs limp (iso-raise)",
  VS_OPEN: "Vs open",
  VS_3BET: "Vs 3-bet",
  VS_4BET: "Vs 4-bet",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Vs all-in (call-jam)",
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
   * @param profile Aktuálně zvolený tréninkový profil pro navazující multi-format
   *   režimy (formát stolu, blind speed, street, model).
   */
  onStart: (
    filters: Filters,
    seed: number | null,
    profile: TrainingProfile,
  ) => void;
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
  setFilters(filters: Filters): void;
  /** Vrátí aktuálně zvolený profil tréninku pro budoucí multi-variant režimy. */
  getProfile(): TrainingProfile;
  setProfile(profile: TrainingProfile): void;
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

/**
 * A filter group that folds away, with its selection stated on the header.
 *
 * Three groups of checkboxes - nine positions, thirteen depths, five contexts -
 * fill most of a phone screen before a single hand is dealt. Collapsed, each is
 * one line that says what is selected, and opening one is a tap.
 *
 * The checkboxes themselves are untouched inside `body`: same classes, same data
 * attributes, present in the DOM whether the group is open or shut. Nothing that
 * reads the filter state needs to know this exists.
 */
/**
 * Předvolba: pojmenovaná skupina souvisejících hodnot v jedné dimenzi.
 *
 * Filtr má jedenatřicet zaškrtávátek - devět pozic, třináct hloubek, devět
 * situací - a než hráč rozdá první ruku, musí se prokousat všemi. Skládanka je
 * to zbytečná, protože se skoro vždycky vybírá souvislá skupina: rané pozice,
 * krátké stacky, obrana proti openu.
 *
 * Zaškrtávátka **zůstávají**, a to schválně ze dvou důvodů. Za prvé na jejich
 * počty a `data-` atributy spoléhá kontrakt DOM testů. Za druhé předvolba pokrývá
 * běžný případ, ne každý: kdo chce přesně UTG a button, musí mít pořád jak si to
 * naklikat. Rozbalovátko je zkratka, ne náhrada.
 */
interface FilterPreset<K> {
  id: string;
  label: string;
  /** Které klíče předvolba vybírá z těch, co zrovna existují. */
  matches: (key: K) => boolean;
}

/**
 * Rozbalovátko, které zaškrtne celou skupinu najednou.
 *
 * Drží se v obou směrech: výběr předvolby zaškrtne její hodnoty, a ruční změna
 * zaškrtávátka přepne rozbalovátko na „vlastní výběr", pokud stav žádné
 * předvolbě neodpovídá. Bez té druhé půlky by rozbalovátko tvrdilo „rané pozice"
 * nad výběrem, který rané pozice není - a to je horší než žádná zkratka.
 */
function makePresetSelect<K>(
  doc: Document,
  className: string,
  presets: readonly FilterPreset<K>[],
  inputs: Map<K, HTMLInputElement>,
  onApply: () => void,
): { root: HTMLSelectElement; sync: () => void } {
  const select = doc.createElement("select");
  select.className = className;
  select.style.fontSize = "12px";

  const custom = doc.createElement("option");
  custom.value = "";
  custom.textContent = CS.filters.presetCustom;
  select.appendChild(custom);
  for (const preset of presets) {
    const option = doc.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    const preset = presets.find((item) => item.id === select.value);
    if (preset === undefined) return;
    for (const [key, input] of inputs) input.checked = preset.matches(key);
    onApply();
  });

  const sync = () => {
    const checked = [...inputs].filter(([, input]) => input.checked).map(([key]) => key);
    const match = presets.find((preset) => {
      const wanted = [...inputs.keys()].filter((key) => preset.matches(key));
      return wanted.length === checked.length
        && wanted.every((key) => checked.includes(key));
    });
    select.value = match?.id ?? "";
  };
  return { root: select, sync };
}

/** Obal, aby předvolba a hromadné přepínače seděly v hlavičce vedle sebe. */
function withPreset(doc: Document, preset: HTMLElement, bulk: HTMLElement): HTMLElement {
  const row = el(doc, "div", "filter-group__shortcuts");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.appendChild(preset);
  row.appendChild(bulk);
  return row;
}

const POSITION_PRESETS: readonly FilterPreset<Position>[] = [
  { id: "all", label: "Vše", matches: () => true },
  {
    id: "early",
    label: "Rané pozice",
    matches: (key) => key === "UTG" || key === "UTG+1" || key === "UTG+2",
  },
  { id: "middle", label: "Střední pozice", matches: (key) => key === "LJ" || key === "HJ" },
  { id: "late", label: "Pozdní pozice", matches: (key) => key === "CO" || key === "BTN" },
  { id: "blinds", label: "Blindy", matches: (key) => key === "SB" || key === "BB" },
];

/**
 * Hranice hloubek jsou tytéž, kterými se řídí obsah.
 *
 * Krátký stack je tam, kde se hraje push/fold, hluboký tam, kde zbývá prostor na
 * víc než jednu sázku. Kdyby si rozbalovátko zvolilo vlastní dělení, hráč by
 * trénoval jinak rozdělené skupiny, než jak je rozdělená strategie.
 */
const BUCKET_PRESETS: readonly FilterPreset<StackBucket>[] = [
  { id: "all", label: "Vše", matches: () => true },
  { id: "short", label: "Krátké (≤ 20 BB)", matches: (key) => key <= 20 },
  { id: "mid", label: "Střední (25–50 BB)", matches: (key) => key >= 25 && key <= 50 },
  { id: "deep", label: "Hluboké (≥ 60 BB)", matches: (key) => key >= 60 },
];

const CONTEXT_PRESETS: readonly FilterPreset<ActionContext>[] = [
  { id: "all", label: "Vše", matches: () => true },
  { id: "open", label: "Otevírání", matches: (key) => key === "RFI" || key === "VS_LIMP" },
  {
    id: "vs-open",
    label: "Proti otevření",
    matches: (key) => key === "VS_OPEN" || key === "VS_3BET"
      || key === "VS_4BET" || key === "SQUEEZE",
  },
  { id: "bvb", label: "Blind proti blindu", matches: (key) => key === "BVB" },
  {
    id: "short",
    label: "Krátký stack",
    matches: (key) => key === "PUSH_FOLD" || key === "VS_ALLIN",
  },
];

interface FilterDisclosure {
  /** The element to append to the form. */
  root: HTMLElement;
  /** Where the group's controls go. */
  body: HTMLElement;
  /** Re-reads the inputs and rewrites the header summary. */
  refresh: () => void;
}

function makeDisclosure(
  doc: Document,
  title: string,
  summarise: () => string,
  bulk: HTMLElement,
  startOpen: boolean,
): FilterDisclosure {
  const root = el(doc, "section", "filter-disclosure");
  root.dataset.open = startOpen ? "true" : "false";

  const header = el(doc, "div", "filter-disclosure__header");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = "filter-disclosure__toggle";
  toggle.setAttribute("aria-expanded", startOpen ? "true" : "false");
  toggle.style.display = "flex";
  toggle.style.alignItems = "baseline";
  toggle.style.gap = "8px";
  toggle.style.flex = "1";
  toggle.style.textAlign = "left";
  toggle.style.cursor = "pointer";

  const caret = doc.createElement("span");
  caret.className = "filter-disclosure__caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = startOpen ? "\u25be" : "\u25b8";

  const name = doc.createElement("span");
  name.className = "filter-disclosure__name";
  name.textContent = title;
  name.style.fontWeight = "700";
  name.style.fontSize = "13px";

  const summary = doc.createElement("span");
  summary.className = "filter-disclosure__summary";
  summary.style.fontSize = "12px";
  summary.style.opacity = ".78";

  toggle.appendChild(caret);
  toggle.appendChild(name);
  toggle.appendChild(summary);
  header.appendChild(toggle);
  header.appendChild(bulk);

  const body = el(doc, "div", "filter-group");
  body.hidden = !startOpen;

  const refresh = () => {
    summary.textContent = summarise();
  };

  toggle.addEventListener("click", () => {
    const open = root.dataset.open !== "true";
    root.dataset.open = open ? "true" : "false";
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    caret.textContent = open ? "\u25be" : "\u25b8";
  });

  root.appendChild(header);
  root.appendChild(body);
  refresh();
  return { root, body, refresh };
}

/**
 * "Vse (9)", "Zadna", or the picks themselves while they still fit on the line.
 *
 * Listing the selection matters more than counting it - "LJ, HJ, CO" tells a
 * player what they are drilling, where "3 z 9" makes them open the group to find
 * out. Past four picks the list stops being readable and the count is better.
 */
function summariseSelection(labels: string[], total: number): string {
  if (labels.length === 0) return CS.filters.noneSelected;
  if (labels.length === total) return CS.filters.allSelected(total);
  if (labels.length <= 4) return labels.join(", ");
  return CS.filters.someSelected(labels.length, total);
}

/** Vykreslí dvojici přepínačů „Vše" / „Žádné" pro hromadnou (de)selekci. */
function makeBulkToggles(
  doc: Document,
  sectionName: string,
  onAll: () => void,
  onNone: () => void,
): HTMLElement {
  const wrap = el(doc, "span", "filter-bulk");
  wrap.style.marginLeft = "8px";
  wrap.style.fontSize = "12px";

  const all = doc.createElement("button");
  all.type = "button";
  all.className = "filter-bulk-all";
  all.textContent = CS.filters.all;
  all.setAttribute("aria-label", CS.filters.selectAll(sectionName));
  all.style.marginRight = "4px";
  all.addEventListener("click", onAll);

  const none = doc.createElement("button");
  none.type = "button";
  none.className = "filter-bulk-none";
  none.textContent = CS.filters.none;
  none.setAttribute("aria-label", CS.filters.clearAll(sectionName));
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
  const profileBox = el(doc, "div", "filters__profile");
  const profileSelector: ProfileSelectorView = renderProfileSelector(profileBox, {
    onChange: (profile) => {
      renderPositionControls(profile.tableFormat);
      hideWarning();
    },
  });
  wrap.appendChild(profileBox);

  // Reference na vstupy pro pozdější čtení stavu.
  const positionInputs = new Map<Position, HTMLInputElement>();
  const bucketInputs = new Map<StackBucket, HTMLInputElement>();
  const contextInputs = new Map<ActionContext, HTMLInputElement>();

  /** Skryje upozornění na prázdný průnik (Req 13.6). */
  function hideWarning(): void {
    warning.hidden = true;
  }

  // --- Sekce: Pozice (Req 13.1) ---
  const posBulk = makeBulkToggles(
    doc,
    CS.filters.positions.toLowerCase(),
    () => {
      for (const inp of positionInputs.values()) inp.checked = true;
      hideWarning();
      posGroup.refresh();
    },
    () => {
      for (const inp of positionInputs.values()) inp.checked = false;
      hideWarning();
      posGroup.refresh();
    },
  );
  const posPreset = makePresetSelect(
    doc, "filter-position-preset", POSITION_PRESETS, positionInputs,
    () => { hideWarning(); posGroup.refresh(); },
  );
  const posGroup = makeDisclosure(
    doc,
    CS.filters.positions,
    () => {
      // Pozice se překreslují při změně formátu stolu, takže se předvolba
      // porovnává s tím, co zrovna existuje - ne s pevným seznamem devíti.
      posPreset.sync();
      return summariseSelection(
        [...positionInputs].filter(([, inp]) => inp.checked).map(([pos]) => pos),
        positionInputs.size,
      );
    },
    withPreset(doc, posPreset.root, posBulk),
    false,
  );
  const posBox = el(doc, "div", "filter-group--positions");
  posGroup.body.appendChild(posBox);
  renderPositionControls(profileSelector.getProfile().tableFormat);
  wrap.appendChild(posGroup.root);

  // --- Sekce: Hloubkové koše (Req 13.2) ---
  const bucketBulk = makeBulkToggles(
    doc,
    CS.filters.stackDepths.toLowerCase(),
    () => {
      for (const inp of bucketInputs.values()) inp.checked = true;
      hideWarning();
      bucketGroup.refresh();
    },
    () => {
      for (const inp of bucketInputs.values()) inp.checked = false;
      hideWarning();
      bucketGroup.refresh();
    },
  );
  const bucketPreset = makePresetSelect(
    doc, "filter-bucket-preset", BUCKET_PRESETS, bucketInputs,
    () => { hideWarning(); bucketGroup.refresh(); },
  );
  const bucketGroup = makeDisclosure(
    doc,
    CS.filters.stackDepths,
    () => {
      bucketPreset.sync();
      return summariseSelection(
        [...bucketInputs].filter(([, inp]) => inp.checked).map(([bb]) => `${bb} BB`),
        bucketInputs.size,
      );
    },
    withPreset(doc, bucketPreset.root, bucketBulk),
    false,
  );
  const bucketBox = el(doc, "div", "filter-group--buckets");
  bucketGroup.body.appendChild(bucketBox);
  for (const bucket of STACK_BUCKETS) {
    const { label, input } = makeCheckbox(doc, "filter-bucket", String(bucket), {
      name: "bucket",
      value: String(bucket),
    });
    input.addEventListener("change", () => {
      hideWarning();
      bucketGroup.refresh();
    });
    bucketInputs.set(bucket, input);
    bucketBox.appendChild(label);
  }
  bucketGroup.refresh();
  wrap.appendChild(bucketGroup.root);

  // --- Sekce: Akční kontexty (Req 13.3) ---
  const ctxBulk = makeBulkToggles(
    doc,
    CS.filters.actionContext.toLowerCase(),
    () => {
      for (const inp of contextInputs.values()) inp.checked = true;
      hideWarning();
      ctxGroup.refresh();
    },
    () => {
      for (const inp of contextInputs.values()) inp.checked = false;
      hideWarning();
      ctxGroup.refresh();
    },
  );
  const ctxPreset = makePresetSelect(
    doc, "filter-context-preset", CONTEXT_PRESETS, contextInputs,
    () => { hideWarning(); ctxGroup.refresh(); },
  );
  const ctxGroup = makeDisclosure(
    doc,
    CS.filters.actionContext,
    () => {
      ctxPreset.sync();
      return summariseSelection(
        [...contextInputs].filter(([, inp]) => inp.checked).map(([ctx]) => CONTEXT_LABEL[ctx]),
        contextInputs.size,
      );
    },
    withPreset(doc, ctxPreset.root, ctxBulk),
    false,
  );
  const ctxBox = el(doc, "div", "filter-group--contexts");
  ctxGroup.body.appendChild(ctxBox);
  for (const ctx of CONTEXT_ORDER) {
    const { label, input } = makeCheckbox(doc, "filter-context", CONTEXT_LABEL[ctx], {
      name: "context",
      value: ctx,
    });
    input.addEventListener("change", () => {
      hideWarning();
      ctxGroup.refresh();
    });
    contextInputs.set(ctx, input);
    ctxBox.appendChild(label);
  }
  ctxGroup.refresh();
  wrap.appendChild(ctxGroup.root);

  // --- Sekce: Konfigurace (ante, scoring, seed) ---
  wrap.appendChild(sectionTitle(doc, CS.filters.configuration));
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
  anteText.textContent = CS.filters.ante;
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
  scoringText.textContent = CS.filters.scoring;
  const scoringSelect = doc.createElement("select");
  scoringSelect.className = "filter-scoring";
  const optLenient = doc.createElement("option");
  optLenient.value = "LENIENT";
  optLenient.textContent = CS.filters.lenient;
  const optStrict = doc.createElement("option");
  optStrict.value = "STRICT";
  optStrict.textContent = CS.filters.strict;
  scoringSelect.appendChild(optLenient);
  scoringSelect.appendChild(optStrict);
  scoringSelect.value = "LENIENT"; // výchozí režim.
  scoringLabel.appendChild(scoringText);
  scoringLabel.appendChild(scoringSelect);
  configBox.appendChild(scoringLabel);

  // Who the hero is up against.
  //
  // The shipped ranges are a GTO baseline against nobody in particular, and that
  // stays the default and stays the answer. Naming an opponent does not swap in a
  // second set of ranges - there is no second set, and inventing one would be
  // inventing poker. It supplies one number, the folds that opponent gives, and
  // the result panel prices the decision against it. See core/opponentStyle for
  // where the two measured anchors come from and where the interpolation starts.
  const opponentLabel = doc.createElement("label");
  opponentLabel.className = "filter-opponent-item";
  opponentLabel.style.display = "inline-flex";
  opponentLabel.style.alignItems = "center";
  opponentLabel.style.gap = "4px";
  opponentLabel.style.fontSize = "13px";
  const opponentText = doc.createElement("span");
  opponentText.textContent = CS.filters.opponent;
  const opponentSelect = doc.createElement("select");
  opponentSelect.className = "filter-opponent";
  for (const [value, label] of [
    ["", CS.filters.opponentUnknown],
    ["TIGHT_AGGRESSIVE", CS.filters.opponentTightAggressive],
    ["TIGHT_PASSIVE", CS.filters.opponentTightPassive],
    ["LOOSE_AGGRESSIVE", CS.filters.opponentLooseAggressive],
    ["LOOSE_PASSIVE", CS.filters.opponentLoosePassive],
  ] as const) {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = label;
    opponentSelect.appendChild(option);
  }
  opponentSelect.value = "";
  opponentLabel.appendChild(opponentText);
  opponentLabel.appendChild(opponentSelect);
  configBox.appendChild(opponentLabel);

  // Seed (Req 6.7 — prázdné = engine vygeneruje).
  const seedLabel = doc.createElement("label");
  seedLabel.className = "filter-seed-item";
  seedLabel.style.display = "inline-flex";
  seedLabel.style.alignItems = "center";
  seedLabel.style.gap = "4px";
  seedLabel.style.fontSize = "13px";
  const seedText = doc.createElement("span");
  seedText.textContent = CS.filters.seed;
  const seedInput = doc.createElement("input");
  seedInput.type = "text";
  seedInput.className = "filter-seed";
  seedInput.placeholder = CS.filters.random;
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
  warning.style.overflowWrap = "anywhere";
  wrap.appendChild(warning);

  // --- Tlačítko Start (Req 13.4 — jediný spouštěč onStart) ---
  const startBtn = doc.createElement("button");
  startBtn.type = "button";
  startBtn.className = "filter-start";
  startBtn.textContent = CS.filters.start;
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

  function renderPositionControls(format: TableFormat): void {
    const selected = new Set<Position>();
    for (const [position, input] of positionInputs.entries()) {
      if (input.checked) selected.add(position);
    }

    positionInputs.clear();
    posBox.replaceChildren();
    for (const pos of positionsForFormat(format)) {
      const { label, input } = makeCheckbox(doc, "filter-position", pos, {
        name: "position",
        value: pos,
      });
      input.checked = selected.has(pos);
      input.addEventListener("change", () => {
        hideWarning();
        posGroup.refresh();
      });
      positionInputs.set(pos, input);
      posBox.appendChild(label);
    }
    posGroup.refresh();
  }

  function getFilters(): Filters {
    const ante: AnteMode = anteInput.checked ? "ON" : "OFF";
    const scoringMode: ScoringMode =
      scoringSelect.value === "STRICT" ? "STRICT" : "LENIENT";
    const opponentStyle = opponentSelect.value === ""
      ? undefined
      : opponentSelect.value as OpponentStyleId;
    const positionOrder = positionsForFormat(profileSelector.getProfile().tableFormat);
    return {
      positions: collect(positionOrder, positionInputs),
      buckets: collect(STACK_BUCKETS, bucketInputs),
      contexts: collect(CONTEXT_ORDER, contextInputs),
      ante,
      scoringMode,
      opponentStyle,
    };
  }

  function getSeed(): number | null {
    return parseSeed(seedInput.value);
  }

  function setCheckedValues<T>(
    inputs: Map<T, HTMLInputElement>,
    values: readonly T[],
  ): void {
    const selected = new Set(values);
    for (const [value, input] of inputs.entries()) {
      input.checked = selected.has(value);
    }
  }

  // ----- Start gate (Req 13.4) -----
  function handleStart(): void {
    // Před spuštěním skryjeme předchozí upozornění (uživatel zkouší znovu).
    hideWarning();
    callbacks.onStart(getFilters(), getSeed(), profileSelector.getProfile());
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
        CS.filters.empty;
    },
    clearWarning(): void {
      hideWarning();
    },
    setSeed(seed: number): void {
      seedInput.value = String(seed);
    },
    setFilters(filters: Filters): void {
      setCheckedValues(positionInputs, filters.positions);
      setCheckedValues(bucketInputs, filters.buckets);
      setCheckedValues(contextInputs, filters.contexts);
      anteInput.checked = filters.ante === "ON";
      scoringSelect.value = filters.scoringMode;
      opponentSelect.value = filters.opponentStyle ?? "";
      hideWarning();
    },
    getProfile(): TrainingProfile {
      return profileSelector.getProfile();
    },
    setProfile(profile: TrainingProfile): void {
      profileSelector.setProfile(profile);
      renderPositionControls(profile.tableFormat);
      hideWarning();
    },
    destroy(): void {
      profileSelector.destroy();
      startBtn.removeEventListener("click", handleStart);
      root.innerHTML = "";
    },
  };
}
