import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  fullTreeBoardsByFamily,
  heroSideOfNode,
  seatsOfFamily,
  trimToModuleBudget,
  supersededByRepair,
} from "./lib/solvedPackBuilding.mts";
import { subgameDecisions } from "./lib/subgameDecisions.mts";
import { actionNodeForSolvedHero } from "../src/data/ranges/solvedHeroActionNode";
import { dirname, join } from "node:path";
import { buildTurnStrategyRule } from "../src/data/ranges/turnStrategyRuleBuilder";
import { buildTurnStrategyPack } from "../src/data/ranges/turnStrategyPack";
import { TURN_COVERAGE_TARGET, type TurnFamilyEvidence } from "../src/data/ranges/turnReviewGate";
import {
  parseTurnReviewVerdicts,
  type TurnReviewVerdictRecord,
} from "../src/data/ranges/turnReviewVerdict";

/**
 * Write a turn strategy pack module from a review-ready family.
 *
 *   npm run mtt:turn-pack -- --family=MTT9_25BB_CO_BB_SRP_CBET_LOWSPR [--write]
 *
 * One family per run and one board per turn card, deliberately. The eleven
 * families hold 35,144 subgames between them; emitting all of it would put
 * megabytes of solved strategy in front of a bundle budget that exists because
 * the app is used on phones. A family is the unit a reviewer works in anyway.
 *
 * Without --write it reports what it would emit, so the size is known before
 * anything lands.
 */

const ROOT = "artifacts/decomposition";
const CHECKPOINT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const VERDICTS_PATH = "Agents/turn-review/verdicts.json";

/** Zaznamenané verdikty hráčů; bez souboru se nic neděje a rodina zůstane LOW. */
function readVerdicts(): TurnReviewVerdictRecord[] {
  if (!existsSync(VERDICTS_PATH)) return [];
  return parseTurnReviewVerdicts(readFileSync(VERDICTS_PATH, "utf8"));
}

/**
 * Kolik desek má rodina vyřešených monolitickým solvem.
 *
 * Deska bez plánu není v žádném plánu, takže ji brána neuvidí - a rodina, které
 * se rozložila třetina desek, projde jako COMPLETE. Tohle je jediné místo, kde
 * jde zjistit, kolik jich vlastně existuje.
 */
function checkpointBoardCount(familyId: string): number {
  const directory = join(CHECKPOINT_ROOT, familyId, "raw");
  if (!existsSync(directory)) return 0;
  return readdirSync(directory).filter((name) => (
    name.startsWith(`pkrtrainer_${familyId}_`) && name.endsWith(".json")
  )).length;
}
const OUT_DIR = "src/data/ranges/turn";
const MANIFEST_PATH = "src/data/ranges/turnSolvedManifest.generated.ts";
const PROFILE_KEY = "FULL_RING_9|REGULAR|CHIP_EV|TURN";

/**
 * Vyřešených rozhodnutí na rodinu.
 *
 * Číslo se řídí limitem chunku, ne odhadem. Rodina je vlastní stahovaný soubor s
 * limitem 512 KiB a nejhustší z nich (`MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR`,
 * patnáct desek a hluboké stromy) se při třech stech pravidlech dostala na
 * 528,74 KiB - tedy přes. Změřeno buildem, ne odhadnuto.
 *
 * Dvě stě šedesát je čtyřikrát šedesát pět, takže vyjde beze zbytku na čtyři
 * rozhodnutí, která se z podhry čtou, a nejhustší rodina se vejde s rezervou.
 * Předtím to bylo tři sta, ale to bylo na jediné rozhodnutí; pravidlo pro
 * hráče, který čelí sázce, nese navíc call, raise i fold, takže je dražší.
 */
const RULE_BUDGET = 260;

interface ManifestEntry { familyId: string; packId: string; slug: string }

/**
 * The file a plan item was written to.
 *
 * The decomposition names a subgame for its flop line and turn card:
 * `BET 17.000000` and `CALL` on a `2c` becomes `BET17_CALL__2c.json`. The
 * mapping is the writer's, and reconstructing it here is the only link between a
 * plan item and the strategy it planned.
 */
function subgameFileName(item: { line?: string[]; turn: string }): string {
  const line = (item.line ?? []).map((action) => {
    const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
    if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
    return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
  }).join("_");
  return `${line}__${item.turn}.json`;
}

/**
 * Rewrite the manifest with this family added, keeping the others.
 *
 * Families arrive one run at a time, so regenerating the manifest from scratch
 * each run would delete the previous ones. The existing entries are read back
 * out of the file rather than tracked separately: the file is the record of what
 * has been built, and a second record would be a second thing to get wrong.
 */
