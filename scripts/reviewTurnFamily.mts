import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { renderHandGridBlock } from "../src/data/ranges/handGridRender";
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
  for (const pack of [...runtimeSolvedTurnPacks].sort((a, b) => a.id.localeCompare(b.id))) {
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
    console.log(`${flag} ${pack.confidence.padEnd(6)} ${family.padEnd(42)} ${aggression}  ${state}`);
    for (const anomaly of profile?.anomalies ?? []) console.log(`      -> ${anomaly.detail}`);
  }

  const flagged = [...profiles.values()].filter((row) => row.anomalies.length > 0).length;
  console.log(flagged === 0
    ? "\nŽádná rodina se od ostatních nápadně neliší; čti v libovolném pořadí."
    : `\n${flagged} rodin se liší od ostatních - začni u nich.`);
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

/**
 * Kbelíky za celou rodinu podle toho, jak často třída napříč deskami sází.
 *
 * Většinová akce na třídu tady nefunguje. Check je převažující akce skoro všude,
 * takže by většina vyšla na check u každé jediné třídy a rodinová mřížka by byla
 * jednolitá plocha jednoho znaku - technicky pravdivá a k ničemu.
 *
 * Zajímavý je tvar sázecí range: které ruce sázejí na většině desek, které jen
 * občas a které nikdy. To se do jednoho znaku vejde jako pásmo, a právě tenhle
 * tvar odhalí chybu, kterou jednotlivé pravidlo neprozradí - třeba že se sází
 * nejsilnějšími i nejslabšími a nic mezi tím, nebo naopak že sází jen střed.
 */
function familyBuckets(
  pack: (typeof runtimeSolvedTurnPacks)[number],
): { action: string; handClasses: string[]; combos: number }[] {
  const boards = new Map<string, { seen: number; bet: number }>();
  for (const rule of pack.rules) {
    for (const bucket of rule.buckets) {
      const bets = /^(BET|RAISE|ALL)/i.test(bucket.action);
      for (const handClass of bucket.handClasses) {
        const row = boards.get(handClass) ?? { seen: 0, bet: 0 };
        row.seen += 1;
        if (bets) row.bet += 1;
        boards.set(handClass, row);
      }
    }
  }

  const combosOf = (hand: string) => (hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12);
  const bands: { action: string; test: (share: number) => boolean }[] = [
    { action: "sází na většině desek", test: (share) => share >= 0.5 },
    { action: "sází na části desek", test: (share) => share >= 0.15 },
    { action: "sází výjimečně", test: (share) => share > 0 },
    { action: "nikdy nesází", test: () => true },
  ];

  const byBand = new Map<string, { handClasses: string[]; combos: number }>();
  for (const [handClass, row] of boards) {
    const share = row.seen === 0 ? 0 : row.bet / row.seen;
    const band = bands.find((candidate) => candidate.test(share))!;
    const bucket = byBand.get(band.action) ?? { handClasses: [], combos: 0 };
    bucket.handClasses.push(handClass);
    bucket.combos += combosOf(handClass);
    byBand.set(band.action, bucket);
  }
  // Pořadí pásem, ne podle velikosti: čtenář čte mřížku odshora dolů a chce, aby
  // nejagresivnější pásmo mělo první znak bez ohledu na to, kolik ruk v něm je.
  return bands
    .filter((band) => byBand.has(band.action))
    .map((band) => ({ action: band.action, ...byBand.get(band.action)! }));
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

  // Celá rodina v jedné mřížce: pro každou třídu akce, kterou hraje nejčastěji
  // napříč deskami. Tvar range je z toho vidět na první pohled, ze seznamu tříd
  // nikdy - a právě tvar odhalí chyby, které jsme v tomhle obsahu našli.
  console.log("\n  celá rodina - jak často která ruka sází napříč deskami:");
  console.log(renderHandGridBlock(familyBuckets(pack), "    ", { preserveOrder: true }));

  console.log("\n  tři desky jednotlivě:");
  for (const rule of pack.rules.slice(0, 3)) {
    console.log(`\n    ${rule.sourceDirectory}`);
    console.log(renderHandGridBlock(rule.buckets, "      "));
  }

  console.log("\n  Verdikt:");
  console.log(`    npm run mtt:turn-review -- --family=${pack.familyIds[0]} --accept --reviewer="jméno"`);
  console.log(`    npm run mtt:turn-review -- --family=${pack.familyIds[0]} --needs-work --note="co je špatně"`);
}
