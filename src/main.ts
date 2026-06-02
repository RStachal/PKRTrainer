/**
 * Bootstrap a propojení aplikace MTT Preflop Trainer (task 20.1).
 *
 * Tento modul je tenká integrační vrstva (DOM I/O). Spojuje čisté jádro
 * (Drill_Engine, Scoring_Engine), datovou vrstvu (Range_Store), perzistenci
 * (migrace + Stats_Store) a UI komponenty (filtry, stůl, range matice,
 * dashboard, HH import) do funkčního celku. Veškerý uživatelský text je v
 * češtině (Req 12.3); strojové identifikátory zůstávají v ASCII.
 *
 * ## Inicializační pořadí (design „Inicializační pořadí", Req 14)
 *
 *   1. **Migrace** (`runMigration`) — proběhne jen, pokud nový stav dosud
 *      neexistuje (idempotence řeší samotná `runMigration`).
 *   2. **Ověření platného stavu** pod verzovanými klíči. Pokud nelze získat ani
 *      migrovaný, ani čistý nový stav ⇒ **Req 14.6**: zobraz chybu
 *      „nekonzistentní úložiště" a relaci NESPOUŠTĚJ.
 *   3. **Načtení Range_Store** (`isRangeDataLoaded`). Pokud data nejsou načtena
 *      jako celek ⇒ **Req 4.6**: zobraz chybu „ranges nedostupné" a relaci
 *      NESPOUŠTĚJ.
 *   4. Jinak zobraz filtry a čekej na **explicitní start** (**Req 13.4**) —
 *      žádné spoty se negenerují automaticky.
 *
 * ## Globální error boundary (Req 12.3)
 *
 * Celý bootstrap je obalen `try/catch`; navíc se registrují posluchače
 * `window.error` a `window.unhandledrejection`, které vykreslí českou chybovou
 * zprávu do DOM. Aplikace tak nikdy „tiše nespadne".
 *
 * ## Service Worker (Req 12.4)
 *
 * `registerServiceWorker` se volá defenzivně; při selhání nakešování zobrazí
 * nenásilné české upozornění a neblokuje aplikaci.
 *
 * _Requirements: 4.6, 12.3, 12.4, 13.4, 14.6_
 */

import type {
  ActionKey,
  Filters,
  ScoringMode,
  SessionConfig,
  Spot,
} from "./core/types";
import type { TrainingProfile } from "./core/trainingProfile";
import { resolveSeed, spotSequence } from "./core/drillEngine";
import { grade } from "./core/scoring";
import { rangeStore } from "./data/rangeStore";
import { getRangeDataErrors, isRangeDataLoaded } from "./data/ranges";
import { hasNewState, runMigration, type MigrationResult } from "./persistence/migration";
import { createStatsStore, type ResultRecord, type StatsStore } from "./persistence/statsStore";
import { KEY_EVENTS, KEY_STATE, SCHEMA_VERSION } from "./persistence/keys";
import {
  bridgePostflopResultRecordToStatsV2,
  buildPostflopResultRecord,
  type PostflopStatsV2BridgeRecord,
} from "./persistence/postflopResultRecord";
import { rangePackForTrainingProfile } from "./data/ranges/trainingRangePacks";
import { renderFilters, type FiltersView } from "./ui/filters";
import { renderTable } from "./ui/tableRenderer";
import { renderMatrix } from "./ui/rangeMatrixView";
import { renderRangeModalButton } from "./ui/rangeModal";
import { renderDashboard } from "./ui/dashboard";
import { renderHHView } from "./ui/hhView";
import { renderPostflopView } from "./ui/postflopView";
import { registerServiceWorker } from "./pwa/registerSw";

// ---------------------------------------------------------------------------
// České popisky Akčních_klíčů (zobrazení doporučení po vyhodnocení, Req 12.3)
// ---------------------------------------------------------------------------

const ACTION_KEY_LABEL: Record<ActionKey, string> = {
  FOLD: "Fold",
  CALL: "Call / Dorovnat",
  LIMP: "Limp / Check",
  OVERLIMP: "Over-limp",
  OPEN_2X: "Raise 2×",
  OPEN_25X: "Raise 2,5×",
  OPEN_3X: "Raise 3×",
  ISO_2X: "Iso-raise 2×",
  ISO_25X: "Iso-raise 2,5×",
  ISO_3X: "Iso-raise 3×",
  "3BET": "3-bet",
  "4BET": "4-bet",
  SQUEEZE: "Squeeze",
  JAM: "All-in",
  CALL_JAM: "Call all-in",
};

