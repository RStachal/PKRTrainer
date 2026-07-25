import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// End-to-end proof of the action-EV turnkey chain: a reviewed action-EV candidate
// on disk must reach the runtime pilot the module builder produces. The strategy
// pilots ship first and EV arrives later, so this is the link that decides whether
// EV ever appears next to the buttons once an EV-capable solve exists.

const SCRIPT = "scripts/buildMttPostflopPilotModules.mts";
const CATALOG_ID = "utg-bb-srp-flop-cbet";
const DRAFT_PATH =
  "artifacts/texas-solver-review-integration/normalized-drafts/MTT9_40BB_UTG_BB_SRP-CHECK/normalized.candidate.json";
const CANDIDATE_PATH =
  `artifacts/mtt-action-ev-intake/${CATALOG_ID}/normalized.action-ev.candidate.json`;

interface DraftPack {
  rules: Array<{
    actions: string[];
    rangeBuckets: Array<{ actionEvs?: unknown }>;
  }>;
}

function completeEvFor(actions: readonly string[], seed: number): unknown {
  return {
    source: "SOLVER",
    unit: "BB",
    equivalentThresholdBb: 0.01,
    acceptableThresholdBb: 0.05,
    values: actions.map((action, index) => ({ action, evBb: seed / 100 + index / 1000 })),
  };
}

/** A candidate that lines up with the draft, with complete EV on every bucket. */
function writeCandidateWithEv(): number {
  const draft = JSON.parse(readFileSync(DRAFT_PATH, "utf8")) as DraftPack;
  let buckets = 0;
  for (const rule of draft.rules) {
    rule.rangeBuckets.forEach((bucket, index) => {
      bucket.actionEvs = completeEvFor(rule.actions, index + 1);
      buckets += 1;
    });
  }
  mkdirSync(dirname(CANDIDATE_PATH), { recursive: true });
  writeFileSync(CANDIDATE_PATH, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return buckets;
}

function runBuilder() {
  return spawnSync(process.execPath, ["node_modules/vite-node/vite-node.mjs", SCRIPT, "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseJson(stdout: string): {
  actionEvBuckets: number;
  modules: Array<{ catalogId: string; actionEvBuckets: number; rangeBuckets: number }>;
} {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`No JSON in output:\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

describe("MTT postflop pilot module action-EV overlay", () => {
  afterEach(() => {
    rmSync(dirname(CANDIDATE_PATH), { recursive: true, force: true });
  });

  it("carries a reviewed action-EV candidate through to the runtime pilot", () => {
    // Baseline: with no candidate on disk, the builder reports no EV.
    rmSync(dirname(CANDIDATE_PATH), { recursive: true, force: true });
    const before = parseJson(runBuilder().stdout);
    const utgBefore = before.modules.find((module) => module.catalogId === CATALOG_ID);
    expect(utgBefore?.actionEvBuckets).toBe(0);

    // With a lined-up candidate, every bucket of that pilot gains EV.
    const bucketCount = writeCandidateWithEv();
    const after = parseJson(runBuilder().stdout);
    const utgAfter = after.modules.find((module) => module.catalogId === CATALOG_ID);
    expect(utgAfter?.actionEvBuckets).toBe(bucketCount);
    expect(utgAfter?.actionEvBuckets).toBe(utgAfter?.rangeBuckets);
    expect(after.actionEvBuckets).toBe(bucketCount);
  });

  it("fails the build when the candidate does not line up with the strategy pilot", () => {
    const draft = JSON.parse(readFileSync(DRAFT_PATH, "utf8")) as DraftPack;
    // Drop one action from the priced set: the EV no longer covers every legal
    // action, so the overlay must refuse rather than ship a half-priced pilot.
    for (const rule of draft.rules) {
      const priced = rule.actions.slice(1);
      for (const bucket of rule.rangeBuckets) bucket.actionEvs = completeEvFor(priced, 1);
    }
    mkdirSync(dirname(CANDIDATE_PATH), { recursive: true });
    writeFileSync(CANDIDATE_PATH, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

    const result = runBuilder();
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("does not line up");
  });
});
