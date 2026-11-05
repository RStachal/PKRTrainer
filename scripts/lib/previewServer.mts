import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

/**
 * Produkční náhled aplikace pro prohlížečové běhy (E2E, prohlídka UI).
 *
 * Tytéž tři funkce byly do 22. 10. 2026 zkopírované ve třech skriptech
 * (runChromePreviewE2e, runChromeProductionFixtureE2e,
 * checkMttTechnicalAcceptance). Jedna kopie se nemůže rozejít s druhou.
 */

const viteCli = resolve("node_modules/vite/bin/vite.js");

/**
 * Halda pro produkční build, **přečtená ze skriptu `build`**, ne opsaná.
 *
 * 10. 9. 2026 se halda kvůli turnové EV zvedla na 12 GB v `package.json`,
 * opsaná kopie v E2E zůstala na osmi a brána spadla uvnitř E2E na
 * `Ineffective mark-compacts near heap limit`. Dvě kopie téhož čísla se
 * rozejdou vždycky; jedna se rozejít nemůže.
 */
export function buildHeapFlag(): string {
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const flag = /--max-old-space-size=\d+(?=[^&]*vite)/.exec(pkg.scripts.build ?? "")?.[0];
  if (flag === undefined) {
    throw new Error("ve skriptu `build` není halda pro vite; náhled si ji nemá odkud vzít");
  }
  return flag;
}

/** Postaví produkční balík do dist/ se stejnou haldou jako `npm run build`. */
export function buildProduction(): void {
  const result = spawnSync(process.execPath, [buildHeapFlag(), viteCli, "build"], {
    cwd: resolve("."),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`vite build skončil kódem ${result.status}`);
}

/** Spustí `vite preview` nad dist/ na daném portu; ukončit přes `stopProcessTree`. */
export function startVitePreview(port: number): ChildProcess {
  return spawn(process.execPath, [
    viteCli,
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ], {
    cwd: resolve("."),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
}

export async function findAvailablePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a preview port."));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

export async function waitForUrl(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Preview did not start: ${url}`);
}

/** Ukončí proces i s potomky; na Windows `kill` potomky nechá běžet. */
export function stopProcessTree(processToStop: ChildProcess | null): void {
  if (!processToStop?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(processToStop.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  processToStop.kill("SIGTERM");
}