/** Přeloží Akční_klíč na český popisek (fallback = samotný klíč). */
function actionKeyLabel(key: ActionKey): string {
  return ACTION_KEY_LABEL[key] ?? key;
}

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

/** Vytvoří element s volitelnou CSS třídou a textem. */
function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------
// Inicializace úložiště (Req 14.2, 14.3, 14.6)
// ---------------------------------------------------------------------------

/** Výsledek inicializace lokálního úložiště. */
interface StorageInit {
  /** Je pod verzovanými klíči k dispozici platný (migrovaný / čistý) stav? */
  ok: boolean;
  /** Výsledek migrace (pro odvození uživatelských upozornění). */
  migration?: MigrationResult;
  /** Selhala migrace, takže trénink začíná s prázdnými statistikami (Req 14.3). */
  startedEmpty: boolean;
}

/**
 * Zapíše čistý nový stav (prázdný event log + snapshot) pod verzované klíče,
 * pokud tam dosud žádný platný stav není, a ověří jeho dostupnost.
 *
 * Vrací `true`, je-li po dokončení pod verzovanými klíči platný stav; `false`
 * při jakékoli chybě I/O (⇒ nekonzistentní úložiště, Req 14.6).
 */
function ensureCleanState(storage: Storage): boolean {
  try {
    if (!hasNewState(storage)) {
      const snapshot = {
        version: SCHEMA_VERSION,
        answered: 0,
        correct: 0,
        streak: 0,
      };
      storage.setItem(KEY_EVENTS, "[]");
      storage.setItem(KEY_STATE, JSON.stringify(snapshot));
    }
    // Ověření: stav musí být po zápisu skutečně dostupný (čitelný).
    return hasNewState(storage);
  } catch {
    return false;
  }
}

/**
 * Provede inicializační krok 1–2 (migrace + ověření stavu) dle designu.
 *
 *   - `runMigration` (idempotentní): migruje legacy data nebo nahlásí
 *     `clean`/`failed`.
 *   - Pro `migrated`/`noop` ověří přítomnost nového stavu; chybí-li, inicializuje
 *     čistý stav.
 *   - Pro `clean` inicializuje čistý nový stav.
 *   - Pro `failed` ponechá legacy beze změny a inicializuje čistý nový stav
 *     (Req 14.3); nelze-li to, signalizuje nekonzistentní úložiště (Req 14.6).
 */
