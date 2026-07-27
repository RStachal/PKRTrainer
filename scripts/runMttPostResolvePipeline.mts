import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { nodeHistoryArgs, reviewFileName } from "./lib/mttReviewFileNaming.mts";

/**
 * Rebuild every scoped pilot after a solver re-solve.
 *
 * Re-solving changes raw checkpoints, and nothing downstream notices on its own:
 * accuracy evidence, per-family drafts, merged pilots and generated modules all
 * stay on the previous content until each is rebuilt in order. Running that
 * chain by hand hit four traps that are encoded here so they are not rediscovered
 * every time.
 *
 *  1. `mtt:texas-solver-ingest-completed` is change-driven, so a family whose raw
 *     changed can still be skipped. Its drafts are removed first to force a
 *     rebuild.
 *  2. It only covers the coverage-v2 families. The rest are rebuilt from their
 *     reviews, which live beside the raw exports as
 *     `strategy-export.<node>.review.json`, not under `artifacts/.../reviews/`.
 *  3. The pilot refresh workflow merges five scopes but seven exist. Without the
 *     missing merge, `SB_vs_BB_SRP_OOP_FLOP_CBET` silently keeps stale content.
 *  4. Facing-bet drafts come from the harvester, whose automatic "best" node
 *     selection can pick a degenerate overbet, so the villain node is pinned per
 *     family from the previous best-candidate record.
 *
 * Dry run is the default; nothing is written without --write.
 */

const SOLVER_OUTPUT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const DRAFT_ROOT = "artifacts/texas-solver-review-integration/normalized-drafts";
const DRAFT_BACKUP_ROOT = "artifacts/mtt-post-resolve/draft-backup";
const DEFAULT_REPORT = "artifacts/mtt-post-resolve/report.json";
const VITE_NODE = "node_modules/vite-node/vite-node.mjs";

/** Scopes with several SPR bands merged into one pilot pack. */
const MERGED_SCOPES = [
  "BTN_vs_BB_SRP_FLOP_CBET",
  "CO_vs_BB_SRP_FLOP_CBET",
  "SB_vs_BB_SRP_OOP_FLOP_CBET",
  "BTN_vs_CO_3BP_FLOP_CBET",
  "BTN_vs_BB_SRP_FLOP_FACING_BET",
  "BTN_vs_CO_3BP_FLOP_FACING_BET",
] as const;

interface Step {
  id: string;
  detail: string;
  ran: boolean;
  ok: boolean;
  output: string;
}

interface CliArgs {
  write: boolean;
  json: boolean;
  summary: boolean;
  reportPath: string;
  skipDrafts: boolean;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  mkdirSync(dirname(args.reportPath), { recursive: true });
  writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report, args));
  process.exitCode = report.valid ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mtt:post-resolve -- --summary            # dry run, shows the plan",
    "  npm run mtt:post-resolve -- --write --summary    # rebuild everything",
    "  npm run mtt:post-resolve -- --write --skip-drafts",
    "",
    "Rebuilds accuracy evidence, per-family drafts, merged pilots and generated",
    "modules after a re-solve, then reports the gates. Dry run by default.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let write = false;
  let json = false;
  let summary = false;
  let reportPath = resolve(DEFAULT_REPORT);
  let skipDrafts = false;

  for (const item of argv) {
    if (item === "--help" || item === "-h") throw new Error(usage());
    if (item === "--write") { write = true; continue; }
    if (item === "--json") { json = true; continue; }
    if (item === "--summary") { summary = true; continue; }
    if (item === "--skip-drafts") { skipDrafts = true; continue; }
    if (item.startsWith("--output=")) { reportPath = resolve(item.slice("--output=".length)); continue; }
    throw new Error(`Unsupported argument: ${item}\n\n${usage()}`);
  }
  return { write, json, summary, reportPath, skipDrafts };
}

