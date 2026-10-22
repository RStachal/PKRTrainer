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

// Styly starého GUI v pořadí, v jakém dřív ležely ve stránce jako vložené
// <style> (shell, stůl, statistiky, HH, postflop, dialog range) - pořadí určuje,
// které pravidlo vyhraje. Mizí s obrazovkami, které nahradí nové GUI.
import "./ui/styles/legacy/app-shell.css";
import "./ui/styles/legacy/table.css";
import "./ui/styles/legacy/dashboard.css";
import "./ui/styles/legacy/hh-view.css";
import "./ui/styles/legacy/postflop-view.css";
import "./ui/styles/legacy/range-modal.css";
// Tokeny a prvky nového GUI (Agents/ui-redesign-plan.md). Vite je vytáhne do
// samostatného hashovaného CSS, které prohlížeč cachuje.
import "./ui/styles/tokens.css";
import "./ui/styles/components.css";
import type {
  ActionKey,
  ActionContext,
  Filters,
  ScoringMode,
  SessionConfig,
  Spot,
} from "./core/types";
import {
  DEFAULT_TRAINING_PROFILE,
  evModelLabel,
  isPostflopStreet,
  profileId,
  type TrainingProfile,
} from "./core/trainingProfile";
import { isFlowAllowed } from "./core/trainingCapability";
import { bucketsWithSpots, resolveSeed, spotSequence } from "./core/drillEngine";
import { postflopIntentFromFilters } from "./core/postflopIntent";
import { grade } from "./core/scoring";
import { buildPreflopExplanationForSpot } from "./core/preflopExplanation";
import type { PostflopPotType, PostflopStreet } from "./core/postflopGenerator";
import {
  isPostflopSprCovered,
  maxCoveredSprForPotType,
} from "./data/ranges/postflopSprCoverage";
import { runtimeEntitlementGrants } from "./core/runtimeEntitlements";
import { evaluateEntitlementAccess } from "./core/paymentEntitlements";
import {
  createRangeStoreFromRangePack,
  rangeStore,
  type RangeStore,
} from "./data/rangeStore";
import { getRangeDataErrors, isRangeDataLoaded } from "./data/ranges";
import { hasNewState, runMigration, type MigrationResult } from "./persistence/migration";
import { createStatsStore, type StatsStore } from "./persistence/statsStore";
import { buildProfileAwarePreflopResultRecord } from "./persistence/statsRecordV2";
import { KEY_EVENTS, KEY_STATE, SCHEMA_VERSION } from "./persistence/keys";
import { createHHReviewStore } from "./persistence/hhReviewStore";
import {
  bridgePostflopResultRecordToStatsV2,
  buildPostflopResultRecord,
} from "./persistence/postflopResultRecord";
import { createPostflopStatsStore } from "./persistence/postflopStatsStore";
import { createPostflopLineStatsStore } from "./persistence/postflopLineStatsStore";
import { buildPostflopLineResultRecord } from "./persistence/postflopLineResultRecord";
import {
  isPlayableMttPreflopPreview,
  trainingCapabilityForProfile,
} from "./data/ranges/trainingCapability";
import {
  mttPreflopRangePackForProfile,
  startableMttPreflopRangePack,
} from "./data/ranges/mttPreflopRangePacks";
import { mttProductionImportSlotId } from "./data/ranges/mttImportSlotNaming";
import { mttProductionLazyLoader } from "./data/ranges/mttProductionLazyLoader";
import { loadSolvedTurnPacks } from "./data/ranges/turnSolvedStrategyPacks";
import { loadSolvedRiverPacks } from "./data/ranges/riverSolvedStrategyPacks";
import { loadSolvedFlopPacks } from "./data/ranges/flopSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "./data/ranges/turnSolvedRuntimeRegistry";

/** Oprávnění k vyřešenému turn obsahu; jedno na celý turn, ne na rodinu. */
const SOLVED_TURN_PILOT_ENTITLEMENT = "mtt.postflop.turn.solved.pilot" as const;
import type { RangePack } from "./data/ranges/rangePack";
import {
  createMttProductionPostflopStrategyResolver,
} from "./data/ranges/postflopStrategyRegistry";
import type { MttPostflopTrainingRuntimeReport } from "./data/ranges/mttPostflopTrainingRuntime";
import {
  readyMttPostflopPilotsForProfile,
  requiredEntitlementsForMttPostflopPilotScopes,
} from "./data/ranges/mttPostflopPilotCatalog";
import { renderFilters, type FiltersView } from "./ui/filters";
import { renderTable } from "./ui/tableRenderer";
import { loadPreflopEquity } from "./core/preflopEquity";
import { renderDecisionPrice } from "./ui/decisionPricePanel";
import {
  emptySessionScore,
  isHit,
  isHotStreak,
  recordAnswer,
} from "./core/sessionScore";
import { colorForActionKey } from "./ui/rangeMatrixView";
import { renderMatrix } from "./ui/rangeMatrixView";
import { renderRangeModalButton } from "./ui/rangeModal";
import { renderHHView } from "./ui/hhView";
import { renderPostflopView, type PostflopRuntimeNotice } from "./ui/postflopView";
import {
  formatActionEvBb,
  revealActionEvButtonBubbles,
  setActionEvButtonContent,
} from "./ui/actionEvButtonBubbles";
import { revealActionPriceLines } from "./ui/actionPriceLines";
import { preflopDecisionPrices } from "./core/preflopDecisionPrice";
import {
  CS,
  getAppLanguage,
  initializeAppLanguage,
  localizedText,
  setAppLanguage,
  type AppLanguage,
} from "./ui/cs";
import { registerServiceWorker } from "./pwa/registerSw";

// ---------------------------------------------------------------------------
// ÄŚeskĂ© popisky AkÄŤnĂ­ch_klĂ­ÄŤĹŻ (zobrazenĂ­ doporuÄŤenĂ­ po vyhodnocenĂ­, Req 12.3)
// ---------------------------------------------------------------------------

