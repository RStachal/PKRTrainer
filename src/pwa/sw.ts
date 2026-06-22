// Service Worker pro MTT Preflop Trainer (Req 12.1, 12.2, 12.4, 12.5).
//
// Aktualni build pri instalaci precachuje kompletni seznam produkcnich souboru
// vlozeny z Vite buildu. Runtime cache pokryva nove same-origin GET odpovedi.
// Pri dvoubuildovem upgradu se z predchozi cache docasne obslouzi pouze
// hashovane build artefakty; stabilni soubory se ze stare verze neprebiraji.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ STRATEGIE NAKEŠOVÁNÍ                                                       │
// ├─────────────────────────────────────────────────────────────────────────┤
// │ Vite produkuje hashované bundly (např. index-a1b2c3.js, style-d4e5.css),  │
// │ jejichž přesné názvy nejsou v době psaní SW známé. Proto kombinujeme:     │
// │                                                                           │
// │ 1) PRECACHE APP SHELLU při `install` — nakešujeme stabilní, nehashované   │
// │    vstupy: kořen "./", "./index.html" a "./manifest.webmanifest".         │
// │                                                                           │
// │ 2) RUNTIME CACHE-FIRST v `fetch` — při prvním načtení se každá úspěšná     │
// │    same-origin GET odpověď (hashovaný JS bundle, CSS, moduly Range_Store  │
// │    a data chartů) uloží do Cache Storage. Při dalším načtení se servíruje │
// │    z cache bez síťového požadavku.                                        │
// │                                                                           │
// │ Po prvním úspěšném načtení tak má aplikace v cache vše potřebné a běží    │
// │ plně offline (Req 12.1, 12.5), kompatibilně se standardním Service Worker │
// │ API v Android WebView (Req 12.2).                                         │
// │                                                                           │
// │ Selhání nakešování (Req 12.4) se propaguje do stránky přes životní cyklus │
// │ SW: pokud `install` selže (addAll odmítne), worker se nestane aktivním a  │
// │ přejde do stavu `redundant`. Registrační helper (registerSw.ts) tento     │
// │ přechod detekuje a zobrazí české upozornění, že aplikaci nelze používat   │
// │ offline — bez pádu aplikace.                                              │
// └─────────────────────────────────────────────────────────────────────────┘
//
// POZNÁMKA K TYPŮM: Projektový tsconfig používá lib "DOM" (kvůli UI kódu).
// Reference na lib "webworker" by kolidovala s "DOM" (duplicitní deklarace
// `self`, `caches`, `fetch`, …). Proto SW kontext typujeme minimálními
// lokálními rozhraními a `self` přetypujeme defenzivním castem. Tím soubor
// projde `tsc --noEmit` se stávajícím tsconfig bez konfliktů.

/** Verze cache. Při změně app shellu / strategie zvyš verzi (úklid ve `activate`). */
const CACHE = "mtt-preflop-__PKR_PRECACHE_VERSION__";

/** Stabilní (nehashovaný) app shell pro precache při install. */
const APP_SHELL = injectedAppShell();

function injectedAppShell(): readonly string[] {
  try {
    const value = JSON.parse("__PKR_PRECACHE_ENTRIES__") as unknown;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return value;
    }
  } catch {
    // Unit test/source execution uses the stable fallback before Vite injection.
  }
  return ["./", "./index.html", "./manifest.webmanifest"];
}

// --- Minimální typy SW kontextu (vyhneme se konfliktu webworker × DOM lib) ---

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface ServiceWorkerScope {
  addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}

/** Defenzivní cast globálního `self` na SW kontext (viz poznámka k typům výše). */
const sw = self as unknown as ServiceWorkerScope;

// --- install: precache app shellu (Req 12.1) -------------------------------

sw.addEventListener("install", (event: ExtendableEventLike) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll je atomické: pokud kterýkoliv zdroj selže, install selže a worker
      // se stane redundantním → registerSw.ts to detekuje (Req 12.4).
      await cache.addAll(APP_SHELL as string[]);
      await sw.skipWaiting();
    })(),
  );
});

// --- activate: úklid starých verzí cache -----------------------------------

sw.addEventListener("activate", (event: ExtendableEventLike) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const applicationCaches = names.filter((name) => name.startsWith("mtt-preflop-"));
      const previousCaches = applicationCaches.filter((name) => name !== CACHE);
      const staleCaches = previousCaches.slice(0, Math.max(0, previousCaches.length - 1));
      await Promise.all(
        staleCaches.map((name) => caches.delete(name)),
      );
      await sw.clients.claim();
    })(),
  );
});

// --- fetch: cache-first s runtime nakešováním (Req 12.1, 12.5) --------------

sw.addEventListener("fetch", (event: FetchEventLike) => {
  const request = event.request;

  // Cachujeme pouze GET. Ostatní metody (POST, …) necháme projít přímo na síť.
  if (request.method !== "GET") {
    return;
  }

  // Cachujeme pouze same-origin požadavky (kód, styly, data, charty). Externí
  // požadavky neřešíme — aplikace je dle Req 12.1 nemá vyžadovat.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    request.mode === "navigate"
      ? networkFirstNavigation(request)
      : cacheFirst(request),
  );
});

async function networkFirstNavigation(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const shell = (await cache.match(request)) ??
      (await cache.match("./index.html")) ??
      (await cache.match("./"));
    if (shell) return shell;
    throw error;
  }
}

/**
 * Cache-first: nejdřív cache, jinak síť (a úspěšnou odpověď do cache uložit).
 * Při offline a chybějící cache nabídne pro navigace fallback na app shell.
 */
async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);

  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  // Po aktivaci nového workeru mohou již otevřené klienty ještě požadovat
  // hashované chunky předchozího buildu. Předchozí cache proto slouží jako
  // přesně jedna rollback generace; stabilní URL z ní nikdy nevracíme.
  if (isVersionedBuildAsset(request)) {
    const previous = await matchPreviousApplicationCache(request);
    if (previous) return previous;
  }

  try {
    const response = await fetch(request);
    // Ukládáme jen úspěšné same-origin odpovědi (basic/default), ne opaque.
    if (response.ok && (response.type === "basic" || response.type === "default")) {
      // Odpověď je jednorázový stream — před uložením je nutné ji klonovat.
      void cache.put(request, response.clone()).catch(() => {
        /* Selhání zápisu do cache nesmí shodit servírování odpovědi. */
      });
    }
    return response;
  } catch (error) {
    // Offline a zdroj není v cache. Pro navigační požadavky vrátíme app shell,
    // aby se SPA dokázala načíst z cache (Req 12.5).
    throw error;
  }
}

function isVersionedBuildAsset(request: Request): boolean {
  const fileName = new URL(request.url).pathname.split("/").pop() ?? "";
  return /-[a-zA-Z0-9_-]{8,}\.(?:css|js|json|wasm)$/.test(fileName);
}

async function matchPreviousApplicationCache(
  request: Request,
): Promise<Response | undefined> {
  const names = await caches.keys();
  const previousCaches = names
    .filter((name) => name.startsWith("mtt-preflop-") && name !== CACHE)
    .reverse();
  for (const name of previousCaches) {
    const cached = await (await caches.open(name)).match(request);
    if (cached) return cached;
  }
  return undefined;
}
