/**
 * Bootstrap a propojenĂ­ aplikace MTT Preflop Trainer (task 20.1).
 *
 * Tento modul je tenkĂˇ integraÄŤnĂ­ vrstva (DOM I/O). Spojuje ÄŤistĂ© jĂˇdro
 * (Drill_Engine, Scoring_Engine), datovou vrstvu (Range_Store), perzistenci
 * (migrace + Stats_Store) a UI komponenty (filtry, stĹŻl, range matice,
 * dashboard, HH import) do funkÄŤnĂ­ho celku. VeĹˇkerĂ˝ uĹľivatelskĂ˝ text je v
 * ÄŤeĹˇtinÄ› (Req 12.3); strojovĂ© identifikĂˇtory zĹŻstĂˇvajĂ­ v ASCII.
 *
 * ## InicializaÄŤnĂ­ poĹ™adĂ­ (design â€žInicializaÄŤnĂ­ poĹ™adĂ­", Req 14)
 *
 *   1. **Migrace** (`runMigration`) â€” probÄ›hne jen, pokud novĂ˝ stav dosud
 *      neexistuje (idempotence Ĺ™eĹˇĂ­ samotnĂˇ `runMigration`).
 *   2. **OvÄ›Ĺ™enĂ­ platnĂ©ho stavu** pod verzovanĂ˝mi klĂ­ÄŤi. Pokud nelze zĂ­skat ani
 *      migrovanĂ˝, ani ÄŤistĂ˝ novĂ˝ stav â‡’ **Req 14.6**: zobraz chybu
 *      â€žnekonzistentnĂ­ ĂşloĹľiĹˇtÄ›" a relaci NESPOUĹ TÄšJ.
 *   3. **NaÄŤtenĂ­ Range_Store** (`isRangeDataLoaded`). Pokud data nejsou naÄŤtena
 *      jako celek â‡’ **Req 4.6**: zobraz chybu â€žranges nedostupnĂ©" a relaci
 *      NESPOUĹ TÄšJ.
 *   4. Jinak zobraz filtry a ÄŤekej na **explicitnĂ­ start** (**Req 13.4**) â€”
 *      ĹľĂˇdnĂ© spoty se negenerujĂ­ automaticky.
 *
 * ## GlobĂˇlnĂ­ error boundary (Req 12.3)
 *
 * CelĂ˝ bootstrap je obalen `try/catch`; navĂ­c se registrujĂ­ posluchaÄŤe
 * `window.error` a `window.unhandledrejection`, kterĂ© vykreslĂ­ ÄŤeskou chybovou
 * zprĂˇvu do DOM. Aplikace tak nikdy â€žtiĹˇe nespadne".
 *
 * ## Service Worker (Req 12.4)
 *
 * `registerServiceWorker` se volĂˇ defenzivnÄ›; pĹ™i selhĂˇnĂ­ nakeĹˇovĂˇnĂ­ zobrazĂ­
 * nenĂˇsilnĂ© ÄŤeskĂ© upozornÄ›nĂ­ a neblokuje aplikaci.
 *
 * _Requirements: 4.6, 12.3, 12.4, 13.4, 14.6_
 */

import type {
  ActionKey,
  ActionContext,
  Filters,
  ScoringMode,
  SessionConfig,
  Spot,
} from "./core/types";
import {
  isPostflopStreet,
  type TrainingProfile,
} from "./core/trainingProfile";
import { resolveSeed, spotSequence } from "./core/drillEngine";
import { postflopIntentFromFilters } from "./core/postflopIntent";
import { grade } from "./core/scoring";
import type { PostflopStreet } from "./core/postflopGenerator";
import { rangeStore } from "./data/rangeStore";
import { getRangeDataErrors, isRangeDataLoaded } from "./data/ranges";
import { hasNewState, runMigration, type MigrationResult } from "./persistence/migration";
import { createStatsStore, type ResultRecord, type StatsStore } from "./persistence/statsStore";
import { KEY_EVENTS, KEY_STATE, SCHEMA_VERSION } from "./persistence/keys";
import {
  bridgePostflopResultRecordToStatsV2,
  buildPostflopResultRecord,
} from "./persistence/postflopResultRecord";
import { createPostflopStatsStore } from "./persistence/postflopStatsStore";
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
// ÄŚeskĂ© popisky AkÄŤnĂ­ch_klĂ­ÄŤĹŻ (zobrazenĂ­ doporuÄŤenĂ­ po vyhodnocenĂ­, Req 12.3)
// ---------------------------------------------------------------------------

const ACTION_KEY_LABEL: Record<ActionKey, string> = {
  FOLD: "Fold",
  CALL: "Call / Dorovnat",
  LIMP: "Limp / Check",
  OVERLIMP: "Over-limp",
  OPEN_2X: "Raise 2Ă—",
  OPEN_25X: "Raise 2,5Ă—",
  OPEN_3X: "Raise 3Ă—",
  ISO_2X: "Iso-raise 2Ă—",
  ISO_25X: "Iso-raise 2,5Ă—",
  ISO_3X: "Iso-raise 3Ă—",
  "3BET": "3-bet",
  "4BET": "4-bet",
  SQUEEZE: "Squeeze",
  JAM: "All-in",
  CALL_JAM: "Call all-in",
};