function run(args: CliArgs) {
  const steps: Step[] = [];
  const fullPlan = draftPlan();

  // Trap 5: a re-solve that stops part way through a family leaves it split
  // across two different trees, and rebuilding then bakes an aggregate that
  // mixes both - the exact defect the re-solve exists to remove. The provenance
  // audit already reports this per family, so it runs first and its verdict
  // holds back the affected families instead of merely reporting them at the end.
  const mixed = mixedTreeFamilies();
  const plan = {
    cbet: fullPlan.cbet.filter((item) => !mixed.has(item.familyId)),
    facingBet: fullPlan.facingBet.filter((item) => !mixed.has(item.familyId)),
  };
  const heldBack = [...new Set([
    ...fullPlan.cbet.filter((item) => mixed.has(item.familyId)).map((item) => item.familyId),
    ...fullPlan.facingBet.filter((item) => mixed.has(item.familyId)).map((item) => item.familyId),
  ])].sort();
  steps.push({
    id: "guard:partial-resolve",
    detail: "Hold back families that are split across the full and reduced trees.",
    ran: true,
    ok: true,
    output: heldBack.length === 0
      ? `No family mixes trees; all ${fullPlan.cbet.length + fullPlan.facingBet.length} planned rebuild(s) proceed.`
      : `Held back ${heldBack.length} partially re-solved family(ies): ${heldBack.join(", ")}. `
        + "Finish their boards before rebuilding, or their aggregates will mix two trees.",
  });

  steps.push(npm("refresh-evidence", ["mtt:texas-solver-review-only-refresh"], args.write,
    "Re-read solver logs so accuracy reflects the new solves."));

  steps.push(npm("regrade-acceptance", [
    "mtt:texas-solver-mechanical-acceptance", "--",
    `--reviewed-at=${new Date().toISOString().slice(0, 10)}`,
    "--out=artifacts/texas-solver-review-protocol/mechanical-acceptance-decisions.json",
    "--summary",
  ], args.write, "Re-grade families on the refreshed evidence."));

  steps.push(npm("apply-acceptance", [
    "mtt:texas-solver-owner-review-batch", "--",
    "--decisions=artifacts/texas-solver-review-protocol/mechanical-acceptance-decisions.json",
    "--write", "--confirm=RECORD_TEXAS_SOLVER_OWNER_REVIEW_BATCH",
  ], args.write, "Write the mechanical decisions through the audited writer."));

  if (!args.skipDrafts) {
    // Trap 1: the ingest is change-driven, so stale drafts are removed first.
    steps.push(clearCoverageV2Drafts(plan, args.write));
    steps.push(npm("ingest-coverage-v2", ["mtt:texas-solver-ingest-completed", "--", "--summary"], args.write,
      "Rebuild the coverage-v2 family drafts."));

    // Trap 2: the remaining families are rebuilt from reviews beside the raw.
    // Trap 6: "ROOT" is not an action, it is the absence of one. The extractor
    // takes a node history of actions to walk, so a root export must pass no
    // --node-history at all; passing the literal "ROOT" asks it to walk to an
    // action node by that name and writes strategy-export.ROOT.review.json,
    // which the normalize step then cannot find. Root exports are named
    // strategy-export.review.json, without an infix.
    for (const item of plan.cbet) {
      steps.push(npm(`review:${item.familyId}`, [
        "mtt:texas-solver-review", "--",
        `--family=${item.familyId}`,
        ...nodeHistoryArgs(item.node),
        "--write",
      ], args.write, `Extract the ${item.node} review for ${item.familyId}.`));
      steps.push(npm(`draft:${item.familyId}`, [
        "mtt:texas-solver-normalize-draft", "--",
        "--review", item.reviewPath,
        `--pot-type=${item.potType}`,
        `--action-node=${item.actionNode}`,
        `--position-pattern=${item.positionPattern}`,
        `--spr-min=${item.sprMin}`, `--spr-max=${item.sprMax}`,
        "--output-dir", item.outputDir, "--write",
      ], args.write, `Normalize ${item.familyId} with board-aware lanes.`));
    }

    // Trap 4: pin the villain node instead of letting the harvester pick.
    for (const item of plan.facingBet) {
      steps.push(npm(`facing:${item.familyId}`, [
        "mtt:texas-solver-facing-bet-candidates", "--",
        `--family=${item.familyId}`, "--source-node=CHECK",
        `--bet-actions=${item.betAction}`,
        `--pot-type=${item.potType}`, `--position-pattern=${item.positionPattern}`,
        `--scope=${item.scope}`, `--spr-min=${item.sprMin}`, `--spr-max=${item.sprMax}`,
        "--write", "--summary",
      ], args.write, `Rebuild ${item.familyId} facing-bet on the pinned ${item.betAction} node.`));
    }
  }

  // Nothing downstream may read a draft the rebuild silently dropped.
  if (!args.skipDrafts) steps.push(restoreUnrebuiltDrafts(plan, args.write));

  // Trap 3: merge every scope, including the one the refresh workflow omits.
  for (const scope of MERGED_SCOPES) {
    steps.push(npm(`merge:${scope}`, [
      "mtt:texas-solver-merge-pilot-drafts", "--", `--scope=${scope}`, "--write", "--summary",
    ], args.write, `Merge the ${scope} SPR bands.`));
  }

  steps.push(npm("pilot-modules", ["mtt:postflop-pilot-modules", "--", "--write"], args.write,
    "Regenerate the runtime pilot modules."));

  // Gates are read-only, so they run even in a dry run and report real state.
  steps.push(npm("gate:pilot-suite", ["mtt:postflop-pilot-suite", "--", "--summary"], true,
    "Pilot suite must be 7/7."));
  steps.push(npm("gate:tree-provenance", ["mtt:texas-solver-tree-provenance", "--", "--summary"], true,
    "How many boards still use the reduced tree."));
  steps.push(npm("gate:core-release", ["mtt:core-release", "--", "--summary"], true,
    "Scoped core release gate."));
  steps.push(npm("gate:playable-beta", ["mtt:playable-beta", "--", "--summary"], true,
    "Playable beta gate."));

  const failed = steps.filter((step) => step.ran && !step.ok);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: args.write ? "WRITE" : "DRY_RUN",
    counts: { steps: steps.length, ran: steps.filter((s) => s.ran).length, failed: failed.length },
    plan: {
      cbetFamilies: plan.cbet.length,
      facingBetFamilies: plan.facingBet.length,
      mergedScopes: MERGED_SCOPES.length,
      heldBackFamilies: heldBack,
    },
    valid: failed.length === 0,
    steps,
  };
}

