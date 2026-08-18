import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { renderTurnFamilyDigest } from "../src/data/ranges/turnReviewDigest";
import { profileTurnFamilies } from "../src/data/ranges/turnFamilyAnomaly";
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
  // Rodiny, které se od svých sourozenců liší, jdou najevo hned. Čtení je práce,
  // kterou nikdo jiný neudělá, a jedenáct rodin po třech stech pravidlech nikdo
  // nepřečte celé - ale chyby, které jsme v tomhle obsahu doopravdy našli, měly
  // všechny stejný tvar: posunuté rozdělení akcí přes celou rodinu, ne špatné
  // jednotlivé pravidlo. Právě to jde porovnat strojově.
  const profiles = new Map(profileTurnFamilies(runtimeSolvedTurnPacks).map((row) => [row.familyId, row]));

  // Pořadí podle měřené odchylky obrany, ne podle abecedy.
  //
  // Osmnáct rodin nikdo nepřečte najednou a seřazené podle jména znamená, že se
  // začne u té první - tedy náhodně. Odchylka obrany od nabízených kurzů je
  // jediné číslo o téhle strategii, které nepotřebuje čtenáře, takže je to
  // nejlepší dostupné vodítko, kde se dívat dřív. Rodina bez čelících
  // rozhodnutí jde na konec: o té tohle číslo neříká nic.
  const gapOf = (pack: (typeof runtimeSolvedTurnPacks)[number]) => (
    profiles.get(pack.familyIds[0] ?? pack.id)?.defenceGap ?? -1
  );
  for (const pack of [...runtimeSolvedTurnPacks].sort((a, b) => {
    const byGap = gapOf(b) - gapOf(a);
    return byGap !== 0 ? byGap : a.id.localeCompare(b.id);
  })) {
    const family = pack.familyIds[0] ?? pack.id;
    const verdict = verdicts.find((item) => item.familyId === family);
    const stale = verdict !== undefined && verdict.contentHash !== pack.contentHash;
    const state = verdict === undefined
      ? "nepřečteno"
      : stale
        ? `PROPADLO (čteno na jiný obsah, ${verdict.reviewedAt})`
        : `${verdict.outcome} ${verdict.reviewedAt} (${verdict.reviewer})`;
    const profile = profiles.get(family);
    const flag = profile !== undefined && profile.anomalies.length > 0 ? "!" : " ";
    const aggression = profile === undefined
      ? "         "
      : `${(profile.aggressionShare * 100).toFixed(0).padStart(3)} % sází`;
    const gap = profile?.defenceGap;
    const defence = gap === undefined
      ? "     -    "
      : `${(gap * 100).toFixed(1).padStart(5)} b obr.`;
    console.log(`${flag} ${pack.confidence.padEnd(6)} ${family.padEnd(42)} ${aggression}  ${defence}  ${state}`);
    for (const anomaly of profile?.anomalies ?? []) console.log(`      -> ${anomaly.detail}`);
  }

  const flagged = [...profiles.values()].filter((row) => row.anomalies.length > 0).length;
  console.log(flagged === 0
    ? "\nŽádná rodina se nápadně neliší rozdělením akcí."
    : `\n${flagged} rodin se liší rozdělením akcí - u těch je vykřičník.`);
  console.log(
    "Seřazeno podle sloupce \"b obr.\": o kolik procentních bodů se obrana proti sázce"
    + "\nliší od kurzů, které ta sázka nabízí. Je to jediné číslo o téhle strategii,"
    + "\nkteré nevzniklo čtením, takže je to nejlepší vodítko, kde začít. Malá"
    + "\nodchylka neznamená, že je rodina v pořádku.",
  );
  console.log("Čtení jedné rodiny: npm run mtt:turn-review -- --family=<ID>");
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
      console.log(renderTurnFamilyDigest(pack, contentHash));
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