const ACTION_CONTEXT_LABEL: Record<ActionContext, string> = {
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

/** PĹ™eloĹľĂ­ AkÄŤnĂ­_klĂ­ÄŤ na ÄŤeskĂ˝ popisek (fallback = samotnĂ˝ klĂ­ÄŤ). */
function actionKeyLabel(key: ActionKey): string {
  return ACTION_KEY_LABEL[key] ?? key;
}

function actionContextLabel(context: ActionContext): string {
  return ACTION_CONTEXT_LABEL[context] ?? context;
}

// ---------------------------------------------------------------------------
// DOM helpery
// ---------------------------------------------------------------------------

/** VytvoĹ™Ă­ element s volitelnou CSS tĹ™Ă­dou a textem. */
function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------
// Inicializace ĂşloĹľiĹˇtÄ› (Req 14.2, 14.3, 14.6)
// ---------------------------------------------------------------------------

/** VĂ˝sledek inicializace lokĂˇlnĂ­ho ĂşloĹľiĹˇtÄ›. */
interface StorageInit {
  /** Je pod verzovanĂ˝mi klĂ­ÄŤi k dispozici platnĂ˝ (migrovanĂ˝ / ÄŤistĂ˝) stav? */
  ok: boolean;
  /** VĂ˝sledek migrace (pro odvozenĂ­ uĹľivatelskĂ˝ch upozornÄ›nĂ­). */
  migration?: MigrationResult;
  /** Selhala migrace, takĹľe trĂ©nink zaÄŤĂ­nĂˇ s prĂˇzdnĂ˝mi statistikami (Req 14.3). */
  startedEmpty: boolean;
}

/**
 * ZapĂ­Ĺˇe ÄŤistĂ˝ novĂ˝ stav (prĂˇzdnĂ˝ event log + snapshot) pod verzovanĂ© klĂ­ÄŤe,
 * pokud tam dosud ĹľĂˇdnĂ˝ platnĂ˝ stav nenĂ­, a ovÄ›Ĺ™Ă­ jeho dostupnost.
 *
 * VracĂ­ `true`, je-li po dokonÄŤenĂ­ pod verzovanĂ˝mi klĂ­ÄŤi platnĂ˝ stav; `false`
 * pĹ™i jakĂ©koli chybÄ› I/O (â‡’ nekonzistentnĂ­ ĂşloĹľiĹˇtÄ›, Req 14.6).
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
    // OvÄ›Ĺ™enĂ­: stav musĂ­ bĂ˝t po zĂˇpisu skuteÄŤnÄ› dostupnĂ˝ (ÄŤitelnĂ˝).
    return hasNewState(storage);
  } catch {
    return false;
  }
}

/**
 * Provede inicializaÄŤnĂ­ krok 1â€“2 (migrace + ovÄ›Ĺ™enĂ­ stavu) dle designu.
 *
 *   - `runMigration` (idempotentnĂ­): migruje legacy data nebo nahlĂˇsĂ­
 *     `clean`/`failed`.
 *   - Pro `migrated`/`noop` ovÄ›Ĺ™Ă­ pĹ™Ă­tomnost novĂ©ho stavu; chybĂ­-li, inicializuje
 *     ÄŤistĂ˝ stav.
 *   - Pro `clean` inicializuje ÄŤistĂ˝ novĂ˝ stav.
 *   - Pro `failed` ponechĂˇ legacy beze zmÄ›ny a inicializuje ÄŤistĂ˝ novĂ˝ stav
 *     (Req 14.3); nelze-li to, signalizuje nekonzistentnĂ­ ĂşloĹľiĹˇtÄ› (Req 14.6).
 */
function initializeStorage(storage: Storage): StorageInit {
  const migration = runMigration(storage);

  switch (migration.status) {
    case "failed": {
      // Req 14.3: migrace selhala â‡’ legacy beze zmÄ›ny, ÄŤistĂ˝ novĂ˝ stav.
      const ok = ensureCleanState(storage);
      return { ok, migration, startedEmpty: ok };
    }
    case "clean": {
      // Ĺ˝ĂˇdnĂˇ legacy data â‡’ ÄŤistĂ˝ start.
      const ok = ensureCleanState(storage);
      return { ok, migration, startedEmpty: false };
    }
    case "migrated":
    case "noop":
    default: {
      // Po migraci/idempotentnĂ­m noopu by mÄ›l stav existovat; pojistka pro
      // pĹ™Ă­pad nastavenĂ©ho pĹ™Ă­znaku migrace bez stavu.
      const ok = hasNewState(storage) || ensureCleanState(storage);
      return { ok, migration, startedEmpty: false };
    }
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/** VolitelnĂ© parametry bootstrapu (injektovatelnĂ© pro testy). */
export interface BootstrapOptions {
  /** KoĹ™enovĂ˝ element aplikace (vĂ˝chozĂ­ `#app`). */
  root?: HTMLElement | null;
  /** LokĂˇlnĂ­ ĂşloĹľiĹˇtÄ› (vĂ˝chozĂ­ `localStorage`, je-li dostupnĂ©). */
  storage?: Storage;
  /** Zaregistrovat Service Worker? (vĂ˝chozĂ­: jen v produkÄŤnĂ­m buildu). */
  registerSw?: boolean;
}

/**
 * SestavĂ­ aplikaci a propojĂ­ vĹˇechny komponenty.
 *
 * IdempotentnĂ­ vĹŻÄŤi `root`: pĹ™ed vykreslenĂ­m koĹ™en vyprĂˇzdnĂ­. CelĂ© tÄ›lo je
 * obaleno `try/catch` (Req 12.3) â€” neoÄŤekĂˇvanĂˇ chyba vyĂşstĂ­ v ÄŤeskou chybovou
 * zprĂˇvu v DOM, nikoli v tichĂ˝ pĂˇd.
 *
 * @param options VolitelnĂ© injektovatelnĂ© zĂˇvislosti (root, storage, SW).
 */
export function bootstrap(options: BootstrapOptions = {}): void {
  const root =
    options.root ?? (typeof document !== "undefined" ? document.getElementById("app") : null);
  if (!root) return;

  // GlobĂˇlnĂ­ error boundary (Req 12.3) â€” i mimo synchronnĂ­ tok bootstrapu.
  installGlobalErrorBoundary(root);

  try {
    renderApp(root, options);
  } catch (err) {
    showFatalError(
      root,
      "Aplikaci se nepodaĹ™ilo spustit kvĹŻli neoÄŤekĂˇvanĂ© chybÄ›. Zkuste ji prosĂ­m " +
        "naÄŤĂ­st znovu.",
      err,
    );
  }
}

/**
 * HlavnĂ­ vykreslenĂ­ aplikace: app shell (zĂˇloĹľky), inicializace ĂşloĹľiĹˇtÄ›,
 * ovÄ›Ĺ™enĂ­ Range_Store a propojenĂ­ trĂ©ninkovĂ© smyÄŤky, statistik a HH importu.
 */
function renderApp(root: HTMLElement, options: BootstrapOptions): void {
  root.innerHTML = "";

  const storage: Storage | null =
    options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);

  // --- App shell: hlaviÄŤka, zĂˇloĹľky, panely, banner upozornÄ›nĂ­ ---
  const shell = buildAppShell(root);

  // --- Krok 1â€“2: migrace + ovÄ›Ĺ™enĂ­ stavu (Req 14) ---
  if (!storage) {
    // Bez ĂşloĹľiĹˇtÄ› nelze zaruÄŤit konzistentnĂ­ stav â‡’ Req 14.6.
    renderStorageError(shell.trainingPanel);
    // HH import nezĂˇvisĂ­ na ĂşloĹľiĹˇti â€” nechĂˇme ho funkÄŤnĂ­.
    renderHHView(shell.hhPanel);
    renderPostflopView(shell.postflopPanel);
    return;
  }

  const storageInit = initializeStorage(storage);
  if (!storageInit.ok) {
    // Req 14.6: nelze zĂ­skat platnĂ˝ stav pod verzovanĂ˝mi klĂ­ÄŤi.
    renderStorageError(shell.trainingPanel);
    renderHHView(shell.hhPanel);
    renderPostflopView(shell.postflopPanel);
    return;
  }

  // Req 14.3: migrace selhala, ale ÄŤistĂ˝ stav je k dispozici â‡’ nenĂˇsilnĂ©
  // upozornÄ›nĂ­, Ĺľe trĂ©nink zaÄŤĂ­nĂˇ s prĂˇzdnĂ˝mi statistikami.
  if (storageInit.startedEmpty) {
    showNotice(
      shell.notice,
      "Migrace dat z pĹ™edchozĂ­ verze neprobÄ›hla. TrĂ©nink zaÄŤĂ­nĂˇ s prĂˇzdnĂ˝mi " +
        "statistikami; vaĹˇe pĹŻvodnĂ­ data zĹŻstala nedotÄŤenĂˇ.",
    );
  }

  const statsStore = createStatsStore(storage);
  const postflopStatsStore = createPostflopStatsStore(storage);

  // Statistiky (dashboard) a HH import jsou dostupnĂ© nezĂˇvisle na Range_Store.
  let sessionCount = 0;
  let currentPostflopProfile: TrainingProfile | undefined;
  const refreshDashboard = (): void => {
    renderDashboard({
      store: statsStore,
      sessionCount,
      postflopRecords: postflopStatsStore.events(),
      onPostflopRecordsImported: (records) => {
        const save = postflopStatsStore.replaceAll(records);
        if (!save.ok) {
          showNotice(
            shell.notice,
            "Postflop zaznamy se nepodarilo ulozit. Export preflop statistik zustal zachovany.",
          );
        }
        return save.ok;
      },
    }, shell.statsPanel);
  };
  const renderPostflopPanel = (
    options: {
      initialSeed?: number;
      initialStreet?: PostflopStreet;
      profile?: TrainingProfile;
      filters?: Filters;
      autoGenerate?: boolean;
    } = {},
  ): void => {
    currentPostflopProfile = options.profile ?? currentPostflopProfile;
    const postflopIntent = options.filters ? postflopIntentFromFilters(options.filters) : null;
    renderPostflopView(shell.postflopPanel, {
      initialStreet: options.initialStreet ?? "FLOP",
      initialSeed: options.initialSeed,
      initialPositionContext: postflopIntent?.positionContext,
      initialPotType: postflopIntent?.potType,
      initialPotBB: postflopIntent?.potBB,
      initialEffectiveStackBB: postflopIntent?.effectiveStackBB,
      autoGenerate: options.autoGenerate === true,
      onAnswered: (spot, chosen) => {
        const record = buildPostflopResultRecord(spot, chosen);
        const save = postflopStatsStore.record(bridgePostflopResultRecordToStatsV2(record, {
          profile: currentPostflopProfile,
        }));
        if (!save.ok) {
          showNotice(
            shell.notice,
            "Postflop odpoved se nepodarilo ulozit do lokalniho uloziste.",
          );
        }
        sessionCount += 1;
        refreshDashboard();
      },
    });
  };
  refreshDashboard();
  renderHHView(shell.hhPanel);
  renderPostflopPanel();

  // --- Krok 3: naÄŤtenĂ­ Range_Store (Req 4.6) ---
  if (!isRangeDataLoaded()) {
    // Diagnostiku zalogujeme (bez pĂˇdu); uĹľivateli zobrazĂ­me ÄŤeskĂ© upozornÄ›nĂ­.
    const errors = getRangeDataErrors();
    if (errors.length > 0 && typeof console !== "undefined") {
      console.warn("Range_Store nenĂ­ naÄŤten:", errors);
    }
    renderRangesError(shell.trainingPanel);
    return;
  }

  // --- Krok 4: filtry + trĂ©ninkovĂˇ smyÄŤka (Req 13.4) ---
  setupTraining(shell, statsStore, {
    onAnswered: () => {
      sessionCount += 1;
    },
    getSessionCount: () => sessionCount,
    resetSession: () => {
      sessionCount = 0;
    },
    refreshDashboard,
    startPostflopFlow: (seed, street, profile, filters) => {
      renderPostflopPanel({
        initialSeed: seed,
        initialStreet: street,
        profile,
        filters,
        autoGenerate: true,
      });
      refreshDashboard();
      shell.selectTab("postflop");
    },
  });

  // --- Service Worker (Req 12.4) ---
  maybeRegisterServiceWorker(shell.notice, options.registerSw);
}

// ---------------------------------------------------------------------------
// App shell (zĂˇloĹľky TrĂ©nink / Statistiky / Import HH)
// ---------------------------------------------------------------------------

/** Reference na klĂ­ÄŤovĂ© ÄŤĂˇsti app shellu. */
interface AppShell {
  notice: HTMLElement;
  trainingPanel: HTMLElement;
  statsPanel: HTMLElement;
  hhPanel: HTMLElement;
  postflopPanel: HTMLElement;
  selectTab: (id: TabId) => void;
}

/** IdentifikĂˇtory zĂˇloĹľek. */
type TabId = "training" | "stats" | "hh" | "postflop";

/**
 * SestavĂ­ statickou kostru aplikace: hlaviÄŤku s nĂˇzvem, navigaci zĂˇloĹľek,
 * tĹ™i panely (TrĂ©nink / Statistiky / Import HH) a banner pro nenĂˇsilnĂˇ
 * upozornÄ›nĂ­. VrĂˇtĂ­ reference na panely a banner.
 */
function buildAppShell(root: HTMLElement): AppShell {
  root.appendChild(appStyles());

  const app = el("div", "app");

  // HlaviÄŤka.
  const header = el("header", "app__header");
  header.appendChild(el("h1", "app__title", "MTT Preflop Trainer"));
  header.appendChild(
    el(
      "p",
      "app__subtitle",
      "TrĂ©nink preflop rozhodovĂˇnĂ­ â€” full ring 9-handed, 5â€“150 BB.",
    ),
  );
  app.appendChild(header);

  // Banner upozornÄ›nĂ­ (Req 12.4, 14.3) â€” nenĂˇsilnĂ˝, skrytĂ˝ dokud nenĂ­ potĹ™eba.
  const notice = el("div", "app__notice");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  app.appendChild(notice);

  // Navigace zĂˇloĹľek.
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
    { id: "training", label: "TrĂ©nink" },
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

  // VĂ˝chozĂ­ zĂˇloĹľka: TrĂ©nink.
  selectTab("training");

  return { notice, trainingPanel, statsPanel, hhPanel, postflopPanel, selectTab };
}

// ---------------------------------------------------------------------------
// TrĂ©ninkovĂˇ smyÄŤka (Req 13.4, 13.6, 7, 9, 10)
// ---------------------------------------------------------------------------

/** Callbacky propojujĂ­cĂ­ trĂ©ninkovou smyÄŤku se stavem relace v `main.ts`. */
interface TrainingHooks {
  /** ZavolĂˇ se po kaĹľdĂ©m vyhodnocenĂ­ odpovÄ›di (inkrement poÄŤtu spotĹŻ relace). */
  onAnswered: () => void;
  /** VrĂˇtĂ­ aktuĂˇlnĂ­ poÄŤet spotĹŻ relace (Req 9.5). */
  getSessionCount: () => number;
  /** Vynuluje poÄŤet spotĹŻ relace (pĹ™i novĂ©m startu). */
  resetSession: () => void;
  /** PĹ™ekreslĂ­ dashboard statistik. */
  refreshDashboard: () => void;
  startPostflopFlow: (
    seed: number,
    street: PostflopStreet,
    profile: TrainingProfile,
    filters: Filters,
  ) => void;
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

function candidateProfileLabel(profile: TrainingProfile): string {
  if (profile.gameVariant === "SNG") {
    return `SNG ${profile.evModel === "CHIP_EV" ? "chipEV" : "ICM"} preview`;
  }
  if (profile.gameVariant === "CASH") {
    return `Cash ${profile.rakeMode === "RAKE" ? "RAKE" : "NO_RAKE"} preview`;
  }
  return `${profile.tableFormat === "FULL_RING_9" ? "9-max" : "6-max"} ${profile.gameVariant} preflop preview`;
}

function profileGateMessage(profile: TrainingProfile): string {
  {
    const pack = rangePackForTrainingProfile(profile);
    if (pack && (pack.confidence === "LOW" || pack.records.length === 0)) {
      return (
        `${candidateProfileLabel(profile)}: candidate/preview. Produkcni trening se nespusti, ` +
        "dokud profil neprojde kontrolou hand-class hodnot."
      );
    }
  }

  return (
    "Zvoleny profil je zatim preview a nema zapnuty produkcni scoring. " +
    "Pouzijte MTT 9-max regular preflop chipEV nebo postflop preview."
  );

}

/**
 * SestavĂ­ trĂ©ninkovou sekci: filtry (se strĂˇĹľĂ­ explicitnĂ­ho startu, Req 13.4) a
 * hernĂ­ oblast (stĹŻl + akce + vĂ˝sledek + range matice). GenerovĂˇnĂ­ spotĹŻ zaÄŤne
 * **aĹľ** po kliknutĂ­ na Start ve filtrech.
 */
function setupTraining(
  shell: AppShell,
  statsStore: StatsStore,
  hooks: TrainingHooks,
): void {
  const panel = shell.trainingPanel;
  panel.innerHTML = "";

  // Kontejner filtrĹŻ + hernĂ­ oblast.
  const filtersBox = el("div", "training__filters");
  const gameBox = el("div", "training__game");
  gameBox.hidden = true; // dokud uĹľivatel nespustĂ­ relaci (Req 13.4).
  panel.appendChild(filtersBox);
  panel.appendChild(gameBox);

  // HernĂ­ sub-oblasti.
  const sessionBar = el("div", "training__session-bar");
  const sessionInfo = el("div", "training__session-info");
  const sessionTitle = el("div", "training__session-title", "Otazka");
  const sessionMeta = el("div", "training__session-meta");
  const changeSituationBtn = document.createElement("button");
  changeSituationBtn.type = "button";
  changeSituationBtn.className = "training__change-situation";
  changeSituationBtn.textContent = "Zmenit situaci";
  sessionInfo.appendChild(sessionTitle);
  sessionInfo.appendChild(sessionMeta);
  sessionBar.appendChild(sessionInfo);
  sessionBar.appendChild(changeSituationBtn);
  const tableContainer = el("div", "training__table");
  const actionsContainer = el("div", "training__actions");
  const resultContainer = el("div", "training__result");
  const matrixContainer = el("div", "training__matrix");
  gameBox.appendChild(sessionBar);
  gameBox.appendChild(tableContainer);
  gameBox.appendChild(actionsContainer);
  gameBox.appendChild(resultContainer);
  gameBox.appendChild(matrixContainer);

  // Stav bÄ›ĹľĂ­cĂ­ relace (iterĂˇtor sekvence).
  let iterator: Iterator<Spot> | null = null;
  let answered = false; // bylo uĹľ na aktuĂˇlnĂ­ spot odpovÄ›zeno?

  const filtersView: FiltersView = renderFilters(filtersBox, {
    onStart: (filters: Filters, seed: number | null, profile) => {
      if (isPostflopStreet(profile.street)) {
        startPostflopSession(filters, seed, profile.street, profile);
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

  changeSituationBtn.addEventListener("click", () => {
    iterator = null;
    answered = false;
    clearActiveQuestion();
    gameBox.hidden = true;
    filtersBox.hidden = false;
  });

  function startPostflopSession(
    filters: Filters,
    seed: number | null,
    street: PostflopStreet,
    profile: TrainingProfile,
  ): void {
    const resolvedSeed = resolveSeed(seed);
    filtersView.setSeed(resolvedSeed);
    hooks.resetSession();
    filtersView.clearWarning();
    clearActiveQuestion();
    gameBox.hidden = true;
    filtersBox.hidden = false;
    hooks.startPostflopFlow(resolvedSeed, street, profile, filters);
  }

  /**
   * SpustĂ­ relaci pro zvolenĂ© filtry a seed (Req 13.4 â€” pouze pĹ™es explicitnĂ­
   * start). SestavĂ­ deterministickou sekvenci; je-li prĂˇzdnĂˇ (Req 13.6),
   * zobrazĂ­ upozornÄ›nĂ­ a relaci nespustĂ­.
   */
  function startSession(filters: Filters, seed: number | null): void {
    // Req 6.7: vyĹ™eĹˇ a zpĹ™Ă­stupni platnĂ˝ seed (aby Ĺˇel zopakovat).
    const resolvedSeed = resolveSeed(seed);
    filtersView.setSeed(resolvedSeed);

    const cfg: SessionConfig = { seed: resolvedSeed, filters };

    // Sestav sekvenci a zjisti, zda obsahuje alespoĹ jeden spot.
    const seq = spotSequence(cfg, rangeStore);
    const it = seq[Symbol.iterator]();
    const first = it.next();

    if (first.done) {
      // Req 13.6: prĂˇzdnĂ˝ prĹŻnik filtrĹŻ â‡’ upozornÄ›nĂ­, relaci nespouĹˇtÄ›j.
      clearActiveQuestion();
      gameBox.hidden = true;
      filtersView.showEmptyResult();
      return;
    }

    // NovĂˇ relace: vynuluj poÄŤet spotĹŻ relace (Req 9.5) a vyÄŤisti vĂ˝sledek.
    hooks.resetSession();
    hooks.refreshDashboard();
    filtersView.clearWarning();

    iterator = it;
    filtersBox.hidden = true;
    gameBox.hidden = false;
    showSpot(first.value, filters);
  }

  /** ZobrazĂ­ spot: vykreslĂ­ stĹŻl a nabĂ­dku akcĂ­, vyÄŤistĂ­ pĹ™edchozĂ­ vĂ˝sledek. */
  function clearActiveQuestion(): void {
    sessionTitle.textContent = "Otazka";
    sessionMeta.textContent = "";
    tableContainer.innerHTML = "";
    actionsContainer.innerHTML = "";
    resultContainer.innerHTML = "";
    matrixContainer.innerHTML = "";
  }

  function showSpot(spot: Spot, filters: Filters): void {
    answered = false;

    sessionTitle.textContent = `${actionContextLabel(spot.context)} - ${spot.heroPos} - ${spot.hand}`;
    sessionMeta.textContent =
      `${spot.effStack} BB - ${filters.ante === "ON" ? "ante ON" : "ante OFF"} - ` +
      `seed ${filtersView.getSeed() ?? "random"}`;
    renderTable(spot, filters.ante, tableContainer);
    resultContainer.innerHTML = "";
    matrixContainer.innerHTML = "";
    renderActions(spot, filters.scoringMode);
  }

  /** VykreslĂ­ tlaÄŤĂ­tka nabĂ­zenĂ˝ch akcĂ­ (Req 3.12 â€” 1 klĂ­ÄŤ na akci). */
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
   * VyhodnotĂ­ zvolenou akci (Req 7), zobrazĂ­ sprĂˇvnost + zdĹŻvodnÄ›nĂ­ +
   * doporuÄŤenĂ© klĂ­ÄŤe, vykreslĂ­ range matici (Req 10), zaznamenĂˇ vĂ˝sledek do
   * Stats_Store PĹED dalĹˇĂ­m spotem (Req 9.1) a nabĂ­dne tlaÄŤĂ­tko â€žDalĹˇĂ­".
   */
  function handleAnswer(spot: Spot, chosen: ActionKey, mode: ScoringMode): void {
    if (answered) return; // jedna odpovÄ›ÄŹ na spot.
    answered = true;

    // Zablokuj tlaÄŤĂ­tka akcĂ­ a zvĂ˝razni zvolenĂ©.
    const buttons = actionsContainer.querySelectorAll<HTMLButtonElement>(".action-btn");
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.action === chosen) b.classList.add("action-btn--chosen");
    });

    // VyhodnocenĂ­ (ÄŤistĂ© jĂˇdro).
    const result = grade(spot, chosen, mode);

    // ZĂˇznam vĂ˝sledku PĹED dalĹˇĂ­m spotem (Req 9.1); selhĂˇnĂ­ â‡’ upozornÄ›nĂ­ (Req 9.6).
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

    // Inkrement poÄŤtu spotĹŻ relace + pĹ™ekreslenĂ­ dashboardu (Req 9.5).
    hooks.onAnswered();
    hooks.refreshDashboard();

    // ZobrazenĂ­ vĂ˝sledku, zdĹŻvodnÄ›nĂ­ a doporuÄŤenĂ­.
    renderResult(spot, result, save.ok);

    // Range matice pro danĂ˝ spot (Req 10) + legacy parity modal.
    matrixContainer.innerHTML = "";
    renderRangeModalButton(spot, rangeStore, matrixContainer);
    const inlineMatrix = el("div", "training__matrix-inline");
    matrixContainer.appendChild(inlineMatrix);
    renderMatrix(spot, rangeStore, inlineMatrix);
  }

  /** VykreslĂ­ indikaci sprĂˇvnosti, zdĹŻvodnÄ›nĂ­ a doporuÄŤenĂ© AkÄŤnĂ­_klĂ­ÄŤe (Req 7.4). */
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
      result.correct ? "SprĂˇvnÄ›!" : "Ĺ patnÄ›.",
    );
    box.appendChild(verdict);

    // DoporuÄŤenĂ© AkÄŤnĂ­_klĂ­ÄŤe z Range_Store (Req 7.4 / 7.7).
    if (result.recommended.length > 0) {
      const rec = el(
        "div",
        "result__recommended",
        `DoporuÄŤeno: ${result.recommended.map(actionKeyLabel).join(" / ")}`,
      );
      box.appendChild(rec);
    }

    // ZdĹŻvodnÄ›nĂ­ (Req 7.4); pĹ™i nedostupnosti zobraz nĂˇhradnĂ­ text (Req 7.5).
    const explanation = el("div", "result__explanation");
    if (result.explanationAvailable) {
      explanation.textContent = spot.explanation;
    } else {
      explanation.textContent = "ZdĹŻvodnÄ›nĂ­ nenĂ­ k tomuto spotu k dispozici.";
      explanation.classList.add("result__explanation--unavailable");
    }
    box.appendChild(explanation);

    // Req 9.6: vĂ˝sledek se nepodaĹ™ilo uloĹľit â‡’ upozornÄ›nĂ­, ale pokraÄŤujeme.
    if (!saveOk) {
      const warn = el(
        "div",
        "result__save-warning",
        "UpozornÄ›nĂ­: vĂ˝sledek se nepodaĹ™ilo uloĹľit. Statistiky nemusĂ­ bĂ˝t ĂşplnĂ©.",
      );
      box.appendChild(warn);
    }

    // TlaÄŤĂ­tko â€žDalĹˇĂ­" â€” zobrazĂ­ dalĹˇĂ­ spot ze sekvence.
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "result__next";
    nextBtn.textContent = "DalĹˇĂ­ spot";
    nextBtn.addEventListener("click", () => advance());
    box.appendChild(nextBtn);

    resultContainer.appendChild(box);
  }

  /** Posune sekvenci na dalĹˇĂ­ spot (Req 6.6 â€” sekvence cyklĂ­ deterministicky). */
  function advance(): void {
    if (!iterator) return;
    const next = iterator.next();
    if (next.done) {
      // Pojistka: neprĂˇzdnĂˇ sekvence cyklĂ­ donekoneÄŤna, sem bychom se nemÄ›li
      // dostat. DefenzivnÄ› relaci ukonÄŤĂ­me.
      gameBox.hidden = true;
      return;
    }
    showSpot(next.value, filtersView.getFilters());
  }
}

// ---------------------------------------------------------------------------
// ChybovĂ© stavy a upozornÄ›nĂ­ (Req 4.6, 12.4, 14.6)
// ---------------------------------------------------------------------------

/** VykreslĂ­ blok chyby do panelu (relaci nespouĹˇtÄ›t). */
function renderBlockingError(panel: HTMLElement, title: string, message: string): void {
  panel.innerHTML = "";
  const box = el("div", "fatal");
  box.setAttribute("role", "alert");
  box.appendChild(el("div", "fatal__title", title));
  box.appendChild(el("div", "fatal__message", message));
  panel.appendChild(box);
}

/** Req 14.6: nekonzistentnĂ­ lokĂˇlnĂ­ ĂşloĹľiĹˇtÄ› â€” relaci nespouĹˇtÄ›t. */
function renderStorageError(panel: HTMLElement): void {
  renderBlockingError(
    panel,
    "NekonzistentnĂ­ ĂşloĹľiĹˇtÄ›",
    "LokĂˇlnĂ­ ĂşloĹľiĹˇtÄ› je v nekonzistentnĂ­m stavu a nelze v nÄ›m vytvoĹ™it ani " +
      "platnĂ˝ ÄŤistĂ˝ stav. TrĂ©nink proto nelze spustit. Zkontrolujte prosĂ­m " +
      "nastavenĂ­ prohlĂ­ĹľeÄŤe (povolenĂ­ ĂşloĹľiĹˇtÄ›) a naÄŤtÄ›te aplikaci znovu.",
  );
}

/** Req 4.6: referenÄŤnĂ­ ranges nejsou dostupnĂ© â€” relaci nespouĹˇtÄ›t. */
function renderRangesError(panel: HTMLElement): void {
  renderBlockingError(
    panel,
    "ReferenÄŤnĂ­ ranges nejsou dostupnĂ©",
    "Data referenÄŤnĂ­ch ranges se nepodaĹ™ilo naÄŤĂ­st jako celek, proto nelze " +
      "generovat trĂ©ninkovĂ© spoty ani spustit relaci. Zkuste prosĂ­m aplikaci " +
      "naÄŤĂ­st znovu.",
  );
}

/** ZobrazĂ­ nenĂˇsilnĂ© upozornÄ›nĂ­ v banneru (Req 12.4, 14.3). */
function showNotice(notice: HTMLElement, message: string): void {
  notice.hidden = false;
  const line = el("div", "app__notice-line", message);
  notice.appendChild(line);
}

/**
 * VykreslĂ­ fatĂˇlnĂ­ chybu (globĂˇlnĂ­ error boundary). Pokud uĹľ je v DOM app shell,
 * pĹ™idĂˇ nenĂˇsilnĂ© upozornÄ›nĂ­; jinak nahradĂ­ obsah koĹ™ene chybovĂ˝m blokem.
 */
function showFatalError(root: HTMLElement, message: string, err?: unknown): void {
  if (typeof console !== "undefined") {
    console.error("MTT Preflop Trainer â€” chyba:", message, err);
  }
  // Pokud existuje banner upozornÄ›nĂ­, pouĹľij ho (nenĂˇsilnÄ›); jinak nahraÄŹ koĹ™en.
  const notice = root.querySelector<HTMLElement>(".app__notice");
  if (notice) {
    notice.hidden = false;
    notice.appendChild(el("div", "app__notice-line", message));
    return;
  }
  renderBlockingError(root, "DoĹˇlo k chybÄ›", message);
}

// ---------------------------------------------------------------------------
// Service Worker (Req 12.4)
// ---------------------------------------------------------------------------

/**
 * DefenzivnÄ› zaregistruje Service Worker (pokud je to vhodnĂ©). PĹ™i selhĂˇnĂ­
 * nakeĹˇovĂˇnĂ­ zobrazĂ­ nenĂˇsilnĂ© ÄŤeskĂ© upozornÄ›nĂ­ (Req 12.4) a aplikaci
 * neblokuje. Ve vĂ˝chozĂ­m stavu se registruje jen v produkÄŤnĂ­m buildu
 * (`import.meta.env.PROD`), aby nepĹ™ekĂˇĹľel ve vĂ˝voji/testech.
 */
function maybeRegisterServiceWorker(notice: HTMLElement, force?: boolean): void {
  const shouldRegister =
    force ?? (typeof import.meta !== "undefined" && import.meta.env?.PROD === true);
  if (!shouldRegister) return;

  void registerServiceWorker({
    onCacheFailure: () => {
      showNotice(
        notice,
        "Aplikaci se nepodaĹ™ilo plnÄ› pĹ™ipravit pro offline pouĹľitĂ­. Online " +
          "funguje normĂˇlnÄ›; offline reĹľim ale nemusĂ­ bĂ˝t dostupnĂ˝.",
      );
    },
  });
}

// ---------------------------------------------------------------------------
// GlobĂˇlnĂ­ error boundary (Req 12.3)
// ---------------------------------------------------------------------------

/** PĹ™Ă­znak, aby se posluchaÄŤe registrovaly jen jednou. */
let errorBoundaryInstalled = false;

/**
 * Zaregistruje globĂˇlnĂ­ posluchaÄŤe `error` a `unhandledrejection`, kterĂ©
 * vykreslĂ­ ÄŤeskou chybovou zprĂˇvu do DOM mĂ­sto tichĂ©ho pĂˇdu (Req 12.3).
 */
function installGlobalErrorBoundary(root: HTMLElement): void {
  if (errorBoundaryInstalled || typeof window === "undefined") return;
  errorBoundaryInstalled = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    showFatalError(
      root,
      "DoĹˇlo k neoÄŤekĂˇvanĂ© chybÄ› aplikace. ÄŚĂˇst funkcĂ­ nemusĂ­ fungovat sprĂˇvnÄ›.",
      event.error ?? event.message,
    );
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    showFatalError(
      root,
      "DoĹˇlo k neoÄŤekĂˇvanĂ© chybÄ› pĹ™i asynchronnĂ­ operaci. ÄŚĂˇst funkcĂ­ nemusĂ­ " +
        "fungovat sprĂˇvnÄ›.",
      event.reason,
    );
  });
}

