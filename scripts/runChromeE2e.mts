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

interface ContrastAuditEntry {
  selector: string;
  ratio: number;
  required: number;
  fontSize: number;
  fontWeight: string;
}

const VIEWPORTS: readonly Viewport[] = [
  { name: "desktop-1280", width: 1280, height: 900, mobile: false },
  { name: "mobile-360", width: 360, height: 800, mobile: true },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-412", width: 412, height: 915, mobile: true },
];
const activeViewports = process.env.MTT_E2E_VIEWPORTS === "desktop"
  ? [VIEWPORTS[0]]
  : VIEWPORTS;

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
const artifactDirectory = resolve(process.env.MTT_E2E_ARTIFACTS ?? "artifacts/e2e-chrome");
const buildDirectory = resolve(process.env.MTT_E2E_DIST ?? "dist");
const expectedPreflop = process.env.MTT_E2E_EXPECT_PREFLOP === "production"
  ? "production"
  : "blocked";
const expectedPostflopPackId = process.env.MTT_E2E_EXPECT_POSTFLOP_PACK_ID ?? "";
const expectedTurnPackId = process.env.MTT_E2E_EXPECT_TURN_PACK_ID ?? "";
const expectedRiverPackId = process.env.MTT_E2E_EXPECT_RIVER_PACK_ID ?? "";
const expectedPostflopPackIds = [
  expectedPostflopPackId,
  expectedTurnPackId,
  expectedRiverPackId,
].filter((packId) => packId.length > 0);
const postflopSeed = process.env.MTT_E2E_POSTFLOP_SEED ?? "1788246284";
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
  const contrastAudits: Array<{
    viewport: string;
    surface: string;
    entries: ContrastAuditEntry[];
  }> = [];
  for (const viewport of activeViewports) {
    if (expectedPreflop === "production") {
      console.log(`Production fixture viewport: ${viewport.name}`);
    }
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
    await ensureServiceWorkerControl(cdp);

    const initial = await evaluate(cdp, `(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fatal: document.querySelector(".fatal")?.textContent ?? "",
      profileStatus: document.querySelector(".profile-selector__note")?.getAttribute("data-status"),
      profileText: document.querySelector(".profile-selector__note")?.textContent ?? ""
    }))()`);
    assert(initial.overflow <= 1, `${viewport.name}: page has horizontal overflow ${initial.overflow}px`);
    assert(initial.fatal === "", `${viewport.name}: fatal bootstrap error: ${initial.fatal}`);
    assert(initial.profileStatus === "blocked", `${viewport.name}: unloaded preflop must fail closed`);
    assert(
      initial.profileText.includes("Kandidátní náhled"),
      `${viewport.name}: missing fail-closed preflop notice`,
    );

    contrastAudits.push({
      viewport: viewport.name,
      surface: "initial",
      entries: await auditContrast(cdp, viewport.name, "initial", [
        "h1",
        ".profile-selector__note",
        ".filter-start",
      ]),
    });

    await activate(cdp, ".filter-start", viewport.mobile ? "touch" : "keyboard");
    if (expectedPreflop === "blocked") {
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
      contrastAudits.push({
        viewport: viewport.name,
        surface: "preflop-blocker",
        entries: await auditContrast(cdp, viewport.name, "preflop blocker", [
          ".filter-empty-warning",
        ]),
      });
    } else {
      await waitForSelector(cdp, ".action-btn");
      const productionPreflop = await evaluate(cdp, `(() => ({
        table: Boolean(document.querySelector(".poker-table")),
        productionChunk: performance.getEntriesByType("resource").some((entry) => (
          entry.name.includes("mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1")
        ))
      }))()`);
      assert(productionPreflop.table, `${viewport.name}: production preflop table did not render`);
      assert(
        productionPreflop.productionChunk,
        `${viewport.name}: production preflop lazy chunk was not requested`,
      );
      await activate(cdp, ".action-btn", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, ".result__next");
      await activate(cdp, ".result__next", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, ".action-btn");
      await activate(
        cdp,
        ".training__change-situation",
        viewport.mobile ? "touch" : "keyboard",
      );
      await waitForSelector(cdp, ".filter-start");
    }

    await evaluate(cdp, `(() => {
      const select = document.querySelector(".profile-street");
      if (!(select instanceof HTMLSelectElement)) throw new Error("Missing street selector");
      select.value = "FLOP";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const seed = document.querySelector(".filter-seed");
      if (!(seed instanceof HTMLInputElement)) throw new Error("Missing seed input");
      seed.value = ${JSON.stringify(postflopSeed)};
      seed.dispatchEvent(new Event("input", { bubbles: true }));
      if (${JSON.stringify(expectedPostflopPackId)} !== "") {
        const positions = [...document.querySelectorAll(".filter-position")];
        for (const item of positions) {
          if (item instanceof HTMLInputElement) item.checked = false;
        }
        for (const position of ["LJ", "HJ"]) {
          const item = document.querySelector(
            '.filter-position[data-position="' + position + '"]',
          );
          if (!(item instanceof HTMLInputElement)) {
            throw new Error("Missing production fixture position " + position);
          }
          item.checked = true;
        }
        const contexts = [...document.querySelectorAll(".filter-context")];
        for (const item of contexts) {
          if (item instanceof HTMLInputElement) item.checked = false;
        }
        const context = document.querySelector(
          '.filter-context[data-context="VS_3BET"]',
        );
        if (!(context instanceof HTMLInputElement)) {
          throw new Error("Missing production fixture VS_3BET context");
        }
        context.checked = true;
        context.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`);
    await activate(cdp, ".filter-start", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".postflop-action");
    const postflop = await evaluate(cdp, `(() => ({
      actions: document.querySelectorAll(".postflop-action").length,
      street: document.querySelector(".postflop-meta")?.getAttribute("data-street"),
      potType: document.querySelector(".postflop-meta")?.getAttribute("data-pot-type"),
      positionPattern: document.querySelector(".postflop-meta")?.getAttribute("data-position-pattern"),
      text: document.querySelector(".app")?.textContent ?? "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }))()`);
    assert(postflop.actions >= 3, `${viewport.name}: postflop actions did not render`);
    assert(postflop.street === "FLOP", `${viewport.name}: wrong postflop street`);
    if (expectedPostflopPackId) {
      assert(postflop.potType === "THREE_BET_POT", `${viewport.name}: wrong fixture pot type`);
      assert(
        postflop.positionPattern === "OOP_CALLER_VS_IP_3BETTOR",
        `${viewport.name}: wrong fixture position pattern`,
      );
    }
    assert(postflop.overflow <= 1, `${viewport.name}: postflop page overflow ${postflop.overflow}px`);
    assertSourceFree(postflop.text, viewport.name);
    if (expectedPostflopPackId) {
      const productionPostflop = await evaluate<boolean>(cdp, (
        `performance.getEntriesByType("resource").some((entry) => (` +
        `entry.name.includes(${JSON.stringify(expectedPostflopPackId)})))`
      ));
      assert(
        productionPostflop,
        `${viewport.name}: production FLOP lazy chunk was not requested`,
      );
    }

    await activate(cdp, ".postflop-action", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".postflop-result");
    contrastAudits.push({
      viewport: viewport.name,
      surface: "postflop-result",
      entries: await auditContrast(cdp, viewport.name, "postflop result", [
        ".postflop-meta",
        ".postflop-action",
        ".postflop-result",
      ]),
    });

    const productionHandLine = expectedTurnPackId.length > 0 && expectedRiverPackId.length > 0;
    if (productionHandLine) {
      await activate(
        cdp,
        ".postflop-change-situation",
        viewport.mobile ? "touch" : "keyboard",
      );
      await waitForSelector(cdp, ".postflop-generate");
      await evaluate(cdp, `(() => {
        const mode = document.querySelector(".postflop-mode");
        if (!(mode instanceof HTMLSelectElement)) throw new Error("Missing postflop mode");
        mode.value = "line";
        mode.dispatchEvent(new Event("change", { bubbles: true }));
        const situation = document.querySelector(".postflop-situation");
        if (!(situation instanceof HTMLSelectElement)) {
          throw new Error("Missing postflop situation");
        }
        situation.value = "facing-bet";
        situation.dispatchEvent(new Event("change", { bubbles: true }));
        const seed = document.querySelector(".postflop-seed");
        if (!(seed instanceof HTMLInputElement)) throw new Error("Missing postflop seed");
        seed.value = ${JSON.stringify(postflopSeed)};
      })()`);
      await activate(cdp, ".postflop-generate", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, '.postflop-meta[data-mode="line"][data-street="FLOP"]');
      const familyChunksLoaded = await evaluate<boolean>(cdp, (
        `(() => { const resources = performance.getEntriesByType("resource"); return (` +
        `resources.some((entry) => entry.name.includes(${JSON.stringify(expectedTurnPackId)})) && ` +
        `resources.some((entry) => entry.name.includes(${JSON.stringify(expectedRiverPackId)}))); })()`
      ));
      assert(
        familyChunksLoaded,
        `${viewport.name}: production hand-line did not preload TURN/RIVER chunks`,
      );
      await activate(
        cdp,
        '.postflop-action[data-action="CALL"]',
        viewport.mobile ? "touch" : "keyboard",
      );
      await waitForSelector(cdp, ".postflop-line-next");
      await activate(cdp, ".postflop-line-next", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, '.postflop-meta[data-mode="line"][data-street="TURN"]');
      await activate(
        cdp,
        '.postflop-action[data-action="CALL"]',
        viewport.mobile ? "touch" : "keyboard",
      );
      await waitForSelector(cdp, ".postflop-line-next");
      await activate(cdp, ".postflop-line-next", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, '.postflop-meta[data-mode="line"][data-street="RIVER"]');
      await activate(
        cdp,
        '.postflop-action[data-action="CALL"]',
        viewport.mobile ? "touch" : "keyboard",
      );
      await waitForSelector(cdp, ".postflop-line-complete");
      const lineState = await evaluate(cdp, `(() => ({
        total: document.querySelector(".postflop-line-complete")?.getAttribute("data-total-streets"),
        text: document.querySelector(".postflop-output")?.textContent ?? ""
      }))()`);
      assert(lineState.total === "3", `${viewport.name}: production hand-line was incomplete`);
      assertSourceFree(lineState.text, `${viewport.name} production hand-line`);
    }

    for (const expectedStreet of [
      { street: "TURN", packId: expectedTurnPackId },
      { street: "RIVER", packId: expectedRiverPackId },
    ] as const) {
      if (!expectedStreet.packId) continue;
      await activate(cdp, '[data-tab="training"]', viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, ".filter-start");
      await configureProductionPostflopProfile(cdp, expectedStreet.street, postflopSeed);
      await activate(cdp, ".filter-start", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(
        cdp,
        `.postflop-meta[data-street="${expectedStreet.street}"]`,
      );
      await waitForSelector(cdp, ".postflop-action");
      const streetState = await evaluate(cdp, `(() => (({
        actions: document.querySelectorAll(".postflop-action").length,
        street: document.querySelector(".postflop-meta")?.getAttribute("data-street"),
        potType: document.querySelector(".postflop-meta")?.getAttribute("data-pot-type"),
        positionPattern: document.querySelector(".postflop-meta")?.getAttribute("data-position-pattern"),
        productionChunk: performance.getEntriesByType("resource").some((entry) => (
          entry.name.includes(${JSON.stringify(expectedStreet.packId)})
        ))
      })))()`);
      assert(
        streetState.actions >= 3,
        `${viewport.name}: ${expectedStreet.street} actions did not render`,
      );
      assert(
        streetState.street === expectedStreet.street,
        `${viewport.name}: wrong ${expectedStreet.street} street`,
      );
      assert(
        streetState.potType === "THREE_BET_POT",
        `${viewport.name}: wrong ${expectedStreet.street} fixture pot type`,
      );
      assert(
        streetState.positionPattern === "OOP_CALLER_VS_IP_3BETTOR",
        `${viewport.name}: wrong ${expectedStreet.street} fixture position pattern`,
      );
      assert(
        streetState.productionChunk,
        `${viewport.name}: production ${expectedStreet.street} lazy chunk was not requested`,
      );
      await activate(cdp, ".postflop-action", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, ".postflop-result");
    }

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
    contrastAudits.push({
      viewport: viewport.name,
      surface: "hh-review",
      entries: await auditContrast(cdp, viewport.name, "HH review", [
        ".hh-analyze",
        ".hh-analysis__title",
        ".hh-analysis__explanation",
      ]),
    });

    await activate(cdp, '[data-tab="stats"]', viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".dashboard");
    const stats = await evaluate(cdp, `(() => ({
      sessionCount: document.querySelector(".dashboard-session-count")?.getAttribute("data-session-count"),
      text: document.querySelector(".dashboard")?.textContent ?? ""
    }))()`);
    assert(
      stats.sessionCount === "1",
      `${viewport.name}: result was not persisted to dashboard`,
    );
    assertSourceFree(stats.text, `${viewport.name} stats`);
    await activate(cdp, ".stats-export", viewport.mobile ? "touch" : "keyboard");
    const exportedStats = await evaluate<string>(
      cdp,
      `document.querySelector(".stats-json-box")?.value ?? ""`,
    );
    assert(exportedStats.includes('"postflopRecords"'), `${viewport.name}: stats export is incomplete`);
    if (productionHandLine) {
      assert(
        exportedStats.includes('"postflopLineRecords"'),
        `${viewport.name}: production hand-line stats export is incomplete`,
      );
    }
    assert(!/https?:|www\./i.test(exportedStats), `${viewport.name}: stats export leaked a URL`);
    for (const expectedPackId of expectedPostflopPackIds) {
      assert(
        exportedStats.includes(expectedPackId),
        `${viewport.name}: postflop stats did not preserve ${expectedPackId} identity`,
      );
    }
    await activate(cdp, ".stats-import", viewport.mobile ? "touch" : "keyboard");
    await waitForSelector(cdp, ".stats-transfer__status--ok");
    contrastAudits.push({
      viewport: viewport.name,
      surface: "stats-transfer",
      entries: await auditContrast(cdp, viewport.name, "stats transfer", [
        ".stats-export",
        ".stats-import",
        ".stats-transfer__status--ok",
      ]),
    });

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
    const expectedPersistedCount = expectedPostflopPackIds.length > 0
      ? String(expectedPostflopPackIds.length + (productionHandLine ? 3 : 0))
      : "1";
    assert(
      reloadedCount === expectedPersistedCount,
      `${viewport.name}: persisted postflop stats did not survive reload`,
    );

    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await reload(cdp);
    await waitForSelector(cdp, ".filter-start");
    if (expectedPreflop === "production") {
      await activate(cdp, ".filter-start", viewport.mobile ? "touch" : "keyboard");
      await waitForSelector(cdp, ".action-btn");
      await activate(
        cdp,
        ".training__change-situation",
        viewport.mobile ? "touch" : "keyboard",
      );
      await waitForSelector(cdp, ".filter-start");
    }
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
      preflopGate: expectedPreflop,
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
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const serviceWorkerUpgrade = await runServiceWorkerUpgradeScenario(cdp, targetUrl);

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
    contrastAudits,
    resilience,
    serviceWorkerUpgrade,
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
  console.log(`- contrast: ${contrastAudits.flatMap((audit) => audit.entries).length} checks passed`);
  console.log("- service worker: real upgrade and previous-build chunk rollback passed");
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

async function ensureServiceWorkerControl(client: CdpClient): Promise<void> {
  const supported = await evaluate<boolean>(
    client,
    `"serviceWorker" in navigator`,
  );
  if (!supported) return;
  const controlled = await evaluate<boolean>(
    client,
    `navigator.serviceWorker.controller !== null`,
  );
  if (controlled) return;
  await evaluate(client, `(async () => {
    const existing = await navigator.serviceWorker.getRegistration("./");
    if (!existing) {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    }
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("Timed out waiting for service worker readiness")),
        15000
      ))
    ]);
    const deadline = Date.now() + 15000;
    while (navigator.serviceWorker.controller === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })()`);
  const claimed = await evaluate<boolean>(
    client,
    `navigator.serviceWorker.controller !== null`,
  );
  if (claimed) return;
  await reload(client);
  await waitForSelector(client, ".filter-start");
  const controlledAfterReload = await evaluate<boolean>(
    client,
    `navigator.serviceWorker.controller !== null`,
  );
  assert(controlledAfterReload, "Service worker did not control the page after reload");
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
  const debug = await evaluate<{ url: string; text: string }>(client, `(() => ({
    url: location.href,
    text: (document.body?.innerText ?? "").slice(0, 500)
  }))()`);
  throw new Error(
    `Timed out waiting for selector: ${selector} at ${debug.url}; body=${debug.text}`,
  );
}

async function configureProductionPostflopProfile(
  client: CdpClient,
  street: "TURN" | "RIVER",
  seed: string,
): Promise<void> {
  await evaluate(client, `(() => {
    const select = document.querySelector(".profile-street");
    if (!(select instanceof HTMLSelectElement)) throw new Error("Missing street selector");
    select.value = ${JSON.stringify(street)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const seedInput = document.querySelector(".filter-seed");
    if (!(seedInput instanceof HTMLInputElement)) throw new Error("Missing seed input");
    seedInput.value = ${JSON.stringify(seed)};
    seedInput.dispatchEvent(new Event("input", { bubbles: true }));
    for (const item of document.querySelectorAll(".filter-position")) {
      if (item instanceof HTMLInputElement) item.checked = false;
    }
    for (const position of ["LJ", "HJ"]) {
      const item = document.querySelector(
        '.filter-position[data-position="' + position + '"]',
      );
      if (!(item instanceof HTMLInputElement)) {
        throw new Error("Missing production fixture position " + position);
      }
      item.checked = true;
    }
    for (const item of document.querySelectorAll(".filter-context")) {
      if (item instanceof HTMLInputElement) item.checked = false;
    }
    const context = document.querySelector('.filter-context[data-context="VS_3BET"]');
    if (!(context instanceof HTMLInputElement)) {
      throw new Error("Missing production fixture VS_3BET context");
    }
    context.checked = true;
    context.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
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

async function auditContrast(
  client: CdpClient,
  viewport: string,
  surface: string,
  selectors: readonly string[],
): Promise<ContrastAuditEntry[]> {
  const entries = await evaluate<ContrastAuditEntry[]>(client, `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const parseColor = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) throw new Error("Unsupported computed color: " + value);
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: Number.isFinite(parts[3]) ? parts[3] : 1
      };
    };
    const composite = (front, back) => {
      const alpha = front.a + back.a * (1 - front.a);
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / alpha,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / alpha,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / alpha,
        a: alpha
      };
    };
    const background = (element) => {
      const chain = [];
      for (let current = element; current instanceof Element; current = current.parentElement) {
        chain.push(current);
      }
      let color = { r: 9, g: 15, b: 24, a: 1 };
      for (const current of chain.reverse()) {
        color = composite(parseColor(getComputedStyle(current).backgroundColor), color);
      }
      return color;
    };
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const luminance = (color) => (
      0.2126 * channel(color.r) +
      0.7152 * channel(color.g) +
      0.0722 * channel(color.b)
    );
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error("Missing contrast target: " + selector);
      const style = getComputedStyle(element);
      const baseBackground = background(element);
      const gradientColors = [...style.backgroundImage.matchAll(/rgba?\\([^)]+\\)/gi)]
        .map((match) => parseColor(match[0]));
      const parentBackground = element.parentElement
        ? background(element.parentElement)
        : { r: 9, g: 15, b: 24, a: 1 };
      const backgrounds = gradientColors.length > 0
        ? gradientColors.map((color) => composite(color, parentBackground))
        : [baseBackground];
      const ratios = backgrounds.map((bg) => {
        const fg = composite(parseColor(style.color), bg);
        const lighter = Math.max(luminance(fg), luminance(bg));
        const darker = Math.min(luminance(fg), luminance(bg));
        return (lighter + 0.05) / (darker + 0.05);
      });
      const ratio = Math.min(...ratios);
      const fontSize = Number.parseFloat(style.fontSize);
      const numericWeight = Number.parseInt(style.fontWeight, 10);
      const bold = Number.isFinite(numericWeight) ? numericWeight >= 700 : style.fontWeight === "bold";
      const required = fontSize >= 24 || (bold && fontSize >= 18.66) ? 3 : 4.5;
      return {
        selector,
        ratio: Math.round(ratio * 100) / 100,
        required,
        fontSize,
        fontWeight: style.fontWeight
      };
    });
  })()`);
  const failures = entries.filter((entry) => entry.ratio < entry.required);
  assert(
    failures.length === 0,
    `${viewport} ${surface}: insufficient contrast ${failures.map((entry) => (
      `${entry.selector}=${entry.ratio}:1 required ${entry.required}:1`
    )).join(", ")}`,
  );
  return entries;
}

async function runServiceWorkerUpgradeScenario(
  client: CdpClient,
  appUrl: string,
): Promise<{
  oldCache: string;
  newCache: string;
  previousChunkRollback: "passed";
  stableAssetIsolation: "passed";
}> {
  const workerPath = resolve(buildDirectory, "sw.js");
  assert(existsSync(workerPath), "Service-worker upgrade scenario requires dist/sw.js");
  const originalWorker = readFileSync(workerPath, "utf8");
  const cacheMatch = originalWorker.match(/mtt-preflop-[a-zA-Z0-9_-]+/);
  assert(cacheMatch, "Built service worker does not contain a versioned cache name");
  const oldCache = cacheMatch[0];
  const newCache = `${oldCache}-e2e-upgrade`;
  const upgradedWorker = originalWorker.replaceAll(oldCache, newCache);
  assert(upgradedWorker !== originalWorker, "Service-worker cache version could not be changed");

  const baseUrl = new URL(appUrl);
  const removedChunkUrl = new URL(
    "./assets/main-browserprevious-a1b2c3d4.js",
    baseUrl,
  ).href;
  const removedStableUrl = new URL("./removed-browser-icon.svg", baseUrl).href;

  await reload(client);
  await waitForSelector(client, ".filter-start");
  const workerReady = await evaluate<boolean>(client, `(() => (
    "serviceWorker" in navigator && navigator.serviceWorker.controller !== null
  ))()`);
  assert(workerReady, "Current page is not controlled by a service worker");
  await evaluate(client, `(async () => {
    const cache = await caches.open(${JSON.stringify(oldCache)});
    await cache.put(
      ${JSON.stringify(removedChunkUrl)},
      new Response("previous-build-chunk", {
        status: 200,
        headers: { "content-type": "text/javascript" }
      })
    );
    await cache.put(
      ${JSON.stringify(removedStableUrl)},
      new Response("stale-stable-asset", { status: 200 })
    );
  })()`);

  try {
    writeFileSync(workerPath, upgradedWorker);
    const upgrade = await evaluate<{
      activeScript: string;
      caches: string[];
    }>(client, `(async () => {
      const registration = await navigator.serviceWorker.register(
        "./sw.js?e2e-upgrade=1",
        { scope: "./", updateViaCache: "none" }
      );
      const candidate = registration.installing ?? registration.waiting;
      if (candidate && candidate.state !== "activated") {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Timed out installing upgraded service worker")),
            15000
          );
          candidate.addEventListener("statechange", () => {
            if (candidate.state === "activated") {
              clearTimeout(timer);
              resolve(undefined);
            }
            if (candidate.state === "redundant") {
              clearTimeout(timer);
              reject(new Error("Upgraded service worker became redundant"));
            }
          });
        });
      }
      await navigator.serviceWorker.ready;
      const deadline = Date.now() + 15000;
      while (
        !navigator.serviceWorker.controller?.scriptURL.includes("e2e-upgrade=1") &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!navigator.serviceWorker.controller?.scriptURL.includes("e2e-upgrade=1")) {
        throw new Error("Upgraded service worker did not claim the current page");
      }
      return {
        activeScript: registration.active?.scriptURL ?? "",
        caches: await caches.keys()
      };
    })()`);
    assert(
      upgrade.activeScript.includes("e2e-upgrade=1"),
      "Upgraded service worker did not become active",
    );
    assert(upgrade.caches.includes(oldCache), "Previous build cache was not preserved");
    assert(upgrade.caches.includes(newCache), "New build cache was not created");

    await client.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const rollbackText = await evaluate<string>(
      client,
      `fetch(${JSON.stringify(removedChunkUrl)}).then((response) => response.text())`,
    );
    assert(
      rollbackText === "previous-build-chunk",
      "Removed previous-build chunk was not served from rollback cache",
    );
    const stableFetch = await evaluate<{ failed: boolean; text: string }>(
      client,
      `fetch(${JSON.stringify(removedStableUrl)})
        .then((response) => response.text().then((text) => ({ failed: false, text })))
        .catch(() => ({ failed: true, text: "" }))`,
    );
    assert(
      stableFetch.text !== "stale-stable-asset",
      "Stable asset leaked from the previous-build rollback cache",
    );
  } finally {
    writeFileSync(workerPath, originalWorker);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }

  return {
    oldCache,
    newCache,
    previousChunkRollback: "passed",
    stableAssetIsolation: "passed",
  };
}

async function waitForDevToolsPort(directory: string): Promise<number> {
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