function initializeStorage(storage: Storage): StorageInit {
  const migration = runMigration(storage);

  switch (migration.status) {
    case "failed": {
      // Req 14.3: migrace selhala ⇒ legacy beze změny, čistý nový stav.
      const ok = ensureCleanState(storage);
      return { ok, migration, startedEmpty: ok };
    }
    case "clean": {
      // Žádná legacy data ⇒ čistý start.
      const ok = ensureCleanState(storage);
      return { ok, migration, startedEmpty: false };
    }
    case "migrated":
    case "noop":
    default: {
      // Po migraci/idempotentním noopu by měl stav existovat; pojistka pro
      // případ nastaveného příznaku migrace bez stavu.
      const ok = hasNewState(storage) || ensureCleanState(storage);
      return { ok, migration, startedEmpty: false };
    }
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/** Volitelné parametry bootstrapu (injektovatelné pro testy). */
export interface BootstrapOptions {
  /** Kořenový element aplikace (výchozí `#app`). */
  root?: HTMLElement | null;
  /** Lokální úložiště (výchozí `localStorage`, je-li dostupné). */
  storage?: Storage;
  /** Zaregistrovat Service Worker? (výchozí: jen v produkčním buildu). */
  registerSw?: boolean;
}

/**
 * Sestaví aplikaci a propojí všechny komponenty.
 *
 * Idempotentní vůči `root`: před vykreslením kořen vyprázdní. Celé tělo je
 * obaleno `try/catch` (Req 12.3) — neočekávaná chyba vyústí v českou chybovou
 * zprávu v DOM, nikoli v tichý pád.
 *
 * @param options Volitelné injektovatelné závislosti (root, storage, SW).
 */
export function bootstrap(options: BootstrapOptions = {}): void {
  const root =
    options.root ?? (typeof document !== "undefined" ? document.getElementById("app") : null);
  if (!root) return;

  // Globální error boundary (Req 12.3) — i mimo synchronní tok bootstrapu.
  installGlobalErrorBoundary(root);

  try {
    renderApp(root, options);
  } catch (err) {
    showFatalError(
      root,
      "Aplikaci se nepodařilo spustit kvůli neočekávané chybě. Zkuste ji prosím " +
        "načíst znovu.",
      err,
    );
  }
}

/**
 * Hlavní vykreslení aplikace: app shell (záložky), inicializace úložiště,
 * ověření Range_Store a propojení tréninkové smyčky, statistik a HH importu.
 */
function renderApp(root: HTMLElement, options: BootstrapOptions): void {
  root.innerHTML = "";

  const storage: Storage | null =
    options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);

  // --- App shell: hlavička, záložky, panely, banner upozornění ---
  const shell = buildAppShell(root);

  // --- Krok 1–2: migrace + ověření stavu (Req 14) ---
  if (!storage) {
    // Bez úložiště nelze zaručit konzistentní stav ⇒ Req 14.6.
    renderStorageError(shell.trainingPanel);
    // HH import nezávisí na úložišti — necháme ho funkční.
    renderHHView(shell.hhPanel);
    renderPostflopView(shell.postflopPanel);
    return;
  }

  const storageInit = initializeStorage(storage);
  if (!storageInit.ok) {
    // Req 14.6: nelze získat platný stav pod verzovanými klíči.
    renderStorageError(shell.trainingPanel);
    renderHHView(shell.hhPanel);
    renderPostflopView(shell.postflopPanel);
    return;
  }

  // Req 14.3: migrace selhala, ale čistý stav je k dispozici ⇒ nenásilné
  // upozornění, že trénink začíná s prázdnými statistikami.
  if (storageInit.startedEmpty) {
    showNotice(
      shell.notice,
      "Migrace dat z předchozí verze neproběhla. Trénink začíná s prázdnými " +
        "statistikami; vaše původní data zůstala nedotčená.",
    );
  }

  const statsStore = createStatsStore(storage);

  // Statistiky (dashboard) a HH import jsou dostupné nezávisle na Range_Store.
  let sessionCount = 0;
  let postflopRecords: PostflopStatsV2BridgeRecord[] = [];
  let currentPostflopProfile: TrainingProfile | undefined;
  const refreshDashboard = (): void => {
    renderDashboard({ store: statsStore, sessionCount, postflopRecords }, shell.statsPanel);
  };
  const renderPostflopPanel = (
    options: { initialSeed?: number; profile?: TrainingProfile } = {},
  ): void => {
    currentPostflopProfile = options.profile ?? currentPostflopProfile;
    renderPostflopView(shell.postflopPanel, {
      initialStreet: "FLOP",
      initialSeed: options.initialSeed,
      onAnswered: (spot, chosen) => {
        const record = buildPostflopResultRecord(spot, chosen);
        postflopRecords = postflopRecords.concat(
          bridgePostflopResultRecordToStatsV2(record, {
            profile: currentPostflopProfile,
          }),
        );
        sessionCount += 1;
        refreshDashboard();
      },
    });
  };
  refreshDashboard();
  renderHHView(shell.hhPanel);
  renderPostflopPanel();

  // --- Krok 3: načtení Range_Store (Req 4.6) ---
  if (!isRangeDataLoaded()) {
    // Diagnostiku zalogujeme (bez pádu); uživateli zobrazíme české upozornění.
    const errors = getRangeDataErrors();
    if (errors.length > 0 && typeof console !== "undefined") {
      console.warn("Range_Store není načten:", errors);
    }
    renderRangesError(shell.trainingPanel);
    return;
  }

  // --- Krok 4: filtry + tréninková smyčka (Req 13.4) ---
  setupTraining(shell, statsStore, {
    onAnswered: () => {
      sessionCount += 1;
    },
    getSessionCount: () => sessionCount,
    resetSession: () => {
      sessionCount = 0;
    },
    refreshDashboard,
    startPostflopFlow: (seed, profile) => {
      postflopRecords = [];
      renderPostflopPanel({ initialSeed: seed, profile });
      refreshDashboard();
      shell.selectTab("postflop");
    },
  });

  // --- Service Worker (Req 12.4) ---
  maybeRegisterServiceWorker(shell.notice, options.registerSw);
}

// ---------------------------------------------------------------------------
// App shell (záložky Trénink / Statistiky / Import HH)
// ---------------------------------------------------------------------------

/** Reference na klíčové části app shellu. */
interface AppShell {
  notice: HTMLElement;
  trainingPanel: HTMLElement;
  statsPanel: HTMLElement;
  hhPanel: HTMLElement;
  postflopPanel: HTMLElement;
  selectTab: (id: TabId) => void;
}

/** Identifikátory záložek. */
type TabId = "training" | "stats" | "hh" | "postflop";

/**
 * Sestaví statickou kostru aplikace: hlavičku s názvem, navigaci záložek,
 * tři panely (Trénink / Statistiky / Import HH) a banner pro nenásilná
 * upozornění. Vrátí reference na panely a banner.
 */
function buildAppShell(root: HTMLElement): AppShell {
  root.appendChild(appStyles());

  const app = el("div", "app");

  // Hlavička.
  const header = el("header", "app__header");
  header.appendChild(el("h1", "app__title", "MTT Preflop Trainer"));
  header.appendChild(
    el(
      "p",
      "app__subtitle",
      "Trénink preflop rozhodování — full ring 9-handed, 5–150 BB.",
    ),
  );
  app.appendChild(header);

  // Banner upozornění (Req 12.4, 14.3) — nenásilný, skrytý dokud není potřeba.
  const notice = el("div", "app__notice");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  app.appendChild(notice);

  // Navigace záložek.
  const nav = el("nav", "app__tabs");
  const trainingPanel = el("section", "app__panel app__panel--training");
  const statsPanel = el("section", "app__panel app__panel--stats");
  const hhPanel = el("section", "app__panel app__panel--hh");
  const postflopPanel = el("section", "app__panel app__panel--postflop");

  const panels: Record<TabId, HTMLElement> = {
    training: trainingPanel,
    stats: statsPanel,
    hh: hhPanel,
    postflop: postflopPanel,
  };

  const tabDefs: { id: TabId; label: string }[] = [
    { id: "training", label: "Trénink" },
    { id: "stats", label: "Statistiky" },
    { id: "hh", label: "Import HH" },
    { id: "postflop", label: "Postflop" },
  ];

  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const selectTab = (id: TabId): void => {
    for (const def of tabDefs) {
      const isActive = def.id === id;
      panels[def.id].hidden = !isActive;
      const btn = tabButtons.get(def.id);
      if (btn) {
        btn.classList.toggle("app__tab--active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      }
    }
  };

  for (const def of tabDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app__tab";
    btn.dataset.tab = def.id;
    btn.textContent = def.label;
    btn.addEventListener("click", () => selectTab(def.id));
    tabButtons.set(def.id, btn);
    nav.appendChild(btn);
  }
  app.appendChild(nav);

  app.appendChild(trainingPanel);
  app.appendChild(statsPanel);
  app.appendChild(hhPanel);
  app.appendChild(postflopPanel);

  root.appendChild(app);

  // Výchozí záložka: Trénink.
  selectTab("training");

  return { notice, trainingPanel, statsPanel, hhPanel, postflopPanel, selectTab };
}

// ---------------------------------------------------------------------------
// Tréninková smyčka (Req 13.4, 13.6, 7, 9, 10)
// ---------------------------------------------------------------------------

/** Callbacky propojující tréninkovou smyčku se stavem relace v `main.ts`. */
interface TrainingHooks {
  /** Zavolá se po každém vyhodnocení odpovědi (inkrement počtu spotů relace). */
  onAnswered: () => void;
  /** Vrátí aktuální počet spotů relace (Req 9.5). */
  getSessionCount: () => number;
  /** Vynuluje počet spotů relace (při novém startu). */
  resetSession: () => void;
  /** Překreslí dashboard statistik. */
  refreshDashboard: () => void;
  startPostflopFlow: (seed: number, profile: TrainingProfile) => void;
}

function isProductionPreflopProfile(profile: TrainingProfile): boolean {
  return (
    profile.gameVariant === "MTT" &&
    profile.tableFormat === "FULL_RING_9" &&
    profile.blindSpeed === "REGULAR" &&
    profile.street === "PREFLOP" &&
    profile.evModel === "CHIP_EV" &&
    profile.rakeMode === "NONE"
  );
}

function profileGateMessage(profile: TrainingProfile): string {
  const pack = rangePackForTrainingProfile(profile);
  if (pack && (pack.confidence === "LOW" || pack.records.length === 0)) {
    return (
      `Profil ${pack.id} je zatím candidate/preview: má LOW confidence nebo 0 records. ` +
      "Produkční trénink se nespustí, dokud neprojde import report a ověření hand-class hodnot."
    );
  }

  return (
    "Zvolený profil je zatím preview a nemá produkčně ověřený RangePack pro scoring. " +
    "Použijte MTT 9-max regular preflop chipEV nebo flop preview."
  );
}

/**
 * Sestaví tréninkovou sekci: filtry (se stráží explicitního startu, Req 13.4) a
 * herní oblast (stůl + akce + výsledek + range matice). Generování spotů začne
 * **až** po kliknutí na Start ve filtrech.
 */
function setupTraining(
  shell: AppShell,
  statsStore: StatsStore,
  hooks: TrainingHooks,
): void {
  const panel = shell.trainingPanel;
  panel.innerHTML = "";

  // Kontejner filtrů + herní oblast.
  const filtersBox = el("div", "training__filters");
  const gameBox = el("div", "training__game");
  gameBox.hidden = true; // dokud uživatel nespustí relaci (Req 13.4).
  panel.appendChild(filtersBox);
  panel.appendChild(gameBox);

  // Herní sub-oblasti.
  const tableContainer = el("div", "training__table");
  const actionsContainer = el("div", "training__actions");
  const resultContainer = el("div", "training__result");
  const matrixContainer = el("div", "training__matrix");
  gameBox.appendChild(tableContainer);
  gameBox.appendChild(actionsContainer);
  gameBox.appendChild(resultContainer);
  gameBox.appendChild(matrixContainer);

  // Stav běžící relace (iterátor sekvence).
  let iterator: Iterator<Spot> | null = null;
  let answered = false; // bylo už na aktuální spot odpovězeno?

  const filtersView: FiltersView = renderFilters(filtersBox, {
    onStart: (filters: Filters, seed: number | null, profile) => {
      if (profile.street === "FLOP") {
        startPostflopSession(seed, profile);
        return;
      }
      if (!isProductionPreflopProfile(profile)) {
        gameBox.hidden = true;
        filtersView.showEmptyResult(profileGateMessage(profile));
        return;
      }
      startSession(filters, seed);
    },
  });

  function startPostflopSession(seed: number | null, profile: TrainingProfile): void {
    const resolvedSeed = resolveSeed(seed);
    filtersView.setSeed(resolvedSeed);
    hooks.resetSession();
    filtersView.clearWarning();
    gameBox.hidden = true;
    hooks.startPostflopFlow(resolvedSeed, profile);
  }

  /**
   * Spustí relaci pro zvolené filtry a seed (Req 13.4 — pouze přes explicitní
   * start). Sestaví deterministickou sekvenci; je-li prázdná (Req 13.6),
   * zobrazí upozornění a relaci nespustí.
   */
  function startSession(filters: Filters, seed: number | null): void {
    // Req 6.7: vyřeš a zpřístupni platný seed (aby šel zopakovat).
    const resolvedSeed = resolveSeed(seed);
    filtersView.setSeed(resolvedSeed);

    const cfg: SessionConfig = { seed: resolvedSeed, filters };

    // Sestav sekvenci a zjisti, zda obsahuje alespoň jeden spot.
    const seq = spotSequence(cfg, rangeStore);
    const it = seq[Symbol.iterator]();
    const first = it.next();

    if (first.done) {
      // Req 13.6: prázdný průnik filtrů ⇒ upozornění, relaci nespouštěj.
      gameBox.hidden = true;
      filtersView.showEmptyResult();
      return;
    }

    // Nová relace: vynuluj počet spotů relace (Req 9.5) a vyčisti výsledek.
    hooks.resetSession();
    hooks.refreshDashboard();
    filtersView.clearWarning();

    iterator = it;
    gameBox.hidden = false;
    showSpot(first.value, filters);
  }

  /** Zobrazí spot: vykreslí stůl a nabídku akcí, vyčistí předchozí výsledek. */
  function showSpot(spot: Spot, filters: Filters): void {
    answered = false;

    renderTable(spot, filters.ante, tableContainer);
    resultContainer.innerHTML = "";
    matrixContainer.innerHTML = "";
    renderActions(spot, filters.scoringMode);
  }

  /** Vykreslí tlačítka nabízených akcí (Req 3.12 — 1 klíč na akci). */
  function renderActions(spot: Spot, mode: ScoringMode): void {
    actionsContainer.innerHTML = "";

    const heading = el("div", "training__actions-title", "Tvoje akce:");
    actionsContainer.appendChild(heading);

    const row = el("div", "training__actions-row");
    for (const answer of spot.answers) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn";
      btn.dataset.action = answer.key;
      btn.textContent = answer.label;
      btn.addEventListener("click", () => handleAnswer(spot, answer.key, mode));
      row.appendChild(btn);
    }
    actionsContainer.appendChild(row);
  }

  /**
   * Vyhodnotí zvolenou akci (Req 7), zobrazí správnost + zdůvodnění +
   * doporučené klíče, vykreslí range matici (Req 10), zaznamená výsledek do
   * Stats_Store PŘED dalším spotem (Req 9.1) a nabídne tlačítko „Další".
   */
  function handleAnswer(spot: Spot, chosen: ActionKey, mode: ScoringMode): void {
    if (answered) return; // jedna odpověď na spot.
    answered = true;

    // Zablokuj tlačítka akcí a zvýrazni zvolené.
    const buttons = actionsContainer.querySelectorAll<HTMLButtonElement>(".action-btn");
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.action === chosen) b.classList.add("action-btn--chosen");
    });

    // Vyhodnocení (čisté jádro).
    const result = grade(spot, chosen, mode);

    // Záznam výsledku PŘED dalším spotem (Req 9.1); selhání ⇒ upozornění (Req 9.6).
    const record: ResultRecord = {
      qid: spot.id,
      chosen,
      correct: result.correct,
      context: spot.context,
      position: spot.heroPos,
      bucket: spot.effStack,
      ts: Date.now(),
    };
    const save = statsStore.record(record);

    // Inkrement počtu spotů relace + překreslení dashboardu (Req 9.5).
    hooks.onAnswered();
    hooks.refreshDashboard();

    // Zobrazení výsledku, zdůvodnění a doporučení.
    renderResult(spot, result, save.ok);

    // Range matice pro daný spot (Req 10) + legacy parity modal.
    matrixContainer.innerHTML = "";
    renderRangeModalButton(spot, rangeStore, matrixContainer);
    const inlineMatrix = el("div", "training__matrix-inline");
    matrixContainer.appendChild(inlineMatrix);
    renderMatrix(spot, rangeStore, inlineMatrix);
  }

  /** Vykreslí indikaci správnosti, zdůvodnění a doporučené Akční_klíče (Req 7.4). */
  function renderResult(
    spot: Spot,
    result: ReturnType<typeof grade>,
    saveOk: boolean,
  ): void {
    resultContainer.innerHTML = "";

    const box = el("div", "result");
    box.classList.add(result.correct ? "result--correct" : "result--wrong");

    const verdict = el(
      "div",
      "result__verdict",
      result.correct ? "Správně!" : "Špatně.",
    );
    box.appendChild(verdict);

    // Doporučené Akční_klíče z Range_Store (Req 7.4 / 7.7).
    if (result.recommended.length > 0) {
      const rec = el(
        "div",
        "result__recommended",
        `Doporučeno: ${result.recommended.map(actionKeyLabel).join(" / ")}`,
      );
      box.appendChild(rec);
    }

    // Zdůvodnění (Req 7.4); při nedostupnosti zobraz náhradní text (Req 7.5).
    const explanation = el("div", "result__explanation");
    if (result.explanationAvailable) {
      explanation.textContent = spot.explanation;
    } else {
      explanation.textContent = "Zdůvodnění není k tomuto spotu k dispozici.";
      explanation.classList.add("result__explanation--unavailable");
    }
    box.appendChild(explanation);

    // Req 9.6: výsledek se nepodařilo uložit ⇒ upozornění, ale pokračujeme.
    if (!saveOk) {
      const warn = el(
        "div",
        "result__save-warning",
        "Upozornění: výsledek se nepodařilo uložit. Statistiky nemusí být úplné.",
      );
      box.appendChild(warn);
    }

    // Tlačítko „Další" — zobrazí další spot ze sekvence.
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "result__next";
    nextBtn.textContent = "Další spot";
    nextBtn.addEventListener("click", () => advance());
    box.appendChild(nextBtn);

    resultContainer.appendChild(box);
  }

  /** Posune sekvenci na další spot (Req 6.6 — sekvence cyklí deterministicky). */
  function advance(): void {
    if (!iterator) return;
    const next = iterator.next();
    if (next.done) {
      // Pojistka: neprázdná sekvence cyklí donekonečna, sem bychom se neměli
      // dostat. Defenzivně relaci ukončíme.
      gameBox.hidden = true;
      return;
    }
    showSpot(next.value, filtersView.getFilters());
  }
}

