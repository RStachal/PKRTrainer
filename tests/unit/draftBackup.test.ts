import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  backupAndClearDrafts,
  recoverAbandonedDrafts,
  restoreUnrebuilt,
} from "../../scripts/lib/draftBackup.mts";

// Clearing a draft is a bet that it can be rebuilt. The backup made that bet
// safe within a run; it did not make it safe across one. A run interrupted
// between clearing and restoring left the drafts missing on disk with the only
// copy in a backup that the next run wiped on its way past - and a missing
// directory is not a backup target, so nothing replaced it. That is the same
// silent loss the backup exists to prevent, one run later.

let root: string;
let draftRoot: string;
let backupRoot: string;

function writeDraft(name: string, content: string): string {
  const dir = join(draftRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "normalized.candidate.json"), content, "utf8");
  return dir;
}

function draftContent(name: string): string | null {
  const file = join(draftRoot, name, "normalized.candidate.json");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pkr-draft-backup-"));
  draftRoot = join(root, "drafts");
  backupRoot = join(root, "backup");
  mkdirSync(draftRoot, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("draft backup across an interrupted run", () => {
  it("recovers a draft the previous run cleared and never restored", () => {
    const dir = writeDraft("family-a", "solved-content");
    backupAndClearDrafts(backupRoot, [dir]);
    expect(draftContent("family-a")).toBeNull(); // the run stops here

    const recovered = recoverAbandonedDrafts(backupRoot, draftRoot);

    expect(recovered).toEqual(["family-a"]);
    expect(draftContent("family-a")).toBe("solved-content");
  });

  it("does not destroy the only copy when the next run clears again", () => {
    // The whole defect in one test: run one is interrupted, run two starts by
    // recovering, and only then re-takes the backup. Without the recovery the
    // wipe leaves nothing anywhere.
    const dir = writeDraft("family-a", "solved-content");
    backupAndClearDrafts(backupRoot, [dir]);

    recoverAbandonedDrafts(backupRoot, draftRoot);
    backupAndClearDrafts(backupRoot, [dir]);
    const restored = restoreUnrebuilt(backupRoot, draftRoot);

    expect(restored).toEqual(["family-a"]);
    expect(draftContent("family-a")).toBe("solved-content");
  });

  it("leaves a draft the rebuild recreated alone", () => {
    // Recovery must not overwrite fresh content with the previous build. That
    // would turn a working rebuild into a silent revert.
    const dir = writeDraft("family-a", "old-content");
    backupAndClearDrafts(backupRoot, [dir]);
    writeDraft("family-a", "rebuilt-content");

    const recovered = recoverAbandonedDrafts(backupRoot, draftRoot);

    expect(recovered).toEqual([]);
    expect(draftContent("family-a")).toBe("rebuilt-content");
  });

  it("ignores a backup entry that is itself incomplete", () => {
    // A directory without the candidate file is not a draft. Copying one back
    // would satisfy the existence check downstream while holding nothing.
    mkdirSync(join(backupRoot, "family-b"), { recursive: true });

    expect(recoverAbandonedDrafts(backupRoot, draftRoot)).toEqual([]);
    expect(draftContent("family-b")).toBeNull();
  });

  it("is idempotent, so recovering twice changes nothing", () => {
    const dir = writeDraft("family-a", "solved-content");
    backupAndClearDrafts(backupRoot, [dir]);

    expect(recoverAbandonedDrafts(backupRoot, draftRoot)).toEqual(["family-a"]);
    expect(recoverAbandonedDrafts(backupRoot, draftRoot)).toEqual([]);
    expect(draftContent("family-a")).toBe("solved-content");
  });

  it("says nothing to recover when no backup exists at all", () => {
    expect(recoverAbandonedDrafts(backupRoot, draftRoot)).toEqual([]);
    expect(restoreUnrebuilt(backupRoot, draftRoot)).toEqual([]);
  });

  it("restores every draft a failed rebuild left missing, not just the first", () => {
    const dirs = ["family-a", "family-b", "family-c"].map((name) => writeDraft(name, `${name}-content`));
    backupAndClearDrafts(backupRoot, dirs);
    writeDraft("family-b", "family-b-rebuilt");

    const restored = restoreUnrebuilt(backupRoot, draftRoot);

    expect(restored).toEqual(["family-a", "family-c"]);
    expect(draftContent("family-a")).toBe("family-a-content");
    expect(draftContent("family-b")).toBe("family-b-rebuilt");
    expect(draftContent("family-c")).toBe("family-c-content");
  });
});
