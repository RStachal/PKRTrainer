// Service Worker pro MTT Preflop Trainer (Req 12.1, 12.2, 12.4, 12.5).
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
const CACHE = "mtt-preflop-v1";

/** Stabilní (nehashovaný) app shell pro precache při install. */
const APP_SHELL: readonly string[] = ["./", "./index.html", "./manifest.webmanifest"];

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
    })(),
  );
  // Nový SW převezme řízení co nejdříve (nečekat na zavření všech karet).
  void sw.skipWaiting();
});

// --- activate: úklid starých verzí cache -----------------------------------

sw.addEventListener("activate", (event: ExtendableEventLike) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("mtt-preflop-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      // Převzít řízení nad otevřenými klienty bez nutnosti reloadu.
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

  event.respondWith(cacheFirst(request));
});

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
    if (request.mode === "navigate") {
      const shell = (await cache.match("./index.html")) ?? (await cache.match("./"));
      if (shell) {
        return shell;
      }
    }
    throw error;
  }
}
