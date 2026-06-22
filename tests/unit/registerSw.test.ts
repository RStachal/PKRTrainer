import { afterEach, describe, expect, it, vi } from "vitest";

import { registerServiceWorker } from "../../src/pwa/registerSw";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete (globalThis as { navigator?: Navigator }).navigator;
  }
});

describe("registrace service workeru", () => {
  it("mimo podporovane prostredi skonci bez chyby", async () => {
    delete (globalThis as { navigator?: Navigator }).navigator;

    await expect(registerServiceWorker()).resolves.toEqual({
      supported: false,
      registered: false,
      cacheFailed: false,
    });
  });

  it("ohlasi chybu registrace bez padu aplikace", async () => {
    const failure = new Error("registration blocked");
    const onCacheFailure = vi.fn();
    setServiceWorkerRegistration(() => Promise.reject(failure));

    await expect(registerServiceWorker({ onCacheFailure })).resolves.toEqual({
      supported: true,
      registered: false,
      cacheFailed: true,
      error: failure,
    });
    expect(onCacheFailure).toHaveBeenCalledWith(failure);
  });

  it("sleduje pozdejsi updatefound a odlisi neuspesnou instalaci od nahrazeni", async () => {
    const onCacheFailure = vi.fn();
    const registration = new FakeRegistration();
    setServiceWorkerRegistration(() => Promise.resolve(
      registration as unknown as ServiceWorkerRegistration,
    ));

    await expect(registerServiceWorker({ onCacheFailure })).resolves.toMatchObject({
      supported: true,
      registered: true,
      cacheFailed: false,
    });

    const failedWorker = new FakeWorker();
    registration.installing = failedWorker as unknown as ServiceWorker;
    registration.dispatchUpdateFound();
    failedWorker.setState("redundant");
    expect(onCacheFailure).toHaveBeenCalledOnce();

    const replacedWorker = new FakeWorker();
    registration.installing = replacedWorker as unknown as ServiceWorker;
    registration.dispatchUpdateFound();
    replacedWorker.setState("installed");
    replacedWorker.setState("activated");
    replacedWorker.setState("redundant");
    expect(onCacheFailure).toHaveBeenCalledOnce();
  });
});

class FakeWorker {
  state: ServiceWorkerState = "installing";
  private readonly listeners: Array<() => void> = [];

  addEventListener(type: string, listener: () => void): void {
    if (type === "statechange") this.listeners.push(listener);
  }

  setState(state: ServiceWorkerState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

class FakeRegistration {
  installing: ServiceWorker | null = null;
  private readonly updateListeners: Array<() => void> = [];

  addEventListener(type: string, listener: () => void): void {
    if (type === "updatefound") this.updateListeners.push(listener);
  }

  dispatchUpdateFound(): void {
    for (const listener of this.updateListeners) listener();
  }
}

function setServiceWorkerRegistration(
  register: (url: string, options: RegistrationOptions) => Promise<ServiceWorkerRegistration>,
): void {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: { register },
    },
  });
}
