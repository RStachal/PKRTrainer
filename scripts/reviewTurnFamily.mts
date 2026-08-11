import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import {
  parseTurnReviewVerdicts,
  turnRuleContentHash,
  type TurnReviewOutcome,
  type TurnReviewVerdictRecord,
} from "../src/data/ranges/turnReviewVerdict";

/**
 * Předloží vyřešenou turn rodinu ke čtení a zapíše verdikt.
 *
 *   npm run mtt:turn-review                          # co čeká na přečtení
 *   npm run mtt:turn-review -- --family=X            # vypíše rodinu ke čtení
 *   npm run mtt:turn-review -- --family=X --accept --reviewer="Radim"
 *   npm run mtt:turn-review -- --family=X --needs-work --note="BTN sází moc"
 *
 * Proč tohle existuje: veškerý solverový turn obsah je LOW, LOW všude blokuje
 * produkci, a nic v repozitáři neumělo zaznamenat, že se na obsah někdo podíval.
 * Cesta z LOW ven byla uzavřená konstrukcí - dalo se solvit donekonečna a nikdy
 * nic nedodat.
 *
 * Výpis je schválně stručný. Rodina má stovky pravidel a čtení všech by nikdo
 * nedokončil; ukazuje se proto rozdělení akcí po hloubkách a několik desek celé,
 * což stačí na to poznat, jestli strategie dává smysl, nebo je někde obrácená.
 */

const VERDICTS_PATH = "Agents/turn-review/verdicts.json";

function arg(name: string): string | undefined {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

function readVerdicts(): TurnReviewVerdictRecord[] {
  if (!existsSync(VERDICTS_PATH)) return [];
  return parseTurnReviewVerdicts(readFileSync(VERDICTS_PATH, "utf8"));
}

function writeVerdicts(verdicts: readonly TurnReviewVerdictRecord[]): void {
  mkdirSync(dirname(VERDICTS_PATH), { recursive: true });
  writeFileSync(VERDICTS_PATH, `${JSON.stringify({
    schemaVersion: "PKRTRAINER_TURN_REVIEW_V1",
    verdicts: [...verdicts].sort((left, right) => left.familyId.localeCompare(right.familyId)),
  }, null, 2)}\n`, "utf8");
}

await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
const verdicts = readVerdicts();
const familyId = arg("family");

if (familyId === undefined) {
  console.log("Vyřešené turn rodiny a stav jejich čtení\n");
  for (const pack of [...runtimeSolvedTurnPacks].sort((a, b) => a.id.localeCompare(b.id))) {
    const family = pack.familyIds[0] ?? pack.id;
    const verdict = verdicts.find((item) => item.familyId === family);
    const stale = verdict !== undefined && verdict.contentHash !== pack.contentHash;
    const state = verdict === undefined
      ? "nepřečteno"
      : stale
        ? `PROPADLO (čteno na jiný obsah, ${verdict.reviewedAt})`
        : `${verdict.outcome} ${verdict.reviewedAt} (${verdict.reviewer})`;
    console.log(`  ${pack.confidence.padEnd(6)} ${family.padEnd(42)} ${pack.rules.length} pravidel  ${state}`);
  }
  console.log("\nČtení jedné rodiny: npm run mtt:turn-review -- --family=<ID>");
} else {
  const pack = runtimeSolvedTurnPacks.find((item) => item.familyIds.includes(familyId));
  if (pack === undefined) {
    console.error(`Rodina ${familyId} se nedodává; přečíst jde jen to, co je v manifestu.`);
    process.exitCode = 2;
  } else {
    const contentHash = turnRuleContentHash(pack.rules);
    const outcome: TurnReviewOutcome | undefined =
      process.argv.includes("--accept") ? "ACCEPTED"
        : process.argv.includes("--needs-work") ? "NEEDS_WORK"
          : process.argv.includes("--reject") ? "REJECTED"
            : undefined;

    if (outcome === undefined) {
      renderForReading(pack, contentHash);
    } else {
      const reviewer = arg("reviewer") ?? "neuvedeno";
      const note = arg("note");
      const record: TurnReviewVerdictRecord = {
        familyId,
        contentHash,
        outcome,
        reviewedAt: new Date().toISOString().slice(0, 10),
        reviewer,
        ...(note ? { notes: note } : {}),
      };
      writeVerdicts([...verdicts.filter((item) => item.familyId !== familyId), record]);
      console.log(`Zapsáno: ${familyId} = ${outcome} (${reviewer}), otisk ${contentHash}`);
      console.log("Přegeneruj pack, aby se důvěra propsala: npm run mtt:turn-pack -- --family=" + familyId + " --write");
    }
  }
}

function renderForReading(
  pack: (typeof runtimeSolvedTurnPacks)[number],
  contentHash: string,
): void {
  const first = pack.rules[0];
  console.log(`${pack.familyIds[0]}`);
  console.log(`  spot: ${first?.positionPattern}, ${first?.potType}, ${first?.node}, ${first?.stackBB}BB`);
  console.log(`  pravidel ${pack.rules.length}, důvěra ${pack.confidence}, otisk ${contentHash}\n`);

  // Rozdělení akcí je to, co odhalí obrácené znaménko. Rodina, která z pozice
  // bez iniciativy sází ve třech čtvrtinách případů, je špatně, i kdyby každé
  // jednotlivé pravidlo vypadalo rozumně.
  const byAction = new Map<string, number>();
  for (const rule of pack.rules) {
    for (const bucket of rule.buckets) {
      byAction.set(bucket.action, (byAction.get(bucket.action) ?? 0) + bucket.combos);
    }
  }
  const totalCombos = [...byAction.values()].reduce((sum, value) => sum + value, 0) || 1;
  console.log("  rozdělení akcí podle kombinací:");
  for (const [action, combos] of [...byAction].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${action.padEnd(22)} ${((combos / totalCombos) * 100).toFixed(1)} %`);
  }

  console.log("\n  tři desky celé:");
  for (const rule of pack.rules.slice(0, 3)) {
    console.log(`\n    ${rule.sourceDirectory}`);
    for (const bucket of rule.buckets) {
      const hands = [...bucket.handClasses].slice(0, 14).join(" ");
      const more = bucket.handClasses.length > 14 ? ` … +${bucket.handClasses.length - 14}` : "";
      console.log(`      ${bucket.action.padEnd(22)} ${bucket.combos} komb.  ${hands}${more}`);
    }
  }

  console.log("\n  Verdikt:");
  console.log(`    npm run mtt:turn-review -- --family=${pack.familyIds[0]} --accept --reviewer="jméno"`);
  console.log(`    npm run mtt:turn-review -- --family=${pack.familyIds[0]} --needs-work --note="co je špatně"`);
}
