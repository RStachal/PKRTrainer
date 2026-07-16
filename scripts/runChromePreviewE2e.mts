import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

const root = resolve(".");
const nodeExecutable = process.execPath;
const viteCli = resolve("node_modules/vite/bin/vite.js");
const viteNodeCli = resolve("node_modules/vite-node/vite-node.mjs");
const previewPort = await findAvailablePort();
let preview: ChildProcess | null = null;

try {
  runNode([viteCli, "build"]);
  preview = spawn(nodeExecutable, [
    viteCli,
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(previewPort),
    "--strictPort",
  ], {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  await waitForUrl(`http://127.0.0.1:${previewPort}/`);
  runNode([viteNodeCli, "scripts/runChromeE2e.mts"], {
    MTT_E2E_URL: `http://127.0.0.1:${previewPort}/`,
  });
  console.log("Production preview Chrome E2E passed.");
} finally {
  stopProcessTree(preview);
}

function runNode(args: readonly string[], env: Record<string, string> = {}): void {
  const result = spawnSync(nodeExecutable, [...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed (${result.status}): node ${args.join(" ")}`);
}

async function findAvailablePort(): Promise<number> {
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
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
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

function stopProcessTree(processToStop: ChildProcess | null): void {
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
