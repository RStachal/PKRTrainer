import { takeSuiteLock } from "../scripts/lib/suiteLock.mts";

/**
 * `globalSetup` sady: po dobu běhu leží zámek `artifacts/locks/vitest-<pid>.lock`
 * a hook Claude Code mezitím nepustí úpravy zdrojů ani deníku
 * (`scripts/hooks/guardToolUse.mjs`, majitel 4. 11. 2026).
 */
export default function setup(): () => void {
  return takeSuiteLock("vitest");
}
