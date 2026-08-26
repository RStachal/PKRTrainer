import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedFlopPacks } from "../src/data/ranges/flopSolvedRuntimeRegistry";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { runtimeSolvedRiverPacks } from "../src/data/ranges/riverSolvedRuntimeRegistry";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks";
import type { TurnStrategyPack } from "../src/data/ranges/turnStrategyPack";
import { renderTurnFamilyDigest } from "../src/data/ranges/turnReviewDigest";
import { profileTurnFamilies } from "../src/data/ranges/turnFamilyAnomaly";
import {
  familiesNeededFor,
  planReviewUnlock,
} from "../src/data/ranges/reviewUnlockPlan";
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

/**
 * Která ulice se čte.
 *
 * Rodina má dnes pack na všech třech ulicích a jsou to tři různé obsahy s
 * vlastními otisky. Číst šla jen turnová, takže flopový a riverový obsah neměl
 * jak opustit LOW - a LOW nikde neprojde do produkce. Verdikt proto nese ulici a
 * tenhle přepínač vybírá, čí frontu čteš.
 */
type Street = "FLOP" | "TURN" | "RIVER";
const ALL_STREETS: readonly Street[] = ["FLOP", "TURN", "RIVER"];

/**
 * Která ulice se čte, nebo `undefined` když to čtenář neřekl.
 *
 * Dřív se nezadaná ulice tiše brala jako TURN, a to byla past přesně tam, kde
 * bolí: kdo přečetl celou rodinu a zapsal verdikt, zapsal ho jen turnu. Flop a
 * river zůstaly LOW a nic to neřeklo. Nezadaná ulice proto při **čtení**
 * znamená "ukaž všechny" a při **zápisu** je chyba - verdikt musí říct, co
 * člověk doopravdy viděl.
 */
const requestedStreet = ((): Street | "ALL" | undefined => {
  const value = arg("street")?.toUpperCase();
  if (value === undefined) return undefined;
  if (value === "ALL") return "ALL";
  return value === "FLOP" || value === "RIVER" || value === "TURN" ? value : undefined;
})();
// Fronta a profily potřebují jednu ulici; bez upřesnění je to turn, protože ta
// má obsah na všech rodinách.
const street: Street = requestedStreet === undefined || requestedStreet === "ALL"
  ? "TURN"
  : requestedStreet;

await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");

// Packy tří ulic mají týž tvar pravidla, takže digest i profil fungují na
// všechny; liší se jen tím, ze kterého registru se berou.
// Vědomé přetypování, ze stejného důvodu jako u `registries` níž: pravidla
// všech tří ulic jsou kompatibilní, liší se jen deklarovaná ulice.
const packsForStreet: readonly TurnStrategyPack[] = (street === "FLOP"
  ? runtimeSolvedFlopPacks as readonly TurnStrategyPack[]
  : street === "RIVER"
    ? runtimeSolvedRiverPacks as readonly TurnStrategyPack[]
    : runtimeSolvedTurnPacks
);

const verdicts = readVerdicts();
const familyId = arg("family");