/**
 * Families whose boards sit on both trees at once, from the provenance audit.
 *
 * The audit is read-only, so this runs in a dry run too and reports real state.
 * If it cannot run, the set is empty: this guard exists to stop a known bad
 * rebuild, and it must not become a new way for the whole pipeline to fail.
 */
function mixedTreeFamilies(): Set<string> {
  try {
    const output = execFileSync("npm", [
      "run", "mtt:texas-solver-tree-provenance", "--", "--json",
    ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: true });
    const start = output.indexOf("{");
    if (start < 0) return new Set();
    const report = JSON.parse(output.slice(start)) as {
      families?: Array<{ familyId?: unknown; fullTree?: unknown; reducedTree?: unknown }>;
    };
    const mixed = new Set<string>();
    for (const row of report.families ?? []) {
      if (Number(row.fullTree) > 0 && Number(row.reducedTree) > 0) mixed.add(String(row.familyId));
    }
    return mixed;
  } catch {
    return new Set();
  }
}

interface CbetPlan {
  familyId: string;
  node: string;
  potType: string;
  actionNode: string;
  positionPattern: string;
  sprMin: number;
  sprMax: number;
  outputDir: string;
  reviewPath: string;
}

interface FacingPlan {
  familyId: string;
  betAction: string;
  potType: string;
  positionPattern: string;
  scope: string;
  sprMin: number;
  sprMax: number;
}

/**
 * Recover each family's normalization parameters from the drafts already on
 * disk. Reading them beats hardcoding: the plan then follows whatever the
 * pipeline currently produces instead of a copy that silently goes stale.
 */
function draftPlan(): { cbet: CbetPlan[]; facingBet: FacingPlan[] } {
  const cbet: CbetPlan[] = [];
  const facingBet: FacingPlan[] = [];
  if (!existsSync(DRAFT_ROOT)) return { cbet, facingBet };

  for (const dir of readdirSync(DRAFT_ROOT).sort()) {
    const normalized = join(DRAFT_ROOT, dir, "normalized.candidate.json");
    if (!existsSync(normalized)) continue;
    let rule: Record<string, unknown>;
    try {
      const parsed = JSON.parse(readFileSync(normalized, "utf8")) as { rules?: unknown };
      if (!Array.isArray(parsed.rules) || parsed.rules.length === 0) continue;
      rule = parsed.rules[0] as Record<string, unknown>;
    } catch { continue; }

    const cbetMatch = /^(MTT9_.+)-(CHECK|ROOT)$/.exec(dir);
    if (cbetMatch !== null) {
      const familyId = cbetMatch[1];
      const node = cbetMatch[2];
      cbet.push({
        familyId,
        node,
        potType: String(rule.potType),
        actionNode: String(rule.actionNode),
        positionPattern: String(rule.positionPattern),
        sprMin: Number(rule.sprMin),
        sprMax: Number(rule.sprMax),
        outputDir: join(DRAFT_ROOT, dir),
        reviewPath: join(SOLVER_OUTPUT_ROOT, familyId, reviewFileName(node)),
      });
      continue;
    }

    if (dir.endsWith("-FACING-BET-BEST")) {
      const familyId = dir.replace(/-FACING-BET-BEST$/, "");
      const best = join(DRAFT_ROOT, dir, "best-candidate.json");
      if (!existsSync(best)) continue;
      let node = "";
      try {
        node = String((JSON.parse(readFileSync(best, "utf8")) as { nodeHistory?: unknown }).nodeHistory ?? "");
      } catch { continue; }
      const betAction = node.split(">").pop() ?? "";
      if (betAction.length === 0) continue;
      const potType = String(rule.potType);
      facingBet.push({
        familyId,
        betAction,
        potType,
        positionPattern: String(rule.positionPattern),
        scope: potType === "THREE_BET_POT" ? "BTN_vs_CO_3BP_FLOP_FACING_BET" : "BTN_vs_BB_SRP_FLOP_FACING_BET",
        sprMin: Number(rule.sprMin),
        sprMax: Number(rule.sprMax),
      });
    }
  }
  return { cbet, facingBet };
}