const ACTION_KEY_LABEL: Record<ActionKey, string> = {
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

const ACTION_CONTEXT_LABEL: Record<ActionContext, string> = {
  RFI: "RFI / Open",
  VS_LIMP: "Proti limpu (iso-raise)",
  VS_OPEN: "Proti openu",
  VS_3BET: "Proti 3-betu",
  VS_4BET: "Proti 4-betu",
  SQUEEZE: "Squeeze",
  BVB: "Blind vs blind",
  PUSH_FOLD: "Push / Fold",
  VS_ALLIN: "Proti all-inu (call-jam)",
};

/** PĹ™eloĹľĂ­ AkÄŤnĂ­_klĂ­ÄŤ na ÄŤeskĂ˝ popisek (fallback = samotnĂ˝ klĂ­ÄŤ). */
function actionKeyLabel(key: ActionKey): string {
  return ACTION_KEY_LABEL[key] ?? key;
}

function actionContextLabel(context: ActionContext): string {
  return ACTION_CONTEXT_LABEL[context] ?? context;
}

/**
 * Nadpis otázky: kontext, a když spot jmenuje protihráče, i on.
 *
 * „Proti openu - BB - AKs" neříká, kdo otevřel, a range proti UTG a proti BTN
 * je jiná (bod 234). Od 15. 9. 2026 spot otvírače nese (`tableState.vsSeat`)
 * a hráč ho musí číst dřív, než odpoví - jinak odpovídá na jinou otázku než
 * range. Bez sedačky zůstává nadpis jako dřív.
 */
function spotTitle(spot: Spot): string {
  const seat = spot.tableState.vsSeat;
  const context = actionContextLabel(spot.context);
  const situation = seat === undefined
    ? context
    : spot.context === "VS_3BET"
      ? `${context} od ${seat}`
      : spot.context === "SQUEEZE"
        ? `${context} (${seat} otevírá, ${spot.tableState.callsBefore}x call)`
        : `${context} z ${seat}`;
  return `${situation} - ${spot.heroPos} - ${spot.hand}`;
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

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startMs: number): number | undefined {
  if (!Number.isFinite(startMs) || startMs <= 0) return undefined;
  const value = Math.max(0, Math.round(nowMs() - startMs));
  return Number.isFinite(value) ? value : undefined;
}

function focusElement(element: HTMLElement | null): void {
  if (!element || typeof element.focus !== "function") return;
  element.focus();
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
      // Legacy data existovala, ale nešla přečíst: stats začínají prázdné a hráč
      // to musí vědět. Bez tohoto vypadal takový běh jako běžná úspěšná migrace
      // hráče, který prostě žádnou historii neměl - přestože jeho data v
      // úložišti dál leží a jsou obnovitelná.
      if (migration.legacyEventsUnreadable === true) {
        const okUnreadable = hasNewState(storage) || ensureCleanState(storage);
        return { ok: okUnreadable, migration, startedEmpty: true };
      }
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
        CS.system.unexpectedStart,
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
  initializeAppLanguage(storage);
  if (typeof document !== "undefined") {
    document.documentElement.lang = getAppLanguage() === "EN" ? "en" : "cs";
  }

  // --- App shell: hlaviÄŤka, zĂˇloĹľky, panely, banner upozornÄ›nĂ­ ---
  const shell = buildAppShell(root, (language) => {
    if (language === getAppLanguage()) return;
    setAppLanguage(language, storage);
    renderApp(root, options);
  });

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
      CS.system.migrationFailed,
    );
  }

  const statsStore = createStatsStore(storage);
  const postflopStatsStore = createPostflopStatsStore(storage);
  const postflopLineStatsStore = createPostflopLineStatsStore(storage);
  const hhReviewStore = createHHReviewStore(storage);

  // Statistiky (dashboard) a HH import jsou dostupnĂ© nezĂˇvisle na Range_Store.
  let sessionCount = 0;
  let currentPostflopProfile: TrainingProfile | undefined;
  let startPreflopFocusSession: ((filters: Filters) => void) | null = null;
  let getSelectedTrainingProfile = (): TrainingProfile => DEFAULT_TRAINING_PROFILE;
  const dashboardModule = import("./ui/dashboard");
  let dashboardRenderVersion = 0;
  const refreshDashboard = (): void => {
    const renderVersion = ++dashboardRenderVersion;
    void dashboardModule.then(({ renderDashboard }) => {
      if (renderVersion !== dashboardRenderVersion) return;
      renderDashboard({
        store: statsStore,
        sessionCount,
        // Preflop answers are recorded under the preflop profile whatever street
        // the trainer is showing, so the street is pinned rather than taken from
        // the selection - otherwise the dashboard would scope to a profile that
        // has no preflop answers in it at all.
        activeProfileId: profileId({ ...getSelectedTrainingProfile(), street: "PREFLOP" }),
        postflopRecords: postflopStatsStore.events(),
        postflopLineRecords: postflopLineStatsStore.events(),
        onStartPreflopFocus: (filters) => {
          shell.selectTab("training");
          startPreflopFocusSession?.(filters);
        },
        onPostflopRecordsImported: (records) => {
          const save = postflopStatsStore.replaceAll(records);
          if (!save.ok) {
            showNotice(
              shell.notice,
              CS.system.postflopRecordsSave,
            );
          }
          return save.ok;
        },
        onPostflopLineRecordsImported: (records) => {
          const save = postflopLineStatsStore.replaceAll(records);
          if (!save.ok) {
            showNotice(
              shell.notice,
              CS.system.postflopLinesSave,
            );
          }
          return save.ok;
        },
      }, shell.statsPanel);
    }).catch(() => {
      showNotice(shell.notice, CS.system.unexpectedStart);
    });
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
    const selectedProfile = options.profile ?? currentPostflopProfile;
    const resolvedProfile = selectedProfile && options.filters
      ? runtimeProfile(selectedProfile, options.filters)
      : selectedProfile;
    currentPostflopProfile = resolvedProfile;
    const postflopIntent = options.filters ? postflopIntentFromFilters(options.filters) : null;
    const capability = resolvedProfile
      ? trainingCapabilityForProfile(resolvedProfile)
      : null;
    const hasScopedPilotCoverage = resolvedProfile
      ? readyMttPostflopPilotsForProfile(resolvedProfile).length > 0
      : false;
    const grants = runtimeEntitlementGrants();
    const pilotEntitlements = resolvedProfile
      ? requiredEntitlementsForMttPostflopPilotScopes(
        readyMttPostflopPilotsForProfile(resolvedProfile).map((pilot) => pilot.scope),
      )
      : [];
    const hasActivePilotEntitlement = evaluateEntitlementAccess({
      required: [],
      grants,
    }).active.some((entitlement) => pilotEntitlements.includes(entitlement));
    // Vyřešený turn obsah se počítá jako pilotní pokrytí, i když v pilotním
    // katalogu není: má vlastní placený režim a hráč o něm má vědět stejně jako
    // o flopových pilotech. Bez toho by mu runtime obsah zamkl a hláška by
    // mluvila o náhledu, tedy o něčem, co se koupit nedá.
    const hasSolvedTurnCoverage = resolvedProfile?.street === "TURN" &&
      runtimeSolvedTurnPacks.length > 0;
    const hasSolvedTurnEntitlement = hasSolvedTurnCoverage && evaluateEntitlementAccess({
      required: [SOLVED_TURN_PILOT_ENTITLEMENT],
      grants,
    }).active.includes(SOLVED_TURN_PILOT_ENTITLEMENT);

    // Dodané rodiny nesou vlastní důvěru; dokud je celá LOW, nikdo je nečetl.
    // Až první projde review, tahle věta z hlášky sama zmizí.
    const unreviewedContent = hasSolvedTurnCoverage &&
      runtimeSolvedTurnPacks.every((pack) => pack.confidence === "LOW");

    const runtimeNotice = postflopRuntimeNotice({
      // Preflop se sem nedostane, ale typ to neví; hláška je postflopová.
      street: resolvedProfile?.street === "PREFLOP" ? undefined : resolvedProfile?.street,
      unreviewedContent,
      hasScopedPilotCoverage: hasScopedPilotCoverage || hasSolvedTurnCoverage,
      hasActivePilotEntitlement: hasActivePilotEntitlement || hasSolvedTurnEntitlement,
      productionReady: capability?.status === "PRODUCTION",
      coverage: postflopIntent
        ? {
          potType: postflopIntent.potType,
          spr: Math.round((postflopIntent.effectiveStackBB / postflopIntent.potBB) * 10) / 10,
        }
        : null,
    });
    const requiresExactRuntime = (
      (hasSolvedTurnCoverage && hasSolvedTurnEntitlement) ||
      (hasScopedPilotCoverage && hasActivePilotEntitlement) ||
      capability?.status === "PRODUCTION"
    );
    let postflopRuntime: MttPostflopTrainingRuntimeReport | null = null;
    const runtimeProfileForView = (
      requiresExactRuntime &&
      resolvedProfile &&
      isPostflopStreet(resolvedProfile.street) &&
      options.filters
    ) ? resolvedProfile : null;
    renderPostflopView(shell.postflopPanel, {
      initialStreet: options.initialStreet ?? "FLOP",
      initialSeed: options.initialSeed,
      initialPositionContext: postflopIntent?.positionContext,
      initialPotType: postflopIntent?.potType,
      initialPotBB: postflopIntent?.potBB,
      initialEffectiveStackBB: postflopIntent?.effectiveStackBB,
      autoGenerate: options.autoGenerate === true,
      runtimeNotice,
      strategyResolver: runtimeProfileForView
        ? (input) => postflopRuntime?.resolver?.(input) ?? null
        : undefined,
      allowFallback: requiresExactRuntime ? false : capability?.allowHeuristicFallback ?? true,
      // Linka prochází flop, turn i river. Když je obsah vyřešený jen na části
      // z nich, běží linka s heuristikou tam, kde vyřešená není - jednotlivý spot
      // zůstává přísný.
      //
      // Dřív se v takovém případě linka vypínala úplně, a to mělo absurdní
      // důsledek: hráč, který si vyřešený turn zaplatil, o celý režim přišel.
      // Zaplatit za obsah a přijít o funkci je nejhorší možný tvar paywallu.
      lineModeAvailable: true,
      lineAllowFallback: !(resolvedProfile !== undefined && resolvedProfile !== null
        && POSTFLOP_LINE_STREETS.every((street) => (
          trainingCapabilityForProfile({ ...resolvedProfile, street }).status === "PRODUCTION"
        ))),
      beforeGenerate: runtimeProfileForView
        ? async (mode) => {
          const { buildMttPostflopTrainingRuntime } = await import("./data/ranges/mttPostflopTrainingRuntime");
          postflopRuntime = buildMttPostflopTrainingRuntime({
            profile: runtimeProfileForView,
            grants,
          });
          if (postflopRuntime.mode === "PRODUCTION" && mode === "line") {
            const profileKeys = (["FLOP", "TURN", "RIVER"] as const)
              .map((street) => mttProductionProfileKey({
                ...runtimeProfileForView,
                street,
              }))
              .filter((profileKey): profileKey is string => profileKey !== null);
            await mttProductionLazyLoader.loadProfiles(profileKeys);
            await loadSolvedTurnPacksForProfiles(profileKeys);
          }
        }
        : undefined,
      onAnswered: (spot, chosen, responseMs) => {
        const record = buildPostflopResultRecord(spot, chosen, Date.now(), responseMs);
        const save = postflopStatsStore.record(bridgePostflopResultRecordToStatsV2(record, {
          profile: currentPostflopProfile,
        }));
        if (!save.ok) {
          showNotice(
            shell.notice,
            CS.system.postflopAnswerSave,
          );
        }
        sessionCount += 1;
        refreshDashboard();
      },
      onLineCompleted: (line, chosenByStreet, startedAt, completedAt) => {
        const record = buildPostflopLineResultRecord(line, {
          profile: currentPostflopProfile,
          chosenByStreet,
          startedAt,
          completedAt,
        });
        const save = postflopLineStatsStore.record(record);
        if (!save.ok) {
          showNotice(
            shell.notice,
            CS.system.postflopLineSave,
          );
        }
        sessionCount += 1;
        refreshDashboard();
      },
    });
  };
  refreshDashboard();
  renderHHView(shell.hhPanel, {
    beforeAnalyze: async () => {
      while (true) {
        const selected = getSelectedTrainingProfile();
        const selectedFamily = mttProductionProfileFamilyKey(selected);
        const profileKeys = (["PREFLOP", "FLOP", "TURN", "RIVER"] as const)
          .map((street) => mttProductionProfileKey({ ...selected, street }))
          .filter((profileKey): profileKey is string => profileKey !== null);
        await mttProductionLazyLoader.loadProfiles(profileKeys);
        // Started, not waited on. Reviewing a hand history does not depend on
        // solved turn content - the chain falls through to the heuristic without
        // it - and nine families is several megabytes that would otherwise sit
        // between the player pressing analyse and seeing anything.
        void loadSolvedTurnPacksForProfiles(profileKeys);
        if (
          selectedFamily ===
          mttProductionProfileFamilyKey(getSelectedTrainingProfile())
        ) {
          return;
        }
      }
    },
    parseOptions: () => {
      const selected = getSelectedTrainingProfile();
      const profile: TrainingProfile = {
        ...selected,
        street: "PREFLOP",
      };
      const pack = mttPreflopRangePackForProfile(profile);
      const profileRangeStore = pack
        ? createRangeStoreFromRangePack(pack)
        : {
          lookup: () => undefined,
          isLoaded: () => false,
        };
      return {
        profile,
        rangeStore: profileRangeStore,
        requireLoadedStrategy: true,
        ...(pack
          ? {
            rangePack: {
              id: pack.id,
              version: pack.version,
              verifiedAt: pack.verifiedAt,
            },
          }
          : {}),
      };
    },
    postflopStrategyResolver: (input) => {
      const profile = getSelectedTrainingProfile();
      const capability = trainingCapabilityForProfile({ ...profile, street: input.street });
      if (capability.status !== "PRODUCTION") return null;
      return createMttProductionPostflopStrategyResolver({
        gameVariant: profile.gameVariant,
        tableFormat: profile.tableFormat,
        blindSpeed: profile.blindSpeed,
        street: input.street,
        evModel: profile.evModel,
        ante: profile.ante,
        rakeMode: profile.rakeMode,
      })(input);
    },
    postflopAllowFallback: false,
    postflopProfileGuard: (result) => {
      const profile = getSelectedTrainingProfile();
      const capability = trainingCapabilityForProfile(profile);
      if (!isFlowAllowed(capability, "HH_REVIEW")) {
        return localizedText(
          "Production HH review requires an MTT training profile.",
          "Produkční HH review vyžaduje tréninkový profil MTT.",
        );
      }
      if (result.fields.tableFormat !== profile.tableFormat) {
        return localizedText(
          "The imported hand and selected profile use different table formats.",
          "Importovaná handa a vybraný profil používají jiný formát stolu.",
        );
      }
      if (profile.ante !== (result.fields.ante ?? "OFF")) {
        return localizedText(
          "The imported hand and selected profile use different ante modes.",
          "Importovaná handa a vybraný profil používají jiný režim ante.",
        );
      }
      return null;
    },
    onReviewBuilt: (records) => {
      const save = hhReviewStore.replaceAll(hhReviewStore.events().concat(records));
      if (!save.ok) {
        showNotice(
          shell.notice,
          localizedText(
            "The HH review could not be saved. Training stats were not changed.",
            "HH review se nepodařilo uložit. Statistiky tréninku nebyly změněny.",
          ),
        );
      }
      return save.ok;
    },
  });
  renderPostflopPanel();

  // --- Krok 3: filtry + trĂ©ninkovĂˇ smyÄŤka (Req 13.4) ---
  const trainingController = setupTraining(shell, statsStore, {
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
  startPreflopFocusSession = trainingController.startPreflopFocusSession;
  getSelectedTrainingProfile = trainingController.getProfile;

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
function buildAppShell(
  root: HTMLElement,
  onLanguageChange: (language: AppLanguage) => void,
): AppShell {

  const app = el("div", "app");

  // HlaviÄŤka.
  const header = el("header", "app__header");
  const headerCopy = el("div", "app__header-copy");
  headerCopy.appendChild(el("h1", "app__title", CS.app.title));
  headerCopy.appendChild(
    el(
      "p",
      "app__subtitle",
      CS.app.subtitle,
    ),
  );
  header.appendChild(headerCopy);

  const languageSwitch = el("div", "language-switch");
  languageSwitch.setAttribute("role", "group");
  languageSwitch.setAttribute("aria-label", "Language");
  for (const language of ["EN", "CZ"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "language-switch__option";
    button.textContent = language;
    const selected = getAppLanguage() === language;
    button.classList.toggle("language-switch__option--active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => onLanguageChange(language));
    languageSwitch.appendChild(button);
  }
  header.appendChild(languageSwitch);
  app.appendChild(header);

  // Banner upozornÄ›nĂ­ (Req 12.4, 14.3) â€” nenĂˇsilnĂ˝, skrytĂ˝ dokud nenĂ­ potĹ™eba.
  const notice = el("div", "app__notice");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  app.appendChild(notice);

  // Navigace zĂˇloĹľek.
  const nav = el("nav", "app__tabs");
  nav.setAttribute("aria-label", CS.app.primarySections);
  nav.setAttribute("role", "tablist");
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

  const allTabIds: readonly TabId[] = ["training", "stats", "hh", "postflop"];
  const tabDefs: { id: Exclude<TabId, "postflop">; label: string }[] = [
    { id: "training", label: CS.app.tabs.training },
    { id: "stats", label: CS.app.tabs.stats },
    { id: "hh", label: CS.app.tabs.hh },
  ];

  for (const tabId of allTabIds) {
    const panel = panels[tabId];
    panel.id = `app-panel-${tabId}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("tabindex", "-1");
    if (tabId === "postflop") {
      panel.setAttribute("aria-label", CS.app.postflopTraining);
    } else {
      panel.setAttribute("aria-labelledby", `app-tab-${tabId}`);
    }
  }

  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const selectTab = (id: TabId): void => {
    for (const tabId of allTabIds) {
      const isActive = tabId === id;
      panels[tabId].hidden = !isActive;
      panels[tabId].setAttribute("aria-hidden", String(!isActive));
      const btn = tabButtons.get(tabId);
      if (btn) {
        btn.classList.toggle("app__tab--active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      }
    }
  };

  for (const def of tabDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = `app-tab-${def.id}`;
    btn.className = "app__tab";
    btn.dataset.tab = def.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", `app-panel-${def.id}`);
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

interface TrainingController {
  startPreflopFocusSession: (filters: Filters) => void;
  getProfile: () => TrainingProfile;
}

function runtimeProfile(profile: TrainingProfile, filters: Filters): TrainingProfile {
  return {
    ...profile,
    ante: profile.gameVariant === "CASH" ? "OFF" : filters.ante,
  };
}

/** The streets a hand line walks; all three need content for it to run. */
const POSTFLOP_LINE_STREETS = ["FLOP", "TURN", "RIVER"] as const;

export function postflopRuntimeNotice(input: {
  hasScopedPilotCoverage: boolean;
  hasActivePilotEntitlement: boolean;
  productionReady: boolean;
  coverage?: { potType: PostflopPotType; spr: number } | null;
  /**
   * Ulice, pro kterou se hláška píše.
   *
   * Text o pilotech mluvil vždycky o flopu, protože jiné piloty neexistovaly.
   * Vyřešený turn obsah má teď vlastní placený režim a hráči, který si vybral
   * turn, by věta o flopových situacích neřekla nic užitečného - a to je zrovna
   * hláška, podle které se rozhoduje, jestli si něco koupí.
   */
  street?: PostflopStreet;
  /** Pravda, dokud žádná z dodaných rodin neprošla čtením hráče. */
  unreviewedContent?: boolean;
}): PostflopRuntimeNotice | null {
  // Nepřečtený obsah to musí říct právě tady.
  //
  // Pack má důvěru LOW a ve svých `assumptions` napsáno, že ho zatím nikdo
  // nečetl - jenže to hráč nevidí. Na obrazovce stálo jen „úzký pilot, ne plné
  // pokrytí", což čte jako rozsah, ne jako míru ověření. Platícímu člověku pak
  // servírujeme solverová data s tichým předpokladem, že solverové znamená
  // prověřené. Neznamená: brána kontroluje tvar solvu, ne jestli je strategie
  // dobrá.
  const unreviewed = input.unreviewedContent === true
    ? localizedText(
      " Nobody has reviewed this content yet, so it is shipped content, not verified content.",
      " Tenhle obsah zatím nikdo neprošel, takže je dodaný, ne ověřený.",
    )
    : "";
  // Každá ulice vyjmenovaná, žádná přes `else`.
  //
  // Dřív tu byl turn a všechno ostatní spadlo na „flopové situace" - takže river
  // by hráči tvrdil, že jde o flop. Je to potřetí, co stejný tvar udělal chybu:
  // pravidlo psané pro jednu ulici mlčky pohltí ty ostatní. Vyjmenovat je stojí
  // řádek navíc a ušetří ten objev.
  const pilotSubject = input.street === "TURN"
    ? localizedText("solved turn boards", "vyřešené turnové desky")
    : input.street === "RIVER"
      ? localizedText("solved river boards", "vyřešené riverové desky")
      : localizedText("selected flop situations", "vybrané flopové situace");
  // When an active scoped pilot is the runtime but the player has selected a stack
  // depth past every solved band - a deep single-raised pot at SPR 25, say - say
  // so first. Otherwise the "solver pilot is active" notice below would be
  // actively misleading for exactly the spot they are about to see refused. The
  // coverage bands are derived from the pilots, so this applies only to the pilot
  // runtime; a future full production model would carry its own, wider coverage,
  // and its own notice must not be overridden by pilot-derived bands. Only warn
  // when the pot type has some coverage at all, so it is a depth edge, not the
  // general preview state the PREVIEW notice already describes.
  //
  // Pásma se počítají z flopových pilotů, takže platí pro flop a pro nic jiného.
  // Vyřešený turn je zpřístupnil i turnu - `hasScopedPilotCoverage` je teď
  // pravda i pro něj - a hráč by u turnového spotu dostal varování odvozené z
  // rozsahů, které se ho netýkají. Varování odvozené ze špatných dat je horší
  // než žádné: hráč podle něj změní hloubku a nic se nezlepší.
  const usesPilotCoverage = !input.productionReady &&
    input.street !== "TURN" &&
    input.hasScopedPilotCoverage && input.hasActivePilotEntitlement;
  if (
    usesPilotCoverage &&
    input.coverage != null &&
    maxCoveredSprForPotType(input.coverage.potType) !== null &&
    !isPostflopSprCovered(input.coverage.potType, input.coverage.spr)
  ) {
    const maxSpr = maxCoveredSprForPotType(input.coverage.potType);
    return {
      kind: "DEEP_STACK_UNCOVERED",
      text: localizedText(
        `This stack depth is past the solved SPR range (up to SPR ${maxSpr}) for this pot type, so no solver-backed strategy is available here. Choose a shallower stack for solver coverage.`,
        `Tato hloubka stacku je za solvenutým rozsahem SPR (do SPR ${maxSpr}) pro tento typ potu, takže zde není dostupná solverem podložená strategie. Pro solverové pokrytí zvolte mělčí stack.`,
      ),
    };
  }
  if (input.productionReady) {
    return {
      kind: "PRODUCTION",
      text: localizedText(
        "The production postflop model is active. Training runs without preview fallback.",
        "Produkční postflop model je aktivní. Trénink běží bez náhledového fallbacku.",
      ),
    };
  }
  if (input.hasScopedPilotCoverage && input.hasActivePilotEntitlement) {
    return {
      kind: "SCOPED_PILOT",
      text: localizedText(
        `A solver pilot is active for ${pilotSubject}. This is a narrow pilot, not complete postflop production coverage.${unreviewed}`,
        `Solverový pilot je aktivní pro ${pilotSubject}. Jde o úzký pilotní režim, ne kompletní produkční pokrytí.${unreviewed}`,
      ),
    };
  }
  if (input.hasScopedPilotCoverage) {
    return {
      kind: "LOCKED_PILOT",
      text: localizedText(
        `Paid solver content exists for ${pilotSubject}. Without an active licence only preview mode runs, not the solved strategy.`,
        `Pro ${pilotSubject} existuje placený solverový obsah. Bez aktivní licence běží jen náhledový režim, ne vyřešená strategie.`,
      ),
    };
  }
  return {
    kind: "PREVIEW",
    text: localizedText(
      "Postflop runs in preview mode without complete solver coverage. Spots support training flow but are not a fully reviewed production model.",
      "Postflop běží v náhledovém režimu bez kompletní solverové coverage. Spoty jsou použitelné pro trénink flow, ne jako plně ověřený produkční model.",
    ),
  };
}

function candidateProfileLabel(profile: TrainingProfile): string {
  if (profile.gameVariant === "SNG") {
    return `SNG ${evModelLabel(profile.evModel)} preview`;
  }
  if (profile.gameVariant === "CASH") {
    return `Cash ${profile.rakeMode === "RAKE" ? "rake" : "no rake"} preview`;
  }
  return `${profile.gameVariant} ${profile.tableFormat === "FULL_RING_9" ? "9-max" : "6-max"} preflop ${evModelLabel(profile.evModel)} preview`;
}

function profileGateMessage(profile: TrainingProfile, filters: Filters): string {
  const resolvedProfile = runtimeProfile(profile, filters);
  const capability = trainingCapabilityForProfile(resolvedProfile);
  const mttReadiness = capability.mttReadiness;
  if (mttReadiness) {
    const label = mttProfileLabel(resolvedProfile);
    if (mttReadiness.status === "CANDIDATE") {
      return `${label}: ${CS.training.profile.candidate}. ${CS.training.profile.disabledUntilCoverage}`;
    }
    return `${label}: ${
      resolvedProfile.street === "PREFLOP"
        ? CS.training.profile.missingRange
        : CS.training.profile.missingStrategy
    }. ${CS.training.profile.disabled}`;
  }

  if (capability.status === "PREVIEW") {
    return (
      `${candidateProfileLabel(profile)}: ${CS.training.profile.candidate}. ` +
      CS.training.profile.disabledUntilCoverage
    );
  }

  return capability.status === "UNSUPPORTED"
    ? CS.training.profile.unsupported
    : CS.training.profile.disabled;

}


function mttProductionProfileKey(
  profile: TrainingProfile,
): string | null {
  if (
    profile.gameVariant !== "MTT" ||
    profile.evModel === "ICM" ||
    profile.rakeMode !== "NONE"
  ) {
    return null;
  }
  return mttProductionImportSlotId({
    tableFormat: profile.tableFormat,
    blindSpeed: profile.blindSpeed,
    evModel: profile.evModel,
    street: profile.street,
    ante: profile.ante,
  });
}

function mttProductionProfileFamilyKey(profile: TrainingProfile): string {
  return [
    profile.gameVariant,
    profile.tableFormat,
    profile.blindSpeed,
    profile.evModel,
    profile.ante,
    profile.rakeMode,
  ].join("|");
}

function logRangeLoadFailure(): void {
  const errors = getRangeDataErrors();
  if (errors.length > 0 && typeof console !== "undefined") {
    console.warn("Range_Store is not loaded:", errors);
  }
}

function mttProfileLabel(profile: TrainingProfile): string {
  return `MTT ${profile.tableFormat === "FULL_RING_9" ? "9-max" : "6-max"} ` +
    `${profile.blindSpeed === "REGULAR" ? "regular" : "turbo"} ` +
    `${profile.street.toLowerCase()} ${evModelLabel(profile.evModel)}`;
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
): TrainingController {
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
  const sessionTitle = el("div", "training__session-title", CS.training.question);
  const sessionMeta = el("div", "training__session-meta");
  const changeSituationBtn = document.createElement("button");
  changeSituationBtn.type = "button";
  changeSituationBtn.className = "training__change-situation";
  changeSituationBtn.textContent = CS.training.changeSituation;
  sessionInfo.appendChild(sessionTitle);
  sessionInfo.appendChild(sessionMeta);

  /**
   * How this session is going, on the bar above the table.
   *
   * The trainer graded every answer and then forgot it until the dashboard. A
   * player working through spots had nothing in front of them that moved, which
   * is the difference between practising and playing. The streak is the part
   * that pulls - it is the number you do not want to reset - and the tally is
   * the part that keeps it honest, because a streak alone hides a bad session.
   *
   * Session-scoped and deliberately not persisted: this is the run you are in,
   * not your record. The dashboard already owns the long view.
   */
  const scoreboard = el("div", "training__scoreboard");
  const streakChip = el("div", "training__streak");
  const tallyChip = el("div", "training__tally");
  scoreboard.appendChild(streakChip);
  scoreboard.appendChild(tallyChip);
  let sessionScore = emptySessionScore();

  function renderScoreboard(): void {
    streakChip.dataset.streak = String(sessionScore.streak);
    streakChip.textContent = CS.training.streak(sessionScore.streak);
    streakChip.classList.toggle("training__streak--hot", isHotStreak(sessionScore));
    tallyChip.textContent = sessionScore.answered === 0
      ? CS.training.tallyEmpty
      : CS.training.tally(sessionScore.correct, sessionScore.answered, sessionScore.bestStreak);
  }

  function recordScore(hit: boolean): void {
    sessionScore = recordAnswer(sessionScore, hit);
    renderScoreboard();
  }

  function resetScore(): void {
    sessionScore = emptySessionScore();
    renderScoreboard();
  }

  renderScoreboard();
  sessionBar.appendChild(sessionInfo);
  sessionBar.appendChild(scoreboard);
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

  // The equity table prices the action buttons. It is fetched rather than bundled
  // - 115 KB has no business on the install path - and the fetch starts here, at
  // boot, rather than when a session starts. Gating the start on it was the first
  // attempt and it was wrong twice over: it turned a synchronous click into a
  // deferred one, which the mobile smoke tests caught immediately, and it made
  // every postflop session wait for a table postflop never reads.
  //
  // Booting it here means it is in flight while the player picks filters, so by
  // the click it has landed. If it somehow has not, the first spot of the session
  // carries no EV and the rest carry it - spots are generated one at a time as
  // the player advances, so only the first can be early enough to miss.
  void loadPreflopEquity();

  // Stav bÄ›ĹľĂ­cĂ­ relace (iterĂˇtor sekvence).
  let iterator: Iterator<Spot> | null = null;
  let activeRangeStore: RangeStore = rangeStore;
  let activeTrainingProfile: TrainingProfile | null = null;
  let activeRangePack: RangePack | null = null;
  // The filters the running session was started with. Kept here beside the other
  // session state rather than threaded through the click handlers, which is how
  // this file already carries the range store and the profile.
  let activeFilters: Filters | null = null;
  let answered = false; // bylo uĹľ na aktuĂˇlnĂ­ spot odpovÄ›zeno?
  let activeQuestionStartedAt = 0;

  const filtersView: FiltersView = renderFilters(filtersBox, {
    onStart: (filters: Filters, seed: number | null, profile) => {
      const resolvedProfile = runtimeProfile(profile, filters);
      const startResolvedProfile = (): void => {
        const capability = trainingCapabilityForProfile(resolvedProfile);
        if (isPostflopStreet(profile.street)) {
          if (!capability.canStartTraining) {
            gameBox.hidden = true;
            filtersView.showEmptyResult(profileGateMessage(profile, filters));
            return;
          }
          startPostflopSession(filters, seed, profile.street, resolvedProfile);
          return;
        }
        if (!isRangeDataLoaded()) {
          logRangeLoadFailure();
          gameBox.hidden = true;
          filtersView.showEmptyResult(
            CS.training.referenceRangesUnavailable,
          );
          return;
        }
        const pack = startableMttPreflopRangePack(resolvedProfile, capability);
        if (!pack) {
          gameBox.hidden = true;
          filtersView.showEmptyResult(profileGateMessage(profile, filters));
          return;
        }
        startSession(filters, seed, resolvedProfile, pack);
      };

      mttProductionLazyLoader.cancelPendingProfileLoads();
      const profileKey = mttProductionProfileKey(resolvedProfile);
      const initialCapability = trainingCapabilityForProfile(resolvedProfile);
      if (
        (
          resolvedProfile.street === "PREFLOP" &&
          initialCapability.status === "PREVIEW" &&
          isPlayableMttPreflopPreview(resolvedProfile)
        ) ||
        profileKey === null ||
        mttProductionLazyLoader.isProfileLoaded(profileKey)
      ) {
        startResolvedProfile();
        return;
      }
      void mttProductionLazyLoader.loadProfile(profileKey)
        .then((loaded) => {
          if (!loaded.stale) startResolvedProfile();
        })
        .catch(() => {
          gameBox.hidden = true;
          filtersView.showEmptyResult(CS.training.productionStrategyUnavailable);
        });
    },
  });

  changeSituationBtn.addEventListener("click", () => {
    iterator = null;
    answered = false;
    clearActiveQuestion();
    gameBox.hidden = true;
    filtersBox.hidden = false;
    focusElement(filtersBox.querySelector<HTMLElement>(".profile-variant"));
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
  function startSession(
    filters: Filters,
    seed: number | null,
    profile: TrainingProfile,
    pack: RangePack,
  ): void {
    // Req 6.7: vyĹ™eĹˇ a zpĹ™Ă­stupni platnĂ˝ seed (aby Ĺˇel zopakovat).
    const resolvedSeed = resolveSeed(seed);
    filtersView.setSeed(resolvedSeed);

    const cfg: SessionConfig = { seed: resolvedSeed, filters };

    // Sestav sekvenci a zjisti, zda obsahuje alespoĹ jeden spot.
    const profileRangeStore = createRangeStoreFromRangePack(pack);
    if (!profileRangeStore.isLoaded()) {
      clearActiveQuestion();
      gameBox.hidden = true;
      filtersView.showEmptyResult(
        `${mttProfileLabel(profile)}: ${CS.training.productionStrategyUnavailable}`,
      );
      return;
    }
    const seq = spotSequence(cfg, profileRangeStore);
    const it = seq[Symbol.iterator]();
    const first = it.next();

    if (first.done) {
      // Říct, co funguje, ne jen že nic nefunguje.
      //
      // Nabídka je širší než obsah: push/fold se nabízí na 5 až 25 BB a knihovna
      // ho má na 5 a 10, takže relace „push/fold, 20 BB" rozdá nula spotů.
      // Obecná hláška to svádí číst jako chybu výběru, přitom je to naše mezera.
      const workingDepths = bucketsWithSpots(filters.contexts, filters.ante, profileRangeStore);
      // Req 13.6: prĂˇzdnĂ˝ prĹŻnik filtrĹŻ â‡’ upozornÄ›nĂ­, relaci nespouĹˇtÄ›j.
      clearActiveQuestion();
      gameBox.hidden = true;
      filtersView.showEmptyResult(
        workingDepths.length > 0 ? CS.filters.emptyDepths(workingDepths) : undefined,
      );
      return;
    }

    // NovĂˇ relace: vynuluj poÄŤet spotĹŻ relace (Req 9.5) a vyÄŤisti vĂ˝sledek.
    hooks.resetSession();
    resetScore();
    hooks.refreshDashboard();
    filtersView.clearWarning();

    activeRangeStore = profileRangeStore;
    activeTrainingProfile = profile;
    activeRangePack = pack;
    iterator = it;
    filtersBox.hidden = true;
    gameBox.hidden = false;
    showSpot(first.value, filters);
  }

  function startPreflopFocusSession(filters: Filters): void {
    const profile: TrainingProfile = {
      ...DEFAULT_TRAINING_PROFILE,
      ante: filters.ante,
      street: "PREFLOP",
    };
    filtersView.setProfile(profile);
    filtersView.setFilters(filters);
    const resolvedProfile = runtimeProfile(profile, filters);
    const capability = trainingCapabilityForProfile(resolvedProfile);
    const pack = startableMttPreflopRangePack(resolvedProfile, capability);
    if (!pack) {
      gameBox.hidden = true;
      filtersView.showEmptyResult(profileGateMessage(profile, filters));
      return;
    }
    startSession(filters, null, resolvedProfile, pack);
  }

  /** ZobrazĂ­ spot: vykreslĂ­ stĹŻl a nabĂ­dku akcĂ­, vyÄŤistĂ­ pĹ™edchozĂ­ vĂ˝sledek. */
  function clearActiveQuestion(): void {
    sessionTitle.textContent = CS.training.question;
    sessionMeta.textContent = "";
    tableContainer.innerHTML = "";
    actionsContainer.innerHTML = "";
    resultContainer.innerHTML = "";
    matrixContainer.innerHTML = "";
    activeQuestionStartedAt = 0;
  }

  function showSpot(spot: Spot, filters: Filters): void {
    answered = false;
    activeFilters = filters;
    activeQuestionStartedAt = nowMs();

    sessionTitle.textContent = spotTitle(spot);
    sessionMeta.textContent =
      `${spot.effStack} BB - ${filters.ante === "ON" ? "ante ON" : "ante OFF"} - ` +
      `seed ${filtersView.getSeed() ?? CS.filters.random}`;
    renderTable(spot, filters.ante, tableContainer);
    resultContainer.innerHTML = "";
    matrixContainer.innerHTML = "";
    renderActions(spot, filters.scoringMode);
    focusElement(actionsContainer.querySelector<HTMLButtonElement>(".action-btn"));
  }

  /** VykreslĂ­ tlaÄŤĂ­tka nabĂ­zenĂ˝ch akcĂ­ (Req 3.12 â€” 1 klĂ­ÄŤ na akci). */
  function renderActions(spot: Spot, mode: ScoringMode): void {
    actionsContainer.innerHTML = "";

    const heading = el("div", "training__actions-title", CS.app.actionsTitle);
    actionsContainer.appendChild(heading);

    const row = el("div", "training__actions-row");
    for (const answer of spot.answers) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn";
      btn.dataset.action = answer.key;
      // The same colour this action wears in the range matrix, so pressing a
      // button and reading the grid afterwards are visibly the same decision.
      // Applied as an accent rather than a fill: eleven saturated backgrounds
      // behind white text would be a colour test, not a poker trainer.
      const accent = colorForActionKey(answer.key);
      btn.style.setProperty("--action-accent", accent);
      setActionEvButtonContent(btn, answer.label);
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
    const result = grade(spot, chosen, mode);

    // Zablokuj tlaÄŤĂ­tka akcĂ­ a zvĂ˝razni zvolenĂ©.
    const buttons = actionsContainer.querySelectorAll<HTMLButtonElement>(".action-btn");
    buttons.forEach((b) => {
      b.disabled = true;
      if (b.dataset.action === chosen) b.classList.add("action-btn--chosen");
      if (result.recommended.includes(b.dataset.action as ActionKey)) {
        b.classList.add("action-btn--recommended");
      }
    });
    revealActionEvButtonBubbles(buttons, spot.actionEvs, result.actionEv);
    // Cena vedle EV, ne místo ní. EV říká, co akce vynese; cena, kolik musí
    // vydělat, aby se zaplatila - a je jich víc: přesnou EV má 33,1 % spotů,
    // aspoň jednu cenu 100 %.
    revealActionPriceLines(buttons, preflopDecisionPrices(spot, activeRangeStore));

    // VyhodnocenĂ­ (ÄŤistĂ© jĂˇdro).
    const responseMs = elapsedMs(activeQuestionStartedAt);

    // ZĂˇznam vĂ˝sledku PĹED dalĹˇĂ­m spotem (Req 9.1); selhĂˇnĂ­ â‡’ upozornÄ›nĂ­ (Req 9.6).
    if (!activeTrainingProfile || !activeRangePack) {
      throw new Error("Active preflop profile identity is missing.");
    }
    const record = buildProfileAwarePreflopResultRecord({
      spot,
      chosen,
      correct: result.correct,
      profile: activeTrainingProfile,
      rangePack: activeRangePack,
      scoringMode: mode,
      ts: Date.now(),
      responseMs,
    });
    const save = statsStore.record(record);

    // Inkrement poÄŤtu spotĹŻ relace + pĹ™ekreslenĂ­ dashboardu (Req 9.5).
    hooks.onAnswered();
    hooks.refreshDashboard();

    // The scoreboard counts what the grader decided, so an EQUIVALENT or
    // ACCEPTABLE outcome is not punished as a mistake - the same distinction the
    // verdict text makes.
    recordScore(isHit(result.correct, result.actionEv?.outcome));

    // ZobrazenĂ­ vĂ˝sledku, zdĹŻvodnÄ›nĂ­ a doporuÄŤenĂ­.
    renderResult(spot, result, save.ok, activeFilters);

    // Range matice pro danĂ˝ spot (Req 10) + legacy parity modal.
    matrixContainer.innerHTML = "";
    renderRangeModalButton(spot, activeRangeStore, matrixContainer);
    const inlineMatrix = el("div", "training__matrix-inline");
    matrixContainer.appendChild(inlineMatrix);
    renderMatrix(spot, activeRangeStore, inlineMatrix);
  }

  /** VykreslĂ­ indikaci sprĂˇvnosti, zdĹŻvodnÄ›nĂ­ a doporuÄŤenĂ© AkÄŤnĂ­_klĂ­ÄŤe (Req 7.4). */
  function renderResult(
    spot: Spot,
    result: ReturnType<typeof grade>,
    saveOk: boolean,
    filters: Filters | null,
  ): void {
    resultContainer.innerHTML = "";

    const box = el("div", "result");
    box.classList.add(result.correct ? "result--correct" : "result--wrong");

    const verdictText = result.actionEv?.outcome === "EQUIVALENT"
      ? CS.training.equivalent
      : result.actionEv?.outcome === "ACCEPTABLE"
        ? CS.training.acceptable
        : result.correct
          ? CS.training.correct
          : CS.training.incorrect;
    const verdict = el(
      "div",
      "result__verdict",
      verdictText,
    );
    box.appendChild(verdict);

    // DoporuÄŤenĂ© AkÄŤnĂ­_klĂ­ÄŤe z Range_Store (Req 7.4 / 7.7).
    if (result.recommended.length > 0) {
      const rec = el(
        "div",
        "result__recommended",
        `${CS.training.recommended}: ${result.recommended.map(actionKeyLabel).join(" / ")}`,
      );
      box.appendChild(rec);
    }
    box.appendChild(renderPreflopActionEv(spot, result));

    // What the decision cost, derived from the pot and the stack rather than
    // looked up, so every all-in spot can be priced whether or not a pack ships
    // a number for it.
    const price = filters === null ? null : renderDecisionPrice(document, spot, filters);
    if (price !== null) box.appendChild(price);

    // ZdĹŻvodnÄ›nĂ­ (Req 7.4); pĹ™i nedostupnosti zobraz nĂˇhradnĂ­ text (Req 7.5).
    const explanation = el("div", "result__explanation");
    if (result.explanationAvailable) {
      explanation.textContent = buildPreflopExplanationForSpot(spot, getAppLanguage());
    } else {
      explanation.textContent = CS.training.explanationUnavailable;
      explanation.classList.add("result__explanation--unavailable");
    }
    box.appendChild(explanation);

    // Req 9.6: vĂ˝sledek se nepodaĹ™ilo uloĹľit â‡’ upozornÄ›nĂ­, ale pokraÄŤujeme.
    if (!saveOk) {
      const warn = el(
        "div",
        "result__save-warning",
        CS.training.saveWarning,
      );
      box.appendChild(warn);
    }

    // TlaÄŤĂ­tko â€žDalĹˇĂ­" â€” zobrazĂ­ dalĹˇĂ­ spot ze sekvence.
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "result__next";
    nextBtn.textContent = CS.training.nextSpot;
    nextBtn.addEventListener("click", () => advance());
    box.appendChild(nextBtn);

    resultContainer.appendChild(box);
    focusElement(nextBtn);
  }

  /** Posune sekvenci na dalĹˇĂ­ spot (Req 6.6 â€” sekvence cyklĂ­ deterministicky). */
  function renderPreflopActionEv(
    spot: Spot,
    result: ReturnType<typeof grade>,
  ): HTMLElement {
    const section = el("section", "action-ev");
    section.dataset.available = result.actionEv ? "true" : "false";
    section.appendChild(el("div", "action-ev__title", CS.training.actionEv.title));

    if (!result.actionEv || !spot.actionEvs) {
      section.appendChild(el("p", "action-ev__unavailable", CS.training.actionEv.unavailable));
      return section;
    }

    const list = el("div", "action-ev__list");
    const sorted = [...spot.actionEvs.values].sort((left, right) => right.evBb - left.evBb);
    for (const item of sorted) {
      const lossBb = Math.max(0, result.actionEv.bestEvBb - item.evBb);
      const row = el("div", "action-ev__row");
      row.classList.toggle("action-ev__row--chosen", item.action === result.actionEv.chosenAction);
      row.classList.toggle("action-ev__row--best", result.actionEv.bestActions.includes(item.action));
      row.dataset.action = item.action;
      row.dataset.evBb = String(item.evBb);
      row.append(
        el("span", "action-ev__action", actionKeyLabel(item.action)),
        el("span", "action-ev__value", `${formatActionEvBb(item.evBb)} BB`),
        el(
          "span",
          "action-ev__delta",
          lossBb <= 1e-9 ? CS.training.actionEv.best : `${formatActionEvBb(-lossBb)} BB`,
        ),
      );
      list.appendChild(row);
    }
    section.appendChild(list);
    section.appendChild(el("p", "action-ev__note", CS.training.actionEv.note));
    return section;
  }

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

  return {
    startPreflopFocusSession,
    getProfile: () => runtimeProfile(filtersView.getProfile(), filtersView.getFilters()),
  };
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
    CS.system.storageTitle,
    CS.system.storageMessage,
  );
}

/** ZobrazĂ­ nenĂˇsilnĂ© upozornÄ›nĂ­ v banneru (Req 12.4, 14.3). */
/**
 * Fetch solved turn content alongside the production packs, without gating on it.
 *
 * A failed chunk must not stop a session starting. The resolver chain already
 * falls through to the chart-derived turn packs and then to the heuristic model
 * when no solved pack is present, so the cost of a failed download is content
 * that is a grade less specific - not a trainer that refuses to deal a hand.
 */
async function loadSolvedTurnPacksForProfiles(profileKeys: readonly string[]): Promise<void> {
  await Promise.all(profileKeys.flatMap((profileKey) => [
    loadSolvedTurnPacks(profileKey).catch(() => []),
    // Riverový obsah jde stejnou cestou a se stejnou tolerancí k selhání. Kdyby
    // se nenačetl, resolver na riveru prostě nic nenajde a řetězec propadne níž
    // - stejně jako když ta rodina ještě neexistuje.
    loadSolvedRiverPacks(profileKey).catch(() => []),
    // Flop stejnou cestou. Když se nenačte, odpoví texturní agregát jako dřív -
    // tedy o stupeň méně přesně, ne vůbec.
    loadSolvedFlopPacks(profileKey).catch(() => []),
  ]));
}

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
    console.error("MTT Preflop Trainer - error:", message, err);
  }
  // Pokud existuje banner upozornÄ›nĂ­, pouĹľij ho (nenĂˇsilnÄ›); jinak nahraÄŹ koĹ™en.
  const notice = root.querySelector<HTMLElement>(".app__notice");
  if (notice) {
    notice.hidden = false;
    notice.appendChild(el("div", "app__notice-line", message));
    return;
  }
  renderBlockingError(root, CS.system.errorTitle, message);
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
        CS.system.offlineFailure,
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
      CS.system.runtimeError,
      event.error ?? event.message,
    );
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    showFatalError(
      root,
      CS.system.asyncError,
      event.reason,
    );
  });
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