if (process.argv.includes("--plan")) {
  // Fronta výš odpovídá na "kde hledat chybu". Tahle na "co přečíst, když mám
  // dvě hodiny" - a to jsou dvě různé otázky s různým pořadím.
  const plan = planReviewUnlock({
    FLOP: runtimeSolvedFlopPacks,
    TURN: runtimeSolvedTurnPacks,
    RIVER: runtimeSolvedRiverPacks,
  }, verdicts);

  console.log("Co přečíst, aby se odemklo nejvíc\n");
  console.log("  #  rodina                                      ulice      pravidel  podíl  souhrnně");
  plan.rows.forEach((row, index) => {
    const streets = (["FLOP", "TURN", "RIVER"] as const)
      .map((street) => {
        const found = row.streets.find((item) => item.street === street);
        if (found === undefined) return "-";
        return found.alreadyRead ? street[0].toLowerCase() : street[0];
      })
      .join("");
    console.log(
      `${String(index + 1).padStart(3)}  ${row.familyId.padEnd(42)} ${streets.padEnd(8)}`
      + `${String(row.unlockableRules).padStart(9)}`
      + `${(row.shareOfShipped * 100).toFixed(1).padStart(7)}%`
      + `${(row.cumulativeShare * 100).toFixed(1).padStart(9)}%`,
    );
  });

  const readShare = plan.shippedRules === 0 ? 0 : plan.readRules / plan.shippedRules;
  console.log(`
Dodávaných rozhodnutí: ${plan.shippedRules}, přečtených ${plan.readRules} (${(readShare * 100).toFixed(1)} %).`);
  for (const target of [0.25, 0.5, 0.8]) {
    console.log(
      `  ${familiesNeededFor(plan, target)} rodin přečíst -> ${(target * 100).toFixed(0)} % obsahu opustí LOW`,
    );
  }
  console.log([
    "",
    "Váha je objem, ne kvalita: odemyká se obsah k posouzení, ne k důvěře.",
    "Velká písmena jsou ulice, které rodina má a nikdo je nečetl, malá přečtené.",
    "Celá rodina najednou: npm run mtt:turn-review -- --family=<ID>",
  ].join("\n"));
} else if (familyId === undefined) {
  console.log(`Vyřešené ${street} rodiny a stav jejich čtení\n`);
  // Rodiny, které se od svých sourozenců liší, jdou najevo hned. Čtení je práce,
  // kterou nikdo jiný neudělá, a jedenáct rodin po třech stech pravidlech nikdo
  // nepřečte celé - ale chyby, které jsme v tomhle obsahu doopravdy našli, měly
  // všechny stejný tvar: posunuté rozdělení akcí přes celou rodinu, ne špatné
  // jednotlivé pravidlo. Právě to jde porovnat strojově.
  const profiles = new Map(profileTurnFamilies(packsForStreet).map((row) => [row.familyId, row]));

  // Pořadí podle měřené odchylky obrany, ne podle abecedy.
  //
  // Osmnáct rodin nikdo nepřečte najednou a seřazené podle jména znamená, že se
  // začne u té první - tedy náhodně. Odchylka obrany od nabízených kurzů je
  // jediné číslo o téhle strategii, které nepotřebuje čtenáře, takže je to
  // nejlepší dostupné vodítko, kde se dívat dřív. Rodina bez čelících
  // rozhodnutí jde na konec: o té tohle číslo neříká nic.
  const gapOf = (pack: TurnStrategyPack) => (
    profiles.get(pack.familyIds[0] ?? pack.id)?.defenceGap ?? -1
  );
  for (const pack of [...packsForStreet].sort((a, b) => {
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
  console.log(`Čtení jedné rodiny: npm run mtt:turn-review -- --street=${street} --family=<ID>`);
} else {
  // Přetypování je tu vědomé a je jiného druhu než to, které zmizelo výš.
  //
  // `planReviewUnlock` si říkalo o celý turnový pack, ačkoli četlo tři pole -
  // tam stačilo popsat skutečnou potřebu. Turnový profiler ale čte pravidla,
  // a ta jsou u všech tří ulic kompatibilní (`RiverStrategyRule` i
  // `FlopStrategyRule` rozšiřují `TurnStrategyRule`); liší se jen deklarovaná
  // ulice v `dimensions`. Rozšířit jeho API na všechny tři je samostatná
  // změna, ne úklid typů - a dělat ji mimochodem by znamenalo sáhnout na
  // měření odchylky obrany bez měření.
  const registries: Record<Street, readonly TurnStrategyPack[]> = {
    FLOP: runtimeSolvedFlopPacks as readonly TurnStrategyPack[],
    TURN: runtimeSolvedTurnPacks,
    RIVER: runtimeSolvedRiverPacks as readonly TurnStrategyPack[],
  };
  const packFor = (item: Street) => registries[item].find((row) => row.familyIds.includes(familyId));
  const present = ALL_STREETS.filter((item) => packFor(item) !== undefined);

  const outcome: TurnReviewOutcome | undefined =
    process.argv.includes("--accept") ? "ACCEPTED"
      : process.argv.includes("--needs-work") ? "NEEDS_WORK"
        : process.argv.includes("--reject") ? "REJECTED"
          : undefined;

  if (present.length === 0) {
    console.error(`Rodina ${familyId} se nedodává; přečíst jde jen to, co je v manifestu.`);
    process.exitCode = 2;
  } else if (outcome === undefined) {
    // Čtení: bez upřesnění všechny ulice, které rodina má. Je to jeden spot -
    // titíž hráči, tytéž stacky, jedna linka - takže je číst odděleně znamená
    // třikrát se do něj dostávat znovu.
    const streets = requestedStreet === undefined || requestedStreet === "ALL"
      ? present
      : [requestedStreet];
    for (const item of streets) {
      const pack = packFor(item);
      if (pack === undefined) {
        console.log(`
### ${item}: tuhle ulici rodina nedodává.`);
        continue;
      }
      console.log(`
${"=".repeat(72)}
### ${item}
${"=".repeat(72)}`);
      console.log(renderTurnFamilyDigest(pack, turnRuleContentHash(pack.rules)));
    }
    if (streets.length > 1) {
      console.log(
        `
Přečteno ${streets.length} ulic. Verdikt za všechny najednou:`
        + `
  npm run mtt:turn-review -- --family=${familyId} --street=ALL --accept --reviewer="jméno"`,
      );
    }
  } else if (requestedStreet === undefined) {
    // Zápis bez ulice se dřív tiše uložil jako turn. Verdikt je záznam o tom, co
    // člověk viděl, takže se radši neuloží nic, než aby se uložilo něco jiného.
    console.error(
      "Verdikt musí říct, kterou ulici jsi četl: --street=FLOP|TURN|RIVER, nebo --street=ALL"
      + `
Rodina ${familyId} dodává: ${present.join(", ")}.`,
    );
    process.exitCode = 2;
  } else {
    const streets = requestedStreet === "ALL" ? present : [requestedStreet];
    const reviewer = arg("reviewer") ?? "neuvedeno";
    const note = arg("note");
    const reviewedAt = new Date().toISOString().slice(0, 10);

    let next = [...verdicts];
    for (const item of streets) {
      const pack = packFor(item);
      if (pack === undefined) continue;
      const contentHash = turnRuleContentHash(pack.rules);
      next = next.filter((row) => (
        row.familyId !== familyId || (row.street ?? "TURN") !== item
      ));
      next.push({
        street: item, familyId, contentHash, outcome, reviewedAt, reviewer,
        ...(note ? { notes: note } : {}),
      });
      console.log(`Zapsáno: ${familyId} ${item} = ${outcome} (${reviewer}), otisk ${contentHash}`);
    }
    writeVerdicts(next);

    // Přegenerovat se musí ty packy, které se četly - jinak verdikt visí u
    // obsahu, do kterého se nepropsal.
    const generatorOf = (item: Street) => (
      item === "FLOP" ? "mtt:flop-pack" : item === "RIVER" ? "mtt:river-pack" : "mtt:turn-pack"
    );
    console.log("Přegeneruj packy, aby se důvěra propsala:");
    for (const item of streets) {
      console.log(`  npm run ${generatorOf(item)} -- --family=${familyId} --write`);
    }
  }
}