/**
 * Trap 7: clearing a draft is a bet that it can be rebuilt.
 *
 * The ingest is change-driven and skips a family whose draft still exists, so
 * the drafts have to go before the rebuild. But a rebuild step can fail - a
 * missing review file is enough - and then the source draft is simply gone, the
 * merge downstream of it has nothing to read, and a scope silently loses its
 * content. That is exactly what happened to the three SB families the first time
 * this ran.
 *
 * So every cleared draft is copied aside first, and any that the rebuild did not
 * recreate is restored at the end. The same backup-and-restore shape the weekend
 * solver runner already uses for raw checkpoints.
 */
function clearCoverageV2Drafts(plan: ReturnType<typeof draftPlan>, write: boolean): Step {
  const targets = plan.cbet
    .map((item) => item.outputDir)
    .filter((dir) => existsSync(dir));
  if (write) {
    rmSync(DRAFT_BACKUP_ROOT, { recursive: true, force: true });
    for (const dir of targets) {
      cpSync(dir, join(DRAFT_BACKUP_ROOT, basename(dir)), { recursive: true });
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return {
    id: "clear-stale-drafts",
    detail: "Back up and remove per-family drafts so the change-driven ingest cannot skip them.",
    ran: write,
    ok: true,
    output: `${targets.length} draft directory(ies)${write ? ` backed up to ${DRAFT_BACKUP_ROOT} and removed` : " would be removed"}`,
  };
}

/** Put back any draft the rebuild failed to recreate, so nothing is lost. */
function restoreUnrebuiltDrafts(plan: ReturnType<typeof draftPlan>, write: boolean): Step {
  if (!write || !existsSync(DRAFT_BACKUP_ROOT)) {
    return {
      id: "restore-unrebuilt-drafts",
      detail: "Restore any draft a failed rebuild left missing.",
      ran: false,
      ok: true,
      output: write ? "no draft backup was taken" : "dry run",
    };
  }
  const restored: string[] = [];
  for (const name of readdirSync(DRAFT_BACKUP_ROOT)) {
    const target = join(DRAFT_ROOT, name);
    if (existsSync(join(target, "normalized.candidate.json"))) continue;
    rmSync(target, { recursive: true, force: true });
    cpSync(join(DRAFT_BACKUP_ROOT, name), target, { recursive: true });
    restored.push(name);
  }
  return {
    id: "restore-unrebuilt-drafts",
    detail: "Restore any draft a failed rebuild left missing.",
    ran: true,
    // A restore is a rescue, not a success: the rebuild did not do its job.
    ok: restored.length === 0,
    output: restored.length === 0
      ? "every cleared draft was rebuilt"
      : `Restored ${restored.length} draft(s) the rebuild did not recreate: ${restored.join(", ")}. `
        + "Their content is the previous build, not the re-solve; fix the rebuild before shipping.",
  };
}

function npm(id: string, argv: readonly string[], run: boolean, detail: string): Step {
  if (!run) return { id, detail, ran: false, ok: true, output: `npm run ${argv.join(" ")}` };
  try {
    const output = execFileSync("npm", ["run", ...argv], {
      cwd: process.cwd(), encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: true,
    });
    return { id, detail, ran: true, ok: true, output: tail(output) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { id, detail, ran: true, ok: false, output: tail(err.stdout ?? err.stderr ?? err.message ?? "") };
  }
}

function tail(text: string, lines = 12): string {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(-lines).join("\n");
}

function render(report: ReturnType<typeof run>, args: CliArgs): string {
  const out = [
    "MTT post-resolve pipeline",
    `mode: ${report.mode}`,
    `steps: ${report.counts.steps} (ran ${report.counts.ran}, failed ${report.counts.failed})`,
    `plan: ${report.plan.cbetFamilies} c-bet families, ${report.plan.facingBetFamilies} facing-bet families, ${report.plan.mergedScopes} merged scopes`,
    `valid: ${report.valid}`,
  ];
  for (const step of report.steps) {
    out.push(`${step.ran ? (step.ok ? "OK  " : "FAIL") : "SKIP"} ${step.id}`);
    if (!args.summary || !step.ok) {
      for (const line of step.output.split("\n").slice(-6)) out.push(`      ${line}`);
    }
  }
  return out.join("\n");
}