// ---------------------------------------------------------------------------
// Styly app shellu (sobÄ›staÄŤnĂ©, aby aplikace fungovala i bez externĂ­ho CSS)
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
.profile-selector__note{grid-column:1/-1;font-size:12px;color:#9aa6c2;line-height:1.35;
  overflow-wrap:anywhere;}
.training__game{display:flex;flex-direction:column;gap:16px;}
.training__session-bar{display:flex;align-items:center;justify-content:space-between;
  gap:12px;}
.training__session-info{min-width:0;display:grid;gap:3px;}
.training__session-title{font-size:15px;font-weight:900;color:#e8ecf7;}
.training__session-meta{font-size:12px;font-weight:700;color:#9aa6c2;
  overflow-wrap:anywhere;}
.training__change-situation{appearance:none;border:1px solid rgba(255,255,255,.18);
  background:#1b2333;color:#e8ecf7;border-radius:8px;font-size:13px;
  font-weight:800;padding:8px 12px;cursor:pointer;}
.training__change-situation:hover{border-color:#2bd576;}
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
// Auto-start (mimo testovacĂ­ prostĹ™edĂ­)
// ---------------------------------------------------------------------------

// V prohlĂ­ĹľeÄŤi spustĂ­me bootstrap automaticky. V testech (importem modulu)
// se `bootstrap` volĂˇ ruÄŤnÄ› s injektovanĂ˝mi zĂˇvislostmi, takĹľe auto-start
// pĹ™eskoÄŤĂ­me, pokud nenĂ­ dostupnĂ˝ `document`.
if (typeof document !== "undefined") {
  bootstrap();
}