function writeManifestEntry(added: ManifestEntry): void {
  const existing: ManifestEntry[] = [];
  if (existsSync(MANIFEST_PATH)) {
    const source = readFileSync(MANIFEST_PATH, "utf8");
    // Přípona je ve vzoru volitelná schválně.
    //
    // Manifest se při každém zápisu skládá z toho, co se z něj podařilo
    // přečíst - takže vzor, který nesedí, položky nezachová, ale tiše zahodí.
    // Přechod z `.generated` na `.generated.json` proto při prvním zápisu smazal
    // deset rodin z jedenácti a zbyla jen ta právě generovaná. Vzor snese obojí
    // a přežije i příští změnu přípony.
    const pattern = /familyId: "([^"]+)",\s*\n\s*packId: "([^"]+)",[\s\S]*?import\("\.\/turn\/([^"]+)\.generated(?:\.json)?"\)/g;
    for (const match of source.matchAll(pattern)) {
      existing.push({ familyId: match[1], packId: match[2], slug: match[3] });
    }
  }
  const entries = [...existing.filter((item) => item.familyId !== added.familyId), added]
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  const body = entries.map((entry) => `  {
    familyId: "${entry.familyId}",
    packId: "${entry.packId}",
    profileKey: "${PROFILE_KEY}",
    load: () => import("./turn/${entry.slug}.generated.json").then((module) => module.default as unknown as TurnStrategyPack),
  },`).join("\n");

  writeFileSync(MANIFEST_PATH, `// Generated by \`npm run mtt:turn-pack -- --write\`.
// Do not edit by hand.

import type { TurnStrategyPack } from "./turnStrategyPack";

export interface SolvedTurnManifestEntry {
  familyId: string;
  packId: string;
  profileKey: string;
  load(): Promise<TurnStrategyPack>;
}

export const solvedTurnManifest: readonly SolvedTurnManifestEntry[] = [
${body}
];
`, "utf8");
}

const familyArg = process.argv.find((item) => item.startsWith("--family="));
const write = process.argv.includes("--write");
const family = familyArg?.split("=")[1];


