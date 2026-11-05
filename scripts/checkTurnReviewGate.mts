import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildTurnStrategyRule } from "../src/data/ranges/turnStrategyRuleBuilder";
import {
  TURN_COVERAGE_TARGET,
  renderTurnReviewReport,
  reviewTurnFamily,
  type TurnFamilyEvidence,
} from "../src/data/ranges/turnReviewGate";

/**
 * Run the turn review gate over the solver artefacts.
 *
 *   npm run mtt:turn-review-gate [-- --json]
 *
 * Reports which solved families are worth a reviewer's time. Exits non-zero when
 * none are, so the pipeline can tell "nothing solved yet" from "solved and
 * waiting".
 */
const ROOT = "artifacts/decomposition";
const asJson = process.argv.includes("--json");

if (!existsSync(ROOT)) {
  console.error(`${ROOT} is absent; nothing to review.`);
  process.exitCode = 1;
} else {
  const families = new Map<string, TurnFamilyEvidence>();
  for (const directory of readdirSync(ROOT).filter((name) => name.includes("__"))) {
    const familyId = directory.split("__")[0];
    const planPath = join(ROOT, directory, "plan.json");
    if (!existsSync(planPath)) continue;
    let plan: { items?: unknown[]; coverageAchieved?: number };
    try {
      plan = JSON.parse(readFileSync(planPath, "utf8"));
    } catch {
      continue;
    }
    const files = readdirSync(join(ROOT, directory))
      .filter((name) => name.endsWith(".json") && name !== "plan.json");

    const evidence = families.get(familyId) ?? {
      familyId, boards: 0, plannedItems: 0, writtenItems: 0,
      minCoverage: 1, coverageTarget: TURN_COVERAGE_TARGET, sampledRules: [],
    };
    evidence.boards += 1;
    evidence.plannedItems += (plan.items ?? []).length;
    evidence.writtenItems += files.length;
    evidence.minCoverage = Math.min(evidence.minCoverage, plan.coverageAchieved ?? 0);

    // One rule per family is enough for the coherence tier: a reading error
    // shows up on the first subgame, and building thousands to prove it would
    // cost minutes to learn what one file already says.
    if (evidence.sampledRules.length === 0 && files.length > 0) {
      const node = JSON.parse(readFileSync(join(ROOT, directory, files[0]), "utf8"));
      const rule = buildTurnStrategyRule(directory, node);
      if (rule) evidence.sampledRules = [rule];
    }
    families.set(familyId, evidence);
  }

  const verdicts = [...families.values()].map(reviewTurnFamily);
  if (asJson) console.log(JSON.stringify({ verdicts }, null, 2));
  else console.log(renderTurnReviewReport(verdicts));
  process.exitCode = verdicts.some((verdict) => verdict.readyForReview) ? 0 : 1;
}
