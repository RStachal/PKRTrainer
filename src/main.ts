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
  DEFAULT_TRAINING_PROFILE,
  evModelLabel,
  isPostflopStreet,
  type TrainingProfile,
} from "./core/trainingProfile";
import { isFlowAllowed } from "./core/trainingCapability";
import { resolveSeed, spotSequence } from "./core/drillEngine";
import { postflopIntentFromFilters } from "./core/postflopIntent";
import { grade } from "./core/scoring";
import type { PostflopStreet } from "./core/postflopGenerator";
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
  type TrainingCapability,
} from "./data/ranges/trainingCapability";
import { mttPreflopRangePackForProfile } from "./data/ranges/mttPreflopRangePacks";
import { mttProductionImportSlotId } from "./data/ranges/mttImportSlotNaming";
import { mttProductionLazyLoader } from "./data/ranges/mttProductionLazyLoader";
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
import { renderMatrix } from "./ui/rangeMatrixView";
import { renderRangeModalButton } from "./ui/rangeModal";
import { renderHHView } from "./ui/hhView";
import { renderPostflopView } from "./ui/postflopView";
import { CS } from "./ui/cs";
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
    const requiresExactRuntime = (
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
      strategyResolver: runtimeProfileForView
        ? (input) => postflopRuntime?.resolver?.(input) ?? null
        : undefined,
      allowFallback: requiresExactRuntime ? false : capability?.allowHeuristicFallback ?? true,
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
        return "Produkční HH review vyžaduje tréninkový profil MTT.";
      }
      if (result.fields.tableFormat !== profile.tableFormat) {
        return "Importovaná handa a vybraný profil používají jiný formát stolu.";
      }
      if (profile.ante !== (result.fields.ante ?? "OFF")) {
        return "Importovaná handa a vybraný profil používají jiný režim ante.";
      }
      return null;
    },
    onReviewBuilt: (records) => {
      const save = hhReviewStore.replaceAll(hhReviewStore.events().concat(records));
      if (!save.ok) {
        showNotice(
          shell.notice,
          "HH review se nepodařilo uložit. Statistiky tréninku nebyly změněny.",
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
function buildAppShell(root: HTMLElement): AppShell {
  root.appendChild(appStyles());

  const app = el("div", "app");

  // HlaviÄŤka.
  const header = el("header", "app__header");
  header.appendChild(el("h1", "app__title", CS.app.title));
  header.appendChild(
    el(
      "p",
      "app__subtitle",
      CS.app.subtitle,
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

function candidateProfileLabel(profile: TrainingProfile): string {
  if (profile.gameVariant === "SNG") {
    return `SNG ${evModelLabel(profile.evModel)} náhled`;
  }
  if (profile.gameVariant === "CASH") {
    return `Cash ${profile.rakeMode === "RAKE" ? "rake" : "bez rake"} náhled`;
  }
  return `${profile.gameVariant} ${profile.tableFormat === "FULL_RING_9" ? "9-max" : "6-max"} preflop ${evModelLabel(profile.evModel)} náhled`;
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

function preflopRangePackForStart(
  profile: TrainingProfile,
  capability: TrainingCapability,
): RangePack | undefined {
  const pack = mttPreflopRangePackForProfile(profile);
  const readiness = capability.mttReadiness;
  if (capability.status === "PRODUCTION" && readiness?.productionReady === true) {
    return pack?.id === readiness.packId ? pack : undefined;
  }
  if (
    capability.status === "PREVIEW" &&
    isPlayableMttPreflopPreview(profile) &&
    pack &&
    pack.records.length > 0
  ) {
    return pack;
  }
  return undefined;
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
  let activeRangeStore: RangeStore = rangeStore;
  let activeTrainingProfile: TrainingProfile | null = null;
  let activeRangePack: RangePack | null = null;
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
        const pack = preflopRangePackForStart(resolvedProfile, capability);
        if (!pack) {
          gameBox.hidden = true;
          filtersView.showEmptyResult(profileGateMessage(profile, filters));
          return;
        }
        startSession(filters, seed, resolvedProfile, pack);
      };

      mttProductionLazyLoader.cancelPendingProfileLoads();
      const profileKey = mttProductionProfileKey(resolvedProfile);
      if (
        (
          profile.street === "PREFLOP" &&
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
    const pack = preflopRangePackForStart(resolvedProfile, capability);
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
    activeQuestionStartedAt = nowMs();

    sessionTitle.textContent = `${actionContextLabel(spot.context)} - ${spot.heroPos} - ${spot.hand}`;
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

    // ZobrazenĂ­ vĂ˝sledku, zdĹŻvodnÄ›nĂ­ a doporuÄŤenĂ­.
    renderResult(spot, result, save.ok);

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
  ): void {
    resultContainer.innerHTML = "";

    const box = el("div", "result");
    box.classList.add(result.correct ? "result--correct" : "result--wrong");

    const verdict = el(
      "div",
      "result__verdict",
      result.correct ? CS.training.correct : CS.training.incorrect,
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

    // ZdĹŻvodnÄ›nĂ­ (Req 7.4); pĹ™i nedostupnosti zobraz nĂˇhradnĂ­ text (Req 7.5).
    const explanation = el("div", "result__explanation");
    if (result.explanationAvailable) {
      explanation.textContent = spot.explanation;
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
      "Do\u0161lo k neo\u010dek\u00e1van\u00e9 chyb\u011b aplikace. \u010c\u00e1st funkc\u00ed nemus\u00ed fungovat spr\u00e1vn\u011b.",
      event.error ?? event.message,
    );
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    showFatalError(
      root,
      "Do\u0161lo k neo\u010dek\u00e1van\u00e9 chyb\u011b p\u0159i asynchronn\u00ed operaci. \u010c\u00e1st funkc\u00ed nemus\u00ed " +
        "fungovat spr\u00e1vn\u011b.",
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
body{margin:0;background:
  radial-gradient(circle at 18% -8%,rgba(43,213,118,.14),rgba(43,213,118,0) 28%),
  radial-gradient(circle at 88% 4%,rgba(123,211,255,.11),rgba(123,211,255,0) 30%),
  linear-gradient(180deg,#090f18,#060a11 58%,#05080e);
  color:#e8ecf7;font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;}
.app{width:min(100% - 32px,1120px);margin:0 auto;padding:28px 0 56px;}
.app__header{margin-bottom:18px;padding:4px 0 2px;}
.app__title{margin:0;font-size:28px;font-weight:950;letter-spacing:0;color:#f8fbff;
  text-shadow:0 10px 30px rgba(0,0,0,.35);}
.app__subtitle{margin:6px 0 0;font-size:14px;color:#a8b7d5;}
.app__notice{margin:10px 0;padding:10px 12px;border-radius:10px;
  background:rgba(255,209,91,.14);border:1px solid rgba(255,209,91,.45);
  color:#ffd15b;font-size:13px;}
.app__notice-line+.app__notice-line{margin-top:6px;}
.app__tabs{display:flex;gap:8px;border-bottom:1px solid rgba(148,163,184,.16);
  margin-bottom:18px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:#7bd3ff transparent;}
.app__tab{appearance:none;border:1px solid transparent;background:transparent;color:#9fb0cf;
  font-size:14px;font-weight:850;padding:11px 18px;cursor:pointer;border-radius:10px 10px 0 0;
  border-bottom:3px solid transparent;white-space:nowrap;}
.app__tab:hover{color:#e8ecf7;background:rgba(255,255,255,.035);}
.app__tab--active{color:#f8fbff;border-color:rgba(148,163,184,.16);
  border-bottom-color:#2bd576;background:linear-gradient(180deg,rgba(21,30,45,.92),rgba(13,19,30,.72));
  box-shadow:0 10px 24px rgba(0,0,0,.18);}
.app__panel{outline:none;}
.training__filters{background:linear-gradient(180deg,rgba(18,25,38,.98),rgba(10,15,24,.98));
  border:1px solid rgba(148,163,184,.16);border-radius:16px;padding:18px 20px;margin-bottom:18px;
  box-shadow:0 24px 70px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);}
.profile-selector{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));
  gap:12px 14px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid
  rgba(148,163,184,.14);}
.profile-selector__title{grid-column:1/-1;font-size:14px;font-weight:950;color:#f8fbff;}
.profile-selector__field{display:grid;gap:6px;font-size:12px;color:#a8b7d5;font-weight:750;}
.profile-selector__field select,.filter-scoring,.filter-seed{box-sizing:border-box;min-width:0;background:#151f31;color:#f8fbff;
  border:1px solid rgba(148,163,184,.24);border-radius:10px;padding:9px 11px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.profile-selector__field select:focus,.filter-scoring:focus,.filter-seed:focus{outline:2px solid rgba(43,213,118,.42);
  outline-offset:1px;border-color:#2bd576;}
.profile-selector__note{grid-column:1/-1;font-size:12px;color:#b5c3df;line-height:1.4;
  overflow-wrap:anywhere;border-radius:10px;padding:9px 11px;background:rgba(123,211,255,.06);
  border:1px solid rgba(123,211,255,.14);}
.profile-selector__note--production{background:rgba(43,213,118,.08);border-color:rgba(43,213,118,.2);}
.profile-selector__note--candidate{background:rgba(255,209,91,.08);border-color:rgba(255,209,91,.2);}
.profile-selector__note--missing{background:rgba(226,59,59,.08);border-color:rgba(226,59,59,.28);}
.filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.filter-section-title{color:#f8fbff;}
.filter-bulk{display:inline-flex;gap:5px;margin-left:0!important;}
.filter-bulk-all,.filter-bulk-none{appearance:none;border:1px solid rgba(148,163,184,.22);
  border-radius:8px;background:linear-gradient(180deg,#2a3448,#182235);color:#e8ecf7;
  font-size:12px;font-weight:850;padding:5px 9px;cursor:pointer;}
.filter-bulk-all:hover,.filter-bulk-none:hover{border-color:#2bd576;}
.filter-group{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;}
.filter-position-item,.filter-bucket-item,.filter-context-item,.filter-ante-item,
.filter-scoring-item,.filter-seed-item{border-radius:999px;background:rgba(255,255,255,.035);
  border:1px solid rgba(148,163,184,.13);padding:5px 8px;margin-right:0!important;
  color:#edf3ff;}
.filter-group--config .filter-scoring-item,.filter-group--config .filter-seed-item{border-radius:10px;}
.filter-position,.filter-bucket,.filter-context,.filter-ante{accent-color:#2bd576;}
.training__game{display:flex;flex-direction:column;gap:16px;}
.training__session-bar{display:flex;align-items:center;justify-content:space-between;
  gap:12px;}
.training__session-info{min-width:0;display:grid;gap:3px;}
.training__session-title{font-size:15px;font-weight:900;color:#e8ecf7;}
.training__session-meta{font-size:12px;font-weight:700;color:#9aa6c2;
  overflow-wrap:anywhere;}
.training__change-situation{appearance:none;border:1px solid rgba(148,163,184,.24);
  background:linear-gradient(180deg,#202a3e,#151d2d);color:#e8ecf7;border-radius:10px;font-size:13px;
  font-weight:850;padding:9px 13px;cursor:pointer;box-shadow:0 8px 18px rgba(0,0,0,.18);}
.training__change-situation:hover{border-color:#2bd576;}
.training__actions-title{font-weight:700;font-size:14px;margin-bottom:8px;}
.training__actions-row{display:flex;flex-wrap:wrap;gap:8px;}
.action-btn{appearance:none;border:1px solid rgba(148,163,184,.24);
  background:linear-gradient(180deg,#202a3f,#141d2f);color:#e8ecf7;font-size:14px;font-weight:900;
  padding:10px 16px;border-radius:10px;cursor:pointer;box-shadow:0 10px 20px rgba(0,0,0,.18),
  inset 0 1px 0 rgba(255,255,255,.06);}
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
.filter-start{appearance:none;border:0;border-radius:12px;background:linear-gradient(180deg,#45e58c,#20bd65);
  color:#082817;min-height:42px;box-shadow:0 14px 28px rgba(43,213,118,.22),
  inset 0 1px 0 rgba(255,255,255,.35);}
.filter-start:hover{filter:brightness(1.04);transform:translateY(-1px);}
@media (max-width:720px){
  .app{width:min(100% - 20px,1120px);padding:18px 0 40px;}
  .app__title{font-size:25px;}
  .app__subtitle{font-size:13px;}
  .app__tabs{gap:4px;margin-left:-2px;margin-right:-2px;}
  .app__tab{padding:10px 13px;font-size:13px;}
  .training__filters{padding:14px 12px;border-radius:14px;}
  .profile-selector{grid-template-columns:1fr;gap:10px;}
  .filter-row{align-items:flex-start;justify-content:space-between;}
  .filter-group{gap:7px;}
  .filter-position-item,.filter-bucket-item,.filter-context-item{min-height:32px;}
  .filter-group--config{align-items:stretch!important;gap:10px!important;}
  .filter-ante-item,.filter-scoring-item,.filter-seed-item{width:100%;box-sizing:border-box;
    justify-content:space-between;}
  .filter-scoring,.filter-seed{width:min(56%,220px);}
  .filter-start{width:100%;font-size:15px!important;}
  .training__session-bar{flex-direction:column;align-items:stretch;}
  .training__change-situation,.action-btn,.result__next{width:100%;}
  .training__actions-row{display:grid;grid-template-columns:1fr;}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;
    animation-duration:.01ms!important;animation-iteration-count:1!important;}
  .filter-start:hover{filter:none;transform:none;}
}
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
