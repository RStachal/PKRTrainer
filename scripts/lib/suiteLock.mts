import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Zámek běžících testů pro hook `scripts/hooks/guardToolUse.mjs`.
 *
 * Pravidlo „během běhu sady se nemění zdroje ani deník" stálo do 4. 11. 2026
 * jen v textu; teď ho vynucuje hook Claude Code (majitel 4. 11.). Hook pozná
 * běžící sadu podle souboru v `artifacts/locks/` s PID živého procesu, takže
 * zámek po pádu procesu sám přestane platit.
 *
 * Vrací funkci, která zámek uvolní; volá se i při ukončení procesu.
 */
export function takeSuiteLock(kind: string, root = process.cwd()): () => void {
  const directory = resolve(root, "artifacts", "locks");
  const path = join(directory, `${kind}-${process.pid}.lock`);
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, JSON.stringify({ kind, pid: process.pid, startedAt: new Date().toISOString() }), "utf8");
  } catch {
    // Bez zámku poběží testy dál; jen hook o nich nebude vědět.
    return () => undefined;
  }
  const release = (): void => {
    rmSync(path, { force: true });
  };
  process.once("exit", release);
  return release;
}
