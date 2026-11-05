import { spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import {
  CdpClient,
  createTarget,
  evaluate,
  findChromePath,
  launchHeadlessChrome,
  navigate,
  reload,
  waitForDevToolsPort,
  waitForSelector,
} from "./lib/chromeCdp.mts";
import {
  buildProduction,
  findAvailablePort,
  startVitePreview,
  stopProcessTree,
  waitForUrl,
} from "./lib/previewServer.mts";
import { QA_VIEWPORTS, type Viewport } from "./lib/viewports.mts";

/**
 * Prohlídka UI se snímky obrazovek (Agents/ui-redesign-plan.md, fáze 0).
 *
 * Projde trénink od startu po vyhodnocení na preflopu i flopu a na každé šířce
 * uloží snímky do artifacts/ui-tour/<čas>/ spolu s index.json. Seed je pevný,
 * takže dvě prohlídky ukazují tytéž spoty a dají se porovnat před změnou a po ní.
 *
 *   npm run ui:tour                                 postaví dist/ a projde všechny šířky
 *   npm run ui:tour -- --no-build                   použije existující dist/
 *   npm run ui:tour -- --viewports=desktop-1280,mobile-390
 *   npm run ui:tour -- --mode=real                  stůl s typy hráčů (režim REAL), snímky do složky s -real
 *
 * Fotí jediné GUI tréninku; klasické se smazalo 4. 11. 2026 a s ním přepínač
 * `--ui`. Starší prohlídky s příponou `-next` jsou totéž GUI.
 *
 * Není to brána, o obsahu nic netvrdí. Selže jen tehdy, když se nedostane na
 * obrazovku, kterou má vyfotit, protože pak je prohlídka neúplná a má to říct.
 */

const TOUR_SEED = "20261022";
const STEP_TIMEOUT_MS = 60_000;

/** Prvky preflopového tréninku. */
const PREFLOP = {
  action: ".training__game .dx-trainer__actions button",
  result: ".training__game .dx-trainer__feedback:not([hidden])",
  change: ".training__game .dx-trainer__change",
};

/** Totéž pro postflop; obrazovka je v panelu postflopu. */
const POSTFLOP = {
  action: ".postflop-output .dx-trainer__actions button",
  result: ".postflop-output .dx-trainer__feedback:not([hidden])",
};

interface TourArgs {
  build: boolean;
  viewports: readonly Viewport[];
  /** Režim tréninku na startu (Agents/plan-gto-real-2026-11.md); výchozí GTO. */
  mode: "GTO" | "REAL";
}

interface Shot {
  viewport: string;
  step: string;
  file: string;
  fullPage: boolean;
}

interface MissingStep {
  viewport: string;
  step: string;
  error: string;
}

function parseArgs(argv: readonly string[]): TourArgs {
  let build = true;
  let viewports: readonly Viewport[] = QA_VIEWPORTS;
  let mode: TourArgs["mode"] = "GTO";
  for (const arg of argv) {
    if (arg === "--no-build") {
      build = false;
    } else if (arg === "--mode=real" || arg === "--mode=gto") {
      mode = arg === "--mode=real" ? "REAL" : "GTO";
    } else if (arg.startsWith("--viewports=")) {
      const names = arg.slice("--viewports=".length).split(",").map((name) => name.trim());
      const unknown = names.filter((name) => !QA_VIEWPORTS.some((viewport) => viewport.name === name));
      if (unknown.length > 0) {
        throw new Error(
          `neznámé šířky: ${unknown.join(", ")}; známé: ${QA_VIEWPORTS.map((viewport) => viewport.name).join(", ")}`,
        );
      }
      viewports = QA_VIEWPORTS.filter((viewport) => names.includes(viewport.name));
    } else {
      throw new Error(`neznámý přepínač ${arg}; známé: --no-build, --viewports=a,b, --mode=real|gto`);
    }
  }
  return { build, viewports, mode };
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function gitCommit(): string {
  const head = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", windowsHide: true });
  const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8", windowsHide: true });
  const commit = head.stdout.trim() || "neznámý";
  return status.stdout.trim().length > 0 ? `${commit} (s neuloženými změnami)` : commit;
}

const sleep = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

/** Počká na písmo a dva snímky vykreslení, ať snímek nechytí rozpracovaný stav. */
async function settle(client: CdpClient): Promise<void> {
  await evaluate(client, `document.fonts.ready.then(() => new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))))`);
  // Nejdelší animace v aplikaci (příjezd výsledku) trvá 160 ms.
  await sleep(250);
}

async function click(client: CdpClient, selector: string): Promise<void> {
  await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error(${JSON.stringify(`chybí ${selector}`)});
    element.click();
  })()`);
}

async function setSeedAndStreet(
  client: CdpClient,
  street: "PREFLOP" | "FLOP",
  mode: TourArgs["mode"],
): Promise<void> {
  await evaluate(client, `(() => {
    const mode = document.querySelector(".filter-mode");
    if (mode instanceof HTMLSelectElement && mode.value !== ${JSON.stringify(mode)}) {
      mode.value = ${JSON.stringify(mode)};
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const select = document.querySelector(".profile-street");
    if (select instanceof HTMLSelectElement && select.value !== ${JSON.stringify(street)}) {
      select.value = ${JSON.stringify(street)};
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const seed = document.querySelector(".filter-seed");
    if (!(seed instanceof HTMLInputElement)) throw new Error("chybí pole pro seed");
    seed.value = ${JSON.stringify(TOUR_SEED)};
    seed.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}

async function capture(
  client: CdpClient,
  outDirectory: string,
  viewport: Viewport,
  step: string,
  shots: Shot[],
): Promise<void> {
  await settle(client);
  const viewportShot = await client.send("Page.captureScreenshot", { format: "png" }) as { data: string };
  const file = `${viewport.name}-${step}.png`;
  writeFileSync(join(outDirectory, file), Buffer.from(viewportShot.data, "base64"));
  shots.push({ viewport: viewport.name, step, file, fullPage: false });

  // Celá stránka jen tam, kde je delší než obrazovka - jinak by byl druhý
  // snímek kopií prvního.
  const metrics = await client.send("Page.getLayoutMetrics") as {
    cssContentSize: { width: number; height: number };
  };
  const height = Math.ceil(metrics.cssContentSize.height);
  if (height <= viewport.height * 1.1) return;
  const fullShot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewport.width, height, scale: 1 },
  }) as { data: string };
  const fullFile = `${viewport.name}-${step}-full.png`;
  writeFileSync(join(outDirectory, fullFile), Buffer.from(fullShot.data, "base64"));
  shots.push({ viewport: viewport.name, step, file: fullFile, fullPage: true });
}

/**
 * Kroky prohlídky. Každý staví na předchozím, takže první, který selže,
 * ukončí prohlídku na téhle šířce a zbytek se zapíše jako chybějící.
 */
function tourSteps(mode: TourArgs["mode"]): ReadonlyArray<{ step: string; run: (client: CdpClient) => Promise<void> }> {
  const preflop = PREFLOP;
  const postflop = POSTFLOP;
  // Matice range v dialogu (fáze 2).
  const range = (step: string, button: string) => [{
    step,
    run: async (client: CdpClient) => {
      await click(client, button);
      await waitForSelector(client, ".range-modal .dx-matrix", STEP_TIMEOUT_MS);
    },
  }];
  const closeRange = (client: CdpClient) => evaluate(
    client,
    `document.querySelector(".range-modal__close")?.click()`,
  );
  return [
  {
    step: "01-start",
    run: async (client) => {
      await waitForSelector(client, ".filter-start", STEP_TIMEOUT_MS);
      await setSeedAndStreet(client, "PREFLOP", mode);
    },
  },
  {
    step: "02-preflop-question",
    run: async (client) => {
      await click(client, ".filter-start");
      await waitForSelector(client, preflop.action, STEP_TIMEOUT_MS);
    },
  },
  {
    step: "03-preflop-result",
    run: async (client) => {
      await click(client, preflop.action);
      await waitForSelector(client, preflop.result, STEP_TIMEOUT_MS);
    },
  },
  ...range("03b-preflop-range", `${preflop.result} .dx-trainer__range`),
  {
    step: "04-flop-question",
    run: async (client) => {
      await closeRange(client);
      await click(client, preflop.change);
      await waitForSelector(client, ".filter-start", STEP_TIMEOUT_MS);
      await setSeedAndStreet(client, "FLOP", mode);
      await click(client, ".filter-start");
      await waitForSelector(client, postflop.action, STEP_TIMEOUT_MS);
    },
  },
  {
    step: "05-flop-result",
    run: async (client) => {
      await click(client, postflop.action);
      await waitForSelector(client, postflop.result, STEP_TIMEOUT_MS);
    },
  },
  ...range("06-flop-range", `${postflop.result} .dx-trainer__range`),
  ];
}

const args = parseArgs(process.argv.slice(2));
const STEPS = tourSteps(args.mode);
const outDirectory = resolve(
  "artifacts/ui-tour",
  `${timestamp(new Date())}${args.mode === "REAL" ? "-real" : ""}`,
);
const profileDirectory = mkdtempSync(join(tmpdir(), "pkrtrainer-ui-tour-"));
const shots: Shot[] = [];
const missing: MissingStep[] = [];
/** Chyby stránky a pády vykreslování; bez nich je „spojení zavřeno“ slepá ulička. */
const pageErrors: string[] = [];
let preview: ChildProcess | null = null;
let chrome: ChildProcess | null = null;
let cdp: CdpClient | null = null;

try {
  mkdirSync(outDirectory, { recursive: true });
  if (args.build) buildProduction();
  const port = await findAvailablePort();
  const url = `http://127.0.0.1:${port}/`;
  preview = startVitePreview(port);
  await waitForUrl(url);

  chrome = launchHeadlessChrome(findChromePath(), profileDirectory);
  const target = await createTarget(await waitForDevToolsPort(profileDirectory), "about:blank");
  cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Inspector.enable")]);
  cdp.on("Runtime.exceptionThrown", (params) => {
    const details = (params as { exceptionDetails?: { text?: string; exception?: { description?: string } } })
      .exceptionDetails;
    pageErrors.push(details?.exception?.description ?? details?.text ?? "neznámá výjimka");
  });
  cdp.on("Inspector.targetCrashed", () => {
    pageErrors.push("vykreslovací proces stránky spadl (Inspector.targetCrashed)");
  });

  for (const viewport of args.viewports) {
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
    await navigate(cdp, url);
    await waitForSelector(cdp, ".filter-start", STEP_TIMEOUT_MS);
    // Čistý stav: bez uložených filtrů a statistik z předchozí šířky.
    await evaluate(cdp, "localStorage.clear()");
    await reload(cdp);

    for (const [index, { step, run }] of STEPS.entries()) {
      try {
        await run(cdp);
        await capture(cdp, outDirectory, viewport, step, shots);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const skipped of STEPS.slice(index)) {
          missing.push({ viewport: viewport.name, step: skipped.step, error: skipped.step === step ? message : "nedošlo se sem" });
        }
        break;
      }
    }
    console.log(`  ${viewport.name}: ${shots.filter((shot) => shot.viewport === viewport.name).length} snímků`);
  }
} catch (error) {
  missing.push({ viewport: "-", step: "spuštění", error: error instanceof Error ? error.message : String(error) });
} finally {
  cdp?.close();
  stopProcessTree(chrome);
  stopProcessTree(preview);
  await sleep(300);
  try {
    rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch {
    // Chrome občas drží profil o chvilku déle; dočasný adresář uklidí systém.
  }
}

writeFileSync(join(outDirectory, "index.json"), `${JSON.stringify({
  createdAt: new Date().toISOString(),
  commit: gitCommit(),
  seed: TOUR_SEED,
  mode: args.mode,
  built: args.build,
  shots,
  missing,
  pageErrors,
}, null, 2)}\n`);

console.log(`ui-tour: ${shots.length} snímků v ${relative(resolve("."), outDirectory)}`);
for (const error of pageErrors) console.error(`  chyba stránky: ${error.split("\n")[0]}`);
if (missing.length > 0) {
  for (const item of missing) console.error(`  chybí ${item.viewport} ${item.step}: ${item.error}`);
  process.exitCode = 1;
}