// ---------------------------------------------------------------------------
// Chybové stavy a upozornění (Req 4.6, 12.4, 14.6)
// ---------------------------------------------------------------------------

/** Vykreslí blok chyby do panelu (relaci nespouštět). */
function renderBlockingError(panel: HTMLElement, title: string, message: string): void {
  panel.innerHTML = "";
  const box = el("div", "fatal");
  box.setAttribute("role", "alert");
  box.appendChild(el("div", "fatal__title", title));
  box.appendChild(el("div", "fatal__message", message));
  panel.appendChild(box);
}

/** Req 14.6: nekonzistentní lokální úložiště — relaci nespouštět. */
function renderStorageError(panel: HTMLElement): void {
  renderBlockingError(
    panel,
    "Nekonzistentní úložiště",
    "Lokální úložiště je v nekonzistentním stavu a nelze v něm vytvořit ani " +
      "platný čistý stav. Trénink proto nelze spustit. Zkontrolujte prosím " +
      "nastavení prohlížeče (povolení úložiště) a načtěte aplikaci znovu.",
  );
}

/** Req 4.6: referenční ranges nejsou dostupné — relaci nespouštět. */
function renderRangesError(panel: HTMLElement): void {
  renderBlockingError(
    panel,
    "Referenční ranges nejsou dostupné",
    "Data referenčních ranges se nepodařilo načíst jako celek, proto nelze " +
      "generovat tréninkové spoty ani spustit relaci. Zkuste prosím aplikaci " +
      "načíst znovu.",
  );
}

