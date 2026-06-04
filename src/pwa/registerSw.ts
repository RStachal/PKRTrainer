// Defenzivní registrace Service Workeru (volá ji main.ts — task 20.1).
//
// Tento modul běží v kontextu STRÁNKY (DOM), nikoli ve workeru. Je proto
// oddělen od `sw.ts` (čistý worker skript). Registrace je plně defenzivní:
//   - ověří podporu `serviceWorker` v `navigator` (Android WebView ji nemusí mít),
//   - vše obalí try/catch, aby selhání nikdy neshodilo aplikaci (Req 12.4),
//   - detekuje selhání nakešování (worker přejde do stavu `redundant`) a
//     signalizuje ho zpět volajícímu callbackem `onCacheFailure` (Req 12.4).
//
// Cesta k workeru: očekává nasazený `./sw.js` v kořeni se scope `./`, aby SW
// řídil celou aplikaci. Viz `sw.ts` a dokumentace buildu v tasku 19.1.

/** Výsledek pokusu o registraci SW. */
export interface RegisterResult {
  /** Je Service Worker API v tomto prostředí vůbec dostupné? */
  supported: boolean;
  /** Podařilo se registraci spustit bez vyhozené chyby? */
  registered: boolean;
  /**
   * Selhalo nakešování / registrace tak, že aplikaci nelze používat offline?
   * Když je `true`, volající (main.ts) zobrazí české upozornění (Req 12.4).
   */
  cacheFailed: boolean;
  /** Případná zachycená chyba (k logování), bez pádu aplikace. */
  error?: unknown;
}

/** Volitelné callbacky pro propagaci stavu do UI vrstvy. */
export interface RegisterOptions {
  /**
   * Zavoláno, když nakešování zdrojů při prvním načtení selže a aplikaci tak
   * nelze používat offline (Req 12.4). UI má zobrazit upozornění v češtině.
   */
  onCacheFailure?: (error: unknown) => void;
  /** Cesta ke skriptu workeru (default `./sw.js`, kořenový scope). */
  swUrl?: string;
}

/**
 * Zaregistruje Service Worker. Nikdy nevyhazuje — případné chyby vrací ve
 * `RegisterResult` a/nebo hlásí přes `onCacheFailure`. Mimo prohlížeč
 * (např. v testovacím node prostředí) bezpečně vrátí `supported: false`.
 */
export async function registerServiceWorker(
  options: RegisterOptions = {},
): Promise<RegisterResult> {
  const { onCacheFailure, swUrl = "./sw.js" } = options;

  // Feature detection — Android WebView bez SW, SSR, testy, atd.
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, registered: false, cacheFailed: false };
  }

  try {
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: "./",
    });

    // Sledujeme nově instalovaný worker. Pokud `install` selže (např. precache
    // app shellu odmítne v `cache.addAll`), worker přejde do `redundant`, aniž
    // by se kdy aktivoval → to je signál selhání offline cache (Req 12.4).
    watchForInstallFailure(registration, onCacheFailure);

    return { supported: true, registered: true, cacheFailed: false };
  } catch (error) {
    // Samotná registrace selhala (chybí soubor, scope, bezpečnostní omezení…).
    // Aplikace musí běžet dál (online), jen bez offline schopnosti (Req 12.4).
    onCacheFailure?.(error);
    return { supported: true, registered: false, cacheFailed: true, error };
  }
}

/**
 * Naváže se na `installing` worker a hlásí selhání, pokud přejde do stavu
 * `redundant` bez úspěšné aktivace. Čistě best-effort, vše v try/catch.
 */
function watchForInstallFailure(
  registration: ServiceWorkerRegistration,
  onCacheFailure?: (error: unknown) => void,
): void {
  try {
    const installing = registration.installing;
    if (!installing) {
      return;
    }
    installing.addEventListener("statechange", () => {
      // `redundant` před dosažením `activated`/`installed` ⇒ install selhal.
      if (installing.state === "redundant") {
        onCacheFailure?.(
          new Error("Service Worker could not be installed (cache setup failed)."),
        );
      }
    });
  } catch {
    // Nic neděláme — sledování selhání je best-effort a nesmí shodit appku.
  }
}
