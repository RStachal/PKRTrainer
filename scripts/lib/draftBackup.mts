import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Backup and recovery for the per-family drafts the post-resolve rebuild clears.
 *
 * Clearing a draft is a bet that it can be rebuilt. The ingest is change-driven
 * and skips a family whose draft still exists, so the drafts have to go first -
 * but a rebuild step can fail, and then the source draft is simply gone and the
 * merge downstream of it silently loses a scope. Three families were lost that
 * way the first time the pipeline ran.
 *
 * The backup makes that bet safe WITHIN a run. It did not make it safe ACROSS
 * one: the clear step wiped the whole backup root before taking a fresh copy, so
 * a run interrupted between clearing and restoring left the drafts missing on
 * disk and the only copy of them in a backup that the next run destroyed on its
 * way past. A missing directory is not a backup target, so nothing replaced it.
 *
 * Hence two operations rather than one. Recovery runs first and is idempotent;
 * only then is it safe to re-take the backup.
 */

/** The draft is present and usable, rather than an empty or half-written directory. */
function draftIsPresent(dir: string): boolean {
  return existsSync(join(dir, "normalized.candidate.json"));
}

/**
 * Put back any draft that is missing on disk but still held in the backup.
 *
 * Called before the backup is re-taken, so an interrupted previous run cannot
 * cost a draft. Returns the names recovered, which is not routine - it means a
 * previous run did not finish, and the caller should say so.
 */
export function recoverAbandonedDrafts(
  backupRoot: string,
  draftRoot: string,
): string[] {
  if (!existsSync(backupRoot)) return [];
  const recovered: string[] = [];
  for (const name of readdirSync(backupRoot)) {
    const source = join(backupRoot, name);
    if (!draftIsPresent(source)) continue;
    const target = join(draftRoot, name);
    if (draftIsPresent(target)) continue;
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
    recovered.push(name);
  }
  return recovered.sort();
}

/**
 * Restore any draft the rebuild cleared and did not recreate.
 *
 * Runs at the end of a rebuild. Distinct from recovery only in when it happens:
 * this one rescues a rebuild that failed, recovery rescues a run that stopped.
 */
export function restoreUnrebuilt(
  backupRoot: string,
  draftRoot: string,
): string[] {
  if (!existsSync(backupRoot)) return [];
  const restored: string[] = [];
  for (const name of readdirSync(backupRoot)) {
    const target = join(draftRoot, name);
    if (draftIsPresent(target)) continue;
    rmSync(target, { recursive: true, force: true });
    cpSync(join(backupRoot, name), target, { recursive: true });
    restored.push(name);
  }
  return restored.sort();
}

/**
 * Take a fresh backup of the given draft directories and remove the originals.
 *
 * Recovery must have run first; this wipes the previous backup, and doing that
 * while it still holds the only copy of an abandoned draft is the loss above.
 */
export function backupAndClearDrafts(
  backupRoot: string,
  directories: readonly string[],
): string[] {
  rmSync(backupRoot, { recursive: true, force: true });
  const cleared: string[] = [];
  for (const dir of directories) {
    if (!existsSync(dir)) continue;
    cpSync(dir, join(backupRoot, dir.split(/[\\/]/).filter(Boolean).pop()!), { recursive: true });
    rmSync(dir, { recursive: true, force: true });
    cleared.push(dir);
  }
  return cleared;
}