/** Zobrazí nenásilné upozornění v banneru (Req 12.4, 14.3). */
function showNotice(notice: HTMLElement, message: string): void {
  notice.hidden = false;
  const line = el("div", "app__notice-line", message);
  notice.appendChild(line);
}

/**
 * Vykreslí fatální chybu (globální error boundary). Pokud už je v DOM app shell,
 * přidá nenásilné upozornění; jinak nahradí obsah kořene chybovým blokem.
 */
function showFatalError(root: HTMLElement, message: string, err?: unknown): void {
  if (typeof console !== "undefined") {
    console.error("MTT Preflop Trainer — chyba:", message, err);
  }
  // Pokud existuje banner upozornění, použij ho (nenásilně); jinak nahraď kořen.
  const notice = root.querySelector<HTMLElement>(".app__notice");
  if (notice) {
    notice.hidden = false;
    notice.appendChild(el("div", "app__notice-line", message));
    return;
  }
  renderBlockingError(root, "Došlo k chybě", message);
}

// ---------------------------------------------------------------------------
// Service Worker (Req 12.4)
// ---------------------------------------------------------------------------

/**
 * Defenzivně zaregistruje Service Worker (pokud je to vhodné). Při selhání
 * nakešování zobrazí nenásilné české upozornění (Req 12.4) a aplikaci
 * neblokuje. Ve výchozím stavu se registruje jen v produkčním buildu
 * (`import.meta.env.PROD`), aby nepřekážel ve vývoji/testech.
 */
