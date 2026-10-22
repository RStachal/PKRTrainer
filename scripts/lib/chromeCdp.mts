import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Chrome bez okna a jeho DevTools protokol, sdílené E2E během
 * (runChromeE2e.mts) a prohlídkou UI (uiTour.mts).
 */

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

export class CdpClient {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private readonly listeners = new Map<string, Array<(params: unknown) => void>>();

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "CDP command failed"));
        else pending.resolve(message.result);
        return;
      }
      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) {
          listener(message.params);
        }
      }
    });
    await new Promise<void>((resolvePromise, reject) => {
      this.socket?.addEventListener("open", () => resolvePromise(), { once: true });
      this.socket?.addEventListener("error", () => reject(new Error("Chrome CDP connection failed")), {
        once: true,
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Chrome CDP is not connected"));
    }
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket?.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, listener: (params: unknown) => void): void {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  waitFor(method: string, timeoutMs = 15_000): Promise<unknown> {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params: unknown) => {
        clearTimeout(timer);
        const listeners = this.listeners.get(method) ?? [];
        this.listeners.set(method, listeners.filter((item) => item !== listener));
        resolvePromise(params);
      };
      this.on(method, listener);
    });
  }

  close(): void {
    this.socket?.close();
  }
}

export function findChromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((value): value is string => Boolean(value));
  const path = candidates.find(existsSync);
  if (!path) throw new Error("Chrome/Edge executable was not found; set CHROME_PATH.");
  return path;
}

/** Chrome bez okna s vlastním profilem; DevTools port pak přečte `waitForDevToolsPort`. */
export function launchHeadlessChrome(chromePath: string, profileDirectory: string): ChildProcess {
  return spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--hide-scrollbars",
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
}

export async function waitForDevToolsPort(directory: string): Promise<number> {
  const path = join(directory, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      try {
        const port = Number(readFileSync(path, "utf8").split(/\r?\n/)[0]);
        if (Number.isInteger(port) && port > 0) return port;
      } catch {
        // Chrome can briefly lock DevToolsActivePort while finishing startup.
      }
    }
    await sleep(100);
  }
  throw new Error("Chrome did not expose a DevTools port");
}

export async function createTarget(
  port: number,
  url: string,
): Promise<{ webSocketDebuggerUrl: string }> {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Chrome target creation failed: HTTP ${response.status}`);
  return response.json() as Promise<{ webSocketDebuggerUrl: string }>;
}

export async function navigate(client: CdpClient, url: string): Promise<void> {
  const loaded = client.waitFor("Page.loadEventFired", 30_000);
  await client.send("Page.navigate", { url });
  await Promise.race([
    loaded,
    waitForPageReady(client, url, 30_000),
  ]);
}

export async function reload(client: CdpClient): Promise<void> {
  const loaded = client.waitFor("Page.loadEventFired", 30_000);
  await client.send("Page.reload", { ignoreCache: false });
  await Promise.race([
    loaded,
    waitForPageReady(client, null, 30_000, 100),
  ]);
}

async function waitForPageReady(
  client: CdpClient,
  expectedUrl: string | null,
  timeoutMs: number,
  initialDelayMs = 0,
): Promise<void> {
  if (initialDelayMs > 0) await sleep(initialDelayMs);
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const state = await evaluate<{
        href: string;
        readyState: DocumentReadyState;
      }>(client, `(() => ({ href: location.href, readyState: document.readyState }))()`);
      const expectedMatches = expectedUrl === null || state.href === expectedUrl;
      if (
        expectedMatches &&
        (state.readyState === "interactive" || state.readyState === "complete")
      ) {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for page readiness${lastError ? `: ${lastError}` : ""}`,
  );
}

export async function evaluate<T = any>(client: CdpClient, expression: string): Promise<T> {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }) as {
    result?: { value?: T };
    exceptionDetails?: {
      text?: string;
      exception?: { description?: string; value?: unknown };
    };
  };
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.exception?.value;
    throw new Error(
      detail === undefined
        ? response.exceptionDetails.text ?? `Browser evaluation failed: ${expression}`
        : String(detail),
    );
  }
  return response.result?.value as T;
}

export async function waitForSelector(client: CdpClient, selector: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) {
      return;
    }
    await sleep(100);
  }
  const debug = await evaluate<{ url: string; text: string }>(client, `(() => ({
    url: location.href,
    text: (document.body?.innerText ?? "").slice(0, 500)
  }))()`);
  throw new Error(
    `Timed out waiting for selector: ${selector} at ${debug.url}; body=${debug.text}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