if (family === undefined) {
  console.error("Usage: npm run mtt:turn-pack -- --family=<FAMILY_ID> [--write]");
  process.exitCode = 2;
} else if (
  existsSync(MANIFEST_PATH) &&
  supersededByRepair(family, readFileSync(MANIFEST_PATH, "utf8")) !== undefined
) {
  const winner = supersededByRepair(family, readFileSync(MANIFEST_PATH, "utf8"));
  console.error(
    `${family} už nahradila ${winner}; obě řeší tentýž spot a resolver by odpověděl `
    + "z té, která je v řetězci první. Postav a shipuj jen tu opravenou.",
  );
  process.exitCode = 2;
} else if (!existsSync(ROOT)) {
  console.error(`${ROOT} is absent; nothing to build from.`);
  process.exitCode = 1;
} else {
  const fullTreeBoards = fullTreeBoardsByFamily().get(family.toUpperCase());
  const allDirectories = readdirSync(ROOT).filter((name) => name.startsWith(`${family}__`));
  const directories = fullTreeBoards === undefined
    ? allDirectories
    : allDirectories.filter((name) => fullTreeBoards.has(name.split("__")[1] ?? ""));
  const droppedReduced = allDirectories.length - directories.length;
  if (droppedReduced > 0) {
    console.log(`  ${droppedReduced} boardů vynecháno: vyřešené na redukovaném stromě`);
  }
  const evidence: TurnFamilyEvidence = {
    familyId: family,
    boards: 0,
    // Kolik desek rodina vůbec má, ne kolik jich má plán. Brána bez tohohle
    // čísla nepozná rodinu, které se rozložila polovina board space.
    // Desky vyloučené kvůli redukovanému stromu se odečtou.
    //
    // Schodek má dvě různé příčiny a slučovat je znamená hlásit nepravdu:
    // "nerozloženo" u desky, která rozložená je a jen se vědomě vynechala,
    // protože míchá dvě hry. Brána má vidět, kolik desek se dalo použít.
    boardsWithCheckpoint: Math.max(0, checkpointBoardCount(family) - droppedReduced),
    plannedItems: 0, writtenItems: 0,
    minCoverage: 1, coverageTarget: TURN_COVERAGE_TARGET, sampledRules: [],
  };
  const rules = [];
  let unidentified = 0;

  for (const directory of directories) {
    const planPath = join(ROOT, directory, "plan.json");
    if (!existsSync(planPath)) continue;
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const files = readdirSync(join(ROOT, directory))
      .filter((name) => name.endsWith(".json") && name !== "plan.json");
    evidence.boards += 1;
    evidence.plannedItems += (plan.items ?? []).length;
    evidence.writtenItems += files.length;
    evidence.minCoverage = Math.min(evidence.minCoverage, plan.coverageAchieved ?? 0);

    // One rule per solved turn, keyed to the exact board it was solved on.
    //
    // The plan is what ties a subgame file to its board, its turn card, the flop
    // line that led there and the pot at that node. Reading the files alone would
    // produce rules that know their family but not their turn, and a resolver
    // holding those has no way to refuse a board nobody solved.
    // The blind, in chips. The plan states the root stack in chips and the family
    // name states it in big blinds, so their ratio is the only place the two unit
    // systems meet. Without it nothing downstream can deal a spot at the depth it
    // was actually solved at.
    const seats = seatsOfFamily(directory);
    const familyStackBB = Number(/_(\d+)BB_/.exec(directory)?.[1] ?? 0);
    const chipsPerBB = familyStackBB > 0 && plan.stack > 0 ? plan.stack / familyStackBB : 0;
    const inBB = (chips: number) => (
      chipsPerBB > 0 ? Math.round((chips / chipsPerBB) * 10) / 10 : undefined
    );

    for (const item of plan.items ?? []) {
      const fileName = subgameFileName(item);
      const path = join(ROOT, directory, fileName);
      if (!existsSync(path)) continue;
      const node = JSON.parse(readFileSync(path, "utf8"));
      const potChips = item.pot ?? plan.pot ?? 0;
      const stackChips = item.stack ?? plan.stack ?? 0;
      const potBB = inBB(potChips);
      const stackBehindBB = inBB(stackChips);

      // Každé rozhodnutí v podhře, ne jen to kořenové.
      //
      // Dosud se bral jediný uzel - ten na vrcholu - a zbytek stromu se zahodil.
      // Přitom jsou to plnohodnotná vyřešená rozhodnutí: hráč v pozici čelící
      // sázce, hráč v pozici sázející po checku, hráč mimo pozici čelící sázce
      // nebo raisu. V jedné rodině jich je 33 012 a dodávalo se 4 622. Právě
      // proto brána hlásila u „čelí sázce na turnu" nulu.
      for (const decision of subgameDecisions(node, potChips, stackChips)) {
        // Kořen se určuje překryvem ranží jako dosud, protože plán ty range
        // zapsal právě pro něj. Hlouběji už neplatí - akce po cestě je zúžily -
        // a tam je solverův vlastní údaj o hráči na tahu jediný správný zdroj.
        const side = decision.depth === 0
          ? (seats === undefined ? undefined : heroSideOfNode(node, item))
          : { side: decision.player === 1 ? "OOP" as const : "IP" as const, confidence: 1 };
        if (side === undefined || seats === undefined) {
          unidentified += 1;
          continue;
        }
        const seat = side.side === "OOP" ? seats.oop : seats.ip;
        const hero = {
          side: side.side,
          seat,
          villainSeat: side.side === "OOP" ? seats.ip : seats.oop,
          isAggressor: seat === seats.aggressor,
          confidence: side.confidence,
          // Kolik je před hráčem k dorovnání. Dřív se to četlo z toho, jestli
          // uzel nabízí fold; tohle je totéž, jen změřené místo odvozené.
          facingBet: decision.toCallChips > 0,
        };

        // Rozhodnutí, pro která produkt nemá jméno, se nedodávají.
        //
        // `TURN_OOP_LEAD` znamená „mimo pozici, na tahu první, bez iniciativy".
        // Hráč **v pozici**, který hraje po checku a iniciativu nemá, je jiná
        // situace a produkt pro ni uzel nemá - trenažér ji nikdy nerozdá, takže
        // by takové pravidlo neodpovědělo nikomu a jen zabíralo místo v balíku.
        // Týká se to dvou rodin, kde otevřel small blind: tam je v pozici big
        // blind, který dorovnal. Změřeno: 130 pravidel ze 4 160.
        if (!hero.facingBet && !hero.isAggressor && side.side === "IP") continue;

        const rule = buildTurnStrategyRule(directory, decision.node, {
          hero,
          flop: (plan.board ?? []) as string[],
          turnCards: [item.turn, ...(item.represents ?? []).filter((card: string) => card !== item.turn)],
          // Flopová linka i to, co se stihlo na turnu, aby šlo poznat, odkud
          // rozhodnutí pochází.
          priorLine: [...(item.line ?? []), ...decision.line],
          potChips: decision.potChips,
          stackChips: decision.stackChips,
          ...(inBB(decision.potChips) === undefined ? {} : { potBB: inBB(decision.potChips) }),
          ...(inBB(decision.stackChips) === undefined
            ? {}
            : { stackBehindBB: inBB(decision.stackChips) }),
          // Dosah linky k téhle podhře krát pravděpodobnost, že se hra dostane
          // až do tohohle uzlu.
          reach: (item.reach ?? 0) * decision.arrival,
        });
        if (rule) rules.push(rule);
      }
    }
  }

  // Highest reach first within each board, then one board at a time until the
  // budget fills.
  //
  // Sorting the whole family by reach and cutting looks right and is not: the
  // first attempt kept 300 turns spread over eleven of the thirty three solved
  // flops, because a board where the flop line is taken often has higher reach on
  // every one of its turns than a board where it is taken rarely. That buries
  // twenty two boards a player will still be dealt. Taking turns from each board
  // in rotation spends the same budget across all of them, and within a board it
  // still spends it on the turns that actually arrive.
  // One line per board and turn card, the one most often taken.
  //
  // The same turn is reached by several flop lines - checked through, or bet and
  // called - and those are different spots with different ranges. The resolver
  // cannot tell them apart, because the trainer does not tell it which line it
  // dealt, so shipping both means it must refuse every turn where more than one
  // exists. That cost 5.7% of reach and put the refused rules in the bundle
  // anyway. Keeping the highest-reach line spends the space on something a
  // player can actually be served.
  //
  // Klíč nese i to, které rozhodnutí uzel drží a na které straně stolu sedí
  // hrdina. Bez toho by se čtyři různé situace na téže desce - hraju první,
  // sázím s iniciativou, čelím sázce v pozici, čelím sázce mimo pozici -
  // přebily na jednu a zbyla by ta nejdosahovanější. Přesně tyhle dva údaje
  // porovnává resolver, takže se slučuje právě to, co by se u něj srazilo.
  const decisionKey = (rule: (typeof rules)[number]): string => {
    const hero = rule.spot?.hero;
    return `${actionNodeForSolvedHero(hero, "TURN") ?? "?"}|${hero?.side ?? "?"}`;
  };
  const byLine = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    const spot = rule.spot;
    if (spot === undefined) continue;
    const key = `${rule.sourceDirectory}|${spot.turnCards[0]}|${rule.node}|${decisionKey(rule)}`;
    const held = byLine.get(key);
    if (held === undefined || (spot.reach ?? 0) > (held.spot?.reach ?? 0)) {
      byLine.set(key, rule);
    }
  }
  const collapsed = rules.length - byLine.size;
  rules.length = 0;
  rules.push(...byLine.values());
  if (collapsed > 0) {
    console.log(`  ${collapsed} turns dropped: another flop line reaches the same board more often`);
  }

  // Rozpočet se dělí mezi rozhodnutí, ne jen mezi desky.
  //
  // Kdyby se nedělil, vyhrálo by rozhodnutí s nejvyšším dosahem všechno: hraní
  // první je nejčastější situace a zaplnilo by tři sta pravidel dřív, než by na
  // ostatní došlo. Hráč, který čelí sázce, by dál nedostal nic - a to je stav,
  // ze kterého tenhle blok vychází.
  //
  // **Assumption:** dělí se rovným dílem. Poměr, ve kterém trenažér ty situace
  // rozdává, změřený není; rovný díl je obhajitelný default, protože každá z
  // nich je situace, do které se hráč dostane, a žádná zatím nemá přednost.
  // Uvnitř rozhodnutí se pak střídají desky a uvnitř desky rozhoduje dosah.
  const byDecision = new Map<string, Map<string, typeof rules>>();
  for (const rule of rules) {
    const decision = decisionKey(rule);
    const boards = byDecision.get(decision) ?? new Map<string, typeof rules>();
    const bucket = boards.get(rule.sourceDirectory) ?? [];
    bucket.push(rule);
    boards.set(rule.sourceDirectory, bucket);
    byDecision.set(decision, boards);
  }
  const kept: typeof rules = [];
  const share = Math.max(1, Math.floor(RULE_BUDGET / Math.max(1, byDecision.size)));
  for (const boards of byDecision.values()) {
    for (const bucket of boards.values()) {
      bucket.sort((left, right) => (right.spot?.reach ?? 0) - (left.spot?.reach ?? 0));
    }
    const queues = [...boards.values()];
    let taken = 0;
    for (let round = 0; taken < share && kept.length < RULE_BUDGET; round += 1) {
      let placed = 0;
      for (const queue of queues) {
        if (round >= queue.length) continue;
        if (taken >= share || kept.length >= RULE_BUDGET) break;
        kept.push(queue[round]);
        taken += 1;
        placed += 1;
      }
      if (placed === 0) break;
    }
  }
  const dropped = rules.length - kept.length;
  rules.length = 0;
  rules.push(...kept);
  evidence.sampledRules = rules.slice(0, 1);
  if (dropped > 0) console.log(`  ${dropped} lower-reach turns dropped to fit the rule budget`);

  // Who the kept turns belong to, printed every run. This is the fact the
  // directory name could not be trusted for, so it is reported rather than
  // assumed - a family whose seats read wrongly should be visible here before
  // anything is written.
  const identities = new Map<string, number>();
  for (const rule of rules) {
    const hero = rule.spot?.hero;
    if (hero === undefined) continue;
    const key = `${hero.side} ${hero.seat} vs ${hero.villainSeat}, `
      + `${hero.facingBet ? "facing a bet" : "first to act"}`;
    identities.set(key, (identities.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...identities].sort()) {
    console.log(`  hero: ${key} - ${count} turns`);
  }
  if (unidentified > 0) {
    console.log(`  ${unidentified} turns left out: could not establish whose strategy the node holds`);
  }

  const packId = `mtt-full-ring-9-turn-solved-${family.toLowerCase().replace(/_/g, "-")}-v1`;
  const createdAt = new Date().toISOString().slice(0, 10);
  const verdicts = readVerdicts();
  const buildWith = (candidate: typeof rules) => buildTurnStrategyPack({
    id: packId, createdAt, evidence, rules: candidate, verdicts,
  });

  // Strop v bajtech, ne v pravidlech - viz `trimToModuleBudget`. Tahle ulice se
  // do rozpočtu dnes vejde, ale ze stejného důvodu jako river se vejít nemusí:
  // `RULE_BUDGET` neví, kolik místa pravidlo zabere.
  const fitted = trimToModuleBudget(rules, (candidate) => {
    const attempt = buildWith(candidate);
    return attempt.ok ? JSON.stringify(attempt.pack).length : 0;
  });
  if (fitted.dropped > 0) {
    console.log(`  ${fitted.dropped} turnů vynecháno, aby se modul vešel do rozpočtu svazku`);
    rules.length = 0;
    rules.push(...fitted.kept);
  }

  const result = buildWith(rules);

  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 1;
  } else {
    // Data, ne TypeScriptový modul.
    //
    // Balík je několik set kilobajtů strategie a jako `.ts` ho musí každý běh
    // sady projít transformací: změřeno 296 ms na jednu rodinu proti 127 ms u
    // stejného obsahu v JSONu, a bez odsazení a uvozovek u klíčů je soubor
    // poloviční. Jedenáct rodin dělalo 12 s transformace v každém testovém
    // souboru, který je načte, a další rodiny to jen zhoršovaly.
    //
    // Typová kontrola se tím posouvá na jedno místo v manifestu. To je únosné
    // právě u generovaného obsahu: tvar hlídá `buildTurnStrategyPack` při
    // zápisu, ne až překladač u čtenáře.
    const module = JSON.stringify(result.pack);
    const slug = family.toLowerCase().replace(/_/g, "-");
    const outPath = join(OUT_DIR, `${slug}.generated.json`);
    console.log(`family ${family}`);
    const available = evidence.boardsWithCheckpoint ?? evidence.boards;
    const coverageNote = available > evidence.boards
      ? ` (z ${available} použitelných; ${available - evidence.boards} nerozloženo)`
      : "";
    console.log(`  boards ${evidence.boards}${coverageNote}, rules ${rules.length}, module ${(module.length / 1024).toFixed(0)} KB`);
    console.log(`  důvěra ${result.pack.confidence}, otisk ${result.pack.contentHash}`);
    console.log(`  ${write ? "written" : "would write"}: ${outPath}`);
    if (write) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, module, "utf8");
      writeManifestEntry({ familyId: family, packId: result.pack.id, slug });
      console.log(`  manifest updated: ${MANIFEST_PATH}`);
    }
  }
}
