/**
 * `npm run mtt:thread-trial` - vyhodnotí pokus 12 vs. 16 vláken monolitu
 * z nočního logu expanze.
 *
 * Proč pokus běží uvnitř noci a proč se vyhodnocuje párově po rodinách, je
 * v `scripts/lib/threadTrial.mts` a u `trial_threads` v `run_night_expansion.py`.
 */
import { existsSync, readFileSync } from "node:fs";

import { EXPANSION_LOG_PATH, parseBoardSolves } from "./lib/boardCost.mts";
import { formatThreadTrial, threadTrialResult } from "./lib/threadTrial.mts";

if (!existsSync(EXPANSION_LOG_PATH)) {
  console.error(`chybí ${EXPANSION_LOG_PATH}; pokus se vyhodnocuje z nočního logu, jinak odnikud`);
  process.exit(1);
}
const solves = parseBoardSolves(readFileSync(EXPANSION_LOG_PATH, "utf8").split(/\r?\n/));
console.log(formatThreadTrial(threadTrialResult(solves)));
