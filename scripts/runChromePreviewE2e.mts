import { spawnSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import {
  buildProduction,
  findAvailablePort,
  startVitePreview,
  stopProcessTree,
  waitForUrl,
} from "./lib/previewServer.mts";

const root = resolve(".");
const nodeExecutable = process.execPath;
const viteNodeCli = resolve("scripts/run-cli.mjs");
const previewPort = await findAvailablePort();
let preview: ChildProcess | null = null;

try {
  // Tenhle běh si staví vlastní produkční balík, a to se stejnou haldou jako
  // `npm run build` (`buildHeapFlag` v lib/previewServer.mts). Naměřeno
  // 25. 8. 2026: s výchozí čtyřgigabajtovou haldou `vite build` spadl na
  // „Ineffective mark-compacts near heap limit" a E2E se ani nespustilo.
  buildProduction();
  preview = startVitePreview(previewPort);
  await waitForUrl(`http://127.0.0.1:${previewPort}/`);
  runNode([viteNodeCli, "scripts/runChromeE2e.mts"], {
    MTT_E2E_URL: `http://127.0.0.1:${previewPort}/`,
    NODE_ENV: "production",
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
