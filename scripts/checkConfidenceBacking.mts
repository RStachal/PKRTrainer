import { existsSync, readFileSync } from "node:fs";
import { generatedMttPostflopPilotPacks } from "../src/data/ranges/mttPostflopPilotPacks.generated";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import {
  classifyConfidenceClaim,
  renderConfidenceReport,
  type ConfidenceClaim,
} from "../src/data/ranges/confidenceBacking";
import { parseTurnReviewVerdicts } from "../src/data/ranges/turnReviewVerdict";

/**
 * Vypíše, čím je podložená důvěra každého dodávaného packu.
 *
 *   npm run mtt:confidence-backing
 *
 * `MEDIUM` je brána do produkce - `LOW` neprojde nikde. Znamená ale v produktu
 * dvě různé věci: u turnu, že obsah přečetl hráč, u flopu, že pack má dohledatelný
 * solverový export. Ani jeden standard není nesmysl; nesmysl je mít oba pod
 * jedním jménem a nikde to neříct.
 *
 * Nic se tu nepřeznačuje. Srovnat ty dva standardy je produktové rozhodnutí.
 */
const VERDICTS_PATH = "Agents/turn-review/verdicts.json";
const verdicts = existsSync(VERDICTS_PATH)
  ? parseTurnReviewVerdicts(readFileSync(VERDICTS_PATH, "utf8"))
  : [];

await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");

const claims: ConfidenceClaim[] = [];
for (const pack of runtimeSolvedTurnPacks) {
  claims.push(classifyConfidenceClaim({
    packId: pack.id,
    street: "TURN",
    confidence: pack.confidence,
    familyId: pack.familyIds[0],
    contentHash: pack.contentHash,
    // Turn packy nemají pole `sourceEvidence`, ale dohledatelné jsou: každé
    // pravidlo nese adresář, ve kterém vzniklo. Nula by tvrdila, že za nimi
    // nestojí nic, a to je nepravda jiného druhu než ta, kterou tenhle výpis
    // hledá.
    sourceEvidenceCount: pack.rules.length,
  }, verdicts));
}
const seenFlop = new Set<string>();
for (const entry of generatedMttPostflopPilotPacks) {
  const pack = entry.pack as unknown as {
    id: string; confidence: "LOW" | "MEDIUM" | "HIGH"; sourceEvidence?: unknown[];
  };
  // Piloty sdílejí jedno packId napříč rodinami; tvrzení o důvěře je jedno.
  if (seenFlop.has(`${pack.id}|${entry.catalogId}`)) continue;
  seenFlop.add(`${pack.id}|${entry.catalogId}`);
  claims.push(classifyConfidenceClaim({
    packId: `${pack.id} (${entry.catalogId})`,
    street: "FLOP",
    confidence: pack.confidence,
    sourceEvidenceCount: pack.sourceEvidence?.length ?? 0,
  }, verdicts));
}

console.log(renderConfidenceReport(claims));
