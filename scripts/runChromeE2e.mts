import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface Viewport {
  name: string;
  width: number;
  height: number;
  mobile: boolean;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

const VIEWPORTS: readonly Viewport[] = [
  { name: "desktop-1280", width: 1280, height: 900, mobile: false },
  { name: "mobile-360", width: 360, height: 800, mobile: true },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-412", width: 412, height: 915, mobile: true },
];

const VALID_HH = [
  "PokerStars Hand #1: Tournament #1, 10/20",
  "Table 'Test' 9-max Seat #1 is the button",
  "Seat 1: Villain1 (1000 in chips)",
  "Seat 2: Villain2 (1000 in chips)",
  "Seat 3: Villain3 (1000 in chips)",
  "Seat 4: Villain4 (1000 in chips)",
  "Seat 5: Villain5 (1000 in chips)",
  "Seat 6: Villain6 (1000 in chips)",
  "Seat 7: Villain7 (1000 in chips)",
  "Seat 8: Hero (1000 in chips)",
  "Seat 9: Villain9 (1000 in chips)",
  "Villain2: posts small blind 10",
  "Villain3: posts big blind 20",
  "*** HOLE CARDS ***",
  "Dealt to Hero [Ah Kd]",
  "Hero: folds",
  "*** SUMMARY ***",
].join("\n");

class CdpClient {
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

const targetUrl = process.env.MTT_E2E_URL ?? "http://127.0.0.1:4173/";
const artifactDirectory = resolve(process.env.MTT_E2E_ARTIFACTS ?? "dist/e2e-chrome");
const chromePath = findChromePath();
const profileDirectory = mkdtempSync(join(tmpdir(), "pkrtrainer-chrome-e2e-"));
let chrome: ChildProcess | null = null;
let cdp: CdpClient | null = null;

try {
  mkdirSync(artifactDirectory, { recursive: true });
  chrome = spawn(chromePath, [
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

  const port = await waitForDevToolsPort(profileDirectory);
  const target = await createTarget(port, targetUrl);
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Log.enable"),
    cdp.send("Network.enable"),
  ]);

  const browserErrors: string[] = [];
  cdp.on("Runtime.exceptionThrown", (params) => {
    browserErrors.push(JSON.stringify(params));
  });
  cdp.on("Runtime.consoleAPICalled", (params) => {
    const event = params as { type?: string; args?: Array<{ value?: unknown; description?: string }> };
    if (event.type !== "error") return;
    browserErrors.push(event.args?.map((arg) => (
      String(arg.value ?? arg.description ?? "")
    )).join(" ") ?? "console.error");
  });
  cdp.on("Log.entryAdded", (params) => {
    const event = params as { entry?: { level?: string; source?: string; text?: string } };
    if (event.entry?.level === "error" && event.entry.source === "javascript") {
      browserErrors.push(event.entry.text ?? "browser JavaScript error");
    }
  });

  const results = [];
  for (const viewport of VIEWPORTS) {
    browserErrors.length = 0;
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: viewport.mobile,
      maxTouchPoints: viewport.mobile ? 5 : 1,
    });
    await navigate(cdp, targetUrl);
    await waitForSelector(cdp, ".filter-start");
    await evaluate(cdp, `localStorage.clear()`);
    await reload(cdp);
    await waitForSelector(cdp, ".filter-start");

    const initial = await evaluate(cdp, `(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fatal: document.querySelector(".fatal")?.textContent ?? "",
      profileStatus: document.querySelector(".profile-selector__note")?.getAttribute("data-status"),
      profileText: document.querySelector(".profile-selector__note")?.textContent ?? ""
    }))()`);
    assert(initial.overflow <= 1, `${viewport.name}: page has horizontal overflow ${initial.overflow}px`);
    assert(initial.fatal === "", `${viewport.name}: fatal bootstrap error: ${initial.fatal}`);
    assert(initial.profileStatus === "blocked", `${viewport.name}: legacy preflop must be blocked`);
    assert(
      initial.profileText.includes("Kandidátní náhled"),
      `${viewport.name}: missing fail-closed preflop notice`,
    );

    await activate(cdp, ".filter-start", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".filter-empty-warning:not([hidden])");
    const preflopGate = await evaluate(cdp, `(() => ({
      table: Boolean(document.querySelector(".poker-table")),
      warning: document.querySelector(".filter-empty-warning")?.textContent ?? ""
    }))()`);
    assert(!preflopGate.table, `${viewport.name}: blocked preflop rendered a poker table`);
    assert(
      preflopGate.warning.includes("kandidátní náhled"),
      `${viewport.name}: blocked preflop warning is missing`,
    );

    await evaluate(cdp, `(() => {
      const select = document.querySelector(".profile-street");
      if (!(select instanceof HTMLSelectElement)) throw new Error("Missing street selector");
      select.value = "FLOP";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await activate(cdp, ".filter-start", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".postflop-action");
    const postflop = await evaluate(cdp, `(() => ({
      actions: document.querySelectorAll(".postflop-action").length,
      street: document.querySelector(".postflop-meta")?.getAttribute("data-street"),
      text: document.querySelector(".app")?.textContent ?? "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(postflop.actions >= 3, `${viewport.name}: postflop actions did not render`);
    assert(postflop.street === "FLOP", `${viewport.name}: wrong postflop street`);
    assert(postflop.overflow <= 1, `${viewport.name}: postflop page overflow ${postflop.overflow}px`);
    assertSourceFree(postflop.text, viewport.name);

    await activate(cdp, ".postflop-action", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".postflop-result");

    await evaluate(cdp, `(() => {
      const ante = document.querySelector(".profile-ante");
      if (!(ante instanceof HTMLSelectElement)) throw new Error("Missing ante selector");
      ante.value = "OFF";
      ante.dispatchEvent(new Event("change", { bubbles: true }));
      const filterAnte = document.querySelector(".filter-ante");
      if (filterAnte instanceof HTMLInputElement) {
        filterAnte.checked = false;
        filterAnte.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`);
    await activate(cdp, '[data-tab="hh"]', viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".hh-input");
    await evaluate(cdp, `(() => {
      const input = document.querySelector(".hh-input");
      if (!(input instanceof HTMLTextAreaElement)) throw new Error("Missing HH input");
      input.value = ${JSON.stringify(VALID_HH)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await evaluate(cdp, `document.querySelector(".hh-analyze")?.click()`);
    await sleep(500);
    const hhState = await evaluate(cdp, `(() => ({
      error: document.querySelector(".hh-errors:not([hidden])")?.textContent ?? "",
      analysisHidden: document.querySelector(".hh-analysis")?.hasAttribute("hidden") ?? true,
      matrixCells: document.querySelectorAll(".hh-analysis .matrix-cell").length
    }))()`);
    assert(hhState.error === "", `${viewport.name}: HH review failed: ${hhState.error}`);
    assert(!hhState.analysisHidden, `${viewport.name}: HH review did not become visible`);
    await waitForSelector(cdp, ".hh-analysis .matrix-cell");
    const hhReview = await evaluate(cdp, `(() => ({
      matrixCells: document.querySelectorAll(".hh-analysis .matrix-cell").length,
      text: document.querySelector(".hh-analysis")?.textContent ?? ""
    }))()`);
    assert(hhReview.matrixCells === 169, `${viewport.name}: HH review matrix is incomplete`);
    assertSourceFree(hhReview.text, `${viewport.name} HH review`);

    await activate(cdp, '[data-tab="stats"]', viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".dashboard");
    const stats = await evaluate(cdp, `(() => ({
      sessionCount: document.querySelector(".dashboard-session-count")?.getAttribute("data-session-count"),
      text: document.querySelector(".dashboard")?.textContent ?? ""
    }))()`);
    assert(stats.sessionCount === "1", `${viewport.name}: result was not persisted to dashboard`);
    assertSourceFree(stats.text, `${viewport.name} stats`);
    await activate(cdp, ".stats-export", viewport.mobile ? "touch" : "keyboard");
    const exportedStats = await evaluate<string>(
      cdp,
      `document.querySelector(".stats-json-box")?.value ?? ""`,
    );
    assert(exportedStats.includes('"postflopRecords"'), `${viewport.name}: stats export is incomplete`);
    assert(!/https?:|www\./i.test(exportedStats), `${viewport.name}: stats export leaked a URL`);
    await activate(cdp, ".stats-import", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".stats-transfer__status--ok");

    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    }) as { data?: string };
    assert(typeof screenshot.data === "string", `${viewport.name}: screenshot was not captured`);
    writeFileSync(
      join(artifactDirectory, `${viewport.name}.png`),
      Buffer.from(screenshot.data as string, "base64"),
    );

    await reload(cdp);
    await waitForSelector(cdp, ".filter-start");
    await evaluate(cdp, `document.querySelector('[data-tab="stats"]')?.click()`);
    await waitForSelector(cdp, ".dashboard");
    const reloadedCount = await evaluate(cdp, (
      `document.querySelector(".postflop-breakdowns")?.getAttribute("data-total")`
    ));
    assert(reloadedCount === "1", `${viewport.name}: persisted postflop stats did not survive reload`);

    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await reload(cdp);
    await waitForSelector(cdp, ".filter-start");
    const offline = await evaluate(cdp, `(() => ({
      fatal: document.querySelector(".fatal")?.textContent ?? "",
      title: document.querySelector("h1")?.textContent ?? ""
    }))()`);
    assert(offline.fatal === "", `${viewport.name}: offline reload produced fatal state`);
    assert(offline.title.length > 0, `${viewport.name}: offline app shell did not render`);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    assert(browserErrors.length === 0, `${viewport.name}: ${browserErrors.join(" | ")}`);
    results.push({
      viewport: viewport.name,
      size: `${viewport.width}x${viewport.height}`,
      preflopGate: "blocked",
      postflopFlow: "passed",
      hhReview: "passed",
      statsTransfer: "passed",
      inputMode: viewport.mobile ? "touch" : "keyboard",
      reload: "passed",
      offlineReload: "passed",
      browserErrors: 0,
    });
  }

  browserErrors.length = 0;
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 450,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await reload(cdp);
  await waitForSelector(cdp, ".filter-start");
  const zoomState = await evaluate(cdp, `(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    fatal: document.querySelector(".fatal")?.textContent ?? ""
  }))()`);
  assert(zoomState.overflow <= 1, `200% zoom: page overflow ${zoomState.overflow}px`);
  assert(zoomState.fatal === "", `200% zoom: fatal bootstrap error`);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  await evaluate(cdp, `(() => {
    localStorage.clear();
    for (const key of [
      "mtt_preflop_state_v1",
      "mtt_preflop_events_v1",
      "mtt_preflop_postflop_events_v1",
      "mtt_preflop_postflop_line_events_v1",
      "mtt_preflop_hh_v1",
      "mtt_preflop_hh_reviews_v1"
    ]) localStorage.setItem(key, "{broken-json");
  })()`);
  await reload(cdp);
  await waitForSelector(cdp, ".filter-start");
  const corruptState = await evaluate(cdp, `(() => ({
    fatal: document.querySelector(".fatal")?.textContent ?? "",
    filters: Boolean(document.querySelector(".filters"))
  }))()`);
  assert(corruptState.fatal === "", `Corrupt storage caused a fatal bootstrap state`);
  assert(corruptState.filters, `Corrupt storage removed the training filters`);

  await evaluate(cdp, `(() => {
    localStorage.clear();
    const street = document.querySelector(".profile-street");
    if (!(street instanceof HTMLSelectElement)) throw new Error("Missing street selector");
    street.value = "FLOP";
    street.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector(".filter-start")?.click();
  })()`);
  await waitForSelector(cdp, ".postflop-action");
  await evaluate(cdp, `(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, "__pkrOriginalSetItem", { value: original, configurable: true });
    Storage.prototype.setItem = function () {
      throw new DOMException("Simulated quota failure", "QuotaExceededError");
    };
  })()`);
  await activate(cdp, ".postflop-action", "keyboard");
  await waitForSelector(cdp, ".postflop-result");
  await waitForSelector(cdp, ".app__notice:not([hidden])");
  const quotaNotice = await evaluate<string>(
    cdp,
    `document.querySelector(".app__notice")?.textContent ?? ""`,
  );
  assert(
    quotaNotice.includes("nepodařilo uložit"),
    `Quota failure did not produce a recoverable save notice`,
  );
  assertSourceFree(quotaNotice, "quota failure notice");
  assert(browserErrors.length === 0, `resilience scenarios: ${browserErrors.join(" | ")}`);

  const resilience = {
    zoom200: "passed",
    corruptStorage: "passed",
    quotaFailure: "passed",
    browserErrors: 0,
  };
  const report = {
    valid: true,
    url: targetUrl,
    chrome: chromePath,
    artifacts: artifactDirectory,
    results,
    resilience,
  };
  writeFileSync(join(artifactDirectory, "report.json"), JSON.stringify(report, null, 2));
  console.log("MTT Chrome E2E");
  console.log(`valid: ${report.valid}`);
  console.log(`viewports: ${results.length}`);
  console.log(`artifacts: ${artifactDirectory}`);
  for (const result of results) {
    console.log(
      `- ${result.viewport}: ${result.inputMode}, postflop/HH/stats/reload/offline passed, errors=0`,
    );
  }
  console.log("- resilience: zoom 200% / corrupt storage / quota failure passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      chrome.kill("SIGTERM");
    }
  }
  await sleep(500);
  try {
    rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch {
    console.warn(`Chrome profile cleanup deferred: ${profileDirectory}`);
  }
}

async function navigate(client: CdpClient, url: string): Promise<void> {
  const loaded = client.waitFor("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
}

async function reload(client: CdpClient): Promise<void> {
  const loaded = client.waitFor("Page.loadEventFired");
  await client.send("Page.reload", { ignoreCache: false });
  await loaded;
}

async function evaluate<T = any>(client: CdpClient, expression: string): Promise<T> {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }) as {
    result?: { value?: T };
    exceptionDetails?: { text?: string };
  };
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text ?? `Browser evaluation failed: ${expression}`);
  }
  return response.result?.value as T;
}

async function waitForSelector(client: CdpClient, selector: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function activate(
  client: CdpClient,
  selector: string,
  mode: "keyboard" | "touch",
): Promise<void> {
  if (mode === "keyboard") {
    await evaluate(client, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) throw new Error("Missing interactive element");
      element.scrollIntoView({ block: "center" });
      element.focus();
    })()`);
    const key = {
      key: "Enter",
      code: "Enter",
      text: "\r",
      unmodifiedText: "\r",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    };
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    return;
  }

  const point = await evaluate<{ x: number; y: number }>(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error("Missing interactive element");
    element.scrollIntoView({ block: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function waitForDevToolsPort(directory: string): Promise<number> {
  const path = join(directory, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const port = Number(readFileSync(path, "utf8").split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    }
    await sleep(100);
  }
  throw new Error("Chrome did not expose a DevTools port");
}

async function createTarget(
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

function findChromePath(): string {
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

function assertSourceFree(text: string, surface: string): void {
  assert(
    !/https?:|www\.|RangePack|StrategyPack|mtt-[a-z0-9-]+-production|rule[_ -]?id/i.test(text),
    `${surface}: visible UI leaked source/internal strategy metadata`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
