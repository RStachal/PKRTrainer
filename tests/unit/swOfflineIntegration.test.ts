import { describe, expect, it, vi } from "vitest";

type ExtendableEventLike = {
  waitUntil(promise: Promise<unknown>): void;
};

type FetchEventLike = ExtendableEventLike & {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
};

type ListenerMap = {
  install?: (event: ExtendableEventLike) => void;
  activate?: (event: ExtendableEventLike) => void;
  fetch?: (event: FetchEventLike) => void;
};

class FakeCache {
  private readonly origin = "https://trainer.test";
  private readonly entries = new Map<string, Response>();

  async addAll(requests: string[]): Promise<void> {
    for (const request of requests) {
      const url = new URL(request, `${this.origin}/`).href;
      this.entries.set(url, new Response(`app-shell:${request}`, { status: 200 }));
    }
  }

  async match(request: Request | string): Promise<Response | undefined> {
    const hit = this.entries.get(this.keyFor(request));
    return hit?.clone();
  }

  async put(request: Request | string, response: Response): Promise<void> {
    this.entries.set(this.keyFor(request), response.clone());
  }

  private keyFor(request: Request | string): string {
    if (typeof request === "string") {
      return new URL(request, `${this.origin}/`).href;
    }
    return request.url;
  }
}

describe("service worker - offline provoz", () => {
  it("po prvnim online nacteni serviruje same-origin GET z runtime cache bez site", async () => {
    const listeners: ListenerMap = {};
    const cache = new FakeCache();
    const globals = globalThis as Record<string, unknown>;
    const previousSelf = globals.self;
    const previousCaches = globals.caches;
    const previousFetch = globals.fetch;
    let networkCalls = 0;

    globals.self = {
      location: { origin: "https://trainer.test" },
      clients: { claim: () => Promise.resolve() },
      skipWaiting: () => Promise.resolve(),
      addEventListener: (type: keyof ListenerMap, listener: ListenerMap[keyof ListenerMap]) => {
        if (type === "install") {
          listeners.install = listener as (event: ExtendableEventLike) => void;
        }
        if (type === "activate") {
          listeners.activate = listener as (event: ExtendableEventLike) => void;
        }
        if (type === "fetch") {
          listeners.fetch = listener as (event: FetchEventLike) => void;
        }
      },
    };
    globals.caches = {
      open: () => Promise.resolve(cache),
      keys: () => Promise.resolve(["mtt-preflop-old", "mtt-preflop-v1"]),
      delete: () => Promise.resolve(true),
    };
    globals.fetch = async () => {
      networkCalls += 1;
      return new Response("network-js-bundle", { status: 200 });
    };

    try {
      vi.resetModules();
      await import("../../src/pwa/sw");

      const installWork: Promise<unknown>[] = [];
      listeners.install?.({ waitUntil: (promise) => installWork.push(promise) });
      await Promise.all(installWork);

      const request = new Request("https://trainer.test/assets/index-a1b2c3.js");
      const first = await dispatchFetch(listeners, request);
      expect(await first.text()).toBe("network-js-bundle");
      expect(networkCalls).toBe(1);

      const second = await dispatchFetch(listeners, request);
      expect(await second.text()).toBe("network-js-bundle");
      expect(networkCalls).toBe(1);
    } finally {
      restoreGlobal(globals, "self", previousSelf);
      restoreGlobal(globals, "caches", previousCaches);
      restoreGlobal(globals, "fetch", previousFetch);
    }
  });

  it("pri offline navigaci vrati app shell z cache", async () => {
    const listeners: ListenerMap = {};
    const cache = new FakeCache();
    const globals = globalThis as Record<string, unknown>;
    const previousSelf = globals.self;
    const previousCaches = globals.caches;
    const previousFetch = globals.fetch;

    globals.self = {
      location: { origin: "https://trainer.test" },
      clients: { claim: () => Promise.resolve() },
      skipWaiting: () => Promise.resolve(),
      addEventListener: (type: keyof ListenerMap, listener: ListenerMap[keyof ListenerMap]) => {
        if (type === "install") {
          listeners.install = listener as (event: ExtendableEventLike) => void;
        }
        if (type === "fetch") {
          listeners.fetch = listener as (event: FetchEventLike) => void;
        }
      },
    };
    globals.caches = {
      open: () => Promise.resolve(cache),
      keys: () => Promise.resolve(["mtt-preflop-v1"]),
      delete: () => Promise.resolve(true),
    };
    globals.fetch = async () => {
      throw new Error("offline");
    };

    try {
      vi.resetModules();
      await import("../../src/pwa/sw");

      const installWork: Promise<unknown>[] = [];
      listeners.install?.({ waitUntil: (promise) => installWork.push(promise) });
      await Promise.all(installWork);

      const request = new Request("https://trainer.test/deep/link");
      Object.defineProperty(request, "mode", { value: "navigate" });
      const response = await dispatchFetch(listeners, request);

      expect(await response.text()).toBe("app-shell:./index.html");
    } finally {
      restoreGlobal(globals, "self", previousSelf);
      restoreGlobal(globals, "caches", previousCaches);
      restoreGlobal(globals, "fetch", previousFetch);
    }
  });

  it("pro navigaci preferuje novy index ze site pred starou cache", async () => {
    const listeners: ListenerMap = {};
    const cache = new FakeCache();
    const globals = globalThis as Record<string, unknown>;
    const previousSelf = globals.self;
    const previousCaches = globals.caches;
    const previousFetch = globals.fetch;
    let networkCalls = 0;

    globals.self = {
      location: { origin: "https://trainer.test" },
      clients: { claim: () => Promise.resolve() },
      skipWaiting: () => Promise.resolve(),
      addEventListener: (type: keyof ListenerMap, listener: ListenerMap[keyof ListenerMap]) => {
        if (type === "install") listeners.install = listener as (event: ExtendableEventLike) => void;
        if (type === "fetch") listeners.fetch = listener as (event: FetchEventLike) => void;
      },
    };
    globals.caches = {
      open: () => Promise.resolve(cache),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    };
    globals.fetch = async () => {
      networkCalls += 1;
      return new Response("fresh-index", { status: 200 });
    };

    try {
      vi.resetModules();
      await import("../../src/pwa/sw");
      const installWork: Promise<unknown>[] = [];
      listeners.install?.({ waitUntil: (promise) => installWork.push(promise) });
      await Promise.all(installWork);

      const request = new Request("https://trainer.test/");
      Object.defineProperty(request, "mode", { value: "navigate" });
      const response = await dispatchFetch(listeners, request);

      expect(await response.text()).toBe("fresh-index");
      expect(networkCalls).toBe(1);
    } finally {
      restoreGlobal(globals, "self", previousSelf);
      restoreGlobal(globals, "caches", previousCaches);
      restoreGlobal(globals, "fetch", previousFetch);
    }
  });

  it("pri dvoubuildovem upgradu obslouzi stary hashovany chunk z predchozi cache", async () => {
    const listeners: ListenerMap = {};
    const cacheByName = new Map<string, FakeCache>();
    const oldCache = new FakeCache();
    const olderCache = new FakeCache();
    const oldChunk = new Request("https://trainer.test/assets/main-oldbuild1.js");
    const removedStableAsset = new Request("https://trainer.test/legacy-icon.svg");
    await oldCache.put(oldChunk, new Response("old-client-chunk", { status: 200 }));
    await oldCache.put(removedStableAsset, new Response("stale-icon", { status: 200 }));
    cacheByName.set("mtt-preflop-older", olderCache);
    cacheByName.set("mtt-preflop-previous", oldCache);
    const deleted: string[] = [];
    const globals = globalThis as Record<string, unknown>;
    const previousSelf = globals.self;
    const previousCaches = globals.caches;
    const previousFetch = globals.fetch;
    const skipWaiting = vi.fn(() => Promise.resolve());
    const claim = vi.fn(() => Promise.resolve());

    globals.self = {
      location: { origin: "https://trainer.test" },
      clients: { claim },
      skipWaiting,
      addEventListener: (type: keyof ListenerMap, listener: ListenerMap[keyof ListenerMap]) => {
        if (type === "install") listeners.install = listener as (event: ExtendableEventLike) => void;
        if (type === "activate") listeners.activate = listener as (event: ExtendableEventLike) => void;
        if (type === "fetch") listeners.fetch = listener as (event: FetchEventLike) => void;
      },
    };
    globals.caches = {
      open: (name: string) => {
        let cache = cacheByName.get(name);
        if (!cache) {
          cache = new FakeCache();
          cacheByName.set(name, cache);
        }
        return Promise.resolve(cache);
      },
      keys: () => Promise.resolve([...cacheByName.keys()]),
      delete: (name: string) => {
        deleted.push(name);
        return Promise.resolve(cacheByName.delete(name));
      },
    };
    globals.fetch = async () => {
      throw new Error("old chunk was removed from the new deployment");
    };

    try {
      vi.resetModules();
      await import("../../src/pwa/sw");

      const installWork: Promise<unknown>[] = [];
      listeners.install?.({ waitUntil: (promise) => installWork.push(promise) });
      await Promise.all(installWork);
      expect(skipWaiting).toHaveBeenCalledOnce();

      const activateWork: Promise<unknown>[] = [];
      listeners.activate?.({ waitUntil: (promise) => activateWork.push(promise) });
      await Promise.all(activateWork);
      expect(claim).toHaveBeenCalledOnce();
      expect(deleted).toEqual(["mtt-preflop-older"]);

      const response = await dispatchFetch(listeners, oldChunk);
      expect(await response.text()).toBe("old-client-chunk");

      await expect(dispatchFetch(listeners, removedStableAsset)).rejects.toThrow(
        "old chunk was removed from the new deployment",
      );
    } finally {
      restoreGlobal(globals, "self", previousSelf);
      restoreGlobal(globals, "caches", previousCaches);
      restoreGlobal(globals, "fetch", previousFetch);
    }
  });
});

async function dispatchFetch(listeners: ListenerMap, request: Request): Promise<Response> {
  let responsePromise: Promise<Response> | null = null;
  listeners.fetch?.({
    request,
    waitUntil: () => undefined,
    respondWith: (response) => {
      responsePromise = Promise.resolve(response);
    },
  });
  if (!responsePromise) {
    throw new Error("fetch listener did not call respondWith");
  }
  return responsePromise;
}

function restoreGlobal(
  globals: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    delete globals[key];
    return;
  }
  globals[key] = value;
}