function maybeRegisterServiceWorker(notice: HTMLElement, force?: boolean): void {
  const shouldRegister =
    force ?? (typeof import.meta !== "undefined" && import.meta.env?.PROD === true);
  if (!shouldRegister) return;

  void registerServiceWorker({
    onCacheFailure: () => {
      showNotice(
        notice,
        "Aplikaci se nepodařilo plně připravit pro offline použití. Online " +
          "funguje normálně; offline režim ale nemusí být dostupný.",
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Globální error boundary (Req 12.3)
// ---------------------------------------------------------------------------

/** Příznak, aby se posluchače registrovaly jen jednou. */
let errorBoundaryInstalled = false;

/**
 * Zaregistruje globální posluchače `error` a `unhandledrejection`, které
 * vykreslí českou chybovou zprávu do DOM místo tichého pádu (Req 12.3).
 */
function installGlobalErrorBoundary(root: HTMLElement): void {
  if (errorBoundaryInstalled || typeof window === "undefined") return;
  errorBoundaryInstalled = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    showFatalError(
      root,
      "Došlo k neočekávané chybě aplikace. Část funkcí nemusí fungovat správně.",
      event.error ?? event.message,
    );
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    showFatalError(
      root,
      "Došlo k neočekávané chybě při asynchronní operaci. Část funkcí nemusí " +
        "fungovat správně.",
      event.reason,
    );
  });
}

// ---------------------------------------------------------------------------
// Styly app shellu (soběstačné, aby aplikace fungovala i bez externího CSS)
// ---------------------------------------------------------------------------

function appStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
:root{color-scheme:dark;}
body{margin:0;background:#0b1018;color:#e8ecf7;
  font-family:system-ui,Arial,sans-serif;}
.app{max-width:980px;margin:0 auto;padding:18px 16px 48px;}
.app__header{margin-bottom:14px;}
.app__title{margin:0;font-size:24px;font-weight:900;letter-spacing:.3px;}
.app__subtitle{margin:4px 0 0;font-size:13px;color:#9aa6c2;}
.app__notice{margin:10px 0;padding:10px 12px;border-radius:8px;
  background:rgba(255,209,91,.14);border:1px solid rgba(255,209,91,.45);
  color:#ffd15b;font-size:13px;}
.app__notice-line+.app__notice-line{margin-top:6px;}
.app__tabs{display:flex;gap:6px;border-bottom:1px solid rgba(255,255,255,.12);
  margin-bottom:16px;}
.app__tab{appearance:none;border:0;background:transparent;color:#9aa6c2;
  font-size:14px;font-weight:700;padding:10px 16px;cursor:pointer;
  border-bottom:3px solid transparent;}
.app__tab--active{color:#e8ecf7;border-bottom-color:#2bd576;}
.app__panel{outline:none;}
.training__filters{background:#11151f;border:1px solid rgba(255,255,255,.08);
  border-radius:12px;padding:14px 16px;margin-bottom:16px;}
.profile-selector{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));
  gap:10px 12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid
  rgba(255,255,255,.1);}
.profile-selector__title{grid-column:1/-1;font-size:13px;font-weight:900;color:#e8ecf7;}
.profile-selector__field{display:grid;gap:4px;font-size:12px;color:#9aa6c2;}
.profile-selector__field select{min-width:0;background:#0f1624;color:#e8ecf7;
  border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:7px 8px;}
.profile-selector__note{grid-column:1/-1;font-size:12px;color:#9aa6c2;line-height:1.35;}
.training__game{display:flex;flex-direction:column;gap:16px;}
.training__actions-title{font-weight:700;font-size:14px;margin-bottom:8px;}
.training__actions-row{display:flex;flex-wrap:wrap;gap:8px;}
.action-btn{appearance:none;border:1px solid rgba(255,255,255,.18);
  background:#1b2333;color:#e8ecf7;font-size:14px;font-weight:700;
  padding:10px 16px;border-radius:10px;cursor:pointer;}
.action-btn:hover:not(:disabled){border-color:#2bd576;}
.action-btn:disabled{opacity:.55;cursor:default;}
.action-btn--chosen{outline:2px solid #2bd576;outline-offset:1px;}
.result{border-radius:12px;padding:14px 16px;}
.result--correct{background:rgba(43,213,118,.12);border:1px solid rgba(43,213,118,.5);}
.result--wrong{background:rgba(226,59,59,.12);border:1px solid rgba(226,59,59,.5);}
.result__verdict{font-size:18px;font-weight:900;margin-bottom:6px;}
.result__recommended{font-size:14px;font-weight:700;margin-bottom:6px;}
.result__explanation{font-size:13px;color:#cdd5e6;}
.result__explanation--unavailable{font-style:italic;color:#9aa6c2;}
.result__save-warning{margin-top:8px;font-size:12px;color:#ffd15b;}
.result__next{margin-top:12px;appearance:none;border:0;border-radius:10px;
  background:#2bd576;color:#0c3526;font-weight:800;font-size:14px;
  padding:9px 18px;cursor:pointer;}
.fatal{background:rgba(226,59,59,.12);border:1px solid rgba(226,59,59,.5);
  border-radius:12px;padding:16px 18px;}
.fatal__title{font-size:16px;font-weight:900;margin-bottom:6px;color:#ffb4b4;}
.fatal__message{font-size:13px;color:#e8ecf7;line-height:1.5;}
.filter-start{appearance:none;border:0;border-radius:10px;background:#2bd576;
  color:#0c3526;}
`;
  return style;
}

// ---------------------------------------------------------------------------
// Auto-start (mimo testovací prostředí)
// ---------------------------------------------------------------------------

// V prohlížeči spustíme bootstrap automaticky. V testech (importem modulu)
// se `bootstrap` volá ručně s injektovanými závislostmi, takže auto-start
// přeskočíme, pokud není dostupný `document`.
if (typeof document !== "undefined") {
  bootstrap();
}
